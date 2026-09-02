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
 */

(function () {
  if (window.__NM_EXT_BRIDGE_INSTALLED__) return;
  window.__NM_EXT_BRIDGE_INSTALLED__ = true;

  function broadcastReady() {
    window.postMessage({ source: 'ecovacs-ccp-extension:ready', extensionId: chrome.runtime.id }, '*');
  }

  // First ping immediately, then after load (the app's boot is usually
  // after DOMContentLoaded, not during). Repeat 3 times to cover SPAs.
  broadcastReady();
  document.addEventListener('DOMContentLoaded', broadcastReady);
  window.addEventListener('load', broadcastReady);
  setTimeout(broadcastReady, 700);
  setTimeout(broadcastReady, 2500);

  // Background says "push merged fields to the Ticket Notes page" — relay
  // into the page's main world via window.postMessage.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'TICKET_APP_BRIDGE') return false;
    try {
      window.postMessage({ source: 'ecovacs-ccp-extension:push', payload: msg.payload }, '*');
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  });

  // Reverse direction: page asks the extension to do something via
  // postMessage (re-scrape, get state). The page cannot call
  // chrome.runtime.sendMessage directly on arbitrary hosts so it tunnels
  // through this content script instead.
  window.addEventListener('message', (event) => {
    const d = event.data;
    if (!d || typeof d !== 'object' || d.source !== 'ecovacs-ccp-extension:request') return;
    chrome.runtime.sendMessage(d.request, (reply) => {
      window.postMessage({ source: 'ecovacs-ccp-extension:response', id: d.id, reply }, '*');
    });
  });
})();
