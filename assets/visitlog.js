/* Visit log: a quiet record of who opened the site, and a hidden way in.
 *
 * Three parts:
 *   1. a beacon fired once per page view (date, timezone, device, source)
 *   2. a Google sign-in in front of the CV download, which is the only way a
 *      real name and e-mail can be known - the browser never hands those over
 *      on its own
 *   3. a dot in the footer nobody notices; a 4-digit PIN behind it opens the
 *      panel. The PIN is also checked by the server, so the copy of it in this
 *      file (a hash) is only there to keep the pad honest, not to protect data.
 *
 * Endpoint and client id come from window.__visit, written at build time.
 */
(() => {
  const CFG = window.__visit || {};
  const API = CFG.endpoint || '';
  const PIN_HASH = '58298aa91f6ff4905846d4b3c1015d617d23ec268a6f3b9e75d71e5d91829afc';
  const SALT = 'hj-visit-';

  const sha = async (s) => {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  };

  const post = (body) => {
    if (!API) return Promise.resolve(null);
    // keepalive so the beacon still goes out if the tab is closing
    return fetch(API, {
      method: 'POST', keepalive: true, mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // avoids a CORS preflight
      body: JSON.stringify(body),
    }).then((r) => r.json()).catch(() => null);
  };

  /* ----------------------------------------------------------- 1. beacon */
  const source = () => {
    const ref = document.referrer || '';
    if (!ref) return 'direct';
    try {
      const h = new URL(ref).hostname.replace(/^www\./, '');
      if (h === location.hostname) return '';                    // internal click
      if (/linkedin/.test(h)) return 'LinkedIn';
      if (/google|bing|duckduckgo|yahoo/.test(h)) return 'Search';
      if (/github/.test(h)) return 'GitHub';
      return h;
    } catch { return 'direct'; }
  };

  const device = () => {
    const ua = navigator.userAgent;
    const kind = /iPad|Tablet/.test(ua) ? 'Tablet' : /Mobi|Android|iPhone/.test(ua) ? 'Phone' : 'Desktop';
    const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android'
      : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
    const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
      : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '';
    return [kind, os, br].filter(Boolean).join(' · ');
  };

  const beacon = () => {
    const src = source();
    if (src === '') return;                                      // moving within the site
    post({
      type: 'visit',
      page: location.pathname.replace(/index\.html$/, '') || '/',
      source: src,
      device: device(),
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      lang: navigator.language || '',
      screen: `${screen.width}x${screen.height}`,
      ref: document.referrer || '',
    });
  };

  /* -------------------------------------------- 2. sign-in before the CV */
  // The CV buttons carry data-cv. Clicking one asks for a Google sign-in; on
  // success the download starts and the verified name + e-mail are recorded.
  const gate = () => {
    const btns = [...document.querySelectorAll('[data-cv]')];
    if (!btns.length || !CFG.clientId || !API) return;            // not set up: plain download

    let pending = null;
    const done = (resp) => {
      post({ type: 'signin', credential: resp.credential, page: location.pathname })
        .finally(() => { if (pending) { const a = pending; pending = null; location.href = a; } });
    };

    const load = () => new Promise((res) => {
      if (window.google && google.accounts) return res();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.onload = res; s.onerror = res;
      document.head.appendChild(s);
    });

    btns.forEach((b) => b.addEventListener('click', async (e) => {
      if (sessionStorage.getItem('cv-ok')) return;                // already signed in here
      e.preventDefault();
      pending = b.getAttribute('href');
      await load();
      if (!window.google || !google.accounts) { location.href = pending; return; }
      google.accounts.id.initialize({
        client_id: CFG.clientId,
        callback: (r) => { sessionStorage.setItem('cv-ok', '1'); done(r); },
        cancel_on_tap_outside: true,
      });
      google.accounts.id.prompt((n) => {
        // if Google will not show the one-tap, do not hold the download hostage
        if (n.isNotDisplayed && n.isNotDisplayed()) { const a = pending; pending = null; location.href = a; }
      });
    }));
  };

  /* --------------------------------------------- 3. the dot and the panel */
  const fmt = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
    });
  };

  const panel = async (pin) => {
    const box = document.createElement('div');
    box.className = 'pf-log';
    box.innerHTML = `<div class="pf-log__card" role="dialog" aria-label="Visit log">
      <div class="pf-log__head"><b>Who opened this</b>
        <span class="pf-log__tabs"><button data-t="visit" class="is-on">Visits</button><button data-t="signin">Signed in</button></span>
        <button class="pf-log__x" aria-label="Close">&times;</button></div>
      <div class="pf-log__body">Loading&hellip;</div></div>`;
    document.body.appendChild(box);
    const body = box.querySelector('.pf-log__body');
    const close = () => box.remove();
    box.querySelector('.pf-log__x').onclick = close;
    box.onclick = (e) => { if (e.target === box) close(); };

    let data = null;
    try {
      const r = await fetch(`${API}?pin=${encodeURIComponent(pin)}&limit=300`, { mode: 'cors' });
      data = await r.json();
    } catch { /* shown below */ }

    if (!data || data.ok === false) {
      body.innerHTML = `<p class="pf-log__empty">Could not reach the log.${API ? '' : ' No endpoint is configured yet.'}</p>`;
      return;
    }

    const render = (kind) => {
      const rows = (data.rows || []).filter((r) => (r.type || 'visit') === kind);
      if (!rows.length) { body.innerHTML = '<p class="pf-log__empty">Nothing recorded yet.</p>'; return; }
      const head = kind === 'visit'
        ? '<tr><th>When</th><th>From</th><th>Where</th><th>Device</th><th>Page</th></tr>'
        : '<tr><th>When</th><th>Name</th><th>E-mail</th><th>Page</th></tr>';
      const line = (r) => kind === 'visit'
        ? `<tr><td>${fmt(r.at)}</td><td>${r.source || ''}</td><td>${(r.zone || '').split('/').pop()}</td><td>${r.device || ''}</td><td>${r.page || ''}</td></tr>`
        : `<tr><td>${fmt(r.at)}</td><td>${r.name || ''}</td><td>${r.email || ''}</td><td>${r.page || ''}</td></tr>`;
      body.innerHTML = `<div class="pf-log__count">${rows.length} recorded</div>
        <table class="pf-log__table">${head}${rows.map(line).join('')}</table>`;
    };
    render('visit');
    box.querySelectorAll('.pf-log__tabs button').forEach((b) => b.onclick = () => {
      box.querySelectorAll('.pf-log__tabs button').forEach((x) => x.classList.toggle('is-on', x === b));
      render(b.dataset.t);
    });
  };

  const pad = () => {
    const box = document.createElement('div');
    box.className = 'pf-log pf-log--pin';
    box.innerHTML = `<form class="pf-log__pin" autocomplete="off">
      <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" aria-label="PIN" />
      <span class="pf-log__err" hidden>Wrong</span></form>`;
    document.body.appendChild(box);
    const input = box.querySelector('input');
    const err = box.querySelector('.pf-log__err');
    input.focus();
    box.onclick = (e) => { if (e.target === box) box.remove(); };
    addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { box.remove(); removeEventListener('keydown', esc); }
    });
    box.querySelector('form').onsubmit = (e) => e.preventDefault();
    input.addEventListener('input', async () => {
      err.hidden = true;
      if (input.value.length !== 4) return;
      if (await sha(SALT + input.value) === PIN_HASH) { const p = input.value; box.remove(); panel(p); }
      else { err.hidden = false; input.value = ''; }
    });
  };

  const key = document.querySelector('[data-logkey]');
  if (key) key.addEventListener('click', (e) => { e.preventDefault(); pad(); });

  if (document.readyState === 'complete') { beacon(); gate(); }
  else addEventListener('load', () => { beacon(); gate(); }, { once: true });
})();
