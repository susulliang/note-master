/**
 * wave-hook.js — MAIN-world network capture for the [OVER24] Wave report.
 *
 * Runs at document_start (world: MAIN, all_frames) on every Salesforce /
 * Lightning page. It wraps window.fetch + XMLHttpRequest and records the
 * JSON payloads of responses that look like report datasets. The ISOLATED
 * content script / background extractor then pulls the captured payloads on
 * demand via the 'ecovacs-wave-pull' event, and the hook writes them into a
 * <script type="application/json" id="__ecovacs_wave_payload"> node that
 * either world can read.
 *
 * Why: the Wave/Analytics data-grid virtualizes its rows behind a custom
 * viewport that does NOT respond to scrollTop / synthetic wheel events, so
 * DOM scrolling can only ever see the first ~23 rendered rows. The report
 * data itself arrives over XHR with ALL rows — capturing that response gives
 * us the complete dataset regardless of what the DOM renders.
 */
(function () {
  if (window.__ecovacsWaveHookInstalled) return;
  window.__ecovacsWaveHookInstalled = true;

  const captured = []; // { url, ts, text }
  const MAX_ENTRIES = 10;
  const MAX_TEXT = 1500000;

  function looksLikeReportData(text, url) {
    if (!text || text.length < 600) return false;
    const u = String(url || '').toLowerCase();
    if (/report|wave|analytics|query|dataset/.test(u)) return true;
    // Generic: lots of Case record ids (500…) + case-number-like digits.
    return /500[A-Za-z0-9]{12,15}/.test(text) && /\d{7,8}/.test(text);
  }

  function push(url, text) {
    try {
      if (!looksLikeReportData(text, url)) return;
      captured.push({
        url: String(url || '').slice(0, 300),
        ts: Date.now(),
        text: text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text,
      });
      if (captured.length > MAX_ENTRIES) captured.shift();
    } catch (e) { /* ignore */ }
  }

  // ---- fetch ----------------------------------------------------------------
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function () {
      const args = arguments;
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      return origFetch.apply(this, args).then(function (resp) {
        try {
          const ct = (resp.headers && resp.headers.get && resp.headers.get('content-type')) || '';
          if (ct.indexOf('json') !== -1 || ct.indexOf('text') !== -1 || !ct) {
            resp.clone().text().then(function (t) { push(url, t); }).catch(function () { /* ignore */ });
          }
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
        xhr.addEventListener('load', function () {
          try {
            let t = '';
            try { t = xhr.responseText; } catch (e1) {
              try { t = xhr.response ? JSON.stringify(xhr.response) : ''; } catch (e2) { t = ''; }
            }
            push(xhr.__ecoUrl, t);
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
      el.textContent = JSON.stringify(captured);
    } catch (e) { /* ignore */ }
  }, true);
})();
