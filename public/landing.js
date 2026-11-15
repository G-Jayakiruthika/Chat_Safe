'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sections = Array.from(document.querySelectorAll('.stage'));
  const NAMES = { globe: 'GLOBE · CONNECTED INDIA', attack: 'ATTACK · SCAMS SPREADING', shield: 'SHIELD · PROTECTED', lock: 'LOCK · SECURED', ring: 'RING · 23 LANGUAGES', eye: 'EYE · KAVACH WATCHING' };
  const isDark = () => document.documentElement.dataset.theme !== 'light';

  /* ---------- Scroll morph + HUD ---------- */
  const morph = window.createMorph($('morph'), {
    sections,
    reducedMotion,
    onIndex: (i) => {
      $('hudIndex').textContent = `${String(i + 1).padStart(4, '0')} / ${String(sections.length).padStart(4, '0')}`;
      $('hudName').textContent = NAMES[sections[i]?.dataset.shape] || '';
      $('hudNum').textContent = String(i + 1).padStart(2, '0');
      $('hudTotal').textContent = `/ ${String(sections.length).padStart(2, '0')}`;
      $('hudNext').textContent = i + 1 < sections.length ? 'NEXT ↓' : 'TOP ↑';
    },
  });
  morph.setDark(isDark());

  /* ---------- Reveal on scroll + count-up stats ---------- */
  const countUp = (el) => {
    const to = Number(el.dataset.count);
    const dec = Number(el.dataset.decimals || 0);
    const fmt = (v) => `${el.dataset.prefix || ''}${v.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${el.dataset.suffix || ''}`;
    if (reducedMotion) { el.textContent = fmt(to); return; }
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / 1400);
      el.textContent = fmt(to * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      e.target.querySelectorAll('[data-count]').forEach(countUp);
      io.unobserve(e.target);
    }
  }, { threshold: 0.25 });
  document.querySelectorAll('.reveal-on-scroll').forEach((el) => io.observe(el));

  /* ---------- Eye showcase: five mini Kavach faces ---------- */
  document.querySelectorAll('.eye-row canvas').forEach((c) => {
    const k = window.createKavach(c, { mini: true, reducedMotion, mood: c.dataset.mood });
    k.setDark(isDark());
  });

  /* ---------- Theme ---------- */
  $('themeToggle').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('chatsafe.theme', next); } catch { /* ignore */ }
    morph.setDark(next === 'dark');
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
