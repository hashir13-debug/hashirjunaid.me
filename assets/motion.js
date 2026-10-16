/**
 * Page motion: scroll reveals, counters, card tilt, scroll progress.
 *
 * All of it degrades to "everything visible, nothing moving" when the OS asks
 * for reduced motion, and nothing here is required for the page to be readable
 * — if the script fails, the CSS fallback shows every element.
 */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');

  /* --- reveal on scroll ---------------------------------------------------- */
  const reveals = document.querySelectorAll('[data-reveal]');
  if (reduced) {
    reveals.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        // Stagger siblings so a grid arrives as a wave rather than a slab.
        const delay = Number(e.target.dataset.revealDelay || 0);
        setTimeout(() => e.target.classList.add('is-in'), delay);
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    reveals.forEach((el) => io.observe(el));
  }

  /* --- counters ------------------------------------------------------------ */
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target)) return;
    if (reduced) { el.textContent = String(target); return; }
    el.textContent = '0';
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const dur = 900;
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    io.observe(el);
  });

  /* --- card tilt ----------------------------------------------------------- */
  if (!reduced && matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('[data-tilt]').forEach((card) => {
      let frame = 0;
      card.addEventListener('pointermove', (ev) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const r = card.getBoundingClientRect();
          const cx = (ev.clientX - r.left) / r.width - 0.5;
          const cy = (ev.clientY - r.top) / r.height - 0.5;
          card.style.setProperty('--tilt-x', `${(-cy * 4).toFixed(2)}deg`);
          card.style.setProperty('--tilt-y', `${(cx * 5).toFixed(2)}deg`);
          card.style.setProperty('--spot-x', `${((cx + 0.5) * 100).toFixed(1)}%`);
          card.style.setProperty('--spot-y', `${((cy + 0.5) * 100).toFixed(1)}%`);
        });
      });
      card.addEventListener('pointerleave', () => {
        cancelAnimationFrame(frame);
        card.style.setProperty('--tilt-x', '0deg');
        card.style.setProperty('--tilt-y', '0deg');
      });
    });
  }

  /* --- certificate lightbox ------------------------------------------------ */
  const cards = document.querySelectorAll('[data-lightbox]');
  if (cards.length) {
    const box = document.createElement('div');
    box.className = 'lightbox';
    box.innerHTML = '<button class="lightbox__close" aria-label="Close">&times;</button>'
                  + '<img alt=""><p class="lightbox__cap"></p>';
    document.body.appendChild(box);
    const img = box.querySelector('img');
    const cap = box.querySelector('.lightbox__cap');
    const close = () => { box.classList.remove('is-open'); document.body.style.overflow = ''; };
    cards.forEach((el) => el.addEventListener('click', () => {
      img.src = el.dataset.lightbox;
      img.alt = el.dataset.caption || '';
      cap.textContent = el.dataset.caption || '';
      box.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }));
    box.addEventListener('click', (e) => { if (e.target !== img) close(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }

  /* --- scroll progress ----------------------------------------------------- */
  const bar = document.querySelector('[data-progress]');
  if (bar && !reduced) {
    let frame = 0;
    addEventListener('scroll', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = document.body.scrollHeight - innerHeight;
        bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
      });
    }, { passive: true });
  }
})();
