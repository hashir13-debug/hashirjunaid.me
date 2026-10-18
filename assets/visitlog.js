/* Visit log: a quiet record of who opened the site, and a hidden way in.
 *
 * Two parts:
 *   1. a beacon fired once per page view (time, place from the IP, device,
 *      where they came from) - silent, nothing is asked of the visitor
 *   2. a dot in the footer nobody notices; a 4-digit PIN behind it opens the
 *      panel. The PIN is also checked by the server, so the copy of it in this
 *      file (a hash) is only there to keep the pad honest, not to protect data.
 *
 * The endpoint comes from window.__visit, written at build time.
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

  // Apps Script answers a POST with a redirect to another host, which a normal
  // cross-origin fetch will not follow. sendBeacon does not care: it posts and
  // forgets, survives the tab closing, and needs no reply. fetch in no-cors
  // mode is the fallback for anything that lacks it.
  const post = (body) => {
    if (!API) return;
    const text = JSON.stringify(body);
    try {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      if (navigator.sendBeacon && navigator.sendBeacon(API, blob)) return;
    } catch { /* fall through */ }
    fetch(API, {
      method: 'POST', mode: 'no-cors', keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: text,
    }).catch(() => {});
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

  // City and country come from the IP, which needs no permission and shows no
  // prompt. (The precise, GPS kind would ask, so it is deliberately not used.)
  // If the lookup is slow or blocked the visit is still recorded without it.
  const place = () => new Promise((done) => {
    const t = setTimeout(() => done({}), 1500);
    fetch('https://ipwho.is/', { mode: 'cors' })
      .then((r) => r.json())
      .then((d) => { clearTimeout(t); done(d && d.success === false ? {} : d || {}); })
      .catch(() => { clearTimeout(t); done({}); });
  });

  const beacon = async () => {
    const src = source();
    if (src === '') return;                                      // moving within the site
    const g = await place();
    post({
      type: 'visit',
      page: location.pathname.replace(/index\.html$/, '') || '/',
      source: src,
      device: device(),
      city: g.city || '',
      region: g.region || '',
      country: g.country || '',
      isp: (g.connection && g.connection.isp) || '',
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      lang: navigator.language || '',
      screen: `${screen.width}x${screen.height}`,
      ref: document.referrer || '',
    });
  };

  /* ---------------------------------------------- 2. the dot and the panel
   * Note: there is deliberately no sign-in, consent box or permission prompt
   * anywhere in here. A visitor opens the site, reads it and downloads the CV
   * without being asked for anything - that was the whole point. It also means
   * no name and no e-mail are ever knowable, because the browser does not hand
   * those over, and the only honest way to get them is to ask. */
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

    const rows = (data.rows || []).filter((r) => (r.type || 'visit') === 'visit');
    if (!rows.length) { body.innerHTML = '<p class="pf-log__empty">Nothing recorded yet.</p>'; return; }
    const where = (r) => [r.city, r.country].filter(Boolean).join(', ')
      || (r.zone || '').split('/').pop().replace(/_/g, ' ');
    const line = (r) => `<tr><td>${fmt(r.at)}</td><td>${r.source || ''}</td><td>${where(r)}</td>`
      + `<td>${r.isp || ''}</td><td>${r.device || ''}</td><td>${r.page || ''}</td></tr>`;
    const today = new Date().toDateString();
    const todays = rows.filter((r) => new Date(r.at).toDateString() === today).length;
    body.innerHTML = `<div class="pf-log__count">${rows.length} visits &middot; ${todays} today</div>
      <table class="pf-log__table">
        <tr><th>When</th><th>From</th><th>Where</th><th>Network</th><th>Device</th><th>Page</th></tr>
        ${rows.map(line).join('')}</table>`;
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

  if (document.readyState === 'complete') beacon();
  else addEventListener('load', beacon, { once: true });
})();
