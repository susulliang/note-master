/**
 * wave-hook.js — MAIN-world network capture for the [OVER24] Wave report.
 *
 * Runs at document_start (world: MAIN, all_frames) on every Salesforce /
 * Lightning page. It wraps window.fetch + XMLHttpRequest and records JSON
 * response bodies that could contain report datasets. The ISOLATED content
 * script / background extractor pulls the captured payloads on demand via
 * the 'ecovacs-wave-pull' event; this hook writes them into a
 * <script type="application/json" id="__ecovacs_wave_payload"> node that
 * both worlds can read (DOM is shared; CustomEvents propagate cross-world).
 *
 * Why: the Wave/Analytics data-grid virtualizes its rows behind a custom
 * viewport that ignores scrollTop / synthetic wheel events, so DOM scraping
 * only ever sees the first ~23 rendered rows. The report data itself arrives
 * over XHR/fetch with ALL rows — capturing that response gives the complete
 * dataset regardless of what the DOM renders.
 */
(function () {
  if (window.__ecovacsWaveHookInstalled) return;
  window.__ecovacsWaveHookInstalled = true;

  const stored = []; // { url, ts, text } — candidate payloads
  const stats = {
    installedAt: Date.now(),
    fetchSeen: 0,
    xhrSeen: 0,
    stored: 0,
    seenUrls: [], // last 60 response URLs (ANY response, stored or not)
  };
  const MAX_ENTRIES = 12;
  const MAX_TEXT = 1500000;
  const MAX_URLS = 60;

  function noteUrl(url) {
    try {
      const u = String(url || '').slice(0, 220);
      if (!u) return;
      stats.seenUrls.push(u);
      if (stats.seenUrls.length > MAX_URLS) stats.seenUrls.shift();
    } catch (e) { /* ignore */ }
  }

  /** Store anything that could plausibly be the report dataset. Deliberately
   *  loose — the parser filters by shape, so over-capturing is harmless
   *  while under-capturing loses the data. */
  function maybeStore(url, text) {
    try {
      if (!text || text.length < 400) return false;
      const u = String(url || '').toLowerCase();
      const urlHit = /report|wave|analytics|query|dataset|insights|bi/i.test(u);
      // Case-number-like token (6+ digit run) or a Salesforce record id.
      const dataHit = /(^|[^0-9])\d{6,10}([^0-9]|$)/.test(text) || /500[A-Za-z0-9]{12,15}/.test(text);
      if (!urlHit && !dataHit) return false;
      stored.push({
        url: String(url || '').slice(0, 300),
        ts: Date.now(),
        text: text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text,
      });
      if (stored.length > MAX_ENTRIES) stored.shift();
      stats.stored += 1;
      return true;
    } catch (e) { return false; }
  }

  // ---- fetch ----------------------------------------------------------------
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function () {
      const args = arguments;
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      stats.fetchSeen += 1;
      return origFetch.apply(this, args).then(function (resp) {
        try {
          noteUrl(url);
          resp.clone().text().then(function (t) { maybeStore(url, t); }).catch(function () { /* ignore */ });
        } catch (e) { /* ignore */ }
        return resp;
      });
    };
  }

  // ---- XMLHttpRequest ---------------------------------------------------------
  try {
    const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (proto && proto.open && proto.send) {
      const origOpen = proto.open;
      const origSend = proto.send;
      proto.open = function (method, url) {
        this.__ecoUrl = url;
        return origOpen.apply(this, arguments);
      };
      proto.send = function () {
        const xhr = this;
        stats.xhrSeen += 1;
        xhr.addEventListener('load', function () {
          try {
            noteUrl(xhr.__ecoUrl);
            let t = '';
            try { t = xhr.responseText; } catch (e1) {
              try { t = xhr.response ? JSON.stringify(xhr.response) : ''; } catch (e2) { t = ''; }
            }
            maybeStore(xhr.__ecoUrl, t);
          } catch (e) { /* ignore */ }
        });
        return origSend.apply(this, arguments);
      };
    }
  } catch (e) { /* ignore */ }

  // ---- pull bridge (MAIN world -> ISOLATED world) ---------------------------
  window.addEventListener('ecovacs-wave-pull', function () {
    try {
      let el = document.getElementById('__ecovacs_wave_payload');
      if (!el) {
        el = document.createElement('script');
        el.type = 'application/json';
        el.id = '__ecovacs_wave_payload';
        (document.head || document.documentElement).appendChild(el);
      }
      el.textContent = JSON.stringify({ payloads: stored, stats: stats });
    } catch (e) { /* ignore */ }
  }, true);
})();
