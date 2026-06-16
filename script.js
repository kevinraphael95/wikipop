"use strict";

/* ═══════════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════════ */
const WIKI_VIEWS = "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/fr.wikipedia/all-access";
// On utilise l'API MediaWiki action=query pour les images — bien plus fiable que REST summary
// car elle renvoie des URLs upload.wikimedia.org avec pithumbsize réglable et sans pb CORS
const WIKI_API   = "https://fr.wikipedia.org/w/api.php";

const BLACKLIST  = /^(Accueil|Spécial:|Wikipédia:|Portail:|Aide:|Utilisateur|Main_Page|Special:|Wikipedia:)/i;

/* ═══════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════ */
const state = { score: 0, streak: 0, best: 0, answered: false };
let articlePool = [];

/* ═══════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════ */
const qs  = s => document.querySelector(s);
const esc = s => String(s ?? "")
  .replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const fmtNum = n => Math.round(n).toLocaleString("fr-FR");

function setMain(html) { qs("#main").innerHTML = html; }

/* ═══════════════════════════════════════════════
   FETCH TOP ARTICLES (vues d'hier)
═══════════════════════════════════════════════ */
async function fetchTopArticles() {
  const pad = n => String(n).padStart(2, "0");
  const d   = new Date(Date.now() - 86400000); // hier
  const url = `${WIKI_VIEWS}/${d.getUTCFullYear()}/${pad(d.getUTCMonth()+1)}/${pad(d.getUTCDate())}`;
  const r   = await fetch(url);
  if (!r.ok) throw new Error(`pageviews HTTP ${r.status}`);
  const data = await r.json();
  return (data.items?.[0]?.articles ?? [])
    .filter(a => !BLACKLIST.test(a.article) && a.views > 0)
    .slice(0, 100);
}

/* ═══════════════════════════════════════════════
   FETCH IMAGES via MediaWiki action=query
   -----------------------------------------------
   On interroge l'API MediaWiki avec :
     action=query & prop=pageimages & piprop=thumbnail
     & pithumbsize=800    ← haute résolution
     & titles=A|B
   Cette API renvoie les images depuis upload.wikimedia.org
   sans problème CORS dans le navigateur (contrairement
   à l'API REST summary qui est souvent bloquée en iframe).
═══════════════════════════════════════════════ */
async function fetchImages(titles) {
  // titles = ["Tour Eiffel", "Albert Einstein"]
  const params = new URLSearchParams({
    action:      "query",
    prop:        "pageimages|info",
    piprop:      "thumbnail",
    pithumbsize: "800",   // ← taille élevée pour bonne qualité
    inprop:      "url",
    titles:      titles.join("|"),
    format:      "json",
    origin:      "*",     // ← nécessaire pour CORS depuis le navigateur
  });
  const r = await fetch(`${WIKI_API}?${params}`);
  if (!r.ok) throw new Error(`MediaWiki API HTTP ${r.status}`);
  const data = await r.json();

  // Construire un map titre → URL image
  const map = {};
  const pages = Object.values(data.query?.pages ?? {});
  for (const page of pages) {
    // Normalisation : l'API peut retourner le titre canonique
    const key = page.title;
    map[key] = page.thumbnail?.source ?? null;
  }
  // Aussi indexer par les titres demandés (en cas de redirection/normalisation)
  if (data.query?.normalized) {
    for (const n of data.query.normalized) {
      // n.from = titre demandé, n.to = titre canonique
      const imgUrl = map[n.to];
      if (imgUrl) map[n.from] = imgUrl;
    }
  }
  return map;
}

/* ═══════════════════════════════════════════════
   BUILD SIDE HTML
═══════════════════════════════════════════════ */
function sideHTML(side) {
  const imgPart = side.img
    ? `<img class="side-img" src="${esc(side.img)}" alt="${esc(side.title)}"
         loading="eager"
         onerror="this.closest('.side-img-wrap').innerHTML='<div class=\\'no-img\\'>📄</div>'">`
    : `<div class="no-img">📄</div>`;

  return `
    <button class="side" id="side-${side.key}" data-key="${side.key}">
      <div class="side-img-wrap">${imgPart}</div>
      <div class="side-body">
        <div class="side-title">${esc(side.title)}</div>
        <div class="side-hint">vues hier</div>
        <div class="views-wrap" id="views-${side.key}">
          <div class="views-num" id="num-${side.key}">?</div>
          <div class="views-label">vues</div>
          <div class="bar-track"><div class="bar-fill" id="bar-${side.key}"></div></div>
        </div>
      </div>
    </button>`;
}

/* ═══════════════════════════════════════════════
   RENDER ARENA
═══════════════════════════════════════════════ */
function renderArena(left, right, winnerKey) {
  const total    = left.views + right.views;
  const leftPct  = Math.round((left.views / total) * 100);
  const rightPct = 100 - leftPct;

  setMain(`
    <div class="question-bar">
      Lequel a été le plus consulté <em>hier</em> sur Wikipédia ?
    </div>
    <div class="duel">
      ${sideHTML(left)}
      <div class="vs-col"><div class="vs-badge">VS</div></div>
      ${sideHTML(right)}
    </div>
    <div class="feedback" id="feedback"></div>
    <div class="bottom-bar">
      <div class="streak-info">Série&nbsp;<strong id="streak2">${state.streak}</strong></div>
      <button class="btn-next" id="btn-next">
        Suivant
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="5" y1="12" x2="19" y2="12"/>
          <polyline points="12 5 19 12 12 19"/>
        </svg>
      </button>
    </div>
  `);

  qs("#score").textContent  = state.score;
  qs("#streak").textContent = state.streak;

  // Bind clics sur les côtés
  [left, right].forEach(side => {
    qs(`#side-${side.key}`).onclick = () =>
      reveal(side.key, winnerKey, left, right, leftPct, rightPct);
  });

  qs("#btn-next").onclick = loadQuestion;
}

/* ═══════════════════════════════════════════════
   REVEAL après réponse
═══════════════════════════════════════════════ */
function reveal(chosen, winnerKey, left, right, leftPct, rightPct) {
  if (state.answered) return;
  state.answered = true;

  const isOk = chosen === winnerKey;
  if (isOk) {
    state.score  += 10 + state.streak * 2;
    state.streak += 1;
    state.best    = Math.max(state.best, state.streak);
  } else {
    state.streak = 0;
  }

  qs("#score").textContent  = state.score;
  qs("#streak").textContent = state.streak;
  if (qs("#streak2")) qs("#streak2").textContent = state.streak;

  [left, right].forEach(side => {
    const btn = qs(`#side-${side.key}`);
    btn.disabled = true;
    btn.classList.add(side.key === winnerKey ? "correct" : "wrong");
    btn.classList.add("revealed");

    const pct = side.key === left.key ? leftPct : rightPct;
    // Afficher les vues
    const vw = qs(`#views-${side.key}`);
    if (vw) vw.style.display = "flex";
    const numEl = qs(`#num-${side.key}`);
    if (numEl) numEl.textContent = fmtNum(side.views);
    const barEl = qs(`#bar-${side.key}`);
    if (barEl) {
      if (side.key === winnerKey) barEl.classList.add("winner");
      requestAnimationFrame(() => setTimeout(() => { barEl.style.width = pct + "%"; }, 60));
    }
  });

  // Feedback
  const fb = qs("#feedback");
  if (fb) {
    const winner = winnerKey === left.key ? left : right;
    const loser  = winnerKey === left.key ? right : left;
    fb.className = "feedback " + (isOk ? "ok" : "ko");
    fb.textContent = isOk
      ? `✓ Bien joué ! « ${winner.title} » — ${fmtNum(winner.views)} vues vs ${fmtNum(loser.views)}.`
      : `✗ C'était « ${winner.title} » — ${fmtNum(winner.views)} vues vs ${fmtNum(loser.views)}.`;
  }

  const nb = qs("#btn-next");
  if (nb) nb.classList.add("active");
}

/* ═══════════════════════════════════════════════
   LOAD QUESTION
═══════════════════════════════════════════════ */
async function loadQuestion() {
  state.answered = false;
  setMain('<div class="loader"><div class="ring"></div><span>Chargement…</span></div>');

  try {
    // Recharger le pool si nécessaire
    if (articlePool.length < 20) {
      const top   = await fetchTopArticles();
      articlePool = top; // reset
    }

    // Choisir deux articles : un "populaire" (top 15) et un "moins populaire" (rang 15-60)
    if (articlePool.length < 20) throw new Error("Pas assez d'articles dans le top");

    const idxA = Math.floor(Math.random() * 12);
    const idxB = 12 + Math.floor(Math.random() * Math.min(45, articlePool.length - 12));

    const artA = articlePool[idxA];
    const artB = articlePool[idxB];

    // Retirer les deux du pool pour éviter les répétitions
    // (on retire le plus grand index en premier pour ne pas décaler)
    const removeIdxs = [idxA, idxB].sort((a,b) => b - a);
    for (const idx of removeIdxs) articlePool.splice(idx, 1);

    const titleA = artA.article.replaceAll("_", " ");
    const titleB = artB.article.replaceAll("_", " ");

    // Fetch images via MediaWiki API (haute qualité, pas de CORS)
    const imgMap = await fetchImages([titleA, titleB]);

    // Chercher l'image avec correspondance souple (les titres peuvent être normalisés)
    function findImg(title) {
      if (imgMap[title]) return imgMap[title];
      // Essai avec underscore
      const withUnderscore = title.replaceAll(" ", "_");
      if (imgMap[withUnderscore]) return imgMap[withUnderscore];
      // Chercher dans le map par includes (normalisation partielle)
      for (const [k, v] of Object.entries(imgMap)) {
        if (v && k.toLowerCase() === title.toLowerCase()) return v;
      }
      return null;
    }

    const imgA = findImg(titleA);
    const imgB = findImg(titleB);

    // Placement aléatoire gauche/droite
    const swap = Math.random() > 0.5;
    const left  = swap
      ? { key: "B", title: titleB, img: imgB, views: artB.views }
      : { key: "A", title: titleA, img: imgA, views: artA.views };
    const right = swap
      ? { key: "A", title: titleA, img: imgA, views: artA.views }
      : { key: "B", title: titleB, img: imgB, views: artB.views };
    const winnerKey = artA.views >= artB.views ? "A" : "B";

    renderArena(left, right, winnerKey);

  } catch (e) {
    console.error(e);
    setMain(`
      <div class="err">
        ⚡ Erreur de chargement.<br>
        <button class="retry-btn" onclick="loadQuestion()">Réessayer</button>
      </div>
    `);
  }
}

// Exposer globalement pour les boutons inline
window.loadQuestion = loadQuestion;

// Démarrer
loadQuestion();
