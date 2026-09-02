/**
 * background.js — MV3 service worker for the Ecovacs CCP + Salesforce
 * DOM-scraper extension.
 *
 * Three responsibilities:
 *   1. Keep a single in-memory store of the latest scrapes, grouped by
 *      source tab. Popup reads from here; the web-app pulls from here.
 *   2. Relay content-script scrape messages both directions: popup says
 *      "re-scrape case tab" → background finds the SF tab, sends
 *      runtime.sendMessage to its content script, stores + forwards reply.
 *   3. Talk to the Ticket Notes web-app via TWO channels so every
 *      deployment path works:
 *        a) chrome.runtime.onMessageExternal when the app is listed in
 *           manifest.externally_connectable (localhost + Vercel);
 *        b) Chrome tab-based messaging on the TICKET APP tab — fall back
 *           via a tiny content script "bridge.js" injected into the
 *           Ticket Notes page (no externally_connectable required).
 */

const STORAGE_KEY = 'nm-extension-state-v1';
const EXT_ID_STORAGE_KEY = 'nm-extension-id-v1';
const TICKET_APP_HOST_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?\/?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?\/?$/i,
  /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app\/?$/i,
  /^https:\/\/note-master\.vercel\.app\/?$/i,
];

// ---------------------------------------------------------------------------
//  State helpers
// ---------------------------------------------------------------------------

const defaultState = () => ({
  ccp: null,     // { capturedAt, url, title, data: {...} }
  sf: null,      // { capturedAt, url, title, data: {...} }
  settings: {
    /** Optional extra host match patterns the user added in the popup */
    extraTicketHosts: [],
    autoPush: true,
  },
});

let state = loadState();

function loadState() {
  try {
    const raw = (globalThis.localStorage && localStorage.getItem(STORAGE_KEY)) ?? null;
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultState();
}

async function saveState() {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  } catch {
    // storage.local unavailable inside SW unit tests or early init — state
    // lives in memory for the lifetime of this worker wakeup instead.
  }
}

// Migrate away from pre-loaded localStorage-style value: MV3 SWs use
// chrome.storage.local. Run once per worker boot.
(async function init() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    if (stored[STORAGE_KEY]) state = { ...defaultState(), ...stored[STORAGE_KEY] };
  } catch { /* ignore */ }
})();

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function nowISO() {
  return new Date().toISOString();
}

/** Best-effort find ONE tab whose URL matches one of the patterns. */
async function findTab(patterns) {
  const all = await chrome.tabs.query({});
  return (
    all.find((t) => {
      if (!t.url) return false;
      return patterns.some((p) => p.test(t.url));
    }) ?? null
  );
}

const CCP_PATTERNS = [
  /^https:\/\/.*\.my\.connect\.aws\//i,
  /^https:\/\/.*\.connect\.aws\.a2z\.com\//i,
  /^https:\/\/.*\.awsapps\.com\/connect\//i,
  /^https:\/\/.*\.cc\.amazonaws\.com\//i,
  /^https:\/\/.*\.five9\.com\//i,
  /^https:\/\/.*\.genesys(cloud)?\.com\//i,
  /^https:\/\/.*\.talkdesk\.com\//i,
  /^https:\/\/.*\.zendesk\.com\//i,
  /^https:\/\/.*\.freshdesk\.com\//i,
];

const SF_PATTERNS = [
  /^https:\/\/.*\.lightning\.force\.com\//i,
  /^https:\/\/.*\.my\.salesforce\.com\//i,
  /^https:\/\/.*(\.force)?\.salesforce\.com\//i,
  /^https:\/\/.*\.visual\.force\.com\//i,
  /^https:\/\/.*\.force\.com\//i,
];

async function sendToTab(tabId, payload) {
  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

async function scrapeCcpTab() {
  const tab = await findTab(CCP_PATTERNS);
  if (!tab) return { ok: false, error: 'No CCP tab found. Open Amazon Connect / Five9 / Genesys / Zendesk CCP in any tab.' };
  const reply = await sendToTab(tab.id, { type: 'SCRAPE_CCP' });
  if (reply?.ok) {
    state.ccp = { capturedAt: nowISO(), url: tab.url, title: tab.title, tabId: tab.id, data: reply.data };
    await saveState();
    return { ok: true, payload: state.ccp };
  }
  return { ok: false, error: reply?.error || 'CCP content script did not reply.' };
}

async function scrapeSalesforceTab() {
  const tab = await findTab(SF_PATTERNS);
  if (!tab) return { ok: false, error: 'No Salesforce tab found. Open lightning.force.com / my.salesforce.com / Case page in any tab.' };
  const reply = await sendToTab(tab.id, { type: 'SCRAPE_SF' });
  if (reply?.ok) {
    state.sf = { capturedAt: nowISO(), url: tab.url, title: tab.title, tabId: tab.id, data: reply.data };
    await saveState();
    return { ok: true, payload: state.sf };
  }
  return { ok: false, error: reply?.error || 'Salesforce content script did not reply.' };
}

async function scrapeAll() {
  const [a, b] = await Promise.all([scrapeCcpTab(), scrapeSalesforceTab()]);
  return { ok: true, ccp: a, sf: b };
}

/** The "merged" payload the Ticket Notes page actually consumes — a flat
 *  dictionary of field-id → string, matching the shape the app's LLM and
 *  regex engines already fill. */
function buildMergedFields() {
  const out = {};
  for (const src of [state.ccp?.data ?? {}, state.sf?.data ?? {}]) {
    for (const [k, v] of Object.entries(src || {})) {
      if (!v) continue;
      // First write wins: CCP (live in-call contact) is the more specific
      // source for identity fields like customerName / contactNumber.
      if (out[k] !== undefined && String(out[k]).trim() !== '') continue;
      if (typeof v === 'string' && v.trim() === '') continue;
      if (Array.isArray(v)) out[k] = v;
      else out[k] = String(v);
    }
  }
  return out;
}

/** Find the running Ticket Notes web-app tab and push merged fields to it.
 *  Used both by the popup's "Push to ticket" button and by autoPush after
 *  every content-script scrape event. */
async function pushToTicketApp(force = false) {
  if (!force && !state.settings.autoPush) return { ok: false, skipped: 'autoPush disabled' };
  const ticketTab = await findTab(TICKET_APP_HOST_PATTERNS.concat(
    (state.settings.extraTicketHosts || []).map((h) => new RegExp(h.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'i'))
  ));
  if (!ticketTab) return { ok: false, skipped: 'No open Ticket Notes web-app tab found.' };

  const payload = {
    type: 'TICKET_EXT_PUSH',
    fields: buildMergedFields(),
    state: {
      ccp: state.ccp ? { capturedAt: state.ccp.capturedAt, url: state.ccp.url, title: state.ccp.title } : null,
      sf: state.sf ? { capturedAt: state.sf.capturedAt, url: state.sf.url, title: state.sf.title } : null,
    },
    pushedAt: nowISO(),
    source: 'ecovacs-ccp-scraper',
  };
  // Prefer onMessageExternal if the caller is within externally_connectable
  // — the app listens on that channel first. Otherwise fall back to
  // tabs.sendMessage to the bridge content script injected on the ticket
  // page, which window.postMessages it onward.
  let reply;
  try {
    reply = await chrome.tabs.sendMessage(ticketTab.id, { type: 'TICKET_APP_BRIDGE', payload });
  } catch {
    reply = null;
  }
  if (reply?.ok) return reply;
  return { ok: false, error: 'Ticket app bridge did not reply.' };
}

// ---------------------------------------------------------------------------
//  Message routing
// ---------------------------------------------------------------------------

/** Messages from content scripts (CCP / SF) */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // wrap async so the handler can return true for async sendResponse
  (async () => {
    try {
      const t = msg?.type;
      if (t === 'CCP_SCRAPED') {
        state.ccp = {
          capturedAt: nowISO(),
          url: sender.tab?.url,
          title: sender.tab?.title,
          tabId: sender.tab?.id,
          data: msg.data ?? {},
        };
        await saveState();
        if (state.settings.autoPush) void pushToTicketApp(false);
        sendResponse({ ok: true, stored: state.ccp });
        return;
      }
      if (t === 'SF_SCRAPED') {
        state.sf = {
          capturedAt: nowISO(),
          url: sender.tab?.url,
          title: sender.tab?.title,
          tabId: sender.tab?.id,
          data: msg.data ?? {},
        };
        await saveState();
        if (state.settings.autoPush) void pushToTicketApp(false);
        sendResponse({ ok: true, stored: state.sf });
        return;
      }
      if (t === 'PING') { sendResponse({ ok: true, version: chrome.runtime.getManifest?.().version ?? '0.1.0' }); return; }
      sendResponse({ ok: false, error: `Unknown message type: ${t}` });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true; // keep message channel open for async reply
});

/** Messages from the popup */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const t = msg?.type;
  if (t === 'POPUP_GET_STATE') {
    (async () => {
      sendResponse({
        ok: true,
        state,
        merged: buildMergedFields(),
        extensionId: chrome.runtime.id,
      });
    })();
    return true;
  }
  if (t === 'POPUP_SCRAPE_CCP') { (async () => sendResponse(await scrapeCcpTab()))(); return true; }
  if (t === 'POPUP_SCRAPE_SF')  { (async () => sendResponse(await scrapeSalesforceTab()))(); return true; }
  if (t === 'POPUP_SCRAPE_ALL') { (async () => sendResponse(await scrapeAll()))(); return true; }
  if (t === 'POPUP_PUSH')       { (async () => sendResponse(await pushToTicketApp(true)))(); return true; }
  if (t === 'POPUP_UPDATE_SETTINGS') {
    (async () => {
      state.settings = { ...state.settings, ...(msg.settings ?? {}) };
      await saveState();
      sendResponse({ ok: true, state });
    })();
    return true;
  }
  return false;
});

/** Messages from the Ticket Notes web-app itself via externally_connectable.
 *  Because the web-app's origin is listed in manifest.externally_connectable,
 *  calling `chrome.runtime.sendMessage(EXT_ID, {...})` from the page lands
 *  here — no bridge script required on the listed hosts. */
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  (async () => {
    const t = msg?.type;
    try {
      if (t === 'EXT_HELLO') {
        // The web app says hello on boot; confirm extension is present and
        // hand back the current snapshot of merged fields so existing tabs
        // catch up immediately.
        sendResponse({ ok: true, version: chrome.runtime.getManifest?.().version ?? '0.1.0', merged: buildMergedFields(), state });
        return;
      }
      if (t === 'EXT_SCRAPE_ALL') { sendResponse(await scrapeAll()); return; }
      if (t === 'EXT_SCRAPE_CCP') { sendResponse(await scrapeCcpTab()); return; }
      if (t === 'EXT_SCRAPE_SF')  { sendResponse(await scrapeSalesforceTab()); return; }
      if (t === 'EXT_GET_STATE') {
        sendResponse({ ok: true, merged: buildMergedFields(), state });
        return;
      }
      if (t === 'EXT_PUSH_CONFIRM') {
        // The web app confirms it received a prior push — nothing to do,
        // but keeping the hook lets us surface a "received" badge later.
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ ok: false, error: `Unknown external type: ${t}` });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true;
});

// On extension install: drop a tiny hint about the extension id so the web
// app (which has to know the id to call chrome.runtime.sendMessage) can
// find it via bridge.js on the localhost / Vercel tab — or the user can
// copy/paste it from the popup.
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    await chrome.storage.local.set({ [EXT_ID_STORAGE_KEY]: chrome.runtime.id });
  } catch { /* ignore */ }
  // Open the install-guide tab on first install
  if (details.reason === 'install') {
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL('docs/install.html') });
    } catch { /* ignore */ }
  }
});
