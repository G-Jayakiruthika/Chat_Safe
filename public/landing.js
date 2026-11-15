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

  /* ---------- Product demonstration: steps advance on scroll ---------- */
  (() => {
    const section = $('how');
    if (!section) return;
    const pills = Array.from(section.querySelectorAll('.step-pill'));
    const screens = Array.from(section.querySelectorAll('.ps'));
    const chips = Array.from(section.querySelectorAll('[class*="chip-"]'));
    const COPY = [
      ['Tell Kavach', 'Speak, paste or forward the call script, WhatsApp message or payment request — from the app, Telegram, WhatsApp Business or Instagram.'],
      ['X-Ray the scam', 'Offline rules for 8 Indian scam types and 7 pressure tactics, plus Google Gemini and the SEBI @valid UPI check, fused into one 0–100 risk score.'],
      ['Act in time', 'Hear the verdict in your language, alert your family on WhatsApp, and file a ready-made 1930 complaint with the scammer\'s UPI IDs and numbers.'],
    ];
    const CHIPS = [[2], [0, 1, 3], [1, 3]]; // which glass chips belong to each step
    let step = -1;
    let timer = null;

    function show(next) {
      if (next === step) return;
      step = next;
      pills.forEach((p, i) => {
        const on = i === step;
        p.setAttribute('aria-current', String(on));
        p.querySelector('.n').textContent = on ? `Step 0${i + 1}` : `0${i + 1}`;
      });
      screens.forEach((el, i) => el.classList.toggle('on', i === step));
      chips.forEach((c, i) => c.classList.toggle('chip-on', CHIPS[step].includes(i)));
      section.querySelector('.demo-title').textContent = COPY[step][0];
      section.querySelector('.demo-text').textContent = COPY[step][1];
    }

    function autoplay() {
      clearInterval(timer);
      timer = setInterval(() => show((step + 1) % pills.length), 3200);
    }

    pills.forEach((p, i) =>
      p.addEventListener('click', () => {
        show(i);
        clearInterval(timer); // the visitor is driving now
      }),
    );

    // Run only while the section is on screen.
    new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          show(Math.max(0, step));
          if (!reducedMotion) autoplay();
        } else {
          clearInterval(timer);
        }
      },
      { threshold: 0.4 },
    ).observe(section);
    show(0);
  })();

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
