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
// Mirror copy that popup.js knows how to read directly from storage.local
// without needing the SW to be awake. Updated on every saveState().
const STATE_KEY_POPUP = '__ecovacs_scraper_state_v1';
const EXT_ID_STORAGE_KEY = 'nm-extension-id-v1';

// ---------------------------------------------------------------------------
//  Worker lifecycle: force immediate upgrade so the user never sits on an
//  old cached build after clicking reload on the extensions page.
// ---------------------------------------------------------------------------
try {
  // `self` is the ServiceWorkerGlobalScope in MV3 service workers. Wrap in
  // try/catch so the same file won't throw when accidentally imported in a
  // non-SW context (e.g. a unit test or Node port).
  self.addEventListener?.('install', () => { try { self.skipWaiting(); } catch { /* noop */ } });
  self.addEventListener?.('activate', (event) => {
    try {
      event.waitUntil?.(
        Promise.resolve()
          .then(() => self.clients.claim?.())
          .catch(() => null)
      );
    } catch { /* noop */ }
  });
} catch { /* noop */ }
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
  /** Fingerprint of the 4 key fields last actually accepted by the web app.
   *  Lets auto-push skip when the caller/device tuple hasn't changed. */
  lastPushedKeyFields: {},
});

let state = loadState();

function loadState() {
  // Service workers don't expose localStorage — we used to fall back via
  // globalThis.localStorage.getItem which would throw on every read.
  // Primary storage is chrome.storage.local. Additionally load the popup
  // mirror key so a refreshed SW starts with whatever the popup's
  // chrome.storage.local fallback wrote.
  try {
    return { ...defaultState() };
  } catch { return defaultState(); }
}

async function saveState() {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: state,
      [STATE_KEY_POPUP]: state,
    });
  } catch {
    // storage.local unavailable inside SW unit tests or early init — state
    // lives in memory for the lifetime of this worker wakeup instead.
  }
}

// Kick off async load of the real state as soon as the SW starts.
// Popup will read the same storage.local key if we haven't warmed yet.
(async function loadInitialState() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY, STATE_KEY_POPUP]);
    const pick = result?.[STORAGE_KEY] || result?.[STATE_KEY_POPUP];
    if (pick && typeof pick === 'object') state = { ...defaultState(), ...pick };
    await saveState();
  } catch { /* ignore */ }
})();

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function nowISO() {
  return new Date().toISOString();
}

/** Best-effort find ONE tab whose URL matches one of the patterns.
 *
 *  Previously this took the first tab in `chrome.tabs.query({})` order —
 *  Chrome's default order is roughly creation order, so the oldest tab that
 *  matches a pattern always "won".  Result: when the user opened a new
 *  Case tab and clicked Scan, the extension kept scraping their first
 *  (stale) test page.
 *
 *  Fixed ordering (highest priority first):
 *    1. Tab is currently active in the focused / current window.
 *    2. Tab has the most-recent lastAccessed (Chrome populates this reliably
 *       enough to distinguish "the tab I was just on" from a tab opened
 *       three days ago). lastAccessed can be missing on older platforms;
 *       missing entries sort last within their tier.
 *    3. Within a window, smaller `index` (leftmost) wins.
 *  This ensures "scrape" almost always targets the case the agent is
 *  actually looking at. */
async function findTab(patterns) {
  const all = await chrome.tabs.query({});
  const cw = (await chrome.windows.getCurrent({ populate: false }).catch(() => null));
  const currentWindowId = cw?.id ?? null;
  const scored = [];
  for (const t of all) {
    if (!t.url) continue;
    if (!patterns.some((p) => p.test(t.url))) continue;
    const activeNow = !!t.active && t.windowId === currentWindowId;
    const la = (typeof t.lastAccessed === 'number') ? t.lastAccessed : -Infinity;
    // Score tuple — bigger = worse.  Active tab → 0 / any 0 → -1, 0.
    const keyActive = activeNow ? 0 : 1;
    scored.push({
      t,
      sort: [
        keyActive,
        // lastAccessed desc: newer → smaller negative.
        -la,
        // index asc
        typeof t.index === 'number' ? t.index : Number.MAX_SAFE_INTEGER,
        // windowId asc (stable tie-break)
        typeof t.windowId === 'number' ? t.windowId : Number.MAX_SAFE_INTEGER,
      ],
    });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => {
    for (let i = 0; i < a.sort.length; i += 1) {
      if (a.sort[i] < b.sort[i]) return -1;
      if (a.sort[i] > b.sort[i]) return 1;
    }
    return 0;
  });
  return scored[0].t;
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

// ---------------------------------------------------------------------------
// Tier-3 inline extractors: these run via chrome.scripting.executeScript
// ({func: ...}) in the target page's MAIN world. They are the last-resort
// catch-all that NEVER needs a chrome.runtime.onMessage reply — MV3 returns
// the function's return value as results directly.
//
// NOTE: Functions placed here are SERIALIZED and run inside the remote
// browser tab. No outer-scope references work. Keep them self-contained.
// ---------------------------------------------------------------------------

/** Inline Salesforce extractor. Mirrors the 4-tier strategy in
 *  content/salesforce.js but trimmed to the 22+ most valuable fields for
 *  the Ecovacs Case Console. Run via executeScript func(). */
// eslint-disable-next-line func-names
const INLINE_SF_EXTRACT = function () {
  const FIELD_ALIASES = {
    caseNumber: /^(Case\s*Number|Case\s*#?)$/i,
    caseOwner: /^Case\s*Owner$/i,
    status: /^Status$/i,
    subject: /^Subject$/i,
    accountName: /^(Account\s*Name|Account)$/i,
    contactName: /^Contact\s*Name$/i,
    customerName: /^(Name|Customer\s*Name)$/i,
    phone: /^(Phone|Contact\s*Number|Contact\s*Phone)$/i,
    email: /^(Email|Email\s*Address)$/i,
    address: /^Address$/i,
    city: /^City$/i,
    provinceState: /^(Province|State)$/i,
    postalCode: /^(Postal\s*Code|Zip)$/i,
    country: /^Country$/i,
    deebotModel: /^(AMR\s*Model\s*No\.?|Deebot\s*Model|Model)$/i,
    serialNumber: /^Serial\s*Number$/i,
    skuNumber: /^SKU(\s*Number)?$/i,
    issueType: /^Issue\s*Type$/i,
    detailedIssue: /^(Detailed\s*Issue\s*Description|Request\s*Description|Description)$/i,
    resolutionSummary: /^Resolution\s*Summary$/i,
    additionalNotes: /^Additional\s*Notes$/i,
    caseOrigin: /^Case\s*Origin$/i,
    brand: /^Brand$/i,
    phoneSurveyResult: /^Phone\s*Survey\s*Result$/i,
    escalationType: /^Escalation\s*Type$/i,
    purchasingChannel: /^Purchasing\s*Channel$/i,
    orderNumber: /^Order\s*Number$/i,
    purchaseDate: /^Purchase\s*Date$/i,
    caseTag: /^Case\s*Tag$/i,
    firstPendingTs: /^First\s*Pending\s*Timestamp$/i,
    lastPendingTs: /^Last\s*Pending\s*Timestamp$/i,
    mergedCaseIds: /^Merged\s*Cases?$/i,
    aiAgentNote: /^AI\s*Agent$/i,
    appVersion: /^appVersion$/i,
    phoneModel: /^model$/i,
    osVersion: /^systemVersion$/i,
    deviceTypeName: /^deviceTypeName$/i,
    marketName: /^marketName$/i,
    appDeviceBlock: /^App\s*Device\s*Info$/i,
  };
  function clean(v) {
    if (v == null) return '';
    return String(v).replace(/\u00a0/g, ' ').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  }
  function assignOnce(obj, k, v) {
    const cv = clean(v); if (!cv) return;
    if (!obj[k]) obj[k] = cv;
  }
  function splitLines(text) {
    return text.split(/\r?\n/).map((s) => s.replace(/\u00a0/g, ' ').trim()).filter((s) => s.length);
  }
  function isLabelLine(line) {
    for (const pat of Object.values(FIELD_ALIASES)) if (pat.test(line)) return true;
    return false;
  }
  function matchAlias(line) {
    for (const [k, pat] of Object.entries(FIELD_ALIASES)) if (pat.test(line)) return k;
    return null;
  }

  const acc = {};
  const text = (typeof document !== 'undefined' && document.body && (document.body.innerText || document.body.textContent || '')) || '';

  // (1) Full-text regex sweep
  // Case 7-8 digit | Case in breadcrumb
  const cnMatch = text.match(/(?:^|\n)\s*(\d{7,8})\s*\|\s*Case\b/);
  if (cnMatch) assignOnce(acc, 'caseNumber', cnMatch[1]);
  const sfids = [...(text.matchAll(/\b500[a-zA-Z0-9]{12,15}\b/g) || [])].map((x) => x[0]);
  if (sfids[0]) assignOnce(acc, 'salesforceId', sfids[0]);
  // Caller in Subject
  const caller = text.match(/Caller\s*(\+?[\d\- \.\(\)]{6,})/);
  if (caller) assignOnce(acc, 'contactNumber', caller[1]);
  const subjectLine = text.match(/^Subject\s*\n\s*([^\n]+)/m);
  if (subjectLine) assignOnce(acc, 'issueTitle', subjectLine[1]);
  // App Device Info block
  const adiMatch = text.match(/App\s*Device\s*Info\s*\n([\s\S]*?)(?:\n\s*Case\s*Number\b|\n\s*\d{7,8}\s*\|\s*Case\b|$)/i);
  if (adiMatch) {
    for (const line of splitLines(adiMatch[1])) {
      const idx = line.indexOf(':'); if (idx === -1) continue;
      const k = line.slice(0, idx).trim(); const v = line.slice(idx + 1).trim();
      if (k === 'appVersion') assignOnce(acc, 'appVersion', v);
      else if (k === 'model') assignOnce(acc, 'phoneModel', v);
      else if (k === 'systemVersion') assignOnce(acc, 'osVersion', v);
      else if (k === 'deviceTypeName') assignOnce(acc, 'deviceTypeName', v);
      else if (k === 'marketName') assignOnce(acc, 'marketName', v);
      else if (k === 'deviceType') assignOnce(acc, 'deviceType', v);
    }
  }
  // Classification groups: Issue Type{N} (Primary|Second) Classification
  const classes = [];
  const classRe = /Issue\s*Type(\d+)\s*(Primary|Second)\s*Classification\s*\n\s*([^\n]+)/gi;
  let cm;
  while ((cm = classRe.exec(text)) !== null) {
    classes.push({ n: cm[1], kind: cm[2].toLowerCase() === 'primary' ? 'L1' : 'L2', value: clean(cm[3]) });
  }
  if (classes.length) {
    const parts = classes.filter((c) => c.value).sort((a, b) => a.n.localeCompare(b.n) || (a.kind === 'L1' ? -1 : 1)).map((c) => c.value);
    if (parts.length) assignOnce(acc, 'issueType', parts.join(' · '));
    for (const c of classes) {
      if (c.n === '1') assignOnce(acc, c.kind === 'L1' ? 'issueType1L1' : 'issueType1L2', c.value);
      else if (c.n === '2') assignOnce(acc, c.kind === 'L1' ? 'issueType2L1' : 'issueType2L2', c.value);
      else if (c.n === '3') assignOnce(acc, c.kind === 'L1' ? 'issueType3L1' : 'issueType3L2', c.value);
    }
  }
  // Loose Email
  if (!acc.email) {
    const m = text.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/);
    if (m) assignOnce(acc, 'email', m[0]);
  }
  // Timestamp pairs
  const tsm = text.match(/First\s*Pending\s*Timestamp\s*\n\s*([^\n]+)/);
  if (tsm) assignOnce(acc, 'firstPendingTs', tsm[1]);
  const tsm2 = text.match(/Last\s*Pending\s*Timestamp\s*\n\s*([^\n]+)/);
  if (tsm2) assignOnce(acc, 'lastPendingTs', tsm2[1]);
  // AI Agent note block up to the next bold-ish heading
  const ai = text.match(/AI\s*Agent\s*\n([\s\S]*?)(?:\n\s*Summary\b|\n\s*Related\s*Files\b|$)/i);
  if (ai && clean(ai[1])) assignOnce(acc, 'aiAgentNote', clean(ai[1]));

  // (2) SPECIFIC: classic Salesforce `slds-form-element` rows — both the
  // horizontal label / value pair layout (slds-form-element) and the
  // stacked 2-line variant (slds-form-element__label on top, __static
  // / control / value on the bottom / right).  The Ecovacs Case Console
  // detail sidebar uses exactly this structure for Account Name,
  // Contact Name, Phone, Email, Case Number, Case Origin, etc. so if we
  // miss this tier we get 0 fields even on a perfectly normal Case page.
  if (typeof document !== 'undefined' && document.querySelectorAll) {
    // 2A: slds-form-element (label + control horizontal row pairs)
    const rows = document.querySelectorAll('.slds-form-element, .slds-form-element__row, [data-target-selection-name], lightning-output-field, [class*="form-element"], [class*="form-row"]');
    for (const row of rows) {
      const labels = row.querySelectorAll('.slds-form-element__label, label, [class*="-label"], th, [class*="Label"]');
      let labelText = '';
      for (const lab of labels) {
        const t = clean((lab.textContent || lab.innerText || '').replace(/[:*]+$/, ''));
        if (t && t.length < 60) { labelText = t; break; }
      }
      if (!labelText) continue;
      const key = matchAlias(labelText);
      if (!key) continue;
      const valueCandidates = row.querySelectorAll(
        '.slds-form-element__static, .slds-form-element__control, .slds-form-element__control input, .slds-form-element__control textarea, [class*="-value"], [class*="-static"], [class*="-output"], lightning-formatted-text, lightning-formatted-email, lightning-formatted-phone, lightning-formatted-url, a, span:not(.slds-form-element__label):not([class*="label"]), td, div'
      );
      let valueText = '';
      for (const cand of valueCandidates) {
        // don't re-use the label we already picked
        let foundLabel = false;
        for (const lab of labels) { if (cand === lab || cand.contains(lab)) { foundLabel = true; break; } }
        if (foundLabel) continue;
        const t = clean(cand.textContent || cand.innerText || cand.value || '');
        if (!t) continue;
        if (t === labelText) continue;
        if (t.length > 500) continue;
        // Prefer the first non-empty non-label candidate in DOM order;
        // that's Salesforce's convention within a single form element.
        valueText = t;
        break;
      }
      if (valueText && !isLabelLine(valueText)) assignOnce(acc, key, valueText);
    }

    // 2B: Stacked-label cell sweep across visible grid cells (kept as
    // fallback for custom blocks the slds-form-element tier missed)
    const cells = document.querySelectorAll('div[class*="slds"], div[class*="cell"], li[class*="slds"], section, article');
    for (const cell of cells) {
      const lines = splitLines(cell.innerText || cell.textContent || '');
      if (lines.length < 2) continue;
      if (lines.length > 30) continue; // likely a whole-feed block, skip noise
      for (let i = 0; i < lines.length - 1; i += 1) {
        const labelMatch = matchAlias(lines[i]);
        if (!labelMatch) continue;
        const next = lines[i + 1];
        if (isLabelLine(next) && matchAlias(next)) continue;
        assignOnce(acc, labelMatch, next);
        i += 1;
      }
    }
    // (3) Section-scoped pass: "Account Details", "Contact Details",
    // "App Device Info" headers.
    const sectionTitles = ['Account Details', 'Contact Details', 'App Device Info', 'Details', 'Case Details'];
    const xpath = document.evaluate;
    if (xpath) {
      for (const title of sectionTitles) {
        const nodes = document.querySelectorAll('h1, h2, h3, h4, h5, h6, span, div, p, b, strong, th, label');
        for (const heading of nodes) {
          const t = clean(heading.textContent || heading.innerText || '');
          if (!t || t.toLowerCase() !== title.toLowerCase()) continue;
          let container = heading.parentElement;
          for (let depth = 0; depth < 5 && container; depth += 1) {
            if ((container.innerText || '').split(/\n/).length > 6) break;
            container = container.parentElement;
          }
          if (!container) continue;
          const sectionLines = splitLines(container.innerText || '');
          for (let i = 0; i < sectionLines.length - 1; i += 1) {
            const key = matchAlias(sectionLines[i]);
            if (!key) continue;
            const val = sectionLines[i + 1];
            if (isLabelLine(val) && matchAlias(val)) continue;
            assignOnce(acc, key, val);
          }
        }
      }
    }
    // (4) Breadcrumb / Page header / Title fallback: `<title>` or the
    // browser tab title already has "04032251 | Case | Salesforce" so
    // pull caseNumber from it in case the body regex sweep failed to.
    if (!acc.caseNumber) {
      const docTitle = (typeof document !== 'undefined' && document.title) || '';
      const m = docTitle.match(/(?:^|\s|\/|\|)\s*(\d{7,8})\s*(\||\s|\/)/);
      if (m) assignOnce(acc, 'caseNumber', m[1]);
    }
  }

  // Name synthesis
  if (!acc.customerName && (acc.contactName)) acc.customerName = acc.contactName;
  if (!acc.customerName && acc.accountName) acc.customerName = acc.accountName;
  if (!acc.contactNumber && acc.phone) acc.contactNumber = acc.phone;
  if (!acc.emailAddress && acc.email) acc.emailAddress = acc.email;
  if (!acc.deebotModel && acc.model) acc.deebotModel = acc.model;
  // shippingAddress composite
  const addressParts = [acc.address, acc.city, acc.provinceState, acc.postalCode, acc.country].map(clean).filter(Boolean);
  if (addressParts.length) {
    const joined = addressParts.filter((v, i, a) => i === 0 || !a.slice(0, i).includes(v)).join(', ');
    assignOnce(acc, 'shippingAddress', joined);
  }
  // Drop empty strings, ensure clean strings
  for (const k of Object.keys(acc)) {
    if (typeof acc[k] === 'string' && !acc[k]) delete acc[k];
    else if (typeof acc[k] === 'string') acc[k] = clean(acc[k]);
  }
  return acc;
};

/** Inline CCP extractor — lightweight version just in case the content
 *  script is fenced inside Connect's Locker service worker. Uses the fact
 *  that most Connect CCaaS surfaces expose window.connect.API / the same
 *  contact attribute fields the full content script reads. */
// eslint-disable-next-line func-names
const INLINE_CCP_EXTRACT = function () {
  const acc = {};
  function clean(v) { if (v == null) return ''; return String(v).replace(/\u00a0/g, ' ').trim(); }
  function assignOnce(k, v) { const cv = clean(v); if (!cv) return; if (!acc[k]) acc[k] = cv; }
  try {
    const text = (typeof document !== 'undefined' && document.body && (document.body.innerText || document.body.textContent || '')) || '';
    const caller = text.match(/Caller\s*(\+?[\d\- \.\(\)]{6,})/i);
    if (caller) assignOnce('contactNumber', caller[1]);
    const name = text.match(/Contact\s*Name\s*\n?\s*:\s*([^\n]+)/i) || text.match(/Customer\s*Name\s*\n?\s*:\s*([^\n]+)/i);
    if (name) assignOnce('customerName', name[1]);
    const custId = text.match(/Customer\s*Id\s*\n?\s*:\s*([A-Za-z0-9\-]+)/i);
    if (custId) assignOnce('customerId', custId[1]);
    const queue = text.match(/Queue\s*\n?\s*:\s*([^\n]+)/i);
    if (queue) assignOnce('queue', queue[1]);
    // Common Amazon Connect contact attributes window exposure
    try {
      // eslint-disable-next-line no-undef
      const w = typeof window !== 'undefined' ? window : {};
      if (w.connect && w.connect.contact) {
        const c = w.connect.contact;
        if (c.getAttributes) {
          const attrs = c.getAttributes() || {};
          for (const [k, v] of Object.entries(attrs)) {
            const val = v && (v.value != null ? v.value : v);
            const lk = String(k).toLowerCase();
            if (lk.includes('phone') || lk === 'phonenumber' || lk.includes('number')) assignOnce('contactNumber', val);
            else if (lk === 'customername' || lk === 'name') assignOnce('customerName', val);
            else if (lk === 'caseid' || lk === 'ticket') assignOnce('caseNumber', val);
            else if (lk === 'email') assignOnce('emailAddress', val);
            else assignOnce(k, val);
          }
        }
      }
    } catch { /* noop */ }
  } catch { /* noop */ }
  return acc;
};

const INLINE_EXTRACT_MAP = {
  SCRAPE_SF: INLINE_SF_EXTRACT,
  SCRAPE_CCP: INLINE_CCP_EXTRACT,
};

async function sendToTab(tabId, payload) {
  // Field-count helper used for two "should we actually fall through?" checks:
  // a result with 0 non-empty fields is functionally "nothing found",
  // even when `r.ok === true`.  This is what was causing the current Case
  // tab to show "Not captured yet": the manifest SF content script replied
  // { ok:true, data:{} } so the Tier3 chrome.scripting inline-executeScript
  // (which usually salvages the parse) never ran — 0 fields → false success.
  function fieldCount(data) {
    const d = (data && typeof data === 'object') ? data : {};
    return Object.keys(d).filter((k) => d[k] !== '' && d[k] != null && !Array.isArray(d[k]) ? String(d[k]).trim() !== '' : (Array.isArray(d[k]) ? d[k].length > 0 : false)).length;
  }
  const files = INJECT_MAP[payload.type];
  const inlineFunc = INLINE_EXTRACT_MAP[payload.type];
  let bestSoFar = null;

  // Tier 1: manifest content script listener.  Keep going to Tier 3 if we
  // get a 0-field "success" back, because the inline-executeScript fallback
  // typically extracts more fields on real Salesforce pages.
  let firstError = null;
  try {
    const r = await chrome.tabs.sendMessage(tabId, payload);
    if (r && (r.ok || r.scraped || r.diagnostic !== undefined)) {
      if (fieldCount(r.data) > 0) return r;
      // 0 fields → remember as best (might have diagnostic), fall through.
      bestSoFar = r;
      firstError = firstError || `Content script matched 0 fields.`;
    } else {
      firstError = r?.error || 'Content script replied without OK.';
    }
  } catch (err) {
    firstError = String(err?.message || err);
  }

  // Tier 2: chrome.scripting.executeScript {files} — drop the content script
  // into every frame, then retry the message once.
  let injectFileFrames = 0;
  let injectFileError = null;
  if (Array.isArray(files) && files.length > 0) {
    try {
      const r = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files,
      });
      injectFileFrames = Array.isArray(r) ? r.filter((x) => x.frameId != null).length : 0;
    } catch (injErr) {
      injectFileError = String(injErr?.message || injErr);
    }
  }

  if (!injectFileError) {
    try {
      const retry = await chrome.tabs.sendMessage(tabId, payload);
      if (retry) {
        if (retry.diagnostic == null) {
          retry.diagnostic = {
            [retry.ok ? 'injectFallbackUsed' : 'injectedAfterFail']: !!firstError,
            injectFrames: injectFileFrames,
            firstError,
          };
        }
        if (fieldCount(retry.data) > 0) return retry;
        // 0 fields → again keep going; Tier 3 inline is the real workhorse.
        if (!bestSoFar || fieldCount(bestSoFar.data) < fieldCount(retry.data)) bestSoFar = retry;
      }
    } catch (err2) {
      // Fall through to tier 3 instead of aborting here.
      firstError = firstError || String(err2?.message || err2);
    }
  }

  // Tier 3: absolute last resort — chrome.scripting.executeScript {func}
  // runs the inline extractor directly and returns its return value as
  // result[].result synchronously, with NO listener / sendMessage round
  // trip. This ALWAYS works if chrome.scripting itself is allowed (which it
  // always is from popup action's activeTab grant on ANY URL including
  // branded Ecovacs domains not listed in manifest host_permissions).
  if (typeof inlineFunc === 'function') {
    let inlineDiag = { via: 'inline-executeScript', injectFileFrames, firstError, injectFileError };
    try {
      // world: MAIN lets us read window.connect contact attributes for CCP;
      // world: ISOLATED default keeps tier-2 message-listeners in the
      // isolated world that the popup onMessage listener expects. For the
      // inline func() use MAIN because it's safer in Salesforce Locker +
      // Connect fenced frames.
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: inlineFunc,
        world: chrome.scripting.ExecutionWorld ? chrome.scripting.ExecutionWorld.MAIN : 'MAIN',
      });
      const frames = Array.isArray(results) ? results : [];
      // Merge all non-empty frame results. For SF tab this picks the top
      // frame (with the biggest payload); for utility-bar embedded CCP
      // this picks whichever Connect iframe returned fields.
      const merged = {};
      let n = 0;
      const counts = [];
      for (const frame of frames) {
        const obj = (frame && typeof frame.result === 'object' && !Array.isArray(frame.result)) ? frame.result : null;
        if (!obj) continue;
        const size = Object.keys(obj).filter((k) => obj[k] !== '' && obj[k] != null).length;
        counts.push(size);
        n = Math.max(n, size);
        for (const [k, v] of Object.entries(obj)) {
          if (v === '' || v == null) continue;
          if (merged[k] == null) merged[k] = v;
          else if (Array.isArray(v)) merged[k] = `${merged[k]}\n${v.join(', ')}`;
          else if (String(merged[k]).length < String(v).length) merged[k] = v;
        }
      }
      inlineDiag.framesExtracted = frames.length;
      inlineDiag.framesWithContent = counts.filter((c) => c > 0).length;
      inlineDiag.bestFrameFieldCount = n;
      if (Object.keys(merged).length > 0) {
        return { ok: true, data: merged, diagnostic: inlineDiag, scraped: true };
      }
      // Tier3 also produced 0 fields — return the BEST of bestSoFar (from a
      // listener reply that had diagnostic info) plus what Tier 3 found.
      if (bestSoFar) {
        return bestSoFar;
      }
      return {
        ok: false,
        error: `No ${payload.type === 'SCRAPE_SF' ? 'Salesforce' : 'CCP'} fields matched on this page. ${injectFileError ? 'File-inject blocked: ' + injectFileError : ''}`,
        diagnostic: { ...inlineDiag, injectFailed: !!injectFileError, injectError: injectFileError },
      };
    } catch (inlineErr) {
      const msg = String(inlineErr?.message || inlineErr);
      return {
        ok: false,
        error: msg,
        diagnostic: { via: 'inline-executeScript', injectFileFrames, firstError, injectFileError, inlineFailed: true, inlineError: msg },
      };
    }
  }

  // No inline extractor defined for this message type — return what we have.
  if (injectFileError) {
    return {
      ok: false,
      error: `${firstError || 'sendToTab failed'} — inject failed: ${injectFileError}`,
      diagnostic: { firstError, injectFailed: true, injectError: injectFileError, injectFrames: injectFileFrames },
    };
  }
  return {
    ok: false,
    error: firstError || 'Injected, but no reply.',
    diagnostic: { injectFallbackUsed: true, injectFrames: injectFileFrames, firstError },
  };
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

/** Purge a stored snapshot whose source tab has disappeared.
 *
 *  The #1 user complaint was "I closed that Case tab ages ago, yet the
 *  popup still shows fields captured from it."  Root cause: state.sf /
 *  state.ccp live in storage.local forever.  Even when the user navigates
 *  to a different page and force-scans it, if the force-scan yields zero
 *  SF/CCP fields we *don't* overwrite the snapshot — so the old one
 *  stays.
 *
 *  This helper inspects `snapshot.tabId`.  If we can enumerate the
 *  browser's real tabs and that tabId is gone (or its URL has drifted
 *  away from the source pattern — i.e. the agent navigated the same tab
 *  to some non-Case page), return `true` so callers can null out the
 *  stale snapshot before painting.
 *
 *  Safe: returns `false` (keep) if we can't enumerate tabs, or if the
 *  tabId is missing (embedded/synthetic captures that never had a tab). */
async function snapshotStale(snapshot, patterns) {
  if (!snapshot) return false;
  const tabId = snapshot.tabId;
  const url = snapshot.url || null;
  // Embedded / popup-self-extract writes tabId=-1 or absent; can't prove stale.
  if (tabId == null || tabId < 0) return false;
  try {
    const real = await chrome.tabs.get(tabId).catch(() => null);
    // Tab doesn't exist at all → definitely stale.
    if (!real) return true;
    // Tab exists but the stored URL points to *something the user already
    // navigated away from* — also stale.
    if (real.url && url && real.url.split('?')[0] !== url.split('?')[0]) {
      // BUT: if new URL still matches one of our known SF/CCP patterns for
      // this snapshot's kind, trust it (agent just navigated to another
      // Case within the same tab; future scrape will update it).
      if (patterns && patterns.some((p) => p.test(real.url || ''))) return false;
      return true;
    }
  } catch { /* ignore — tabs API transient failure */ }
  return false;
}

/** Write `null` into a stale snapshot when we've proven the source tab is
 *  gone, or when a force-scan of the current tab explicitly didn't
 *  produce data for that side (so stale values from another tab can't
 *  hang around).  Always followed by saveState(). */
function purgeSnapshots({ sf = false, ccp = false }) {
  let did = false;
  if (sf && state.sf) { state.sf = null; did = true; }
  if (ccp && state.ccp) { state.ccp = null; did = true; }
  return did;
}

/** Smart "scan everything" flow — but NOW biased TOWARD CURRENT TAB, no
 *  matter what.
 *
 *  The user explicitly requested: "make the scan button force scrape
 *  current tab".  Previous runs did a Phase 2 fill-in from any still-open
 *  tab matching a URL pattern.  That caused the symptom "I closed the
 *  first test tab but it keeps showing me data from it" because the
 *  closed tab's snapshot lived in storage.local forever, and Phase 2
 *  findTab would still find some *other* stale tab and write that back.
 *
 *  New semantics for the green Scan button:
 *    1. Purge stale snapshots (tabId no longer exists or URL drifted).
 *    2. FORCE-SCAN the tab the user is looking at RIGHT NOW —
 *       chrome.scripting.executeScript with both scrapers injected,
 *       on ANY URL, no pattern gate.
 *    3. If force-scan produced SF fields → write state.sf, ELSE clear
 *       any stale state.sf so the old closed tab's data can't linger.
 *    4. Same for CCP.
 *
 *  So pressing Scan == "I want the page UNDER MY CURSOR to be the sole
 *  source of truth for this extension.  Any old data is wrong."
 *
 *  Per-card Refresh buttons keep the old flexible findTab fallback, and
 *  the popup's zombie-SW self-extract path still forces current-tab. */
async function scrapeAll() {
  // 0) Before anything else — evict snapshots from closed/drifted tabs.
  let purged = 0;
  if (await snapshotStale(state.sf, SF_PATTERNS))  { if (purgeSnapshots({ sf:  true })) purged += 1; }
  if (await snapshotStale(state.ccp, CCP_PATTERNS)) { if (purgeSnapshots({ ccp: true })) purged += 1; }

  // 1) Force-scan current tab only.  No pattern match.  No fallback.
  const activeRes = await scrapeActiveTab({ clearStaleOnEmpty: true });
  const sfFromActive  = !!(activeRes?.ok && activeRes?.sf?.capturedAt  && Object.keys(activeRes.sf?.data  || {}).length > 0);
  const ccpFromActive = !!(activeRes?.ok && activeRes?.ccp?.capturedAt && Object.keys(activeRes.ccp?.data || {}).length > 0);

  // 2) If force-scan didn't produce data for a side, that side is CLEARED
  //    so a closed-tab snapshot can't still be shown on the card.  This
  //    is the critical behavior change the user asked for — "force scrape
  //    current tab" means current tab's result (even if empty) wins over
  //    whatever was cached from a tab closed hours ago.
  let cleared = 0;
  if (!sfFromActive  && purgeSnapshots({ sf:  true })) cleared += 1;
  if (!ccpFromActive && purgeSnapshots({ ccp: true })) cleared += 1;
  if (purged || cleared) await saveState();

  return {
    ok: true,
    ccp: ccpFromActive ? { ok: true, payload: state.ccp, viaActive: true } : { ok: false, error: 'Current tab did not yield CCP fields. Stale cache was cleared.' },
    sf:  sfFromActive  ? { ok: true, payload: state.sf,  viaActive: true } : { ok: false, error: 'Current tab did not yield SF fields. Stale cache was cleared.' },
    activeTab: activeRes?.sf?.url || activeRes?.ccp?.url
      ? { scanned: true, sf: sfFromActive, ccp: ccpFromActive,
           url: activeRes?.sf?.url || activeRes?.ccp?.url || null,
           title: activeRes?.sf?.title || activeRes?.ccp?.title || null }
      : { scanned: false,
          error: activeRes?.error,
          sf: false, ccp: false,
          url: activeRes?.diagnostic?.activeTabUrl || null,
          title: activeRes?.diagnostic?.activeTabTitle || null },
    fillInSf: false, fillInCcp: false,   // Force-current mode: no fill-ins.
    purgedStale: purged, clearedOnEmpty: cleared,
  };
}

/** Refresh helpers for per-card "Refresh" buttons.
 *
 *  The old Refresh buttons did `scrapeCcpTab()`/`scrapeSalesforceTab()`
 *  which used findTab() → always picked the oldest matching tab.  Now,
 *  if the tab the user is currently looking at matches the requested
 *  card pattern, we inject+scan THAT specific tab with force-inject
 *  (chrome.scripting pre-poke), which is what the user meant by
 *  "Refresh the page I'm currently on." If not, fall back to the
 *  findTab-based flow which still prefers most-recently used tabs. */
async function refreshSalesforceTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.url && SF_PATTERNS.some((p) => p.test(active.url))) {
    const before = state.sf;
    const res = await scrapeActiveTab();
    const sfWrote = res?.ok && state.sf && Object.keys(state.sf.data || {}).length > 0;
    if (sfWrote) return { ok: true, payload: state.sf, viaActive: true };
    // Active tab matched by URL but inject didn't produce fields — fall back.
    if (before !== state.sf && state.sf) return { ok: true, payload: state.sf, viaActive: true };
  }
  return scrapeSalesforceTab();
}
async function refreshCcpTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.url && CCP_PATTERNS.some((p) => p.test(active.url))) {
    const res = await scrapeActiveTab();
    if (res?.ok && state.ccp && Object.keys(state.ccp.data || {}).length > 0) {
      return { ok: true, payload: state.ccp, viaActive: true };
    }
  }
  // For CCP, the active tab might be Salesforce which carries the embedded
  // Connect utility bar.  If so, run scrapeSalesforceTab() — it already
  // does a pass through scrapeCcpTab(tabHint=theSFtab) to fish for the
  // embedded iframe.  Popup's CCP card will render with the embedded marker.
  if (active?.url && SF_PATTERNS.some((p) => p.test(active.url))) {
    await scrapeSalesforceTab();
    if (state.ccp && Object.keys(state.ccp.data || {}).length > 0) {
      return { ok: true, payload: state.ccp, viaActive: true, embedded: !!state.sf?.ccpEmbedded };
    }
  }
  return scrapeCcpTab();
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

/** The 4 identity fields auto-pushed on every scrape (with dedupe). */
const KEY_PUSH_FIELDS = ['contactNumber', 'customerName', 'deebotModel', 'serialNumber'];
const KEY_PUSH_FALLBACKS = {
  contactNumber: ['phone'],
  customerName: ['accountName', 'contactName'],
  deebotModel: [],
  serialNumber: [],
};

/** Build the 4-field identity snapshot used for change detection + auto push.
 *  Falls back to aliases scrapers sometimes produce, always returns strings. */
function buildKeyFields(merged = buildMergedFields()) {
  const out = {};
  for (const k of KEY_PUSH_FIELDS) {
    let v = merged[k];
    if (!v || (typeof v === 'string' && v.trim() === '')) {
      for (const alias of KEY_PUSH_FALLBACKS[k] || []) {
        const av = merged[alias];
        if (av && (typeof av !== 'string' || av.trim() !== '')) { v = av; break; }
      }
    }
    if (!v) continue;
    const asStr = Array.isArray(v) ? v.filter(Boolean).join(', ') : String(v);
    if (asStr.trim() !== '') out[k] = asStr;
  }
  return out;
}

/** Stable JSON comparison: empty objects never equal "just scraped". */
function keyFieldsEqual(a, b) {
  const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])];
  if (keys.length === 0) return false;
  return keys.every((k) => String((a || {})[k] ?? '') === String((b || {})[k] ?? ''));
}

/** Find the running Ticket Notes web-app tab and push merged fields to it.
 *  Used both by the popup's "Push to ticket" button and by autoPush after
 *  every content-script scrape event.
 *
 *  force=false (auto push on scrape):
 *    - sends only the 4 identity fields
 *    - skips entirely if the 4 fields haven't changed since last successful push
 *    - payload.mode = 'auto' (app shows confirm popup)
 *
 *  force=true (popup "Push to open Ticket Notes" button):
 *    - sends full merged fields
 *    - bypasses change detection
 *    - payload.mode = 'manual' (app applies immediately, same as today) */
async function pushToTicketApp(force = false) {
  if (!force && !state.settings.autoPush) return { ok: false, skipped: 'autoPush disabled' };
  const ticketTab = await findTab(TICKET_APP_HOST_PATTERNS.concat(
    (state.settings.extraTicketHosts || []).map((h) => new RegExp(h.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'i'))
  ));
  if (!ticketTab) return { ok: false, skipped: 'No open Ticket Notes web-app tab found.' };

  let fields, mode;
  let keyFields = null;
  if (force) {
    fields = buildMergedFields();
    mode = 'manual';
    keyFields = buildKeyFields(fields);
  } else {
    keyFields = buildKeyFields();
    if (Object.keys(keyFields).length === 0) {
      return { ok: false, skipped: 'No identity fields scraped yet.' };
    }
    if (keyFieldsEqual(state.lastPushedKeyFields || {}, keyFields)) {
      return { ok: false, skipped: 'Key fields unchanged since last push.' };
    }
    fields = keyFields;
    mode = 'auto';
  }

  const payload = {
    type: 'TICKET_EXT_PUSH',
    mode,
    fields,
    state: {
      ccp: state.ccp ? { capturedAt: state.ccp.capturedAt, url: state.ccp.url, title: state.ccp.title } : null,
      sf: state.sf ? { capturedAt: state.sf.capturedAt, url: state.sf.url, title: state.sf.title } : null,
    },
    pushedAt: nowISO(),
    source: 'ecovacs-ccp-scraper',
  };
  let reply;
  try {
    reply = await chrome.tabs.sendMessage(ticketTab.id, { type: 'TICKET_APP_BRIDGE', payload });
  } catch {
    reply = null;
  }
  if (reply?.ok) {
    // Only update the fingerprint after the app actually acked receipt,
    // otherwise a closed tab / missing bridge would suppress future retries.
    if (Object.keys(keyFields || {}).length > 0) {
      state.lastPushedKeyFields = keyFields;
      await saveState();
    }
    return reply;
  }
  return { ok: false, error: 'Ticket app bridge did not reply.' };
}

// ---------------------------------------------------------------------------
//  Message routing
// ---------------------------------------------------------------------------

/** Messages from content scripts (CCP / SF) */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // IMPORTANT — gate strictly to messages coming FROM content scripts (i.e.
  // a tab ran our injected scraper). Without this gate the popup's own
  // messages (POPUP_PUSH, POPUP_SCRAPE_*) arrive here and hit the fallback
  // "Unknown message type" reply before the POPUP_* listener below has a
  // chance to respond. Because MV3 onMessage deliverers reply with the
  // FIRST sendResponse() call, this bug looked like:
  //
  //   click "Push info to Ticket Notes" → toast: "Unknown message type: POPUP_PUSH"
  //
  // Gate fix: only process content-script messages here.
  if (!sender || !sender.tab || typeof sender.tab.id !== 'number') return false;
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

/** Messages from the popup (and the internal app bridge which looks like an
 *  "extension popup" to chrome.runtime.sendMessage — both originate from the
 *  extension's own HTML views, i.e. NOT from a tab content script.)
 *
 *  We gate strictly to messages that DON'T come from a tab. This pairs with
 *  the content-script listener above, which gates to messages FROM a tab.
 *  Together the two gates ensure each message type is processed by exactly
 *  one listener — never two "Unknown message type" races. */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (sender && sender.tab && typeof sender.tab.id === 'number') return false;
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
  if (t === 'POPUP_SCRAPE_CCP') { (async () => sendResponse(await refreshCcpTab()))(); return true; }
  if (t === 'POPUP_SCRAPE_SF')  { (async () => sendResponse(await refreshSalesforceTab()))(); return true; }
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
  if (t === 'POPUP_EVICT_STALE') {
    (async () => {
      // Popup did tabs.get(tabId) lookup and found one of our in-memory
      // snapshots was sourced from a now-closed tab; it already wrote the
      // cleaned snapshot to storage.local.  Re-sync our in-memory copy and
      // run snapshotStale for belt-and-braces, then confirm back so popup
      // knows the next POPUP_GET_STATE will be clean too.
      let did = false;
      if (await snapshotStale(state.sf, SF_PATTERNS))  { state.sf  = null; did = true; }
      if (await snapshotStale(state.ccp, CCP_PATTERNS)) { state.ccp = null; did = true; }
      if (did) await saveState();
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
