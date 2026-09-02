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
const CCP_INJECT_FILES = ['content/ccp.js'];

const SF_PATTERNS = [
  /^https:\/\/.*\.lightning\.force\.com\//i,
  /^https:\/\/.*\.my\.salesforce\.com\//i,
  /^https:\/\/.*(\.force)?\.salesforce\.com\//i,
  /^https:\/\/.*\.visual\.force\.com\//i,
  /^https:\/\/.*\.force\.com\//i,
];
const SF_INJECT_FILES = ['content/salesforce.js'];

// For "Force-scan the tab I'm viewing" and as fallback when the manifest
// content script has no registered listener (tab already existed before the
// extension was (re)loaded, or a branded subdomain that's not listed in
// host_permissions hits activeTab from the popup's action), we need a map
// of message type → which JS file to inject via chrome.scripting.
const INJECT_MAP = {
  SCRAPE_CCP: CCP_INJECT_FILES,
  SCRAPE_SF:  SF_INJECT_FILES,
};

async function sendToTab(tabId, payload) {
  // First try the manifest content script listener that Chrome should have
  // injected on every matching frame.
  let firstError = null;
  try {
    const r = await chrome.tabs.sendMessage(tabId, payload);
    if (r && (r.ok || r.scraped || r.diagnostic !== undefined)) return r;
    firstError = r?.error || 'Content script replied without OK.';
  } catch (err) {
    firstError = String(err?.message || err);
  }

  // Typical MV3 failure modes that land here:
  //   • Receiving end does not exist → tab predates extension load, or
  //     content script never matched (the user has a custom Salesforce
  //     domain like ecovacs--amr.force.com but the page is inside an
  //     Experience Cloud that uses a branded URL).
  //   • Could not establish connection → content script was evicted.
  // Fallback: inject the matching content script immediately via the
  // scripting API (permission already requested in manifest), then retry
  // the message once. For the branded-domain case, the host permission
  // might not match so we swallow scripting errors and report diagnostics.
  const files = INJECT_MAP[payload.type];
  if (!files) {
    return { ok: false, error: firstError || 'sendToTab failed', diagnostic: { injectSkipped: true } };
  }

  let injectResult = null;
  try {
    // allFrames=true because embedded Connect lives in a utility bar iframe
    // inside the Salesforce tab — we want both the SF content script (top
    // frame) and the CCP content script (deep iframe) to land.
    injectResult = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files,
    });
  } catch (injErr) {
    const msg = String(injErr?.message || injErr);
    // Permission blocked → tell the popup so it can advise the user to
    // grant <all_urls> optional permission or open a known subdomain.
    if (msg.includes('Cannot access') || msg.includes('permission') || msg.includes('host_permissions')) {
      return {
        ok: false,
        error: `${firstError || 'sendToTab failed'} — and host permission denied for scripting injection: ${msg}`,
        diagnostic: { firstError, injectFailed: true, injectError: msg },
      };
    }
    return {
      ok: false,
      error: `${firstError || 'sendToTab failed'} — inject fallback also failed: ${msg}`,
      diagnostic: { firstError, injectFailed: true, injectError: msg },
    };
  }

  try {
    const retry = await chrome.tabs.sendMessage(tabId, payload);
    const frameCount = Array.isArray(injectResult)
      ? injectResult.filter((x) => x.frameId != null).length
      : 0;
    if (retry && !retry.ok && retry.diagnostic == null) {
      retry.diagnostic = { injectedAfterFail: true, injectFrames: frameCount, firstError };
    }
    if (retry && retry.ok && retry.diagnostic == null) {
      retry.diagnostic = { injectFallbackUsed: !!firstError, injectFrames: frameCount, firstError };
    }
    return retry || { ok: false, error: 'Injected, but no reply yet.', diagnostic: { injectFrames: frameCount, firstError } };
  } catch (err2) {
    const frameCount = Array.isArray(injectResult) ? injectResult.length : 0;
    return {
      ok: false,
      error: `After scripting.executeScript still no listener: ${String(err2?.message || err2)}`,
      diagnostic: { firstError, injected: true, injectFrames: frameCount },
    };
  }
}

async function scrapeCcpTab(tabHint) {
  // Optional tabHint = a known tab to probe first (e.g. the Salesforce tab
  // that wraps the Connect utility bar at the bottom). Allows scraping the
  // embedded CCP even when no standalone *.my.connect.aws tab is open.
  const tabList = tabHint ? [tabHint] : [];
  if (!tabHint) {
    const t = await findTab(CCP_PATTERNS);
    if (t) tabList.push(t);
  }
  // Probe each tab (usually 1 except in the embedded-SF pass, where the SF
  // tab might have a connect iframe inside: content script matches via
  // all_frames: true → we'll either get a SCRAPE_CCP reply from the
  // iframe, or the content script is simply not present there).
  let lastError = 'No CCP tab found. Open Amazon Connect / Five9 / Genesys / Zendesk CCP (standalone or in Salesforce utility bar).';
  for (const tab of tabList) {
    const reply = await sendToTab(tab.id, { type: 'SCRAPE_CCP' });
    if (reply?.ok) {
      const entry = {
        capturedAt: nowISO(),
        url: tab.url,
        title: tab.title,
        tabId: tab.id,
        data: reply.data || {},
        embedded: !!tabHint,
      };
      state.ccp = entry;
      await saveState();
      return { ok: true, payload: entry };
    }
    if (reply?.error) lastError = reply.error;
  }
  return { ok: false, error: lastError };
}

async function scrapeSalesforceTab() {
  const tab = await findTab(SF_PATTERNS);
  if (!tab) return { ok: false, error: 'No Salesforce tab found. Open lightning.force.com / my.salesforce.com / Case page in any tab.' };
  const reply = await sendToTab(tab.id, { type: 'SCRAPE_SF' });
  if (reply?.ok) {
    state.sf = { capturedAt: nowISO(), url: tab.url, title: tab.title, tabId: tab.id, data: reply.data };
    await saveState();
    // Embedded CCP probe: the same Salesforce tab often hosts the Amazon
    // Connect CCP in a utility-bar iframe. Because the SF content script
    // already captured the subject line ("Connected Phone Call from:
    // Caller +1xxxx"), we usually have enough. But when the contact
    // attributes / Streams API are available inside the iframe they carry
    // serial + model, so we do *one* extra SCRAPE_CCP into this tab's
    // frame tree (all_frames:true + CCP content script matches Connect
    // origins and will answer).
    const embedded = await scrapeCcpTab(tab);
    // Set a marker on the sf snapshot so the popup and web app know the
    // CCP on this snapshot came from the *same tab tree* (display badge
    // "CCP: embedded in SF tab" instead of "not captured").
    if (embedded?.ok) {
      state.sf.ccpEmbedded = true;
      await saveState();
    }
    return { ok: true, payload: state.sf };
  }
  return { ok: false, error: reply?.error || 'Salesforce content script did not reply.' };
}

/** POPUP_SCRAPE_ACTIVE fallback — ALWAYS tries to inject BOTH scripts
 *  into the currently active tab, regardless of URL match, then runs both
 *  scrapers. Fixes two cases:
 *    1. SF/Connect are on branded Ecovacs subdomains the patterns don't
 *       know (e.g. ecovacs--amr.my.site.com).
 *    2. Tab was already open when we installed / reloaded the extension
 *       so the manifest content scripts never landed.
 *  Because chrome.scripting via activeTab works on ANY tab when triggered
 *  from the popup browser action, both inject scripts will attach even on
 *  an unlisted host (so long as the user clicks the popup button — which
 *  grants the one-shot activeTab permission automatically). */
async function scrapeActiveTab() {
  const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!current?.id) return { ok: false, error: 'No active tab found.' };
  // Pre-inject both content scripts into every frame of the tab:
  //   - top frame → salesforce.js
  //   - any iframe inside (Connect utility bar, etc) → ccp.js
  const preInjections = [];
  try {
    preInjections.push(...(await chrome.scripting.executeScript({
      target: { tabId: current.id, allFrames: true },
      files: ['content/salesforce.js'],
    }) || []));
  } catch (sfErr) { preInjections.push({ frameId: -1, result: { sfInjectError: String(sfErr?.message || sfErr) } }); }
  try {
    preInjections.push(...(await chrome.scripting.executeScript({
      target: { tabId: current.id, allFrames: true },
      files: ['content/ccp.js'],
    }) || []));
  } catch (ccpErr) { preInjections.push({ frameId: -1, result: { ccpInjectError: String(ccpErr?.message || ccpErr) } }); }

  // Wait one tiny tick so the on-the-fly injected listeners are registered
  // before we broadcast the scrape messages.
  await new Promise((r) => setTimeout(r, 80));

  const [sfReply, ccpReply] = await Promise.all([
    sendToTab(current.id, { type: 'SCRAPE_SF' }),
    sendToTab(current.id, { type: 'SCRAPE_CCP' }),
  ]);

  let updated = false;
  const sfDiag = sfReply?.diagnostic || {};
  sfDiag.preInjectFrames = preInjections.filter((p) => p.frameId !== -1).length;
  sfDiag.activeTabFallback = true;
  if (sfReply?.diagnostic == null) sfReply.diagnostic = sfDiag;

  if (sfReply?.ok && Object.keys(sfReply.data || {}).length > 0) {
    state.sf = { capturedAt: nowISO(), url: current.url, title: current.title, tabId: current.id, data: sfReply.data, diagnostic: sfReply.diagnostic };
    updated = true;
  }
  const ccpDiag = ccpReply?.diagnostic || { activeTabFallback: true };
  if (ccpReply?.ok && Object.keys(ccpReply.data || {}).length > 0) {
    // Same single tab as SF? mark it as embedded.
    state.ccp = {
      capturedAt: nowISO(), url: current.url, title: current.title, tabId: current.id,
      data: ccpReply.data,
      embedded: !!sfReply?.ok || sfReply?.tabId === current.id,
      diagnostic: ccpDiag,
    };
    if (state.sf) { state.sf.ccpEmbedded = !!state.ccp?.capturedAt; }
    updated = true;
  }
  if (updated) {
    await saveState();
    if (state.settings.autoPush) void pushToTicketApp(false);
    return { ok: true, sf: state.sf, ccp: state.ccp };
  }
  // Build a mega-diagnostic for the popup to surface what failed.
  const firstErrors = {
    sf: sfReply?.diagnostic?.firstError || sfReply?.error,
    ccp: ccpReply?.diagnostic?.firstError || ccpReply?.error,
  };
  const injectErrors = preInjections.filter((p) => p.result && (p.result.sfInjectError || p.result.ccpInjectError));
  const sfMatched = sfReply?.data ? Object.keys(sfReply.data).length : 0;
  const ccpMatched = ccpReply?.data ? Object.keys(ccpReply.data).length : 0;
  return {
    ok: false,
    error: 'Force-scan was run, but the current page matched zero known Salesforce or Connect fields.',
    diagnostic: {
      activeTabUrl: current.url,
      activeTabTitle: current.title,
      framesPoked: preInjections.filter((p) => p.frameId !== -1).length,
      injectErrors: injectErrors.map((p) => p.result),
      firstErrors,
      sfMatched,
      ccpMatched,
    },
  };
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
      // Attach a cheap diagnostic snapshot: what matching tabs are currently
      // open in this browser window? Lets the popup tell the user instantly
      // "SF tab was detected at X URL" vs "no tabs match — open Salesforce".
      let open = [];
      try {
        open = (await chrome.tabs.query({ currentWindow: true })).map((t) => ({
          id: t.id, active: !!t.active, title: (t.title || '').slice(0, 120), url: (t.url || '').slice(0, 160),
        }));
      } catch { /* ignore */ }
      const matches = {
        ccp: open.filter((t) => CCP_PATTERNS.some((p) => p.test(t.url || ''))),
        sf:  open.filter((t) => SF_PATTERNS.some((p)  => p.test(t.url || ''))),
      };
      sendResponse({
        ok: true,
        state,
        merged: buildMergedFields(),
        extensionId: chrome.runtime.id,
        runtimeVersion: chrome.runtime.getManifest?.().version || null,
        diag: {
          openCount: open.length,
          activeTab: open.find((t) => t.active) || null,
          matchesCcp: matches.ccp,
          matchesSf: matches.sf,
          manifestCcpPatterns: CCP_PATTERNS.map((r) => String(r)),
          manifestSfPatterns: SF_PATTERNS.map((r) => String(r)),
        },
      });
    })();
    return true;
  }
  if (t === 'POPUP_SCRAPE_CCP') { (async () => sendResponse(await scrapeCcpTab()))(); return true; }
  if (t === 'POPUP_SCRAPE_SF')  { (async () => sendResponse(await scrapeSalesforceTab()))(); return true; }
  if (t === 'POPUP_SCRAPE_ALL') { (async () => sendResponse(await scrapeAll()))(); return true; }
  if (t === 'POPUP_SCRAPE_ACTIVE') { (async () => sendResponse(await scrapeActiveTab()))(); return true; }
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
