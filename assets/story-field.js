/**
 * Story field — the scroll-driven hero animation for the personal site.
 *
 * The reference site tells a scroll story: a character stands up from a desk,
 * walks forward, and lands on a scanning platform. The idea worth taking is
 * the story, not the character — one thing that transforms as you scroll,
 * rather than elements fading in one by one.
 *
 * So this tells Hashir's story instead: a spreadsheet, some of its cells
 * broken with #REF!, which as you scroll reorganises itself into the clean
 * panels of an application. Nothing like a walking avatar, and it is the
 * actual thing he does for a living.
 *
 * Plain canvas, no library. Reduced motion gets the settled end state.
 */
(() => {
  const canvas = document.querySelector('[data-story-field]');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(document.documentElement);
  const read = (n, f) => (css.getPropertyValue(n) || f).trim();
  const accent = read('--accent', '#5B3DF5');
  const broken = read('--field-broken', '#E8501B');
  const ink = read('--text-3', '#8B8399');

  const COLS = 9, ROWS = 7;
  let W = 0, H = 0, dpr = 1, cells = [], progress = 0, shown = 0;

  const rand = (seed) => {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  /* Every cell knows where it starts (a spreadsheet grid) and where it ends
     (one of four application panels). Scroll interpolates between the two. */
  function build() {
    cells = [];
    const panels = [
      { x: 0.06, y: 0.10, w: 0.40, h: 0.34 },
      { x: 0.52, y: 0.10, w: 0.42, h: 0.20 },
      { x: 0.52, y: 0.34, w: 0.42, h: 0.10 },
      { x: 0.06, y: 0.50, w: 0.88, h: 0.40 },
    ];
    let i = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++, i++) {
        const p = panels[i % panels.length];
        const per = Math.ceil((COLS * ROWS) / panels.length);
        const k = Math.floor(i / per);
        const pan = panels[Math.min(k, panels.length - 1)];
        const inPan = i % per;
        const pc = 4, pr = Math.ceil(per / pc);
        cells.push({
          // start: strict grid, the spreadsheet
          sx: 0.06 + (c / COLS) * 0.88,
          sy: 0.10 + (r / ROWS) * 0.80,
          sw: 0.88 / COLS - 0.006,
          sh: 0.80 / ROWS - 0.012,
          // end: packed into an application panel
          ex: pan.x + ((inPan % pc) / pc) * pan.w,
          ey: pan.y + (Math.floor(inPan / pc) / pr) * pan.h,
          ew: pan.w / pc - 0.004,
          eh: pan.h / pr - 0.006,
          broken: rand(i + 3) < 0.13,
          delay: rand(i) * 0.35,
          fill: rand(i + 9),
        });
      }
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));
  const lerp = (a, b, t) => a + (b - a) * t;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const round = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
    };

    for (const cell of cells) {
      // each cell settles on its own slightly different schedule
      const t = ease((shown - cell.delay) / (1 - cell.delay));
      const x = lerp(cell.sx, cell.ex, t) * W;
      const y = lerp(cell.sy, cell.ey, t) * H;
      const w = lerp(cell.sw, cell.ew, t) * W;
      const h = lerp(cell.sh, cell.eh, t) * H;
      const radius = lerp(1, 5, t);

      // broken cells burn off as the system takes over
      const isBroken = cell.broken && t < 0.75;
      ctx.globalAlpha = isBroken ? 0.26 * (1 - t / 0.75) + 0.05 : lerp(0.045, 0.1, t);
      ctx.fillStyle = isBroken ? broken : accent;
      round(x, y, Math.max(1, w), Math.max(1, h), radius);
      ctx.fill();

      ctx.globalAlpha = isBroken ? 0.3 : lerp(0.1, 0.22, t);
      ctx.strokeStyle = isBroken ? broken : accent;
      ctx.lineWidth = 1;
      ctx.stroke();

      // a bar of "content" appears inside each cell once it has settled
      if (t > 0.45 && cell.fill > 0.35) {
        ctx.globalAlpha = (t - 0.45) * 0.3;
        ctx.fillStyle = ink;
        const bw = w * (0.3 + cell.fill * 0.45);
        round(x + w * 0.14, y + h * 0.42, Math.max(2, bw), Math.max(2, h * 0.14), 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function onScroll() {
    const rect = canvas.getBoundingClientRect();
    // 0 while the hero is fully in view, 1 by the time it has scrolled away
    const travelled = Math.min(1, Math.max(0, -rect.top / (rect.height * 0.9)));
    progress = travelled;
  }

  let raf = 0;
  function tick() {
    shown += (progress - shown) * 0.09;   // trails the scroll, so it feels physical
    draw();
    raf = requestAnimationFrame(tick);
  }

  addEventListener('resize', () => { resize(); build(); draw(); }, { passive: true });
  addEventListener('scroll', onScroll, { passive: true });

  resize();
  build();

  if (reduced) {
    shown = 1;
    draw();
  } else {
    onScroll();
    shown = progress;
    tick();
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { if (!raf) tick(); }
      else { cancelAnimationFrame(raf); raf = 0; }
    }, { threshold: 0 }).observe(canvas);
  }
})();
