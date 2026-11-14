'use strict';

// Loaded in <head> without defer so the saved theme applies before first paint (no flash).
(() => {
  let theme = null;
  try {
    theme = localStorage.getItem('chatsafe.theme');
  } catch {
    /* storage blocked */
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = theme;
})();
