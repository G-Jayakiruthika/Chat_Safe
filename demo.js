'use strict';

/**
 * ▶ Guided demo: a self-playing, 8-step walkthrough for judges.
 * A spotlight ring highlights each part of the app while a caption card explains it,
 * with a step counter, progress bar, Pause / Next / Exit controls and keyboard support.
 */
window.ChatSafeDemo = (() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  let running = false;
  let paused = false;
  let skip = false;
  let ui = null;

  const STEPS = [
    {
      target: 'kavach',
      title: 'Meet Kavach',
      text: 'A 3D cyber guardian you can talk to in 23 Indian languages. Drag to spin it, tap to poke it. Its eyes show the danger level.',
      run: async (app) => { app.newChat(); },
    },
    {
      target: 'agentLog',
      title: 'Tell Kavach about a call',
      text: 'A "CBI officer" says you are under digital arrest. Kavach scans it instantly…',
      run: async (app) => {
        await typeInto('agentInput', 'CBI officer says I am under digital arrest. Do not tell family, transfer ₹2 lakh immediately.');
        await app.askAgent($('agentInput').value);
      },
    },
    {
      target: 'kavach',
      title: 'Angry red eyes = scam',
      text: 'Calm round eyes mean safe. A squint means suspicious. Angry, red, scanning eyes mean a scam.',
    },
    {
      target: 'panel-xray',
      title: 'Scam X-Ray',
      text: 'Paste any WhatsApp, SMS or Telegram message. Here is a fake stock-tip group.',
      run: async (app) => {
        app.selectTab('tab-xray');
        app.setSample('stock');
        await app.analyzeText($('message').value);
      },
    },
    {
      target: 'result',
      title: 'Risk score, tactics, 1930 complaint',
      text: 'The score, pressure tactics, the personal UPI ID that fails SEBI\'s @valid rule, and a ready-made 1930 complaint.',
    },
    {
      target: 'panel-pay',
      title: 'Check before you pay',
      text: 'SEBI-registered brokers only collect money through "@valid" UPI IDs. A personal ID is a red flag.',
      run: async (app) => {
        app.selectTab('tab-pay');
        await typeInto('upi', 'rajesh.trader@ybl');
        await app.payCheck($('upi').value);
      },
    },
    {
      target: 'lang',
      title: 'Your language',
      text: 'Switch to Tamil and ask a question — Kavach answers in Tamil and speaks it aloud.',
      run: async (app) => {
        app.setLanguage('ta');
        await app.askAgent('டிஜிட்டல் கைது என்றால் என்ன?');
      },
    },
    {
      target: 'cases',
      title: 'Case files',
      text: 'Every chat is saved on this device only. Search any word — matches are highlighted.',
      run: async (app) => {
        app.openCases();
        await wait(400);
        app.searchCases('CBI');
      },
    },
    {
      target: 'navConnectLink',
      title: 'Works inside your chat apps',
      text: 'Forward a message to the Chat_Safe bot on Telegram, WhatsApp Business, Instagram or Messenger. That\'s the tour — now try it yourself!',
      run: async (app) => {
        app.closeCases();
        app.setLanguage('en');
      },
    },
  ];

  async function typeInto(id, text) {
    const el = $(id);
    el.value = '';
    el.focus({ preventScroll: true });
    for (const ch of text) {
      if (skip) break;
      el.value += ch;
      await wait(18);
    }
    el.value = text;
  }

  function build() {
    const ring = document.createElement('div');
    ring.className = 'tour-ring';
    ring.setAttribute('aria-hidden', 'true');
    const card = document.createElement('section');
    card.className = 'tour-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-live', 'polite');
    card.setAttribute('aria-label', 'Guided demo');
    const el = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text) n.textContent = text;
      return n;
    };
    const bar = el('div', 'tour-bar');
    bar.append(el('span'));
    const actions = el('div', 'tour-actions');
    for (const [act, cls, label] of [['pause', 'secondary', '⏸ Pause'], ['next', 'primary', 'Next ›'], ['exit', 'secondary', '✕ Exit']]) {
      const b = el('button', cls, label);
      b.type = 'button';
      b.dataset.act = act;
      actions.append(b);
    }
    card.append(el('p', 'tour-count'), el('h2', 'tour-title'), el('p', 'tour-text'), bar, actions);
    document.body.append(ring, card);
    card.addEventListener('click', (e) => {
      const act = e.target.closest('button')?.dataset.act;
      if (act === 'pause') {
        paused = !paused;
        e.target.textContent = paused ? '▶ Resume' : '⏸ Pause';
      }
      if (act === 'next') skip = true;
      if (act === 'exit') stop();
    });
    return { ring, card };
  }

  function spotlight(id) {
    const el = $(id);
    if (!el || el.hidden) {
      ui.ring.style.opacity = '0';
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const place = () => {
      const r = el.getBoundingClientRect();
      Object.assign(ui.ring.style, {
        opacity: '1',
        top: `${r.top - 8}px`,
        left: `${r.left - 8}px`,
        width: `${r.width + 16}px`,
        height: `${r.height + 16}px`,
      });
    };
    place();
    setTimeout(place, 450);
  }

  /** Wait ~ms, but stop early on Next/Exit and hold while paused. */
  async function hold(ms) {
    let left = ms;
    while (running && !skip && left > 0) {
      await wait(100);
      if (!paused) left -= 100;
    }
  }

  async function start() {
    if (running) return;
    const app = window.ChatSafeApp;
    if (!app) return;
    running = true;
    paused = false;
    ui = build();
    document.body.classList.add('touring');
    const speakWas = app.autoSpeak;
    app.setAutoSpeak(false); // keep the demo snappy
    const onKey = (e) => {
      if (e.key === 'Escape') stop();
      if (e.key === 'ArrowRight') skip = true;
    };
    document.addEventListener('keydown', onKey);

    for (let i = 0; i < STEPS.length && running; i++) {
      const step = STEPS[i];
      skip = false;
      ui.card.querySelector('.tour-count').textContent = `${String(i + 1).padStart(2, '0')} / ${String(STEPS.length).padStart(2, '0')}`;
      ui.card.querySelector('.tour-title').textContent = step.title;
      ui.card.querySelector('.tour-text').textContent = step.text;
      ui.card.querySelector('.tour-bar span').style.width = `${((i + 1) / STEPS.length) * 100}%`;
      spotlight(step.target);
      try {
        if (step.run) await step.run(app);
      } catch {
        /* keep the tour going */
      }
      spotlight(step.target);
      await hold(i === STEPS.length - 1 ? 6000 : 4200);
    }
    document.removeEventListener('keydown', onKey);
    app.setAutoSpeak(speakWas);
    stop();
  }

  function stop() {
    running = false;
    document.body.classList.remove('touring');
    ui?.ring.remove();
    ui?.card.remove();
    ui = null;
  }

  return { start, stop, get running() { return running; } };
})();
