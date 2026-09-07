"use strict";

const WIKI_VIEWS  = "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/fr.wikipedia/all-access";
const WIKI_API    = "https://fr.wikipedia.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

const BLACKLIST = /^(Accueil|Spécial:|Wikipédia:|Portail:|Aide:|Utilisateur|Main_Page|Special:|Wikipedia:|Liste|Décès_|Décès |Mort_|Mort )/i;

const STORAGE_KEY = "wikipop-state";
const MAX_AGE_MS  = 30 * 24 * 60 * 60 * 1000; // purge après 30 jours d'inactivité

const state = { streak: 0, best: 0, answered: false, round: 0, correct: 0 };
let pool = [], winnerKey = "A", ld = null, rd = null, chosenKey = null;

const $   = id => document.getElementById(id);
const fmt = n  => Math.round(n).toLocaleString("fr-FR");
const pad = n  => String(n).padStart(2, "0");

/* ── Stockage unique (thème + stats + question en cours) avec expiration ──
   Toutes les données de l'app vivent dans UNE seule clé localStorage.
   Chaque écriture rafraîchit "savedAt" ; si l'entrée n'a pas été mise à
   jour depuis plus de 30 jours (utilisateur qui ne revient plus), elle
   est automatiquement purgée à la lecture suivante, pour ne pas
   accumuler de données mortes dans le navigateur. */
function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.savedAt || Date.now() - data.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

function writeStore(patch) {
  try {
    const prev = readStore() || {};
    const next = { ...prev, ...patch, savedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch { return null; } // quota plein / mode privé : tant pis
}

function loadState() {
  return readStore();
}

function saveState() {
  writeStore({
    stats: {
      streak: state.streak, best: state.best,
      round: state.round, correct: state.correct,
    },
    current: (ld && rd) ? {
      answered: state.answered,
      chosenKey,
      winnerKey,
      left:  ld,
      right: rd,
    } : null,
  });
}

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
    piprop: "thumbnail|original", pithumbsize: "800",
    inprop: "url", titles: titles.join("|"),
    format: "json", origin: "*",
  });
  const r = await fetch(`${WIKI_API}?${params}`);
  if (!r.ok) throw new Error(`wiki API ${r.status}`);
  const data = await r.json();

  const map = {};
  for (const p of Object.values(data.query?.pages ?? {})) {
    const orig = p.original;
    const thumb = p.thumbnail;
    const okRes = orig && orig.width >= 150 && orig.height >= 150;
    map[p.title] = okRes ? (thumb?.source ?? null) : null;
  }
  for (const n of data.query?.normalized ?? [])
    if (map[n.to] !== undefined) map[n.from] = map[n.to];
  return map;
}

/* ── Fallback image Commons ── */
async function fetchCommonsImg(query) {
  try {
    const p1 = new URLSearchParams({
      action: "query", list: "search",
      srsearch: query, srnamespace: "6",
      srlimit: "5", format: "json", origin: "*",
    });
    const r1   = await fetch(`${COMMONS_API}?${p1}`);
    const d1   = await r1.json();
    const hits = d1.query?.search ?? [];
    if (!hits.length) return null;

    // On tente chaque résultat jusqu'à en trouver un exploitable : le premier
    // hit n'est pas toujours une vraie image (peut être un doc, une carte, etc.)
    for (const hit of hits) {
      const p2 = new URLSearchParams({
        action: "query", prop: "imageinfo",
        iiprop: "url|size", iiurlwidth: "800",
        titles: hit.title, format: "json", origin: "*",
      });
      const r2 = await fetch(`${COMMONS_API}?${p2}`);
      const d2 = await r2.json();
      const info = Object.values(d2.query?.pages ?? {})[0]?.imageinfo?.[0];
      if (info?.thumburl && info.width >= 150 && info.height >= 150) {
        return info.thumburl;
      }
    }
    return null;
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

  $(`title-${k}`).classList.remove("skeleton");

  // On retire l'ancienne image tout de suite et on précharge la nouvelle
  // en mémoire avant de l'afficher : le shimmer reste visible tant que
  // l'image n'est pas réellement prête, donc jamais de flash de
  // l'ancienne image pendant le chargement de la suivante.
  el.removeAttribute("src");
  el.style.display = "none";
  ph.style.display  = "none";

  if (img) {
    shim.style.display = "flex";
    const preload = new Image();
    preload.onload = () => {
      el.src = img;
      el.alt = title;
      shim.style.display = "none";
      el.style.display = "block";
    };
    preload.onerror = () => {
      shim.style.display = "none";
      ph.style.display = "flex";
    };
    preload.src = img;
    el.onerror = () => { el.style.display = "none"; ph.style.display = "flex"; };
  } else {
    shim.style.display = "none";
    ph.style.display = "flex";
  }

  const s = $(`side-${k}`);
  s.className = "side";
  s.disabled  = false;
  s.setAttribute("aria-label", `Choisir : ${title}`);

  const wiki = $(`wiki-${k}`);
  wiki.href = `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
  wiki.setAttribute("aria-label", `Voir « ${title} » sur Wikipédia`);
  wiki.style.pointerEvents = "";
  wiki.style.opacity = "";
}

function syncUI() {
  $("best").textContent   = state.best;
  $("streak").textContent = state.streak;

  const chip = $("streak-chip");
  chip.className = "chip chip-streak" + (state.streak >= 3 ? " hot" : "");

  const pct = state.round > 0 ? Math.round((state.correct / state.round) * 100) : 0;
  const prog = $("prog-bar");
  prog.style.width = `${pct}%`;
  prog.closest("[role=progressbar]")?.setAttribute("aria-valuenow", pct);
  $("prog-pct").textContent = `${pct}%`;
}

/* ── Affiche le résultat (utilisé après un clic ET après une restauration) ── */
function showResult() {
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
  const ok = chosenKey === winnerKey;

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
  $("btn-next").disabled = false;
}

/* ── Pick ── */
function pick(chosen) {
  if (state.answered) return;
  state.answered = true;
  chosenKey = chosen;

  const ok = chosen === winnerKey;
  if (ok) {
    state.streak  = state.streak + 1;
    state.best    = Math.max(state.best, state.streak);
    state.correct = state.correct + 1;
  } else {
    state.streak = 0;
  }
  state.round++;
  syncUI();
  showResult();
  saveState();
}

/* ── Restaure la question sauvegardée (au lieu d'en tirer une nouvelle) ── */
function restoreCurrent(saved) {
  ld        = saved.left;
  rd        = saved.right;
  winnerKey = saved.winnerKey;
  chosenKey = saved.chosenKey;
  state.answered = !!saved.answered;

  setCard("A", ld.title, ld.img);
  setCard("B", rd.title, rd.img);

  if (state.answered) {
    showResult();
  } else {
    const nextBtn = $("btn-next");
    nextBtn.classList.remove("on");
    nextBtn.disabled = true;
    $("feedback").className   = "feedback";
    $("feedback").textContent = "";
  }
}

/* ── Load question (toujours une NOUVELLE question, écrase la sauvegarde) ── */
async function loadQ() {
  state.answered = false;
  chosenKey = null;

  const nextBtn = $("btn-next");
  nextBtn.classList.remove("on");
  nextBtn.disabled = true;

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
    $(`side-${k}`).closest(".side-wrap").style.animation = "none";
    const title = $(`title-${k}`);
    title.textContent = "";
    title.classList.add("skeleton");
    $(`num-${k}`).textContent   = "???";
    $(`num-${k}`).classList.remove("shown");
    $(`imgel-${k}`).style.display = "none";
    $(`ph-${k}`).style.display    = "none";
    $(`shim${k}`).style.display   = "flex";
    const wiki = $(`wiki-${k}`);
    wiki.style.pointerEvents = "none";
    wiki.style.opacity = "0";
  }
  requestAnimationFrame(() => {
    $("side-A").closest(".side-wrap").style.animation = "";
    $("side-B").closest(".side-wrap").style.animation = "";
  });

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
    ld = swap ? { title: tB, views: aB.views, img: imgB } : { title: tA, views: aA.views, img: imgA };
    rd = swap ? { title: tA, views: aA.views, img: imgA } : { title: tB, views: aB.views, img: imgB };

    winnerKey = aA.views >= aB.views
      ? (swap ? "B" : "A")
      : (swap ? "A" : "B");

    setCard("A", ld.title, ld.img);
    setCard("B", rd.title, rd.img);

    fb.className   = "feedback";
    fb.textContent = "";

    saveState();

  } catch (err) {
    console.error(err);
    fb.className   = "feedback ko";
    fb.textContent = "⚡ Erreur de chargement. Vérifiez votre connexion.";
    nextBtn.classList.add("on");
    nextBtn.disabled = false;
    ld = null; rd = null;
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

/* ── Raccourcis clavier (PC) ──
   ← / → : choisir le côté gauche / droit
   Espace ou Entrée : passer à la question suivante (une fois répondu) */
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    pick("A");
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    pick("B");
  } else if (e.key === " " || e.key === "Enter") {
    if (!$("btn-next").classList.contains("on")) return;
    if (e.target.tagName === "BUTTON") return; // laisse le bouton focus gérer sa propre activation
    e.preventDefault();
    loadQ();
  }
});

/* ── Démarrage ── */
const saved = loadState();

if (saved?.stats) {
  state.streak  = Number(saved.stats.streak)  || 0;
  state.best    = Number(saved.stats.best)    || 0;
  state.round   = Number(saved.stats.round)   || 0;
  state.correct = Number(saved.stats.correct) || 0;
}
syncUI();

if (saved?.current) {
  restoreCurrent(saved.current);
} else {
  loadQ();
}
