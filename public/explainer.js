'use strict';

/**
 * The silent explainer: a looping, wordless animation that shows what Chat_Safe does.
 *
 * It is built for someone who cannot read and cannot hear the audio. Every beat is
 * carried by a picture, a colour and a movement:
 *   1  a stranger calls and demands money      (red, shaking phone, money flying away)
 *   2  Kavach listens and scans the call       (blue, a scanning beam)
 *   3  Kavach says STOP — this is a scam       (red, furious face, a raised palm)
 *   4  you hang up                             (the call is cut)
 *   5  you dial 1930 and your money is safe    (green, shield, tick)
 *
 * The only glyphs used are a number (1930) and universally understood pictograms.
 * It auto-plays muted, loops, can be paused, and freezes on one frame when the
 * visitor prefers reduced motion.
 */
(() => {
  const SCENES = [
    {
      id: 'call',
      tone: 'bad',
      label: 'A stranger calls and demands money',
      build: (el) => {
        el.append(
          fig('👤', 'ex-actor ex-stranger', 'The caller'),
          arrow('ex-money', '💸'),
          fig('📞', 'ex-actor ex-phone ex-ring', 'Your phone ringing'),
          fig('🧓', 'ex-actor ex-you', 'You'),
        );
      },
    },
    {
      id: 'scan',
      tone: 'scan',
      label: 'Kavach listens and checks the call',
      build: (el) => {
        el.append(fig('📞', 'ex-actor ex-phone', 'The call'), shield('scanning'), beam());
      },
    },
    {
      id: 'warn',
      tone: 'bad',
      label: 'Kavach warns you: this is a scam',
      build: (el) => {
        el.append(shield('alarm'), fig('✋', 'ex-actor ex-stop', 'Stop'), fig('🧓', 'ex-actor ex-you ex-shocked', 'You'));
      },
    },
    {
      id: 'hangup',
      tone: 'bad',
      label: 'You hang up and send no money',
      build: (el) => {
        el.append(fig('📵', 'ex-actor ex-cut', 'Call ended'), strike(), fig('💸', 'ex-actor ex-money-blocked', 'No money sent'));
      },
    },
    {
      id: 'safe',
      tone: 'good',
      label: 'You call 1930 and your money is safe',
      build: (el) => {
        el.append(shield('safe'), fig('☎️', 'ex-actor ex-dial', 'Dial'), num('1930'), fig('✅', 'ex-actor ex-tick', 'Safe'));
      },
    },
  ];

  const make = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  };
  /** A pictogram with a hidden label, so screen readers still get the story. */
  const fig = (glyph, cls, label) => {
    const n = make('span', `ex-fig ${cls}`);
    n.setAttribute('role', 'img');
    n.setAttribute('aria-label', label);
    n.textContent = glyph;
    return n;
  };
  const arrow = (cls, glyph) => {
    const n = make('span', `ex-arrow ${cls}`);
    n.setAttribute('aria-hidden', 'true');
    n.textContent = glyph;
    return n;
  };
  const beam = () => {
    const n = make('span', 'ex-beam');
    n.setAttribute('aria-hidden', 'true');
    return n;
  };
  const strike = () => {
    const n = make('span', 'ex-strike');
    n.setAttribute('aria-hidden', 'true');
    return n;
  };
  const num = (t) => make('span', 'ex-num', t);

  /** Kavach as a simple shield face, so the explainer matches the real avatar. */
  function shield(state) {
    const n = make('span', `ex-shield ${state}`);
    n.setAttribute('role', 'img');
    n.setAttribute('aria-label', 'Kavach, your guardian');
    const eyes = make('span', 'ex-eyes');
    eyes.append(make('i'), make('i'));
    const brows = make('span', 'ex-brows');
    brows.append(make('i'), make('i'));
    n.append(brows, eyes);
    return n;
  }

  /**
   * @param {HTMLElement} root
   * @param {{reducedMotion?: boolean, onScene?: (i: number) => void}} [opts]
   */
  function createExplainer(root, opts = {}) {
    const reduced = Boolean(opts.reducedMotion);
    const stage = make('div', 'ex-stage');
    const caption = make('p', 'ex-caption');
    const dots = make('div', 'ex-dots');
    dots.setAttribute('role', 'tablist');
    dots.setAttribute('aria-label', 'Story steps');

    const scenes = SCENES.map((s, i) => {
      const el = make('div', `ex-scene tone-${s.tone}`);
      el.dataset.id = s.id;
      s.build(el);
      stage.append(el);

      const d = make('button', 'ex-dot');
      d.type = 'button';
      d.setAttribute('role', 'tab');
      d.setAttribute('aria-label', `Step ${i + 1}: ${s.label}`);
      d.addEventListener('click', () => {
        show(i);
        stop();
      });
      dots.append(d);
      return { el, dot: d, meta: s };
    });

    const playBtn = make('button', 'ex-play');
    playBtn.type = 'button';
    playBtn.setAttribute('aria-label', 'Pause the story');
    playBtn.textContent = '⏸';

    const bar = make('div', 'ex-bar');
    bar.append(make('span'));

    root.append(stage, bar, dots, caption, playBtn);

    let i = -1;
    let timer = null;

    function show(next) {
      i = (next + scenes.length) % scenes.length;
      scenes.forEach((s, n) => {
        s.el.classList.toggle('on', n === i);
        s.dot.setAttribute('aria-selected', String(n === i));
      });
      root.dataset.tone = scenes[i].meta.tone;
      caption.textContent = scenes[i].meta.label;
      bar.firstChild.style.width = `${((i + 1) / scenes.length) * 100}%`;
      opts.onScene?.(i);
    }

    function play() {
      stop();
      timer = setInterval(() => show(i + 1), 3400);
      playBtn.textContent = '⏸';
      playBtn.setAttribute('aria-label', 'Pause the story');
    }
    function stop() {
      clearInterval(timer);
      timer = null;
      playBtn.textContent = '▶';
      playBtn.setAttribute('aria-label', 'Play the story');
    }

    playBtn.addEventListener('click', () => (timer ? stop() : play()));
    // Only run while on screen, so it never burns battery in the background.
    new IntersectionObserver(([e]) => (e.isIntersecting && !reduced ? play() : stop()), { threshold: 0.3 }).observe(root);

    show(0);
    if (!reduced) play();
    return { show, play, stop, get scene() { return i; } };
  }

  window.createExplainer = createExplainer;
  window.EXPLAINER_SCENES = SCENES.map((s) => s.label);
})();
