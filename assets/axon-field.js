/**
 * Axon field — the animated hero background.
 *
 * Deliberately NOT a rotating wireframe globe and NOT a floating particle
 * constellation: those are what the sites we are measured against already use.
 * This draws the mark's own idea instead — dendrites converging into a cell
 * body, one trunk carrying the signal, then branching out to terminals — and
 * runs light pulses along it.
 *
 * Plain canvas, no library, ~6 KB. Honours prefers-reduced-motion by drawing a
 * single static frame. Pauses when scrolled out of view or the tab is hidden,
 * so it costs nothing while someone is reading further down the page.
 */
(() => {
// The canvas is decoration: it waits until the page has painted, so it never
// competes with the first screen on a slow phone.
const idleStart = (run) => {
  const go = () => ('requestIdleCallback' in window ? requestIdleCallback(run, { timeout: 1200 }) : setTimeout(run, 220));
  if (document.readyState === 'complete') go();
  else addEventListener('load', go, { once: true });
};

idleStart(() => {
  const canvas = document.querySelector('[data-axon-field]');
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { alpha: true });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(document.documentElement);
  const read = (n, fallback) => (css.getPropertyValue(n) || fallback).trim();
  // Follow the active identity rather than hardcoding ember, so the field is
  // orange on Axon Systems and violet on the personal site.
  const mid = read('--accent', '#FF6A2B');
  const hot = read('--field-hot', mid);
  const dim = read('--field-dim', mid);

  /* A gradient stop of `transparent` is transparent BLACK, which fringes grey
     over a light background. Fade to the same colour at zero alpha instead. */
  const fade = (c, a = 0) => {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(c.trim());
    if (m) return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
    const n = c.match(/[\d.]+/g);
    return n && n.length >= 3 ? `rgba(${n[0]},${n[1]},${n[2]},${a})` : `rgba(0,0,0,${a})`;
  };

  let W = 0, H = 0, dpr = 1;
  let nodes = [], edges = [], pulses = [];
  let pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

  /* The graph is generated in normalised space so it reflows with the canvas:
     three input columns funnelling right into a hub, then fanning out. */
  function build() {
    nodes = [];
    edges = [];

    const add = (x, y, r = 2.2, kind = 'node') => (nodes.push({ x, y, r, kind }) - 1);
    const link = (a, b, curve = 0) => edges.push({ a, b, curve, seed: Math.random() * 6.28 });

    const hub = add(0.52, 0.5, 7.5, 'soma');

    // dendrites: many inputs converging
    const inputs = [];
    for (let i = 0; i < 7; i++) {
      const y = 0.12 + (i / 6) * 0.76;
      const a = add(0.04, y, 2.6);
      const b = add(0.2 + Math.random() * 0.08, 0.5 + (y - 0.5) * 0.72, 2);
      inputs.push(a);
      link(a, b, (y - 0.5) * 0.18);
      link(b, hub, (y - 0.5) * 0.1);
    }

    // trunk: the single channel
    const relay = add(0.68, 0.5, 4.5, 'relay');
    link(hub, relay, 0);

    // terminals: distributed outputs
    for (let i = 0; i < 6; i++) {
      const y = 0.14 + (i / 5) * 0.72;
      const t = add(0.94, y, 3.2, 'terminal');
      const m = add(0.81, 0.5 + (y - 0.5) * 0.66, 2);
      link(relay, m, (y - 0.5) * 0.12);
      link(m, t, (y - 0.5) * 0.14);
    }

    pulses = [];
    for (let i = 0; i < 26; i++) {
      pulses.push({
        e: (Math.random() * edges.length) | 0,
        t: Math.random(),
        v: 0.0016 + Math.random() * 0.0026,
      });
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* A little pointer parallax gives the field depth without moving the layout. */
  const px = (n, i) => {
    const drift = (pointer.x - 0.5) * (0.012 + (i % 5) * 0.002);
    return (n.x + drift) * W;
  };
  const py = (n, i) => {
    const drift = (pointer.y - 0.5) * (0.02 + (i % 4) * 0.004);
    return (n.y + drift) * H;
  };

  function edgePoint(e, t) {
    const a = nodes[e.a], b = nodes[e.b];
    const ax = px(a, e.a), ay = py(a, e.a);
    const bx = px(b, e.b), by = py(b, e.b);
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2 + e.curve * H;
    const u = 1 - t;
    return {
      x: u * u * ax + 2 * u * t * cx + t * t * bx,
      y: u * u * ay + 2 * u * t * cy + t * t * by,
    };
  }

  function draw(time) {
    ctx.clearRect(0, 0, W, H);
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;

    // edges
    ctx.lineCap = 'round';
    for (const e of edges) {
      const a = nodes[e.a], b = nodes[e.b];
      const ax = px(a, e.a), ay = py(a, e.a);
      const bx = px(b, e.b), by = py(b, e.b);
      const cx = (ax + bx) / 2;
      const cy = (ay + by) / 2 + e.curve * H;
      const breathe = reduced ? 0.5 : 0.5 + Math.sin(time * 0.0007 + e.seed) * 0.16;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(cx, cy, bx, by);
      ctx.strokeStyle = dim;
      ctx.globalAlpha = 0.17 * breathe + 0.06;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }

    // pulses travelling along the edges
    if (!reduced) {
      for (const p of pulses) {
        p.t += p.v;
        if (p.t > 1) {
          p.t = 0;
          p.e = (Math.random() * edges.length) | 0;
        }
        const e = edges[p.e];
        if (!e) continue;
        const pt = edgePoint(e, p.t);
        const tail = edgePoint(e, Math.max(0, p.t - 0.07));
        const g = ctx.createLinearGradient(tail.x, tail.y, pt.x, pt.y);
        g.addColorStop(0, fade(mid));
        g.addColorStop(1, mid);
        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.strokeStyle = g;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.7, 0, 6.2832);
        ctx.fillStyle = hot;
        ctx.globalAlpha = 0.95;
        ctx.fill();
      }
    }

    // nodes
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const x = px(n, i), y = py(n, i);
      const beat = reduced ? 1 : 1 + Math.sin(time * 0.0012 + i) * 0.1;
      if (n.kind === 'soma' || n.kind === 'relay') {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, n.r * 7 * beat);
        glow.addColorStop(0, n.kind === 'soma' ? hot : mid);
        glow.addColorStop(1, fade(n.kind === 'soma' ? hot : mid));
        ctx.globalAlpha = 1;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, n.r * 7 * beat, 0, 6.2832);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, n.r * beat, 0, 6.2832);
      ctx.fillStyle = n.kind === 'soma' ? hot : n.kind === 'terminal' ? mid : dim;
      ctx.globalAlpha = n.kind === 'node' ? 0.55 : 0.95;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  let raf = 0, running = false;
  const loop = (t) => { draw(t); raf = requestAnimationFrame(loop); };
  const start = () => { if (!running && !reduced) { running = true; raf = requestAnimationFrame(loop); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  addEventListener('resize', () => { resize(); build(); draw(performance.now()); }, { passive: true });
  addEventListener('pointermove', (e) => {
    pointer.tx = e.clientX / innerWidth;
    pointer.ty = e.clientY / innerHeight;
  }, { passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()), { threshold: 0 })
    .observe(canvas);

  resize();
  build();
  draw(performance.now());
  start();
});
})();
