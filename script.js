"use strict";

const WIKI_VIEWS  = "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/fr.wikipedia/all-access";
const WIKI_API    = "https://fr.wikipedia.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

const BLACKLIST = /^(Accueil|Spécial:|Wikipédia:|Portail:|Aide:|Utilisateur|Main_Page|Special:|Wikipedia:|Liste|Décès_|Décès |Mort_|Mort )/i;

const state = { streak: 0, best: 0, answered: false, round: 0 };
let pool = [], winnerKey = "A", ld = null, rd = null;

const $   = id => document.getElementById(id);
const fmt = n  => Math.round(n).toLocaleString("fr-FR");
const pad = n  => String(n).padStart(2, "0");

/* ── Pool : top pageviews 7 derniers jours ── */
async function fetchPool() {
  const seen = new Set();
  const all  = [];

  const fetches = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - 86_400_000 * (i + 1));
    const url = `${WIKI_VIEWS}/${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
    return fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
  });

  const results = await Promise.all(fetches);

  for (const data of results) {
    for (const a of (data?.items?.[0]?.articles ?? [])) {
      if (!BLACKLIST.test(a.article) && a.views > 0 && !a.article.includes(".") && !seen.has(a.article)) {
        seen.add(a.article);
        all.push(a);
      }
    }
  }

  return all.sort(() => Math.random() - 0.5).slice(0, 300);
}

/* ── Images Wikipedia ── */
async function fetchWikiImgs(titles) {
  const params = new URLSearchParams({
    action: "query", prop: "pageimages|info",
    piprop: "thumbnail", pithumbsize: "800",
    inprop: "url", titles: titles.join("|"),
    format: "json", origin: "*",
  });
  const r = await fetch(`${WIKI_API}?${params}`);
  if (!r.ok) throw new Error(`wiki API ${r.status}`);
  const data = await r.json();

  const map = {};
  for (const p of Object.values(data.query?.pages ?? {}))
    map[p.title] = p.thumbnail?.source ?? null;
  for (const n of data.query?.normalized ?? [])
    if (map[n.to]) map[n.from] = map[n.to];
  return map;
}

/* ── Fallback image Commons ── */
async function fetchCommonsImg(query) {
  try {
    const p1 = new URLSearchParams({
      action: "query", list: "search",
      srsearch: query, srnamespace: "6",
      srlimit: "3", format: "json", origin: "*",
    });
    const r1   = await fetch(`${COMMONS_API}?${p1}`);
    const d1   = await r1.json();
    const hit  = d1.query?.search?.[0];
    if (!hit) return null;

    const p2 = new URLSearchParams({
      action: "query", prop: "imageinfo",
      iiprop: "url", iiurlwidth: "800",
      titles: hit.title, format: "json", origin: "*",
    });
    const r2 = await fetch(`${COMMONS_API}?${p2}`);
    const d2 = await r2.json();
    return Object.values(d2.query?.pages ?? {})[0]?.imageinfo?.[0]?.thumburl ?? null;
  } catch { return null; }
}

function findInMap(map, title) {
  if (map[title]) return map[title];
  const u = title.replaceAll(" ", "_");
  if (map[u]) return map[u];
  const low = title.toLowerCase();
  for (const [k, v] of Object.entries(map))
    if (v && k.toLowerCase() === low) return v;
  return null;
}

async function resolveImg(map, title) {
  return findInMap(map, title) ?? await fetchCommonsImg(title);
}

/* ── UI helpers ── */
function setCard(k, title, img) {
  $(`title-${k}`).textContent = title;

  const num  = $(`num-${k}`);
  num.textContent = "???";
  num.classList.remove("shown");

  const el   = $(`imgel-${k}`);
  const ph   = $(`ph-${k}`);
  const shim = $(`shim${k}`);

  shim.style.display = "none";

  if (img) {
    el.alt = title;
    el.src = img;
    el.style.display = "block";
    ph.style.display = "none";
    el.onerror = () => { el.style.display = "none"; ph.style.display = "flex"; };
  } else {
    el.style.display = "none";
    ph.style.display = "flex";
  }

  const s = $(`side-${k}`);
  s.className = "side";
  s.disabled  = false;
  s.setAttribute("aria-label", `Choisir : ${title}`);
}

function syncUI() {
  $("best").textContent   = state.best;
  $("streak").textContent = state.streak;

  const chip = $("streak-chip");
  chip.className = "chip chip-streak" + (state.streak >= 3 ? " hot" : "");

  const prog = $("prog-bar");
  prog.style.width = `${Math.min((state.round % 10) / 10 * 100, 100)}%`;
  prog.closest("[role=progressbar]")?.setAttribute("aria-valuenow", state.round % 10 * 10);
}

/* ── Pick ── */
function pick(chosen) {
  if (state.answered) return;
  state.answered = true;

  const ok = chosen === winnerKey;
  if (ok) {
    state.streak = state.streak + 1;
    state.best   = Math.max(state.best, state.streak);
  } else {
    state.streak = 0;
  }
  state.round++;
  syncUI();

  for (const k of ["A", "B"]) {
    const s = $(`side-${k}`);
    s.disabled = true;
    s.classList.add(k === winnerKey ? "correct" : "wrong");
    const n = $(`num-${k}`);
    n.textContent = fmt((k === "A" ? ld : rd).views);
    n.classList.add("shown");
  }

  const w  = winnerKey === "A" ? ld : rd;
  const l  = winnerKey === "A" ? rd : ld;
  const fb = $("feedback");
  const mobile = window.innerWidth <= 560;

  if (ok) {
    fb.className   = "feedback ok";
    fb.textContent = mobile
      ? "✓ Bien joué !"
      : `✓ Bien joué ! « ${w.title} » — ${fmt(w.views)} vues vs ${fmt(l.views)}.`;
  } else {
    fb.className   = "feedback ko";
    fb.textContent = mobile
      ? "✗ Dommage !"
      : `✗ C'était « ${w.title} » — ${fmt(w.views)} vues vs ${fmt(l.views)}.`;
  }

  $("btn-next").classList.add("on");
}

/* ── Load question ── */
async function loadQ() {
  state.answered = false;
  $("btn-next").classList.remove("on");

  const fb = $("feedback");
  fb.className   = "feedback loading";
  fb.textContent = "Chargement…";

  const duel = $("duel");
  duel.style.animation = "none";
  requestAnimationFrame(() => { duel.style.animation = ""; });

  for (const k of ["A", "B"]) {
    const s = $(`side-${k}`);
    s.className = "side";
    s.disabled  = true;
    $(`title-${k}`).textContent = "…";
    $(`num-${k}`).textContent   = "???";
    $(`num-${k}`).classList.remove("shown");
    $(`imgel-${k}`).style.display = "none";
    $(`ph-${k}`).style.display    = "none";
    $(`shim${k}`).style.display   = "flex";
  }

  try {
    if (pool.length < 10) pool = await fetchPool();
    if (pool.length < 2)  throw new Error("Pool vide");

    let iA, iB;
    do {
      iA = Math.floor(Math.random() * pool.length);
      iB = Math.floor(Math.random() * pool.length);
    } while (iA === iB);

    const aA = pool[iA], aB = pool[iB];
    [iA, iB].sort((a, b) => b - a).forEach(i => pool.splice(i, 1));

    const tA = aA.article.replaceAll("_", " ");
    const tB = aB.article.replaceAll("_", " ");

    const wikiMap        = await fetchWikiImgs([tA, tB]);
    const [imgA, imgB]   = await Promise.all([resolveImg(wikiMap, tA), resolveImg(wikiMap, tB)]);

    const swap = Math.random() > 0.5;
    ld = swap ? { title: tB, views: aB.views } : { title: tA, views: aA.views };
    rd = swap ? { title: tA, views: aA.views } : { title: tB, views: aB.views };
    const imgL = swap ? imgB : imgA;
    const imgR = swap ? imgA : imgB;

    winnerKey = aA.views >= aB.views
      ? (swap ? "B" : "A")
      : (swap ? "A" : "B");

    setCard("A", ld.title, imgL);
    setCard("B", rd.title, imgR);

    fb.className   = "feedback";
    fb.textContent = "";

  } catch (err) {
    console.error(err);
    fb.className   = "feedback ko";
    fb.textContent = "⚡ Erreur de chargement. Vérifiez votre connexion.";
    $("btn-next").classList.add("on");
    for (const k of ["A", "B"]) {
      $(`shim${k}`).style.display = "none";
      $(`ph-${k}`).style.display  = "flex";
    }
  }
}

/* ── Events ── */
$("side-A").addEventListener("click", () => pick("A"));
$("side-B").addEventListener("click", () => pick("B"));
$("btn-next").addEventListener("click", loadQ);

loadQ();
