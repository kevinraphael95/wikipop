/* ============================================================
   WikiGames — script.js
   Zéro base de données. Toutes les questions sont en dur.
   API Wikipedia REST utilisée uniquement pour les résumés/images.
   ============================================================ */

const WIKI_API = "https://fr.wikipedia.org/api/rest_v1";

/* ── État global ── */
const state = {
  mode: "which-country",
  score: 0,
  streak: 0,
  best: 0,
  rounds: 0,
  answered: false,
};

/* ── Modes disponibles ── */
const MODES = [
  { id: "which-country", label: "📍 Pays" },
  { id: "before-after",  label: "📅 Chrono" },
  { id: "popularity",    label: "📊 Popularité" },
  { id: "true-false",    label: "❓ Vrai / Faux" },
];

/* ── Données : mode "Pays" ── */
const LANDMARKS = [
  { title: "Tour_Eiffel",                              country: "France",       distractors: ["Italie","Allemagne","Espagne"] },
  { title: "Colisée",                                  country: "Italie",       distractors: ["Grèce","France","Portugal"] },
  { title: "Big_Ben",                                  country: "Royaume-Uni",  distractors: ["Irlande","Pays-Bas","Belgique"] },
  { title: "Sagrada_Família",                          country: "Espagne",      distractors: ["Portugal","France","Italie"] },
  { title: "Acropole_d'Athènes",                       country: "Grèce",        distractors: ["Turquie","Italie","Chypre"] },
  { title: "Château_de_Versailles",                    country: "France",       distractors: ["Belgique","Luxembourg","Suisse"] },
  { title: "Kremlin_de_Moscou",                        country: "Russie",       distractors: ["Ukraine","Biélorussie","Pologne"] },
  { title: "Tour_de_Pise",                             country: "Italie",       distractors: ["Espagne","France","Croatie"] },
  { title: "Alhambra",                                 country: "Espagne",      distractors: ["Maroc","Portugal","Italie"] },
  { title: "Hagia_Sophia",                             country: "Turquie",      distractors: ["Grèce","Syrie","Égypte"] },
  { title: "Statue_de_la_Liberté",                     country: "États-Unis",   distractors: ["Canada","France","Mexique"] },
  { title: "Opéra_de_Sydney",                          country: "Australie",    distractors: ["Nouvelle-Zélande","Afrique_du_Sud","Canada"] },
  { title: "Machu_Picchu",                             country: "Pérou",        distractors: ["Bolivie","Colombie","Chili"] },
  { title: "Taj_Mahal",                                country: "Inde",         distractors: ["Pakistan","Bangladesh","Népal"] },
  { title: "Grande_Muraille_de_Chine",                 country: "Chine",        distractors: ["Mongolie","Corée_du_Nord","Japon"] },
  { title: "Pyramides_de_Gizeh",                       country: "Égypte",       distractors: ["Soudan","Maroc","Libye"] },
  { title: "Cathédrale_Notre-Dame_de_Paris",           country: "France",       distractors: ["Belgique","Suisse","Luxembourg"] },
  { title: "Atomium",                                  country: "Belgique",     distractors: ["Pays-Bas","Luxembourg","France"] },
  { title: "Parlement_de_Budapest",                    country: "Hongrie",      distractors: ["Roumanie","Autriche","Slovaquie"] },
  { title: "Burj_Khalifa",                             country: "Émirats_arabes_unis", distractors: ["Qatar","Arabie_saoudite","Koweït"] },
];

/* ── Données : mode "Chrono" ── */
const EVENTS = [
  { label: "Révolution française",                 year: 1789 },
  { label: "Première Guerre mondiale",             year: 1914 },
  { label: "Seconde Guerre mondiale",              year: 1939 },
  { label: "Chute du mur de Berlin",               year: 1989 },
  { label: "Premiers pas sur la Lune",             year: 1969 },
  { label: "Traité de Westphalie",                 year: 1648 },
  { label: "Indépendance des États-Unis",          year: 1776 },
  { label: "Révolution russe",                     year: 1917 },
  { label: "Chute de l'Empire romain d'Occident", year: 476  },
  { label: "Naissance de Jésus-Christ",            year: 0    },
  { label: "Découverte de l'Amérique",             year: 1492 },
  { label: "Invention de l'imprimerie (Gutenberg)",year: 1450 },
  { label: "Bataille de Waterloo",                 year: 1815 },
  { label: "Déclaration des droits de l'homme",   year: 1789 },
  { label: "Lancement de Spoutnik",                year: 1957 },
  { label: "Fin de la guerre du Vietnam",          year: 1975 },
  { label: "Charte des Nations Unies",             year: 1945 },
  { label: "Traité de Versailles",                 year: 1919 },
  { label: "Invention de l'automobile (Benz)",     year: 1885 },
  { label: "Révolution industrielle anglaise",     year: 1760 },
];

/* ── Données : mode "Popularité" ──
   La « bonne » réponse est toujours l'index 0 (A),
   car dans la vraie vie les paires sont triées par notoriété supposée.
   Le joueur ne peut pas le deviner à l'avance. */
const POP_PAIRS = [
  { a: { title: "Paris",              label: "Paris"              }, b: { label: "Lyon"               } },
  { a: { title: "Japon",             label: "Japon"              }, b: { label: "Corée du Sud"        } },
  { a: { title: "Football",          label: "Football"           }, b: { label: "Rugby"               } },
  { a: { title: "Albert_Einstein",   label: "Albert Einstein"    }, b: { label: "Isaac Newton"        } },
  { a: { title: "Harry_Potter",      label: "Harry Potter"       }, b: { label: "Le Seigneur des anneaux" } },
  { a: { title: "Lune",              label: "La Lune"            }, b: { label: "Mars (planète)"      } },
  { a: { title: "Manga",             label: "Manga"              }, b: { label: "Anime"               } },
  { a: { title: "Bitcoin",           label: "Bitcoin"            }, b: { label: "Ethereum"            } },
  { a: { title: "Napoléon_Ier",      label: "Napoléon Iᵉʳ"      }, b: { label: "Jules César"         } },
  { a: { title: "Deuxième_Guerre_mondiale", label: "2ᵉ Guerre mondiale" }, b: { label: "1ʳᵉ Guerre mondiale" } },
  { a: { title: "Sushi",             label: "Sushi"              }, b: { label: "Ramen"               } },
  { a: { title: "Python_(langage)",  label: "Python"             }, b: { label: "Java"                } },
  { a: { title: "Versailles",        label: "Versailles"         }, b: { label: "Fontainebleau"       } },
  { a: { title: "Éiffel",            label: "Tour Eiffel"        }, b: { label: "Arc de triomphe"     } },
];

/* ── Données : mode "Vrai / Faux" ── */
const TF_QUESTIONS = [
  { q: "La tour Eiffel est la structure la plus haute du monde.",         a: false, expl: "Elle ne l'est plus depuis longtemps — le Burj Khalifa la dépasse largement." },
  { q: "Le Soleil est une étoile.",                                        a: true,  expl: "Oui, une étoile de type naine jaune (G2V)." },
  { q: "La baleine bleue est le plus grand animal terrestre.",             a: false, expl: "La baleine bleue est marine, pas terrestre." },
  { q: "La Grande Muraille de Chine est visible de l'espace à l'œil nu.", a: false, expl: "C'est un mythe populaire — elle est trop étroite pour être vue depuis l'orbite." },
  { q: "L'ADN humain est identique à plus de 98 % à celui du chimpanzé.", a: true,  expl: "Environ 98,7 % de notre génome est partagé avec le chimpanzé." },
  { q: "Napoléon Bonaparte était de très petite taille pour son époque.", a: false, expl: "Il mesurait ~1 m 69, taille tout à fait normale au XIXᵉ siècle." },
  { q: "L'eau bout à 100 °C au niveau de la mer.",                        a: true,  expl: "Exact, à pression atmosphérique standard (1 atm)." },
  { q: "Les requins sont des mammifères.",                                 a: false, expl: "Les requins sont des poissons cartilagineux (chondrichtyens)." },
  { q: "L'Antarctique est un continent.",                                  a: true,  expl: "Oui, le 5ᵉ plus grand continent, recouvert d'une calotte glaciaire." },
  { q: "Le son voyage plus vite que la lumière.",                          a: false, expl: "La lumière (~300 000 km/s) est environ 880 000 fois plus rapide que le son." },
  { q: "Les chauves-souris sont aveugles.",                                a: false, expl: "Les chauves-souris voient ; elles utilisent aussi l'écholocation." },
  { q: "Le mont Everest est le sommet le plus haut du monde.",             a: true,  expl: "8 848 m au-dessus du niveau de la mer." },
  { q: "Les diamants sont faits de carbone.",                              a: true,  expl: "Oui, du carbone pur cristallisé sous haute pression et température." },
  { q: "L'oxygène est le gaz le plus abondant dans l'atmosphère terrestre.", a: false, expl: "C'est l'azote (78 %), l'oxygène ne représente que 21 %." },
  { q: "La Russie est le plus grand pays du monde en superficie.",         a: true,  expl: "Avec ~17,1 millions de km², la Russie est de loin le plus vaste pays." },
  { q: "Le cœur d'un adulte bat en moyenne 200 fois par minute.",         a: false, expl: "La fréquence cardiaque normale au repos est de 60 à 100 bpm." },
  { q: "L'or est un métal naturellement liquide à température ambiante.", a: false, expl: "L'or est solide à température ambiante — c'est le mercure qui est liquide." },
  { q: "Les humains utilisent seulement 10 % de leur cerveau.",           a: false, expl: "Ce mythe est faux ; la quasi-totalité du cerveau est active à tout moment." },
  { q: "Le Groenland appartient administrativement au Danemark.",         a: true,  expl: "Le Groenland est un territoire autonome du Royaume du Danemark." },
  { q: "Le zèbre est un animal blanc avec des rayures noires.",            a: false, expl: "Génétiquement, le zèbre est noir avec des rayures blanches." },
];

/* ════════════════════════════════════════════════════
   Utilitaires
   ════════════════════════════════════════════════════ */
const qs  = s => document.querySelector(s);
const card = qs("#card");

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickTwo(arr) {
  const s = shuffle(arr);
  return [s[0], s[1]];
}

/* ════════════════════════════════════════════════════
   Score
   ════════════════════════════════════════════════════ */
function bump(id) {
  const el = qs(`#${id}`);
  if (!el) return;
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
  setTimeout(() => el.classList.remove("bump"), 200);
}

function updateScore() {
  const ids = { score: state.score, streak: state.streak, best: state.best, rounds: state.rounds };
  ["hdr-score","sb-score"].forEach(id => { const el = qs(`#${id}`); if (el) el.textContent = state.score; });
  ["hdr-streak","sb-streak"].forEach(id => { const el = qs(`#${id}`); if (el) el.textContent = state.streak; });
  const best = qs("#sb-best");   if (best)   best.textContent   = state.best;
  const rds  = qs("#sb-rounds"); if (rds)    rds.textContent    = state.rounds;
}

function onCorrect() {
  const pts = 10 + state.streak * 2;
  state.score  += pts;
  state.streak += 1;
  state.best    = Math.max(state.best, state.streak);
  state.rounds += 1;
  bump("sb-score");
  bump("sb-streak");
  updateScore();
  return pts;
}

function onWrong() {
  state.streak  = 0;
  state.rounds += 1;
  updateScore();
}

/* ════════════════════════════════════════════════════
   UI helpers
   ════════════════════════════════════════════════════ */
function showLoader() {
  card.innerHTML = `
    <div class="loader">
      <div class="loader-track"><div class="loader-fill"></div></div>
      <span>Chargement…</span>
    </div>`;
}

function showError(msg) {
  card.innerHTML = `
    <div class="error-box">
      ${esc(msg)}<br>
      <button class="retry-btn" onclick="loadQuestion()">Réessayer</button>
    </div>`;
}

async function fetchSummary(title) {
  const r = await fetch(`${WIKI_API}/page/summary/${encodeURIComponent(title)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* ── Bind options ── */
function bindOptions(correctVal, onReveal) {
  state.answered = false;
  const opts   = card.querySelectorAll(".opt");
  const nextBtn = card.querySelector(".btn-next");
  const fb      = card.querySelector(".feedback-bar");

  opts.forEach(btn => {
    btn.onclick = () => {
      if (state.answered) return;
      state.answered = true;

      const isOk = btn.dataset.val === String(correctVal);
      opts.forEach(o => o.disabled = true);
      btn.classList.add(isOk ? "correct" : "wrong");

      if (!isOk) {
        const winner = [...opts].find(o => o.dataset.val === String(correctVal));
        if (winner) winner.classList.add("correct");
      }

      if (fb) {
        fb.className = `feedback-bar show ${isOk ? "ok" : "ko"}`;
        if (!onReveal) {
          fb.textContent = isOk ? "✓ Bonne réponse !" : `✗ C'était : ${correctVal}`;
        }
      }

      isOk ? onCorrect() : onWrong();
      if (onReveal) onReveal(isOk, fb);
      if (nextBtn) nextBtn.disabled = false;
    };
  });

  if (nextBtn) nextBtn.onclick = loadQuestion;
}

function nextBtn() {
  return `<div class="actions">
    <button class="btn-next" disabled>Suivant <i class="ti ti-arrow-right" aria-hidden="true"></i></button>
  </div>`;
}

/* ════════════════════════════════════════════════════
   MODE : Pays
   ════════════════════════════════════════════════════ */
async function loadCountry() {
  const q = LANDMARKS[Math.floor(Math.random() * LANDMARKS.length)];

  let page;
  try { page = await fetchSummary(q.title); }
  catch { page = { title: q.title.replaceAll("_", " "), thumbnail: null, description: "" }; }

  const image = page.thumbnail?.source;
  const opts  = shuffle([
    { val: q.country, label: q.country },
    ...q.distractors.map(d => ({ val: d, label: d })),
  ]).slice(0, 4);
  /* Garantit que la bonne réponse est dans les 4 options */
  if (!opts.find(o => o.val === q.country)) opts[0] = { val: q.country, label: q.country };

  card.innerHTML = `
    ${image ? `<img class="card-image" src="${esc(image)}" alt="${esc(page.title)}" loading="lazy">` : ""}
    <div class="card-top">
      <div class="card-mode-label"><i class="ti ti-map-pin" aria-hidden="true"></i> Dans quel pays ?</div>
      <div class="card-question">${esc(page.title)}</div>
      ${page.description ? `<div class="card-sub">${esc(page.description)}</div>` : ""}
    </div>
    <div class="feedback-bar"></div>
    <div class="options grid2">
      ${shuffle(opts).map(o => `<button class="opt" data-val="${esc(o.val)}">${esc(o.label)}</button>`).join("")}
    </div>
    ${nextBtn()}`;

  bindOptions(q.country);
}

/* ════════════════════════════════════════════════════
   MODE : Chrono
   ════════════════════════════════════════════════════ */
async function loadBeforeAfter() {
  const [a, b] = pickTwo(EVENTS);
  /* Si même année, on re-tire */
  if (a.year === b.year) return loadBeforeAfter();

  const earlier = a.year < b.year ? a : b;
  const later   = a.year < b.year ? b : a;

  card.innerHTML = `
    <div class="card-top">
      <div class="card-mode-label"><i class="ti ti-calendar" aria-hidden="true"></i> Lequel est antérieur ?</div>
      <div class="card-question">Quel événement s'est produit en premier ?</div>
    </div>
    <div class="feedback-bar"></div>
    <div class="options grid2">
      <button class="opt" data-val="earlier" style="text-align:center">${esc(earlier.label)}</button>
      <button class="opt" data-val="later"   style="text-align:center">${esc(later.label)}</button>
    </div>
    ${nextBtn()}`;

  bindOptions("earlier", (isOk, fb) => {
    /* Révèle les années après la réponse */
    const btns = card.querySelectorAll(".opt");
    btns[0].innerHTML += `<br><small style="font-size:11px;opacity:0.7">${earlier.year === 0 ? "an 0" : earlier.year}</small>`;
    btns[1].innerHTML += `<br><small style="font-size:11px;opacity:0.7">${later.year}</small>`;
    if (fb) fb.textContent = isOk ? "✓ Bonne réponse !" : `✗ ${earlier.label} (${earlier.year}) est antérieur.`;
  });
}

/* ════════════════════════════════════════════════════
   MODE : Popularité
   ════════════════════════════════════════════════════ */
async function loadPopularity() {
  const pair = POP_PAIRS[Math.floor(Math.random() * POP_PAIRS.length)];

  /* Cherche l'image du sujet A depuis Wikipedia */
  let img = null;
  try {
    const page = await fetchSummary(pair.a.title);
    img = page.thumbnail?.source ?? null;
  } catch { /* pas grave */ }

  card.innerHTML = `
    ${img ? `<img class="card-image" src="${esc(img)}" alt="" loading="lazy">` : ""}
    <div class="card-top">
      <div class="card-mode-label"><i class="ti ti-chart-bar" aria-hidden="true"></i> Popularité Wikipedia</div>
      <div class="card-question">Lequel de ces deux articles est le plus consulté sur Wikipédia ?</div>
    </div>
    <div class="feedback-bar"></div>
    <div class="options grid2">
      <button class="opt" data-val="A" style="text-align:center">${esc(pair.a.label)}</button>
      <button class="opt" data-val="B" style="text-align:center">${esc(pair.b.label)}</button>
    </div>
    ${nextBtn()}`;

  bindOptions("A", (isOk, fb) => {
    if (fb) fb.textContent = isOk
      ? `✓ Oui ! "${pair.a.label}" est plus populaire sur Wikipédia.`
      : `✗ En réalité, "${pair.a.label}" est plus populaire.`;
  });
}

/* ════════════════════════════════════════════════════
   MODE : Vrai / Faux
   ════════════════════════════════════════════════════ */
async function loadTrueFalse() {
  const q = TF_QUESTIONS[Math.floor(Math.random() * TF_QUESTIONS.length)];
  const correctVal = q.a ? "vrai" : "faux";

  card.innerHTML = `
    <div class="card-top">
      <div class="card-mode-label"><i class="ti ti-help-circle" aria-hidden="true"></i> Vrai ou Faux ?</div>
      <div class="card-question">${esc(q.q)}</div>
    </div>
    <div class="feedback-bar"></div>
    <div class="options grid2">
      <button class="opt" data-val="vrai" style="text-align:center;font-size:16px">✓ Vrai</button>
      <button class="opt" data-val="faux"  style="text-align:center;font-size:16px">✗ Faux</button>
    </div>
    ${nextBtn()}`;

  bindOptions(correctVal, (isOk, fb) => {
    if (fb) fb.textContent = `${isOk ? "✓" : "✗"} ${q.expl}`;
  });
}

/* ════════════════════════════════════════════════════
   Routeur
   ════════════════════════════════════════════════════ */
async function loadQuestion() {
  showLoader();
  try {
    if (state.mode === "which-country") return await loadCountry();
    if (state.mode === "before-after")  return await loadBeforeAfter();
    if (state.mode === "popularity")    return await loadPopularity();
    if (state.mode === "true-false")    return await loadTrueFalse();
  } catch (e) {
    console.error(e);
    showError("Erreur réseau — vérifiez votre connexion.");
  }
}

/* Exposé globalement pour le bouton retry inline */
window.loadQuestion = loadQuestion;

/* ════════════════════════════════════════════════════
   Init : boutons de mode
   ════════════════════════════════════════════════════ */
const modesEl = qs("#modes");
MODES.forEach(m => {
  const btn = document.createElement("button");
  btn.className = "mode-btn" + (m.id === state.mode ? " active" : "");
  btn.textContent = m.label;
  btn.onclick = () => {
    modesEl.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.mode = m.id;
    loadQuestion();
  };
  modesEl.appendChild(btn);
});

loadQuestion();
