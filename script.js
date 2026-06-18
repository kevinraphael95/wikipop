"use strict";

const WIKI_VIEWS  = "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/fr.wikipedia/all-access";
const WIKI_API    = "https://fr.wikipedia.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const BLACKLIST   = /^(Accueil|Spécial:|Wikipédia:|Portail:|Aide:|Utilisateur|Main_Page|Special:|Wikipedia:|Liste|Liste_|Décès_|Décès |Mort_|Mort )/i;

const state = { score: 0, streak: 0, best: 0, answered: false, round: 0 };
let pool = [], winnerKey = "A", ld = null, rd = null;

const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString("fr-FR");
const pad = n => String(n).padStart(2, "0");

async function fetchPool() {
  const params = new URLSearchParams({
    action: "query", list: "random",
    rnnamespace: "0", rnlimit: "50",
    format: "json", origin: "*",
  });
  const r = await fetch(WIKI_API + "?" + params);
  if (!r.ok) throw new Error("random API " + r.status);
  const data = await r.json();
  const titles = (data.query?.random ?? [])
    .filter(a => !BLACKLIST.test(a.title))
    .map(a => a.title);

  const vparams = new URLSearchParams({
    action: "query", prop: "pageviews",
    pvipdays: "7", titles: titles.join("|"),
    format: "json", origin: "*",
  });
  const r2 = await fetch(WIKI_API + "?" + vparams);
  if (!r2.ok) throw new Error("pageviews API " + r2.status);
  const d2 = await r2.json();
  return Object.values(d2.query?.pages ?? {})
    .map(p => {
      const views = Object.values(p.pageviews ?? {}).reduce((s, v) => s + (v || 0), 0);
      return { article: p.title, views };
    })
    .filter(a => a.views > 0);
}

async function fetchWikiImgs(titles) {
  const params = new URLSearchParams({
    action: "query", prop: "pageimages|info",
    piprop: "thumbnail", pithumbsize: "800",
    inprop: "url", titles: titles.join("|"),
    format: "json", origin: "*",
  });
  const r = await fetch(WIKI_API + "?" + params);
  if (!r.ok) throw new Error("wiki API " + r.status);
  const data = await r.json();
  const map = {};
  for (const p of Object.values(data.query?.pages ?? {}))
    map[p.title] = p.thumbnail?.source ?? null;
  for (const n of data.query?.normalized ?? [])
    if (map[n.to]) map[n.from] = map[n.to];
  return map;
}

async function fetchCommonsImg(query) {
  try {
    const params = new URLSearchParams({
      action: "query", list: "search",
      srsearch: query, srnamespace: "6",
      srlimit: "3", format: "json", origin: "*",
    });
    const r = await fetch(COMMONS_API + "?" + params);
    if (!r.ok) return null;
    const data = await r.json();
    const results = data.query?.search ?? [];
    if (!results.length) return null;
    const title = results[0].title;
    const p2 = new URLSearchParams({
      action: "query", prop: "imageinfo",
      iiprop: "url", iiurlwidth: "800",
      titles: title, format: "json", origin: "*",
    });
    const r2 = await fetch(COMMONS_API + "?" + p2);
    if (!r2.ok) return null;
    const d2 = await r2.json();
    const pages = Object.values(d2.query?.pages ?? {});
    return pages[0]?.imageinfo?.[0]?.thumburl ?? null;
  } catch { return null; }
}

function findInMap(map, title) {
  if (map[title]) return map[title];
  const u = title.replaceAll(" ", "_");
  if (map[u]) return map[u];
  for (const [k, v] of Object.entries(map))
    if (v && k.toLowerCase() === title.toLowerCase()) return v;
  return null;
}

async function resolveImg(map, title) {
  const direct = findInMap(map, title);
  if (direct) return direct;
  return await fetchCommonsImg(title);
}

function setCard(k, title, img) {
  $("title-" + k).textContent = title;
  $("num-" + k).textContent = "???";
  $("num-" + k).classList.remove("shown");
  const el = $("imgel-" + k), ph = $("ph-" + k), shim = $("shim" + k);
  shim.style.display = "none";
  if (img) {
    el.style.display = "block"; ph.style.display = "none";
    el.src = img; el.alt = title;
    el.onerror = () => { el.style.display = "none"; ph.style.display = "flex"; };
  } else {
    el.style.display = "none"; ph.style.display = "flex";
  }
  const s = $("side-" + k);
  s.className = "side"; s.disabled = false;
  s.setAttribute("aria-label", "Choisir : " + title);
}

function syncUI() {
  $("best").textContent   = state.best;
  $("streak").textContent = state.streak;
  const chip = $("streak-chip");
  chip.className = "chip chip-streak" + (state.streak >= 3 ? " hot" : "");
  const prog = Math.min((state.round % 10) / 10 * 100, 100);
  $("prog-bar").style.width = prog + "%";
}

function pick(chosen) {
  if (state.answered) return;
  state.answered = true;
  const ok = chosen === winnerKey;
  if (ok) {
    state.score  += 10 + state.streak * 2;
    state.streak += 1;
    state.best    = Math.max(state.best, state.streak);
  } else {
    state.streak = 0;
  }
  state.round++;
  syncUI();

  ["A", "B"].forEach(k => {
    const s = $("side-" + k);
    s.disabled = true;
    s.classList.add(k === winnerKey ? "correct" : "wrong");
    const n = $("num-" + k);
    const d = k === "A" ? ld : rd;
    n.textContent = fmt(d.views);
    n.classList.add("shown");
  });

  const w = winnerKey === "A" ? ld : rd;
  const l = winnerKey === "A" ? rd : ld;
  const fb = $("feedback");
  if (ok) {
    fb.className = "feedback ok";
    fb.textContent = `✓ Bien joué ! « ${w.title} » — ${fmt(w.views)} vues vs ${fmt(l.views)}.`;
  } else {
    fb.className = "feedback ko";
    fb.textContent = `✗ C'était « ${w.title} » — ${fmt(w.views)} vues vs ${fmt(l.views)}.`;
  }
  $("btn-next").classList.add("on");
}

async function loadQ() {
  state.answered = false;
  $("btn-next").classList.remove("on");
  $("feedback").className = "feedback loading";
  $("feedback").textContent = "Chargement des articles…";

  const duel = $("duel");
  duel.style.animation = "none";
  requestAnimationFrame(() => { duel.style.animation = ""; });

  ["A", "B"].forEach(k => {
    const s = $("side-" + k);
    s.className = "side"; s.disabled = true;
    $("title-" + k).textContent = "…";
    $("num-"   + k).textContent = "???";
    $("num-"   + k).classList.remove("shown");
    $("imgel-" + k).style.display = "none";
    $("ph-"    + k).style.display = "none";
    $("shim"   + k).style.display = "flex";
  });

  try {
    if (pool.length < 10) pool = await fetchPool();
    if (pool.length < 2) throw new Error("pool vide");

    let iA, iB;
    do {
      iA = Math.floor(Math.random() * pool.length);
      iB = Math.floor(Math.random() * pool.length);
    } while (iA === iB);

    const aA = pool[iA], aB = pool[iB];
    [iA, iB].sort((a, b) => b - a).forEach(i => pool.splice(i, 1));

    const tA = aA.article.replaceAll("_", " ");
    const tB = aB.article.replaceAll("_", " ");

    const wikiMap = await fetchWikiImgs([tA, tB]);
    const [imgA, imgB] = await Promise.all([
      resolveImg(wikiMap, tA),
      resolveImg(wikiMap, tB),
    ]);

    const swap = Math.random() > 0.5;
    ld = swap ? { title: tB, img: imgB, views: aB.views }
              : { title: tA, img: imgA, views: aA.views };
    rd = swap ? { title: tA, img: imgA, views: aA.views }
              : { title: tB, img: imgB, views: aB.views };
    winnerKey = aA.views >= aB.views ? (swap ? "B" : "A") : (swap ? "A" : "B");

    setCard("A", ld.title, ld.img);
    setCard("B", rd.title, rd.img);
    $("feedback").className = "feedback";
    $("feedback").textContent = "";

  } catch (e) {
    console.error(e);
    $("feedback").className = "feedback ko";
    $("feedback").textContent = "⚡ Erreur de chargement. Vérifiez votre connexion.";
    $("btn-next").classList.add("on");
    ["A", "B"].forEach(k => {
      $("shim" + k).style.display = "none";
      $("ph-"  + k).style.display = "flex";
    });
  }
}

document.getElementById("side-A").addEventListener("click", () => pick("A"));
document.getElementById("side-B").addEventListener("click", () => pick("B"));
document.getElementById("btn-next").addEventListener("click", loadQ);

loadQ();
