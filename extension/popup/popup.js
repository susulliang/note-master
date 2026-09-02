// popup.js — popup UI controller. All scraping happens in the background
// service worker; this file just wires the buttons and renders the result.

const $ = (sel) => document.querySelector(sel);
const elVersion = $('#ver');
const elBadge = $('#badgeConnect');
const elExtId = $('#extId');

const elCcpMeta = $('#ccpMeta');
const elSfMeta = $('#sfMeta');
const elCcpKv = $('#ccpKv');
const elSfKv = $('#sfKv');
const elCcpDot = document.querySelectorAll('.card.ccp .dot')[0];
const elSfDot = document.querySelectorAll('.card.sf .dot')[0];

const btnCcp = $('#btnCcp');
const btnSf = $('#btnSf');
const btnScrapeAll = $('#btnScrapeAll');
const btnPush = $('#btnPush');
const btnScanCurrent = $('#btnScanCurrent');
const cbAuto = $('#cbAuto');

const elToast = $('#toast');

let lastSeen = { ccp: null, sf: null };

function toast(msg, kind = '') {
  elToast.textContent = msg;
  elToast.classList.remove('ok', 'err', 'warn');
  if (kind) elToast.classList.add(kind);
  requestAnimationFrame(() => elToast.classList.add('show'));
  clearTimeout(toast._t);
  toast._t = setTimeout(() => elToast.classList.remove('show'), 1800);
}

function fmtTime(iso) {
  if (!iso) return 'never';
  try {
    const d = new Date(iso);
    const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 5) return `${hm} · just now`;
    if (diff < 60) return `${hm} · ${diff}s ago`;
    if (diff < 3600) return `${hm} · ${Math.floor(diff / 60)}m ago`;
    return `${hm} · ${Math.floor(diff / 3600)}h ago`;
  } catch {
    return iso;
  }
}

function shortDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url?.slice(0, 50) || ''; }
}

const STATE_KEY = '__ecovacs_scraper_state_v1';
function readStateFromStorage() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([STATE_KEY], (items) => {
        resolve(items?.[STATE_KEY] || null);
      });
    } catch {
      resolve(null);
    }
  });
}
/** @returns {Promise<chrome.tabs.Tab[]>} */
function getTabsLocal() {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query({ currentWindow: true }, (tabs) => resolve(Array.isArray(tabs) ? tabs : []));
    } catch {
      resolve([]);
    }
  });
}
function localDiag() {
  const manifest = chrome.runtime.getManifest?.();
  const version = manifest?.version || '?';
  const id = chrome.runtime.id || '';
  return { manifest, version, id };
}
function paintHeaderNow() {
  // Synchronous, zero awaits: paint the version + extension ID before any
  // promise settles. No "warming up…" screen ever again even when the SW
  // is dead / messages are dropped / storage is empty.
  const { version, id } = localDiag();
  if (elVersion) elVersion.textContent = `v${version} · ${id ? id.slice(0, 8) + '…' : 'no-id'}`;
  if (elExtId) elExtId.textContent = id || '(unknown — reload extension)';
  if (elBadge) { elBadge.textContent = 'Off'; elBadge.className = 'badge'; }
  // Seed diag panel with the same instant info so "Loading…" only flashes
  // if storage/tabs reply immediately.
  if (elDiag) {
    elDiag.innerHTML = `<li><span class="kv__k">Extension version</span><span class="kv__v"><code>${escHtml(version)}</code></span></li>` +
                       `<li><span class="kv__k">Extension ID</span><span class="kv__v"><code>${escHtml(id)}</code></span></li>` +
                       `<li class="warn-row"><span class="kv__k">Tip</span><span class="kv__v">If still showing <code>v0.1.0</code>, go to <code>edge://extensions</code> / <code>chrome://extensions</code>, find this extension, and click ⟳ Reload.</span></li>`;
  }
}
// Run BEFORE any other code — popup scripts execute in tag order, but
// explicitly tie into DOMContentLoaded so early queries can't fail.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', paintHeaderNow, { once: true });
} else {
  paintHeaderNow();
}

function renderDiagnosticFooter(diag, state) {
  if (!elDiag) return;
  if (!diag) { elDiag.innerHTML = '<li class="empty">Waiting for first sync…</li>'; return; }
  const lines = [];
  lines.push(`<li><span class="kv__k">Extension version</span><span class="kv__v"><code>${escHtml(state.runtimeVersion || chrome.runtime.getManifest?.().version || '?')}</code></span></li>`);
  lines.push(`<li><span class="kv__k">Active tab title</span><span class="kv__v">${escHtml(diag.activeTab?.title || '(none)')}</span></li>`);
  lines.push(`<li><span class="kv__k">Active tab URL</span><span class="kv__v" style="word-break:break-all"><code>${escHtml(diag.activeTab?.url || '')}</code></span></li>`);
  const sfMatchCount = diag.matchesSf?.length ?? 0;
  const ccpMatchCount = diag.matchesCcp?.length ?? 0;
  if (sfMatchCount === 0 && ccpMatchCount === 0) {
    lines.push(`<li class="warn-row" style="color:var(--warn);border-top:1px dashed var(--border);padding-top:8px"><span class="kv__k">⚠ No tab matches SF / CCP URL patterns.</span><span class="kv__v">Click <code>🔦 Force-scan</code> below. That runs on ANY active tab regardless of URL.</span></li>`);
  } else {
    lines.push(`<li class="ok-row" style="color:var(--primary)"><span class="kv__k">✔ URL-pattern match</span><span class="kv__v">Salesforce tabs: ${sfMatchCount}. CCP tabs: ${ccpMatchCount}.</span></li>`);
  }
  (diag.matchesSf || []).forEach((t, i) => {
    lines.push(`<li><span class="kv__k">SF #${i + 1}</span><span class="kv__v" style="word-break:break-all"><code>${escHtml(t.url)}</code></span></li>`);
  });
  (diag.matchesCcp || []).forEach((t, i) => {
    lines.push(`<li><span class="kv__k">CCP #${i + 1}</span><span class="kv__v" style="word-break:break-all"><code>${escHtml(t.url)}</code></span></li>`);
  });
  lines.push(`<li><span class="kv__k">Why patterns may miss</span><span class="kv__v">Branded domains / custom my.site.com bypass the URL list. Again: Force-scan handles those.</span></li>`);
  elDiag.innerHTML = lines.join('');
}

function renderCapture(card, data, elKv, elMeta, elDot, extra) {
  // When the CCP is captured from the Salesforce tab's utility bar iframe,
  // the sf snapshot carries a ccpEmbedded marker — show a clear inline
  // hint on the SF card, and allow a "not captured yet" CCP card to be
  // soft-green when the same-tab embedded probe succeeded.
  const embedded = !!data?.embedded;
  const sfHasEmbedded = !!(data && card === 'sf' && data.ccpEmbedded);
  if (!data?.capturedAt) {
    if (sfHasEmbedded && card === 'ccp') {
      // CCP card: no standalone tab capture, but the SF scan found the
      // embedded utility bar Connect iframe. Keep it friendly green.
      elDot.classList.remove('warn');
      elDot.classList.add('ok');
      elMeta.textContent = 'Captured inside the Salesforce utility bar.';
      elKv.innerHTML = '<li class="empty">No standalone CCP tab; embedded probe was used.</li>';
      return;
    }
    elDot.classList.remove('ok', 'warn');
    elMeta.textContent = 'Not captured yet.';
    elKv.innerHTML = '<li class="empty">Open this tab type to auto-capture.</li>';
    return;
  }
  elDot.classList.add('ok');
  const tag = embedded ? ' (embedded in SF tab)' : (card === 'sf' && sfHasEmbedded ? ' · CCP embedded' : '');
  elMeta.textContent = `${fmtTime(data.capturedAt)} · ${shortDomain(data.url)}${tag}`;
  const entries = Object.entries(data.data || {}).filter(([, v]) => v !== '' && v != null);
  if (entries.length === 0) {
    let hint = '';
    // Inline diagnostic: show why this capture has no matched fields.
    const diag = data.diagnostic || extra?.diagnostic || null;
    const lastErr = data.lastError || extra?.lastError || null;
    if (diag?.injectFailed) {
      hint = `<li class="warn-row"><span class="kv__k">Inject blocked</span><span class="kv__v">${escHtml(diag.injectError || diag.firstError)}. Grant <em>Site access → On all sites</em> for this extension, or click Force-scan.</span></li>`;
    } else if (diag?.injectFallbackUsed || diag?.injectedAfterFail) {
      hint = `<li class="warn-row"><span class="kv__k">Auto-injected</span><span class="kv__v">Content script was not preloaded (tab opened before extension install). Ran via scripting.executeScript — ${escHtml(diag.injectFrames || 0)} frames. Still zero matches: URL or page layout may be unlisted. Use Force-scan.</span></li>`;
    } else if (lastErr) {
      hint = `<li class="warn-row"><span class="kv__k">Last error</span><span class="kv__v">${escHtml(lastErr)}</span></li>`;
    } else if (extra?.openMatch === false) {
      hint = `<li class="warn-row"><span class="kv__k">No matching tab</span><span class="kv__v">No tab with a matching URL pattern is open in this window. If it IS the right page but branded URL, click Force-scan.</span></li>`;
    }
    elKv.innerHTML =
      `<li class="empty">Tab captured, but no ${card.toUpperCase()} fields matched yet.</li>` +
      hint +
      `<li class="empty tip"><em>Tip: ${card === 'ccp' ? 'Ensure the Connect CCP softphone is fully loaded (not just the Salesforce Console) — it renders as an iframe at the bottom. Embedded-CCP still shows Captured inside Salesforce utility bar on the SF card instead.' : 'Ensure you are on a Case detail page, not the home/feed. On brand domains use Force-scan.'}</em></li>`;
    return;
  }
  elKv.innerHTML = entries
    .slice(0, 24)
    .map(([k, v]) => {
      const valueText = Array.isArray(v) ? v.join(', ') : String(v);
      const safe = valueText.replace(/[<>&"]/g, (ch) => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' })[ch]);
      return `<li><span class="kv__k" title="${k}">${k}</span><span class="kv__v">${safe.length > 160 ? safe.slice(0,157)+'…' : safe}</span></li>`;
    }).join('');
  // Also attach the diagnostic badge at the bottom of a successful capture
  // so you know when the inject fallback was used (useful to spot that a
  // tab was pre-existing vs freshly navigated).
  const d = data.diagnostic || extra?.diagnostic || null;
  if (d?.injectFallbackUsed) {
    elKv.innerHTML += `<li class="ok-row" style="color:var(--accent)"><span class="kv__k">Note</span><span class="kv__v">Fetched via on-the-fly injection (tab predates extension). Reload tab for passive listener behaviour.</span></li>`;
  }
}

function updateBadge(state) {
  const ccpOk = !!state.ccp?.capturedAt || !!state.sf?.ccpEmbedded;
  const sfOk  = !!state.sf?.capturedAt;
  if (ccpOk && sfOk) { elBadge.textContent = 'Both tabs'; elBadge.className = 'badge ok'; return; }
  if (ccpOk || sfOk) { elBadge.textContent = 'One tab'; elBadge.className = 'badge warn'; return; }
  elBadge.textContent = 'No tabs'; elBadge.className = 'badge';
}

function hasChanged(prev, next) {
  return JSON.stringify(prev ?? null) !== JSON.stringify(next ?? null);
}

const SEND_TIMED_OUT = Symbol('sendTimeout');
async function sendWithTimeout(message, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(SEND_TIMED_OUT);
    }, timeoutMs);
    try {
      chrome.runtime.sendMessage(message, (reply) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        // MV3: when the listener doesn't exist chrome sets lastError and
        // passes `undefined` as reply. We must read runtime.lastError via
        // the chrome.runtime.lastError getter *inside this callback*.
        let err = null;
        try {
          // eslint-disable-next-line no-unused-expressions
          if (chrome.runtime.lastError) err = chrome.runtime.lastError.message || String(chrome.runtime.lastError);
        } catch { /* getter not exposed */ }
        if (reply === undefined && !err) err = 'Listener did not send a response.';
        if (err) resolve({ ok: false, error: err });
        else resolve(reply);
      });
    } catch (syncErr) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: false, error: String(syncErr?.message || syncErr) });
    }
  });
}

function defaultState() {
  return { ccp: null, sf: null, settings: { autoPush: false } };
}
async function buildFallbackDiag(state, runtimeVersion) {
  const tabs = await getTabsLocal();
  const slim = tabs.map((t) => ({ id: t.id, active: !!t.active, title: (t.title || '').slice(0, 120), url: (t.url || '').slice(0, 200) }));
  const sfRegexes = [
    /lightning\.force\.com/i, /my\.salesforce\.com/i, /salesforce\.com/i,
    /visual\.force\.com/i, /\.force\.com/i,
  ];
  const ccpRegexes = [
    /\.my\.connect\.aws/i, /\.awsapps\.com\/connect/i, /\.connect\.aws\.a2z\.com/i,
    /five9\.com/i, /genesys.*\.com/i, /zendesk\.com/i, /talkdesk\.com/i, /freshdesk\.com/i,
  ];
  return {
    runtimeVersion,
    openCount: slim.length,
    activeTab: slim.find((t) => t.active) || null,
    matchesSf: slim.filter((t) => sfRegexes.some((r) => r.test(t.url || ''))),
    matchesCcp: slim.filter((t) => ccpRegexes.some((r) => r.test(t.url || ''))),
    builtFrom: 'storage-local-fallback',
    manifestSfPatterns: sfRegexes.map(String),
    manifestCcpPatterns: ccpRegexes.map(String),
  };
}

async function refreshState(silent = false, retries = 1) {
  // ALWAYS refresh the header synchronously first.
  paintHeaderNow();

  // Tier 1: try to wake the SW via POPUP_GET_STATE. We only retries once
  // since tier 2 fallback works immediately.
  let reply = null;
  let swError = null;
  for (let i = 0; i <= retries; i += 1) {
    if (i > 0) await new Promise((r) => setTimeout(r, 220));
    const result = await sendWithTimeout({ type: 'POPUP_GET_STATE' }, i === 0 ? 1500 : 2500);
    if (result === SEND_TIMED_OUT) {
      swError = `sendMessage timed out after ${i === 0 ? 1.5 : 2.5}s — SW not responding.`;
      continue;
    }
    if (result?.ok) { reply = result; break; }
    swError = result?.error || 'SW replied with error.';
  }

  let state;
  let diag;
  let runtimeVersion = chrome.runtime.getManifest?.().version || null;
  let merged = null;
  if (reply?.ok) {
    state = reply.state;
    diag = reply.diag;
    runtimeVersion = reply.runtimeVersion || runtimeVersion;
    merged = reply.merged;
  } else {
    // Tier 2: do everything the popup can do on its own without the SW.
    state = (await readStateFromStorage()) || defaultState();
    if (!state.settings) state.settings = { autoPush: false };
    diag = await buildFallbackDiag(state, runtimeVersion);
    // We actually DO NOT have buildMergedFields in popup; set merged null.
    // Capture cards are rendered from cc/sf anyway — merged only for toast.
    if (!silent) {
      // Distinct toast so the user knows we're running in offline mode and
      // buttons still work (buttons call sendMessage -> get error).
      toast('Service worker is offline — showing cached state. Click Force-scan / buttons to wake it.', 'warn');
    }
    // Attach swError to each card so the panel explains why the SW didn't
    // answer — it's actionable feedback.
    state._swError = swError;
  }

  // Re-paint version header with runtimeVersion from SW if available.
  if (elVersion) elVersion.textContent = `v${runtimeVersion || localDiag().version} · ${(chrome.runtime.id || '').slice(0, 8)}…`;
  if (elExtId) elExtId.textContent = chrome.runtime.id || localDiag().id;

  const swExtra = state._swError ? { lastError: state._swError, diagnostic: { swOffline: true } } : {};
  renderCapture('ccp', state.ccp, elCcpKv, elCcpMeta, elCcpDot, {
    openMatch: !(diag && Array.isArray(diag.matchesCcp) && (state.ccp == null) && diag.matchesCcp.length === 0),
    ...swExtra,
  });
  renderCapture('sf',  state.sf,  elSfKv,  elSfMeta,  elSfDot, {
    openMatch: !(diag && Array.isArray(diag.matchesSf) && (state.sf == null) && diag.matchesSf.length === 0),
    ...swExtra,
  });
  renderDiagnosticFooter(diag || null, { runtimeVersion });
  updateBadge(state);
  cbAuto.checked = !!state.settings?.autoPush;

  if (!silent && (hasChanged(lastSeen.ccp, state.ccp) || hasChanged(lastSeen.sf, state.sf))) {
    lastSeen = { ccp: state.ccp || null, sf: state.sf || null };
    const n = Object.keys(merged || {}).length;
    if (n > 0) toast(`Merged ${n} fields ready.`, 'ok');
  }
  return reply || { ok: !!state.ccp || !!state.sf, cached: true, state, diag };
}

async function withLoading(btn, fn) {
  const oldHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border:1.5px solid currentColor;border-right-color:transparent;border-radius:999px;animation:spin 0.7s linear infinite"></span> Working…`;
  if (!document.getElementById('spin-style')) {
    const s = document.createElement('style');
    s.id = 'spin-style';
    s.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(s);
  }
  try { return await fn(); }
  finally { btn.disabled = false; btn.innerHTML = oldHtml; }
}

function explainError(result, fallback) {
  if (result === SEND_TIMED_OUT) {
    return 'Background service worker did not reply within timeout. Reload the extension at edge://extensions (or chrome://extensions), then click the popup again.';
  }
  if (result?.error) return String(result.error);
  return fallback;
}

async function onClickCcp() {
  const r = await withLoading(btnCcp, () => sendWithTimeout({ type: 'POPUP_SCRAPE_CCP' }, 12000));
  await refreshState(true);
  if (!r?.ok) toast(explainError(r, 'CCP scrape failed.'), 'err');
  else toast('CCP tab re-scraped.', 'ok');
}

async function onClickSf() {
  const r = await withLoading(btnSf, () => sendWithTimeout({ type: 'POPUP_SCRAPE_SF' }, 12000));
  await refreshState(true);
  if (!r?.ok) toast(explainError(r, 'Salesforce scrape failed.'), 'err');
  else toast('Salesforce tab re-scraped.', 'ok');
}

async function onClickScrapeAll() {
  const r = await withLoading(btnScrapeAll, () => sendWithTimeout({ type: 'POPUP_SCRAPE_ALL' }, 16000));
  await refreshState(true);
  if (r === SEND_TIMED_OUT) { toast(explainError(r), 'err'); return; }
  const errors = [r?.ccp, r?.sf].filter((x) => x && x.ok === false).map((x) => x.error);
  if (errors.length === 2) toast(errors[0] || 'Nothing scraped.', 'warn');
  else if (errors.length === 1) toast(`Partial: ${errors[0]}`, 'warn');
  else toast('Both tabs re-scraped.', 'ok');
}

async function onClickScanCurrent() {
  const r = await withLoading(btnScanCurrent, () => sendWithTimeout({ type: 'POPUP_SCRAPE_ACTIVE' }, 12000));
  await refreshState(true);
  if (r?.ok) toast('Scanned active tab — check the cards above.', 'ok');
  else toast(explainError(r, 'Scan found nothing on this page. Hover SF card for details.'), 'warn');
}

async function onClickPush() {
  const r = await withLoading(btnPush, () => sendWithTimeout({ type: 'POPUP_PUSH' }, 10000));
  if (r?.ok) toast('Pushed to Ticket Notes.', 'ok');
  else if (r?.skipped) toast(r.skipped, 'warn');
  else toast(explainError(r, 'Push failed.'), 'err');
}

async function onToggleAuto(e) {
  const checked = e.target.checked;
  const r = await sendWithTimeout({ type: 'POPUP_UPDATE_SETTINGS', settings: { autoPush: checked } }, 4000);
  if (r?.ok) toast(checked ? 'Auto-push ON.' : 'Auto-push OFF.', 'ok');
  else toast(explainError(r, 'Settings update failed — SW not reachable.'), 'warn');
}

function onCopyExtId() {
  try {
    navigator.clipboard.writeText(elExtId.textContent || '').then(
      () => toast('Extension ID copied.', 'ok'),
      () => toast('Copy failed — select manually.', 'err')
    );
  } catch { /* ignore */ }
}

btnCcp.addEventListener('click', onClickCcp);
btnSf.addEventListener('click', onClickSf);
btnScrapeAll.addEventListener('click', onClickScrapeAll);
btnPush.addEventListener('click', onClickPush);
if (btnScanCurrent) btnScanCurrent.addEventListener('click', onClickScanCurrent);
cbAuto.addEventListener('change', onToggleAuto);
elExtId.addEventListener('click', onCopyExtId);

// Initial paint, then refresh every 5s so the popup stays live without a
// messaging subscription.
void refreshState();
setInterval(() => refreshState(true), 5000);
