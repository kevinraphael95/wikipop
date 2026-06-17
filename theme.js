(function(){
  const app  = document.getElementById('app');
  const btn  = document.getElementById('toggle-btn');
  const pref = window.matchMedia('(prefers-color-scheme: dark)').matches;
  let dark   = localStorage.getItem('wp-theme') !== 'light' && (localStorage.getItem('wp-theme') === 'dark' || pref);

  const sunIcon  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  const moonIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

  function apply() {
    const theme = dark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    app.setAttribute('data-theme', theme);
    btn.innerHTML = dark ? sunIcon : moonIcon;
    btn.setAttribute('aria-label', dark ? 'Passer en mode clair' : 'Passer en mode sombre');
    localStorage.setItem('wp-theme', theme);
  }
  apply();
  btn.addEventListener('click', () => { dark = !dark; apply(); });
})();
