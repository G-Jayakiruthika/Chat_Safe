'use strict';

/** Tiny Web Audio sound kit (no audio files). Muted state is remembered. */
window.ChatSafeSound = (() => {
  let ctx = null;
  let muted = false;
  try {
    muted = localStorage.getItem('chatsafe.muted') === '1';
  } catch {
    /* ignore */
  }

  function tone(freq, start, dur, type = 'sine', gain = 0.06) {
    if (muted) return;
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const play = {
    blip: () => tone(880, 0, 0.08),
    send: () => { tone(660, 0, 0.07); tone(990, 0.06, 0.08); },
    scan: () => { for (let i = 0; i < 5; i++) tone(400 + i * 120, i * 0.05, 0.06, 'triangle', 0.04); },
    safe: () => { tone(660, 0, 0.12); tone(880, 0.1, 0.12); tone(1320, 0.2, 0.18); },
    alert: () => { for (let i = 0; i < 3; i++) { tone(880, i * 0.22, 0.12, 'square', 0.05); tone(587, i * 0.22 + 0.11, 0.1, 'square', 0.05); } },
    unlock: () => { tone(523, 0, 0.1); tone(659, 0.08, 0.1); tone(784, 0.16, 0.1); tone(1047, 0.24, 0.2); },
  };

  return {
    play(name) {
      try {
        play[name]?.();
      } catch {
        /* audio not available */
      }
    },
    toggle() {
      muted = !muted;
      try {
        localStorage.setItem('chatsafe.muted', muted ? '1' : '0');
      } catch {
        /* ignore */
      }
      return muted;
    },
    get muted() {
      return muted;
    },
  };
})();
