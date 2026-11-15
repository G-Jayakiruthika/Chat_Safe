'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sections = Array.from(document.querySelectorAll('.stage'));
  const NAMES = { globe: 'GLOBE · CONNECTED INDIA', attack: 'ATTACK · SCAMS SPREADING', shield: 'SHIELD · PROTECTED', lock: 'LOCK · SECURED', ring: 'RING · 23 LANGUAGES', eye: 'EYE · KAVACH WATCHING' };
  const isDark = () => document.documentElement.dataset.theme !== 'light';

  /* ---------- Boot loader ---------- */
  const STEPS = ['Fetching threat signatures…', 'Loading 23 languages…', 'Calibrating Kavach\'s eyes…', 'Arming the shield…'];
  const loader = $('loader');
  function finishLoader(withSound) {
    if (withSound && window.ChatSafeSound.muted) window.ChatSafeSound.toggle();
    if (!withSound && !window.ChatSafeSound.muted) window.ChatSafeSound.toggle();
    window.ChatSafeSound.play('unlock');
    loader.classList.add('done');
    document.body.classList.add('entered');
    setTimeout(() => loader.remove(), 700);
    $('heroTitle').focus?.();
  }
  (function countUp() {
    let pct = 0;
    const tick = () => {
      pct = Math.min(100, pct + (reducedMotion ? 100 : 3 + Math.random() * 7));
      $('loadPct').textContent = String(Math.floor(pct));
      $('loadStep').textContent = STEPS[Math.min(STEPS.length - 1, Math.floor((pct / 100) * STEPS.length))];
      if (pct < 100) setTimeout(tick, 40);
      else {
        $('loadStep').textContent = 'Shield online.';
        $('enter').hidden = false;
        $('enterQuiet').hidden = false;
        $('enter').focus();
      }
    };
    tick();
  })();
  $('enter').addEventListener('click', () => finishLoader(true));
  $('enterQuiet').addEventListener('click', () => finishLoader(false));
  // Returning visitors in the same session skip the loader.
  try {
    if (sessionStorage.getItem('chatsafe.entered')) {
      loader.remove();
      document.body.classList.add('entered');
    }
    sessionStorage.setItem('chatsafe.entered', '1');
  } catch { /* ignore */ }

  /* ---------- Scroll morph + HUD ---------- */
  const morph = window.createMorph($('morph'), {
    sections,
    reducedMotion,
    onIndex: (i) => {
      $('hudIndex').textContent = `${String(i + 1).padStart(4, '0')} / ${String(sections.length).padStart(4, '0')}`;
      $('hudName').textContent = NAMES[sections[i]?.dataset.shape] || '';
    },
  });
  morph.setDark(isDark());
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    $('scrollPct').textContent = String(Math.round((window.scrollY / Math.max(1, max)) * 100));
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

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
