/* ============================================================
   WikiPop — script.js
   Structure : CONFIG · Store · Api · View · Game · Theme
   ============================================================ */
"use strict";

/* ── CONFIG ─────────────────────────────────────────────────── */
const CONFIG = {
  WIKI_VIEWS : "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/fr.wikipedia/all-access",
  WIKI_API   : "https://fr.wikipedia.org/w/api.php",
  COMMONS_API: "https://commons.wikimedia.org/w/api.php",
  BLACKLIST  : /^(Accueil|Spécial:|Wikipédia:|Portail:|Aide:|Utilisateur|Main_Page|Special:|Wikipedia:|Liste|Décès_|Décès |Mort_|Mort )/i,
  STORAGE_KEY: "wikipop-state",
  MAX_AGE_MS : 30 * 24 * 60 * 60 * 1000,   // purge après 30 jours d'inactivité
  DAYS       : 7,
  POOL_SIZE  : 300,
  POOL_MIN   : 10,
  IMG_WIDTH  : 800,
};

const $   = (id) => document.getElementById(id);
const fmt = (n)  => Math.round(n).toLocaleString("fr-FR");
const pad = (n)  => String(n).padStart(2, "0");

/* ── STORE : une seule clé (thème + stats + question en cours) ── */
const Store = {
  read() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data.savedAt || Date.now() - data.savedAt > CONFIG.MAX_AGE_MS) {
        localStorage.removeItem(CONFIG.STORAGE_KEY);
        return null;
      }
      return data;
    } catch { return null; }
  },
  write(patch) {
    try {
      const next = { ...(this.read() || {}), ...patch, savedAt: Date.now() };
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(next));
    } catch { /* stockage indisponible : on continue sans */ }
  },
};

/* ── API : Wikimédia (pageviews, images, fallback Commons) ───── */
const Api = {
  async fetchPool() {
    const requests = Array.from({ length: CONFIG.DAYS }, (_, i) => {
      const d = new Date(Date.now() - 86_400_000 * (i + 1));
      const url = `${CONFIG.WIKI_VIEWS}/${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
      return fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
    });

    const seen = new Set(), all = [];
    for (const data of await Promise.all(requests)) {
      for (const a of data?.items?.[0]?.articles ?? []) {
        const valid = !CONFIG.BLACKLIST.test(a.article) && a.views > 0 && !a.article.includes(".");
        if (valid && !seen.has(a.article)) { seen.add(a.article); all.push(a); }
      }
    }
    return all.sort(() => Math.random() - 0.5).slice(0, CONFIG.POOL_SIZE);
  },

  async fetchWikiImages(titles) {
    const params = new URLSearchParams({
      action: "query", prop: "pageimages|info", piprop: "thumbnail|original",
      pithumbsize: CONFIG.IMG_WIDTH, inprop: "url", titles: titles.join("|"),
      format: "json", origin: "*",
    });
    const res = await fetch(`${CONFIG.WIKI_API}?${params}`);
    if (!res.ok) throw new Error(`wiki API ${res.status}`);
    const data = await res.json();

    const map = {};
    for (const p of Object.values(data.query?.pages ?? {})) map[p.title] = p.thumbnail?.source ?? null;
    for (const n of data.query?.normalized ?? []) if (map[n.to] !== undefined) map[n.from] = map[n.to];
    return map;
  },

  async fetchCommonsImage(query) {
    try {
      const search = new URLSearchParams({
        action: "query", list: "search", srsearch: `${query} filetype:bitmap`,
        srnamespace: "6", srlimit: "5", format: "json", origin: "*",
      });
      const hits = (await (await fetch(`${CONFIG.COMMONS_API}?${search}`)).json()).query?.search ?? [];

      for (const hit of hits) {
        if (/\.(pdf|djvu|svg|ogg|ogv)$/i.test(hit.title)) continue;
        const info = new URLSearchParams({
          action: "query", prop: "imageinfo", iiprop: "url|size",
          iiurlwidth: CONFIG.IMG_WIDTH, titles: hit.title, format: "json", origin: "*",
        });
        const page = Object.values((await (await fetch(`${CONFIG.COMMONS_API}?${info}`)).json()).query?.pages ?? {})[0];
        const ii = page?.imageinfo?.[0];
        if (ii?.thumburl && ii.width >= 200 && ii.height >= 200) return ii.thumburl;
      }
    } catch { /* pas d'image : on affichera l'initiale */ }
    return null;
  },

  async resolveImage(map, title) {
    const lower = title.toLowerCase();
    const hit = map[title] ?? map[title.replaceAll(" ", "_")]
      ?? Object.entries(map).find(([k, v]) => v && k.toLowerCase() === lower)?.[1];
    return hit ?? this.fetchCommonsImage(title);
  },
};

/* ── VIEW : tout ce qui touche au DOM ────────────────────────── */
const View = {
  keys: ["A", "B"],

  init(onPick) {
    const labels = { A: "← A", B: "B →" };
    $("duel").innerHTML = [
      this.cardHTML("A", labels.A),
      `<div class="vs" id="vs" aria-hidden="true">VS</div>`,
      this.cardHTML("B", labels.B),
    ].join("");
    this.keys.forEach(k => $(`pick-${k}`).addEventListener("click", () => onPick(k)));
  },

  cardHTML(k, keyLabel) {
    return `
    <article class="card" id="card-${k}">
      <button class="card__pick" id="pick-${k}" type="button" disabled>
        <div class="card__media" id="media-${k}" data-state="loading">
          <img class="card__img" id="img-${k}" alt="" />
          <span class="card__key" aria-hidden="true">${keyLabel}</span>
          <span class="card__badge">Gagnant</span>
        </div>
        <div class="card__body">
          <h2 class="card__title is-skeleton" id="title-${k}"></h2>
          <div class="result">
            <span class="result__hidden">Nombre de vues masqué</span>
            <div class="result__shown">
              <div class="result__row">
                <span class="result__label">Vues sur 7 jours</span>
                <span class="result__num" id="num-${k}"></span>
              </div>
              <div class="bar"><i id="bar-${k}"></i></div>
            </div>
          </div>
        </div>
      </button>
      <a class="card__link" id="link-${k}" href="#" target="_blank" rel="noopener noreferrer" aria-disabled="true">Lire sur Wikipédia ↗</a>
    </article>`;
  },

  /* Dégradé stable par titre, pour les pages sans image */
  gradient(title) {
    let h = 0;
    for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `linear-gradient(135deg, hsl(${h} 45% 38%), hsl(${(h + 50) % 360} 50% 22%))`;
  },

  setBusy(busy) { $("duel").setAttribute("aria-busy", busy); },

  /* Carte en cours de chargement */
  setLoading(k) {
    $(`card-${k}`).className = "card";
    $(`pick-${k}`).disabled = true;
    const title = $(`title-${k}`);
    title.textContent = "";
    title.classList.add("is-skeleton");
    const media = $(`media-${k}`);
    media.dataset.state = "loading";
    media.style.background = "";
    $(`img-${k}`).removeAttribute("src");
    $(`bar-${k}`).style.width = "0";
    const link = $(`link-${k}`);
    link.setAttribute("aria-disabled", "true");
    link.removeAttribute("href");
  },

  /* Carte prête : titre, image (ou initiale), lien */
  setCard(k, { title, img }) {
    const t = $(`title-${k}`);
    t.textContent = title;
    t.classList.remove("is-skeleton");

    const media = $(`media-${k}`);
    const showEmpty = () => {
      media.dataset.state = "empty";
      media.dataset.initial = title.charAt(0).toUpperCase();
      media.style.background = this.gradient(title);
    };

    if (img) {
      const el = $(`img-${k}`), probe = new Image();
      media.dataset.state = "loading";
      probe.onload  = () => { el.src = img; el.alt = ""; media.dataset.state = "ready"; };
      probe.onerror = showEmpty;
      probe.src = img;
    } else {
      showEmpty();
    }

    const link = $(`link-${k}`);
    link.href = `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
    link.removeAttribute("aria-disabled");
    link.setAttribute("aria-label", `Voir « ${title} » sur Wikipédia`);
    $(`pick-${k}`).setAttribute("aria-label", `Choisir : ${title}`);
    $(`pick-${k}`).disabled = false;
  },

  /* Résultat : contours, vues, barres proportionnelles, écart */
  showResult(duel) {
    const max = Math.max(duel.A.views, duel.B.views);
    this.keys.forEach(k => {
      $(`card-${k}`).classList.add("is-done", k === duel.winner ? "is-win" : "is-lose");
      $(`pick-${k}`).disabled = true;
      $(`num-${k}`).textContent = fmt(duel[k].views);
      requestAnimationFrame(() => { $(`bar-${k}`).style.width = `${(duel[k].views / max) * 100}%`; });
    });
    const vs = $("vs");
    vs.textContent = `×${this.ratio(duel)}`;
    vs.classList.add("is-ratio");
  },

  resetVs() {
    const vs = $("vs");
    vs.textContent = "VS";
    vs.classList.remove("is-ratio");
  },

  ratio(duel) {
    const w = duel[duel.winner].views, l = duel[duel.winner === "A" ? "B" : "A"].views;
    return (w / l).toFixed(1).replace(".", ",");
  },

  feedback(kind, icon, text) {
    $("feedback").className = `feedback${kind ? ` is-${kind}` : ""}`;
    $("fb-ic").textContent = icon;
    $("fb-text").textContent = text;
  },

  setNext(enabled) { $("next").disabled = !enabled; },

  stats({ streak, best, rounds, correct }) {
    $("s-streak").textContent = streak;
    $("s-best").textContent   = best;
    $("s-acc").textContent    = rounds ? `${Math.round((correct / rounds) * 100)} %` : "–";
    $("stat-streak").classList.toggle("is-hot", streak >= 3);
  },
};

/* ── GAME ───────────────────────────────────────────────────── */
const Game = {
  stats : { streak: 0, best: 0, rounds: 0, correct: 0 },
  duel  : null,      // { A:{title,views,img}, B:{…}, winner:"A"|"B", chosen, answered }
  pool  : [],
  loading: false,

  init() {
    View.init((k) => this.pick(k));
    $("next").addEventListener("click", () => this.loadQuestion());
    document.addEventListener("keydown", (e) => this.onKey(e));

    const saved = Store.read();
    if (saved?.stats) {
      const s = saved.stats;
      this.stats = {
        streak : Number(s.streak)  || 0,
        best   : Number(s.best)    || 0,
        rounds : Number(s.round)   || 0,
        correct: Number(s.correct) || 0,
      };
    }
    View.stats(this.stats);

    saved?.current ? this.restore(saved.current) : this.loadQuestion();
  },

  /* Format de sauvegarde inchangé (compatible avec l'ancienne version) */
  save() {
    const d = this.duel;
    Store.write({
      stats: { streak: this.stats.streak, best: this.stats.best, round: this.stats.rounds, correct: this.stats.correct },
      current: d ? { answered: d.answered, chosenKey: d.chosen, winnerKey: d.winner, left: d.A, right: d.B } : null,
    });
  },

  restore(saved) {
    this.duel = { A: saved.left, B: saved.right, winner: saved.winnerKey, chosen: saved.chosenKey, answered: !!saved.answered };
    View.keys.forEach(k => View.setCard(k, this.duel[k]));
    View.setBusy(false);
    View.resetVs();
    if (this.duel.answered) {
      View.showResult(this.duel);
      this.announce();
      View.setNext(true);
    } else {
      View.feedback("", "?", "Choisis une page pour voir la réponse.");
      View.setNext(false);
    }
  },

  async loadQuestion() {
    if (this.loading) return;
    this.loading = true;
    this.duel = null;
    View.setBusy(true);
    View.setNext(false);
    View.resetVs();
    View.feedback("", "…", "Chargement…");
    View.keys.forEach(k => View.setLoading(k));

    try {
      if (this.pool.length < CONFIG.POOL_MIN) this.pool = await Api.fetchPool();
      if (this.pool.length < 2) throw new Error("Pool vide");

      /* Deux articles distincts tirés au hasard, retirés du pool */
      const [a, b] = this.takeTwo();
      const titleA = a.article.replaceAll("_", " "), titleB = b.article.replaceAll("_", " ");
      const map = await Api.fetchWikiImages([titleA, titleB]);
      const [imgA, imgB] = await Promise.all([Api.resolveImage(map, titleA), Api.resolveImage(map, titleB)]);

      const items = [{ title: titleA, views: a.views, img: imgA }, { title: titleB, views: b.views, img: imgB }];
      if (Math.random() > 0.5) items.reverse();
      const [A, B] = items;
      this.duel = { A, B, winner: A.views >= B.views ? "A" : "B", chosen: null, answered: false };

      View.keys.forEach(k => View.setCard(k, this.duel[k]));
      View.feedback("", "?", "Choisis une page pour voir la réponse.");
      this.save();
    } catch (err) {
      console.error(err);
      View.feedback("ko", "!", "Erreur de chargement. Vérifie ta connexion puis réessaie.");
      View.keys.forEach(k => View.setCard(k, { title: "—", img: null }));
      View.keys.forEach(k => { $(`pick-${k}`).disabled = true; });
      View.setNext(true);
    } finally {
      View.setBusy(false);
      this.loading = false;
    }
  },

  takeTwo() {
    const i = Math.floor(Math.random() * this.pool.length);
    let j;
    do { j = Math.floor(Math.random() * this.pool.length); } while (j === i);
    const picked = [this.pool[i], this.pool[j]];
    [i, j].sort((x, y) => y - x).forEach(n => this.pool.splice(n, 1));
    return picked;
  },

  pick(k) {
    const d = this.duel;
    if (!d || d.answered || this.loading) return;
    d.answered = true;
    d.chosen = k;

    const ok = k === d.winner;
    this.stats.rounds++;
    if (ok) {
      this.stats.streak++;
      this.stats.correct++;
      this.stats.best = Math.max(this.stats.best, this.stats.streak);
    } else {
      this.stats.streak = 0;
    }

    View.showResult(d);
    this.announce();
    View.stats(this.stats);
    View.setNext(true);
    $("next").focus({ preventScroll: true });
    this.save();
  },

  announce() {
    const d = this.duel, w = d[d.winner].title, r = View.ratio(d);
    d.chosen === d.winner
      ? View.feedback("ok", "✓", `Bien joué : « ${w} » est ${r} fois plus consultée.`)
      : View.feedback("ko", "✕", `Raté : c'était « ${w} », ${r} fois plus consultée.`);
  },

  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "ArrowLeft")  { e.preventDefault(); this.pick("A"); }
    else if (e.key === "ArrowRight") { e.preventDefault(); this.pick("B"); }
    else if ((e.key === "Enter" || e.key === " ") && this.duel?.answered && document.activeElement === document.body) {
      e.preventDefault();
      this.loadQuestion();
    }
  },
};

/* ── THEME ──────────────────────────────────────────────────── */
const Theme = {
  ICONS: {
    sun : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>`,
    moon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`,
  },
  btn: null,

  init() {
    this.btn = $("theme");
    this.render();
    this.btn.addEventListener("click", () => {
      const next = this.current() === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      Store.write({ theme: next });
      this.render();
    });
  },
  current() { return document.documentElement.dataset.theme === "dark" ? "dark" : "light"; },
  render() {
    const dark = this.current() === "dark";
    this.btn.innerHTML = dark ? this.ICONS.sun : this.ICONS.moon;
    this.btn.setAttribute("aria-label", dark ? "Passer en mode clair" : "Passer en mode sombre");
  },
};

/* ── DÉMARRAGE ──────────────────────────────────────────────── */
Theme.init();
Game.init();
