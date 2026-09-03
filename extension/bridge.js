/**
 * bridge.js — injected into the Ticket Notes web-app page (matches
 * localhost / 127.0.0.1 / [::1] / *.vercel.app via manifest.content_scripts).
 *
 * Two jobs:
 *   1. Tells the page "the extension is installed" by posting
 *      window.postMessage({ source: 'ecovacs-ccp-extension:ready' }) on
 *      load. The page uses this to surface a "Extension connected" badge
 *      and to learn the extension ID for onMessageExternal calls.
 *   2. Relays chrome.tabs.sendMessage payloads sent by the background
 *      service worker (type = 'TICKET_APP_BRIDGE') into the page via
 *      window.postMessage so non-externally-connectable deployments can
 *      still receive merged CCP+SF fields.
 *
 * Everything in this file runs inside the page's MAIN world / isolated
 * world boundary is intentionally bridged via postMessage so the page
 * never directly executes extension-origin code.
 *
 * CONNECTION DIAGNOSTICS:
 *   - `:ready` broadcasts on a persistent 10s heartbeat (not just one-shot
 *     at load) so React SPA components that mount after DOMContentLoaded
 *     still catch the handshake.
 *   - The page can also PROACTIVELY trigger a handshake by posting
 *     `ecovacs-ccp-extension:handshake_request` at any time — we reply
 *     synchronously with `:ready` including the runtime id and origin.
 *   - `:diagnostics` broadcasts read the MANIFEST directly at boot via
 *     chrome.runtime.getURL('/manifest.json') + fetch() — this is the
 *     ONLY source of truth for patterns / version so the broadcasted
 *     lists and what Chrome loaded can never drift again.
 */

(function () {
  if (window.__NM_EXT_BRIDGE_INSTALLED__) return;
  window.__NM_EXT_BRIDGE_INSTALLED__ = true;

  // ---------------------------------------------------------------------
  // Read manifest ONCE asynchronously and cache patterns + version.
  // The ticket app page is allowed to fetch the extension's own
  // manifest.json because it's listed in web_accessible_resources via the
  // '<all_urls>' matches (and more importantly we fetch via
  // chrome-extension:// which is origin-privileged inside content scripts).
  //
  // Until manifest is loaded we fall back to a sane "no patterns" empty
  // list + manifestVersion = 'loading' so the page can tell that the
  // diagnostic surface isn't final yet.
  // ---------------------------------------------------------------------
  let manifestSnapshot = {
    manifestVersion: 'loading',
    versionName: '',
    ticketAppPatterns: [] ,
    externalConnectablePatterns: [] ,
    fingerprint: 'loading',
  };

  function hashString(s) {
    // Very small 32-bit DJB2 — enough for a "did my patterns drift?"
    // fingerprint, not crypto. Returns hex-ish string for readability.
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
    return (h >>> 0).toString(36);
  }

  function extractBridgePatterns(manifest) {
    // manifest.content_scripts[] is a list of { matches, js, ... }.
    // Bridge script is the content_scripts entry whose .js array contains
    // 'bridge.js' (no path prefix per manifest.json).
    if (!manifest || !Array.isArray(manifest.content_scripts)) return [] ;
    for (const entry of manifest.content_scripts) {
      const js = Array.isArray(entry.js) ? entry.js : [];
      if (js.some((x) => typeof x === 'string' && (x === 'bridge.js' || x.endsWith('/bridge.js')))) {
        return Array.isArray(entry.matches) ? entry.matches.filter((x) => typeof x === 'string') : [] ;
      }
    }
    return [] ;
  }

  try {
    fetch(chrome.runtime.getURL('/manifest.json'), { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('fetch status ' + r.status);
        return r.json();
      })
      .then((m) => {
        const ticket = extractBridgePatterns(m) || [] ;
        const ext = (m && m.externally_connectable && Array.isArray(m.externally_connectable.matches))
          ? m.externally_connectable.matches.filter((x) => typeof x === 'string')
          : [] ;
        const manifestVersion = String(m && m.version ? m.version : 'unknown');
        const fingerprint = hashString([
          manifestVersion,
          ticket.join('|'),
          ext.join('|'),
        ].join('||'));
        manifestSnapshot = {
          manifestVersion,
          versionName: String(m && m.version_name ? m.version_name : ''),
          ticketAppPatterns: ticket,
          externalConnectablePatterns: ext,
          fingerprint,
        };
        window.__NM_EXT_BRIDGE_VERSION__ = manifestVersion;
        window.__NM_EXT_BRIDGE_FP__ = fingerprint;
      })
      .catch((err) => {
        // As a fallback, embed patterns CURRENT to the version of
        // bridge.js that shipped with the manifest. This guarantees we
        // never advertise mismatches on a failed fetch, and the ticket
        // app's diagnostics will still show a stale-cache warning.
        manifestSnapshot = {
          manifestVersion: 'fetch-failed:' + String(err?.message || err).slice(0, 60),
          versionName: '',
          ticketAppPatterns: [
            '*://localhost:*/*',
            '*://127.0.0.1:*/*',
            '*://[::1]:*/*',
            'https://*.vercel.app/*',
            'https://note-master.vercel.app/*',
            'https://note-master-roan.vercel.app/*',
          ],
          externalConnectablePatterns: [
            'http://localhost:*/*',
            'https://localhost:*/*',
            'http://127.0.0.1:*/*',
            'https://127.0.0.1:*/*',
            'http://[::1]:*/*',
            'https://[::1]:*/*',
            'https://*.vercel.app/*',
            'https://note-master.vercel.app/*',
            'https://note-master-roan.vercel.app/*',
          ],
          fingerprint: 'fallback-' + Date.now().toString(36),
        };
        window.__NM_EXT_BRIDGE_VERSION__ = manifestSnapshot.manifestVersion;
        window.__NM_EXT_BRIDGE_FP__ = manifestSnapshot.fingerprint;
      });
  } catch (e) {
    manifestSnapshot.fingerprint = 'boot-exception:' + String(e?.message || e).slice(0, 60);
  }

  function commonMeta() {
    return {
      extensionId: chrome.runtime && chrome.runtime.id ? chrome.runtime.id : '',
      ts: Date.now(),
      origin: typeof location !== 'undefined' ? location.origin : '',
      href: typeof location !== 'undefined' ? location.href : '',
      manifestVersion: manifestSnapshot.manifestVersion,
      versionName: manifestSnapshot.versionName,
      fingerprint: manifestSnapshot.fingerprint,
    };
  }

  function broadcastReady() {
    try {
      window.postMessage(Object.assign({
        source: 'ecovacs-ccp-extension:ready',
      }, commonMeta()), '*');
    } catch { /* ignore cross-origin restrictions */ }
  }
  function broadcastDiagnostics() {
    try {
      window.postMessage(Object.assign({
        source: 'ecovacs-ccp-extension:diagnostics',
        ticketAppPatterns: manifestSnapshot.ticketAppPatterns.slice(),
        externalConnectablePatterns: manifestSnapshot.externalConnectablePatterns.slice(),
        // Expose the user's actual location so diagnostic text can always
        // print the URL the browser is on even if window.location is
        // shadowed (it normally isn't, but defensive costs ~20 bytes).
      }, commonMeta()), '*');
    } catch { /* ignore cross-origin restrictions */ }
  }
  function broadcastHandshakeReply() {
    try {
      window.postMessage(Object.assign({
        source: 'ecovacs-ccp-extension:handshake_reply',
      }, commonMeta()), '*');
    } catch { /* ignore cross-origin restrictions */ }
  }

  // (A) Handshake broadcasts — first pings asap, then DOMContentLoaded, then
  // window load, then a few retries to cover initial SPA mount, then a
  // persistent 10s heartbeat so late listeners (user clicks "Generate Note"
  // 5 minutes into a long call) still see connected=true.
  broadcastReady();
  broadcastDiagnostics();
  document.addEventListener('DOMContentLoaded', broadcastReady);
  document.addEventListener('DOMContentLoaded', broadcastDiagnostics);
  window.addEventListener('load', broadcastReady);
  window.addEventListener('load', broadcastDiagnostics);
  // Short ramp-up to cover early listener races (React mounts inside 2s
  // often but dev builds can be slower).
  setTimeout(broadcastReady, 300);
  setTimeout(broadcastDiagnostics, 400);
  setTimeout(broadcastReady, 900);
  setTimeout(broadcastReady, 2200);
  setTimeout(broadcastDiagnostics, 2300);
  setTimeout(broadcastReady, 5500);
  // Persistent heartbeat (10 s interval for :ready, 25s for :diagnostics
  // since payload is bigger and version/patterns rarely change).
  setInterval(broadcastReady, 10_000);
  setInterval(broadcastDiagnostics, 25_000);

  // (B) Reverse handshake: page can proactively ask "is bridge alive?" and
  // we reply synchronously so even a listener that mounted AFTER all
  // of the (A) broadcasts still gets an immediate answer.
  window.addEventListener('message', (event) => {
    const d = event.data;
    if (!d || typeof d !== 'object') return;
    if (d.source === 'ecovacs-ccp-extension:handshake_request') {
      broadcastReady();
      broadcastDiagnostics();
      broadcastHandshakeReply();
    }
    if (d.source === 'ecovacs-ccp-extension:request') {
      try {
        chrome.runtime.sendMessage(d.request, (reply) => {
          try { window.postMessage({ source: 'ecovacs-ccp-extension:response', id: d.id, reply }, '*'); }
          catch { /* ignore cross-origin restrictions */ }
        });
      } catch (e) {
        try { window.postMessage({ source: 'ecovacs-ccp-extension:response', id: d.id, reply: { ok: false, error: String(e?.message || e) } }, '*'); }
        catch { /* ignore */ }
      }
    }
  });

  // Background says "push merged fields to the Ticket Notes page" — relay
  // into the page's main world via window.postMessage.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'TICKET_APP_BRIDGE') return false;
    try {
      window.postMessage(Object.assign({ source: 'ecovacs-ccp-extension:push', payload: msg.payload }, commonMeta()), '*');
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  });
})();
