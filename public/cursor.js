'use strict';

/**
 * Custom cursor and scroll motion.
 *
 * The cursor is a two-part pointer: a small dot that tracks the mouse exactly and a
 * larger ring that trails behind it with easing, so every movement leaves a visible
 * sense of motion. The ring takes the page's palette colour, grows over anything
 * clickable, and turns red over anything marked as a scam, which gives the whole site
 * the "a guard is watching with you" feeling without a single word of explanation.
 *
 * Everything here is opt-out: coarse pointers (phones, tablets) and
 * prefers-reduced-motion keep the normal system cursor and static sections.
 */
(() => {
  const fine = matchMedia('(pointer: fine)').matches;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- scroll reveal (runs on every device) ---------------- */

  const REVEAL = 'section, .card, .type-card, .lang-chip, .step, .ch-card, .faq-item';
  function revealOnScroll() {
    const nodes = [...document.querySelectorAll(REVEAL)].filter((n) => !n.closest('.no-reveal'));
    if (still) {
      nodes.forEach((n) => n.classList.add('seen'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('seen');
          io.unobserve(e.target);
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px' },
    );
    nodes.forEach((n, i) => {
      n.classList.add('reveal');
      // A short stagger inside each group so cards arrive one after another.
      n.style.setProperty('--d', `${Math.min(i % 8, 7) * 55}ms`);
      io.observe(n);
    });
  }

  /* ---------------- the cursor itself ---------------- */

  function customCursor() {
    const dot = document.createElement('div');
    dot.className = 'cur-dot';
    const ring = document.createElement('div');
    ring.className = 'cur-ring';
    ring.innerHTML = '<svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20"/></svg>';
    document.body.append(ring, dot);
    document.documentElement.classList.add('has-cursor');

    let tx = innerWidth / 2;
    let ty = innerHeight / 2;
    let rx = tx;
    let ry = ty;
    let shown = false;

    addEventListener(
      'pointermove',
      (e) => {
        tx = e.clientX;
        ty = e.clientY;
        if (!shown) {
          shown = true;
          ring.classList.add('on');
          dot.classList.add('on');
        }
        const hit = e.target instanceof Element ? e.target.closest('a, button, input, select, textarea, [role="button"], .type-card, .card') : null;
        ring.classList.toggle('hot', Boolean(hit));
        ring.classList.toggle('danger', Boolean(hit && hit.closest('[data-tone="scam"], .type-card, .verdict-scam')));
      },
      { passive: true },
    );
    addEventListener('pointerdown', () => ring.classList.add('press'));
    addEventListener('pointerup', () => ring.classList.remove('press'));
    addEventListener('pointerleave', () => {
      ring.classList.remove('on');
      dot.classList.remove('on');
      shown = false;
    });

    const frame = () => {
      // The ring eases toward the pointer; the gap is what you read as movement.
      rx += (tx - rx) * 0.18;
      ry += (ty - ry) * 0.18;
      ring.style.transform = `translate3d(${rx - 22}px, ${ry - 22}px, 0)`;
      dot.style.transform = `translate3d(${tx - 3}px, ${ty - 3}px, 0)`;
      requestAnimationFrame(frame);
    };
    frame();
  }

  /** Buttons lean toward the pointer, so the page feels alive under the hand. */
  function magnets() {
    for (const b of document.querySelectorAll('.btn, .type-card, .ch-card')) {
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        b.style.setProperty('--mx', `${x * 9}px`);
        b.style.setProperty('--my', `${y * 7}px`);
      });
      b.addEventListener('pointerleave', () => {
        b.style.setProperty('--mx', '0px');
        b.style.setProperty('--my', '0px');
      });
    }
  }

  const start = () => {
    revealOnScroll();
    if (fine && !still) {
      customCursor();
      magnets();
    }
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start);
  else start();
})();
