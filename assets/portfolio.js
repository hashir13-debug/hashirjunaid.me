/**
 * Hashir Junaid — portfolio interactions (v3).
 *
 * The centrepiece is the road: a delivery rider on a strip fixed to the bottom
 * of the screen. Scroll moves him from left to right; the wheels turn by the
 * distance actually scrolled; he parks, exhaust off, when you stop; the sky
 * goes from day to night and his headlight comes on; each section's stop lights
 * up as he passes it.
 *
 * No library. Reduced motion gets a still rider at the right place and no
 * animation. Everything else here is optional polish.
 */
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ================================================================ road */
  const road = document.querySelector('[data-road]');
  const rider = road && road.querySelector('.pf-rider');
  const wheels = rider ? [...rider.querySelectorAll('#r-wheel-back, #r-wheel-front')] : [];
  const stops = road ? [...road.querySelectorAll('.pf-road__stop')] : [];

  if (road && rider) {
    // Stops sit evenly along the road so their labels never crowd each other.
    // The rider still arrives at a stop exactly when its section arrives on
    // screen: his position is interpolated between the stops, segment by
    // segment, from where each section actually sits in the document.
    const lane = road.querySelector('.pf-road__progress');
    const n = stops.length;
    let pos = [];                                                          // % along the road
    let at = [];                                                           // scroll fraction per stop

    const place = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      // narrow screens keep the end labels clear of the edges
      const edge = road.clientWidth < 720 ? 11 : 7;
      pos = stops.map((_, i) => edge + (i * (100 - 2 * edge)) / Math.max(1, n - 1));
      const narrow = road.clientWidth < 720;
      at = stops.map((s, i) => {
        s.style.left = `${pos[i]}%`;
        // seven full names do not fit across a phone, so they shorten there
        const label = s.firstElementChild;
        // data-long, not data-full: [data-full] is the lightbox's own hook
        const want = narrow ? s.dataset.abbr : s.dataset.long;
        if (label && want && label.textContent !== want) label.textContent = want;
        const target = document.querySelector(s.dataset.for);
        return target ? Math.min(1, Math.max(0, (target.offsetTop - innerHeight * 0.35) / max)) : 1;
      });
      for (let i = 1; i < n; i++) at[i] = Math.max(at[i], at[i - 1] + 0.001);   // keep them ordered
    };

    const xFor = (p) => {
      if (!n || p <= at[0]) return 2 + (pos[0] - 2) * (at[0] ? p / at[0] : 1);
      for (let i = 0; i < n - 1; i++) {
        if (p < at[i + 1]) return pos[i] + ((p - at[i]) / (at[i + 1] - at[i])) * (pos[i + 1] - pos[i]);
      }
      const last = at[n - 1];
      return pos[n - 1] + (last < 1 ? ((p - last) / (1 - last)) * (97 - pos[n - 1]) : 0);
    };

    let angle = 0, lastY = scrollY, parkTimer = 0, frame = 0;

    const update = () => {
      frame = 0;
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      const p = Math.min(1, Math.max(0, scrollY / max));
      const x = xFor(p);
      const px = (road.clientWidth * x) / 100 - rider.clientWidth * 0.62;   // front wheel on the point
      rider.style.setProperty('--x', `${Math.round(Math.min(road.clientWidth - rider.clientWidth, Math.max(0, px)))}px`);
      if (lane) lane.style.width = `${x}%`;
      road.style.setProperty('--t', p.toFixed(3));
      root.style.setProperty('--t', p.toFixed(3));
      road.style.setProperty('--scroll', Math.round(scrollY * 0.6));

      // wheels turn by distance travelled, not by time
      angle += (scrollY - lastY) * 0.9;
      lastY = scrollY;
      wheels.forEach((w) => { w.style.transform = `rotate(${angle}deg)`; });

      let current = -1;
      stops.forEach((s, i) => {
        const passed = p >= at[i] - 0.01;
        s.classList.toggle('is-passed', passed);
        if (passed) current = i;
      });
      stops.forEach((s, i) => s.classList.toggle('is-current', i === current));

      if (!reduced) {
        rider.classList.remove('is-parked');
        clearTimeout(parkTimer);
        parkTimer = setTimeout(() => rider.classList.add('is-parked'), 420);
      }
    };

    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };

    // the road is also a way to move around: a stop takes you to its section,
    // the rider takes you back to the top
    stops.forEach((s) => s.addEventListener('click', () => {
      document.querySelector(s.dataset.for)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    }));
    rider.addEventListener('click', () => scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }));

    place();
    update();
    rider.classList.add('is-parked');
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', () => { place(); update(); }, { passive: true });
    // fonts and images change the document height after first paint
    addEventListener('load', () => { place(); update(); }, { once: true });
  }

  /* ================================================================= nav */
  const nav = document.querySelector('.pf-nav');
  if (nav) {
    const solid = () => nav.classList.toggle('is-scrolled', scrollY > 24);
    solid();
    addEventListener('scroll', solid, { passive: true });
  }

  document.querySelectorAll('[data-top]').forEach((b) => b.addEventListener('click', () =>
    scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })));

  /* ============================================================= reveals */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      setTimeout(() => e.target.classList.add('is-in'), Number(e.target.dataset.rDelay || 0));
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  document.querySelectorAll('[data-r]').forEach((el) => (reduced ? el.classList.add('is-in') : io.observe(el)));

  /* ============================================================ counters */
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    if (!Number.isFinite(target)) return;
    if (reduced) { el.textContent = target + suffix; return; }
    el.textContent = '0' + suffix;
    const o = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      o.disconnect();
      const t0 = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / 1100);
        el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))) + suffix;
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    o.observe(el);
  });

  /* ========================================================= active link */
  const links = [...document.querySelectorAll('.pf-links a[href^="#"]')];
  const secs = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if (secs.length) {
    const nio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${e.target.id}`));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    secs.forEach((s) => nio.observe(s));
  }

  /* ============================================================ lightbox */
  // Only real images open the lightbox. A stray data-full on something else
  // used to open an empty black screen, which looked like a broken site.
  const openers = [...document.querySelectorAll('[data-full]')]
    .filter((el) => /\.(webp|png|jpe?g|avif|svg)(\?|$)/i.test(el.dataset.full || ''));
  if (openers.length) {
    const box = document.createElement('div');
    box.className = 'pf-box';
    box.innerHTML = '<button class="pf-box__x" aria-label="Close">&times;</button><img alt=""><p class="pf-box__c"></p>';
    document.body.append(box);
    const img = box.querySelector('img'), cap = box.querySelector('.pf-box__c');
    const shut = () => { box.classList.remove('is-open'); document.body.style.overflow = ''; };
    openers.forEach((el) => el.addEventListener('click', () => {
      img.src = el.dataset.full; img.alt = el.dataset.cap || ''; cap.textContent = el.dataset.cap || '';
      box.classList.add('is-open'); document.body.style.overflow = 'hidden';
    }));
    box.addEventListener('click', (e) => { if (e.target !== img) shut(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') shut(); });
  }

  /* =============================================================== stars */
  document.querySelectorAll('[data-stars]').forEach((host) => {
    for (let i = 0; i < 60; i++) {
      const s = document.createElement('i');
      s.style.left = `${Math.random() * 100}%`;
      s.style.top = `${Math.random() * 100}%`;
      s.style.animationDelay = `${-Math.random() * 3}s`;
      s.style.opacity = (0.3 + Math.random() * 0.7).toFixed(2);
      host.append(s);
    }
  });
})();
