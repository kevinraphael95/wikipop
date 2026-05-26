/* ============================================================
   TU PRÉFÈRES — Application Logic
   ============================================================ */

const API = "https://fr.wikipedia.org/api/rest_v1";

const state = {
  mode: "which-country",
  score: 0,
  streak: 0,
  best: 0,
  rounds: 0,
  answered: false
};

const $ = (s) => document.querySelector(s);

const card = $("#wg-card");

function esc(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/* SCORE */
function updateScore() {
  $("#wg-score-display").textContent = state.score;
  $("#wg-streak-display").textContent = state.streak;
  $("#sb-score").textContent = state.score;
  $("#sb-streak").textContent = state.streak;
  $("#sb-best").textContent = state.best;
  $("#sb-rounds").textContent = state.rounds;
}

function correct() {
  state.score += 10 + state.streak * 2;
  state.streak++;
  state.best = Math.max(state.best, state.streak);
  state.rounds++;
  updateScore();
}

function wrong() {
  state.streak = 0;
  state.rounds++;
  updateScore();
}

/* UI */
function loader() {
  card.innerHTML = `<div class="wg-loader">Chargement...</div>`;
}

function error(msg) {
  card.innerHTML = `<div style="padding:20px">${msg}<br><button onclick="loadQuestion()">Retry</button></div>`;
}

/* FETCH */
async function randomPage() {
  const r = await fetch(`${API}/page/random/summary`);
  return r.json();
}

async function summary(title) {
  const r = await fetch(`${API}/page/summary/${encodeURIComponent(title)}`);
  return r.json();
}

/* OPTIONS ENGINE (important optimisation) */
function bind(correct, onReveal) {
  state.answered = false;

  const opts = document.querySelectorAll(".wg-option");
  const next = $("#wg-next");
  const fb = $("#wg-fb");

  opts.forEach(btn => {
    btn.onclick = () => {
      if (state.answered) return;
      state.answered = true;

      const ok = btn.dataset.val === correct;

      opts.forEach(o => o.disabled = true);

      btn.classList.add(ok ? "correct" : "wrong");

      if (fb) {
        fb.textContent = ok ? "Bonne réponse" : `Faux → ${correct}`;
        fb.className = ok ? "wg-feedback correct-fb" : "wg-feedback wrong-fb";
      }

      ok ? correct() : wrong();
      if (onReveal) onReveal();

      next.disabled = false;
    };
  });

  next.onclick = loadQuestion;
}

/* MODE */
async function loadCountry() {
  const titles = ["Tour Eiffel","Colisée","Big Ben","Sagrada Família"];
  const title = titles[Math.floor(Math.random() * titles.length)];

  const page = await summary(title);

  const correct = "France";

  card.innerHTML = `
    <div class="wg-question-top">
      <div class="wg-question-text">${esc(page.title)}</div>
    </div>
    <div class="wg-feedback" id="wg-fb"></div>
    <div class="wg-options grid2">
      <button class="wg-option" data-val="France">France</button>
      <button class="wg-option" data-val="Italie">Italie</button>
      <button class="wg-option" data-val="Espagne">Espagne</button>
      <button class="wg-option" data-val="${correct}">${correct}</button>
    </div>
    <div class="wg-actions">
      <button id="wg-next" disabled>Next</button>
    </div>
  `;

  bind(correct);
}

/* ROUTER */
window.loadQuestion = async function () {
  loader();

  try {
    if (state.mode === "which-country") return loadCountry();
  } catch (e) {
    error("Erreur réseau");
  }
};

/* MODE SWITCH */
document.querySelectorAll(".wg-mode-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".wg-mode-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    state.mode = btn.dataset.mode;
    loadQuestion();
  };
});

loadQuestion();
