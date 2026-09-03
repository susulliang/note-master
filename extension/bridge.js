/**
 * bridge.js — injected into the Ticket Notes web-app page (matches
 * localhost / 127.0.0.1 / *.vercel.app via manifest.content_scripts).
 *
 * Two jobs:
 *   1. Tells the page "the extension is installed" by posting a
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
 *   - `:diagnostics` broadcasts include the current page origin + a list
 *     of manifest match-patterns that would cover it, so if the content
 *     script actually FAILED to inject (because the origin isn't in the
 *     manifest matches) the page can tell the user exactly what line to
 *     paste into manifest.json.
 */

(function () {
  if (window.__NM_EXT_BRIDGE_INSTALLED__) return;
  window.__NM_EXT_BRIDGE_INSTALLED__ = true;

  function broadcastReady() {
    window.postMessage({ source: 'ecovacs-ccp-extension:ready', extensionId: chrome.runtime.id, ts: Date.now() }, '*');
  }
  function broadcastDiagnostics() {
    // The set of match patterns the TICKET-APP content script requires.
    // This MUST stay in sync with manifest.json > content_scripts > bridge.js
    // entry and externally_connectable > matches; when they drift the
    // diagnostic toast the user receives becomes misleading.
    const ticketAppPatterns = [
      '*://localhost:*/*',
      '*://127.0.0.1:*/*',
      'https://*.vercel.app/*',
      'https://note-master.vercel.app/*',
    ];
    const externalConnectablePatterns = [
      'http://localhost:*/*',
      'https://localhost:*/*',
      'http://127.0.0.1:*/*',
      'https://127.0.0.1:*/*',
      'https://*.vercel.app/*',
      'https://note-master.vercel.app/*',
    ];
    window.postMessage({
      source: 'ecovacs-ccp-extension:diagnostics',
      origin: location.origin,
      href: location.href,
      extensionId: chrome.runtime.id,
      ticketAppPatterns,
      externalConnectablePatterns,
      ts: Date.now(),
    }, '*');
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
  setTimeout(broadcastReady, 900);
  setTimeout(broadcastReady, 2200);
  setTimeout(broadcastReady, 5500);
  // Persistent heartbeat (10 s interval, indefinite).  Lightweight: ~28
  // bytes over postMessage. No DOM access, so safe for long calls.
  setInterval(broadcastReady, 10_000);
  setInterval(broadcastDiagnostics, 60_000);

  // (B) Reverse handshake: page can proactively ask "is bridge alive?" and
  // we reply synchronously so even a listener that mounted AFTER all
  // of the (A) broadcasts still gets an immediate answer.
  window.addEventListener('message', (event) => {
    const d = event.data;
    if (!d || typeof d !== 'object') return;
    if (d.source === 'ecovacs-ccp-extension:handshake_request') {
      broadcastReady();
      broadcastDiagnostics();
      try { window.postMessage({ source: 'ecovacs-ccp-extension:handshake_reply', extensionId: chrome.runtime.id, ts: Date.now() }, '*'); }
      catch { /* ignore cross-origin restrictions */ }
    }
    if (d.source === 'ecovacs-ccp-extension:request') {
      chrome.runtime.sendMessage(d.request, (reply) => {
        try { window.postMessage({ source: 'ecovacs-ccp-extension:response', id: d.id, reply }, '*'); }
        catch { /* ignore */ }
      });
    }
  });

  // Background says "push merged fields to the Ticket Notes page" — relay
  // into the page's main world via window.postMessage.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'TICKET_APP_BRIDGE') return false;
    try {
      window.postMessage({ source: 'ecovacs-ccp-extension:push', payload: msg.payload, ts: Date.now() }, '*');
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  });
})();
