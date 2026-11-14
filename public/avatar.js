'use strict';

/**
 * Kavach — Chat_Safe's 3D cyber-guardian avatar.
 * Pure Canvas 2D with a hand-rolled 3D pipeline (icosphere mesh, rotation matrices,
 * perspective projection, depth shading). No libraries, so the strict CSP stays intact.
 *
 * States: idle · listening · thinking · speaking. Moods tint the shield by threat level.
 */
(() => {
  const MOOD_COLORS = Object.freeze({
    idle: [34, 211, 238], // cyan
    safe: [52, 211, 153], // green
    suspicious: [251, 191, 36], // amber
    high: [251, 146, 60], // orange
    critical: [248, 113, 113], // red
  });

  /** Build a once-subdivided icosahedron (42 vertices, 120 edges) on the unit sphere. */
  function buildIcosphere() {
    const t = (1 + Math.sqrt(5)) / 2;
    const verts = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map(normalize);
    let faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    const midCache = new Map();
    const mid = (a, b) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (!midCache.has(key)) {
        const [x1, y1, z1] = verts[a];
        const [x2, y2, z2] = verts[b];
        verts.push(normalize([(x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2]));
        midCache.set(key, verts.length - 1);
      }
      return midCache.get(key);
    };
    faces = faces.flatMap(([a, b, c]) => {
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
    });
    const edgeSet = new Set();
    const edges = [];
    for (const [a, b, c] of faces) {
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const key = p < q ? `${p}_${q}` : `${q}_${p}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push([p, q]);
        }
      }
    }
    return { verts, edges };
  }

  function normalize([x, y, z]) {
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  }

  /** Rotate around Y then X. */
  function rotate([x, y, z], ry, rx) {
    const cy = Math.cos(ry);
    const sy = Math.sin(ry);
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const cx = Math.cos(rx);
    const sx = Math.sin(rx);
    return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
  }

  const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a.toFixed(3)})`;
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{reducedMotion?: boolean}} [opts]
   */
  function createKavach(canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    const mesh = buildIcosphere();
    const ring = Array.from({ length: 72 }, (_, i) => (i / 72) * Math.PI * 2);
    const reduced = Boolean(opts.reducedMotion);

    let w = 0;
    let h = 0;
    let state = 'idle';
    let mood = 'idle';
    let color = MOOD_COLORS.idle;
    let target = MOOD_COLORS.idle;
    let mouth = 0;
    let mouthTarget = 0;
    let pointer = { x: 0, y: 0 };
    let tilt = { x: 0, y: 0 };
    let spin = 0;
    let nextBlink = 2;
    let blink = 0;
    let alertUntil = 0;
    let dark = true;
    let last = performance.now();

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function onPointer(e) {
      const rect = canvas.getBoundingClientRect();
      pointer = {
        x: Math.max(-1, Math.min(1, (e.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2))),
        y: Math.max(-1, Math.min(1, (e.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2))),
      };
    }

    function drawFrame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const time = now / 1000;
      const speedFactor = reduced ? 0.25 : 1;

      // Ease colour, tilt and mouth toward their targets.
      color = mix(color, target, Math.min(1, dt * 4));
      tilt.x += (pointer.y * 0.35 - tilt.x) * Math.min(1, dt * 3);
      tilt.y += (pointer.x * 0.5 - tilt.y) * Math.min(1, dt * 3);
      if (state === 'speaking') mouthTarget = Math.max(mouthTarget * 0.9, 0.25 + 0.35 * Math.abs(Math.sin(time * 14)));
      else mouthTarget *= 0.85;
      mouth += (mouthTarget - mouth) * Math.min(1, dt * 18);

      const spinSpeed = { idle: 0.25, listening: 0.45, thinking: 2.2, speaking: 0.5 }[state] * speedFactor;
      spin += dt * spinSpeed;

      nextBlink -= dt;
      if (nextBlink <= 0) {
        blink = 1;
        nextBlink = 2.5 + Math.random() * 3;
      }
      blink = Math.max(0, blink - dt * 7);

      const shake = !reduced && now < alertUntil ? Math.sin(time * 60) * 3 : 0;
      const cx = w / 2 + shake;
      const cy = h / 2 + (reduced ? 0 : Math.sin(time * 1.3) * 4);
      const R = Math.min(w, h) * 0.3;
      const persp = 3.2;

      ctx.clearRect(0, 0, w, h);

      // Halo glow
      const halo = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.8);
      halo.addColorStop(0, rgba(color, dark ? 0.35 : 0.22));
      halo.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      // Listening: expanding sonar rings
      if (state === 'listening') {
        for (let i = 0; i < 3; i++) {
          const p = (time * 0.8 + i / 3) % 1;
          ctx.strokeStyle = rgba(color, (1 - p) * 0.6);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, R * (1.05 + p * 0.7), 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Project mesh
      const projected = mesh.verts.map((v) => {
        const [x, y, z] = rotate(v, spin + tilt.y, tilt.x + 0.15);
        const s = persp / (persp - z);
        return { x: cx + x * R * s, y: cy + y * R * s, z };
      });

      // Back-to-front edges with depth shading
      ctx.lineWidth = 1.2;
      for (const [a, b] of mesh.edges) {
        const pa = projected[a];
        const pb = projected[b];
        const depth = (pa.z + pb.z) / 2; // -1 back … 1 front
        ctx.strokeStyle = rgba(color, 0.08 + (depth + 1) * 0.28);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      for (const p of projected) {
        if (p.z < 0) continue;
        ctx.fillStyle = rgba(color, 0.4 + p.z * 0.6);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6 + p.z * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Orbiting data ring (tilted torus of particles)
      for (const a0 of ring) {
        const a = a0 + time * 0.6 * speedFactor * (state === 'thinking' ? 3 : 1);
        const [x, y, z] = rotate([Math.cos(a) * 1.45, 0, Math.sin(a) * 1.45], 0, 1.15 + tilt.x);
        const s = persp / (persp - z);
        ctx.fillStyle = rgba(color, z > 0 ? 0.85 : 0.25);
        ctx.fillRect(cx + x * R * s - 1.5, cy + y * R * s - 1.5, 3, 3);
      }

      // Face visor follows the pointer (not the spin)
      const [fx, fy, fz] = rotate([0, 0.05, 1], tilt.y * 0.8, tilt.x * 0.8);
      const fs = persp / (persp - fz);
      const vx = cx + fx * R * 0.55 * fs;
      const vy = cy + fy * R * 0.55 * fs;
      const vw = R * 1.05;
      const vh = R * 0.62;
      ctx.save();
      ctx.translate(vx, vy);
      ctx.rotate(tilt.y * -0.15);
      ctx.fillStyle = dark ? 'rgba(4,10,22,0.82)' : 'rgba(10,22,40,0.86)';
      ctx.strokeStyle = rgba(color, 0.9);
      ctx.lineWidth = 2;
      roundRect(ctx, -vw / 2, -vh / 2, vw, vh, vh / 2.2);
      ctx.fill();
      ctx.stroke();

      // Eyes
      const eyeOpen = state === 'listening' ? 1.25 : 1;
      const eh = Math.max(2, vh * 0.26 * eyeOpen * (1 - blink));
      ctx.shadowColor = rgba(color, 1);
      ctx.shadowBlur = 14;
      ctx.fillStyle = rgba(color, 1);
      for (const side of [-1, 1]) {
        const ex = side * vw * 0.2 + tilt.y * 6;
        const ey = -vh * 0.12 + tilt.x * 4;
        roundRect(ctx, ex - vw * 0.07, ey - eh / 2, vw * 0.14, eh, Math.min(vw * 0.07, eh / 2));
        ctx.fill();
      }

      // Mouth: equaliser bars driven by speech
      const bars = 7;
      const bw = vw * 0.045;
      for (let i = 0; i < bars; i++) {
        const k = 1 - Math.abs(i - (bars - 1) / 2) / bars;
        const bh = 3 + mouth * vh * 0.32 * k * (0.6 + 0.4 * Math.sin(time * 22 + i * 1.7));
        const bx = (i - (bars - 1) / 2) * bw * 1.7;
        ctx.fillRect(bx - bw / 2, vh * 0.22 - bh / 2, bw, bh);
      }
      ctx.shadowBlur = 0;

      // Thinking: scan line sweeping the visor
      if (state === 'thinking') {
        const sy = -vh / 2 + ((time * 1.6) % 1) * vh;
        const g = ctx.createLinearGradient(0, sy - 10, 0, sy + 10);
        g.addColorStop(0, rgba(color, 0));
        g.addColorStop(0.5, rgba(color, 0.7));
        g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(-vw / 2 + 6, sy - 10, vw - 12, 20);
      }
      ctx.restore();

      requestAnimationFrame(drawFrame);
    }

    function roundRect(c, x, y, rw, rh, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + rw, y, x + rw, y + rh, r);
      c.arcTo(x + rw, y + rh, x, y + rh, r);
      c.arcTo(x, y + rh, x, y, r);
      c.arcTo(x, y, x + rw, y, r);
      c.closePath();
    }

    resize();
    new ResizeObserver(resize).observe(canvas);
    window.addEventListener('pointermove', onPointer, { passive: true });
    requestAnimationFrame(drawFrame);

    return {
      /** @param {'idle'|'listening'|'thinking'|'speaking'} s */
      setState(s) {
        state = s;
      },
      /** @param {'idle'|'safe'|'suspicious'|'high'|'critical'} m */
      setMood(m) {
        mood = MOOD_COLORS[m] ? m : 'idle';
        target = MOOD_COLORS[mood];
        if (mood === 'critical' || mood === 'high') alertUntil = performance.now() + 700;
      },
      /** Kick the mouth open — called on speech word boundaries. */
      pulse() {
        mouthTarget = 0.9;
      },
      /** @param {boolean} isDark */
      setDark(isDark) {
        dark = isDark;
      },
      get mood() {
        return mood;
      },
    };
  }

  window.createKavach = createKavach;
})();
