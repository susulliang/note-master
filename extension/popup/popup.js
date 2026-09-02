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

function renderCapture(card, data, elKv, elMeta, elDot) {
  if (!data?.capturedAt) {
    elDot.classList.remove('ok', 'warn');
    elMeta.textContent = 'Not captured yet.';
    elKv.innerHTML = '<li class="empty">Open this tab type to auto-capture.</li>';
    return;
  }
  elDot.classList.add('ok');
  elMeta.textContent = `${fmtTime(data.capturedAt)} · ${shortDomain(data.url)}`;
  const entries = Object.entries(data.data || {}).filter(([, v]) => v !== '' && v != null);
  if (entries.length === 0) {
    elKv.innerHTML = '<li class="empty">Tab captured, no fields matched yet.</li>';
    return;
  }
  elKv.innerHTML = entries
    .slice(0, 24)
    .map(([k, v]) => {
      const valueText = Array.isArray(v) ? v.join(', ') : String(v);
      const safe = valueText.replace(/[<>&"]/g, (ch) => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' })[ch]);
      return `<li><span class="kv__k" title="${k}">${k}</span><span class="kv__v">${safe.length > 160 ? safe.slice(0,157)+'…' : safe}</span></li>`;
    }).join('');
}

function updateBadge(state) {
  const ccpOk = !!state.ccp?.capturedAt;
  const sfOk  = !!state.sf?.capturedAt;
  if (ccpOk && sfOk) { elBadge.textContent = 'Both tabs'; elBadge.className = 'badge ok'; return; }
  if (ccpOk || sfOk) { elBadge.textContent = 'One tab'; elBadge.className = 'badge warn'; return; }
  elBadge.textContent = 'No tabs'; elBadge.className = 'badge';
}

function hasChanged(prev, next) {
  return JSON.stringify(prev ?? null) !== JSON.stringify(next ?? null);
}

async function refreshState(silent = false) {
  const reply = await chrome.runtime.sendMessage({ type: 'POPUP_GET_STATE' });
  if (!reply?.ok) {
    if (!silent) toast('Could not reach extension background.', 'err');
    return null;
  }
  const { state, merged, extensionId } = reply;
  elVersion.textContent = `v${chrome.runtime.getManifest?.().version ?? '0.1.0'} · ${extensionId.slice(0, 8)}…`;
  elExtId.textContent = extensionId;

  renderCapture('ccp', state.ccp, elCcpKv, elCcpMeta, elCcpDot);
  renderCapture('sf',  state.sf,  elSfKv,  elSfMeta,  elSfDot);
  updateBadge(state);
  cbAuto.checked = !!state.settings.autoPush;

  if (!silent && (hasChanged(lastSeen.ccp, state.ccp) || hasChanged(lastSeen.sf, state.sf))) {
    lastSeen = { ccp: state.ccp || null, sf: state.sf || null };
    const n = (Object.keys(merged || {}).length);
    if (n > 0) toast(`Merged ${n} fields ready.`, 'ok');
  }
  return reply;
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

async function onClickCcp() {
  const r = await withLoading(btnCcp, () => chrome.runtime.sendMessage({ type: 'POPUP_SCRAPE_CCP' }));
  await refreshState(true);
  if (!r?.ok) toast(r?.error || 'CCP scrape failed.', 'err');
  else toast('CCP tab re-scraped.', 'ok');
}

async function onClickSf() {
  const r = await withLoading(btnSf, () => chrome.runtime.sendMessage({ type: 'POPUP_SCRAPE_SF' }));
  await refreshState(true);
  if (!r?.ok) toast(r?.error || 'Salesforce scrape failed.', 'err');
  else toast('Salesforce tab re-scraped.', 'ok');
}

async function onClickScrapeAll() {
  const r = await withLoading(btnScrapeAll, () => chrome.runtime.sendMessage({ type: 'POPUP_SCRAPE_ALL' }));
  await refreshState(true);
  const errors = [r?.ccp, r?.sf].filter((x) => x && x.ok === false).map((x) => x.error);
  if (errors.length === 2) toast(errors[0] || 'Nothing scraped.', 'warn');
  else if (errors.length === 1) toast(`Partial: ${errors[0]}`, 'warn');
  else toast('Both tabs re-scraped.', 'ok');
}

async function onClickPush() {
  const r = await withLoading(btnPush, () => chrome.runtime.sendMessage({ type: 'POPUP_PUSH' }));
  if (r?.ok) toast('Pushed to Ticket Notes.', 'ok');
  else if (r?.skipped) toast(r.skipped, 'warn');
  else toast(r?.error || 'Push failed.', 'err');
}

async function onToggleAuto(e) {
  const checked = e.target.checked;
  const r = await chrome.runtime.sendMessage({ type: 'POPUP_UPDATE_SETTINGS', settings: { autoPush: checked } });
  if (r?.ok) toast(checked ? 'Auto-push ON.' : 'Auto-push OFF.', 'ok');
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
cbAuto.addEventListener('change', onToggleAuto);
elExtId.addEventListener('click', onCopyExtId);

// Initial paint, then refresh every 5s so the popup stays live without a
// messaging subscription.
void refreshState();
setInterval(() => refreshState(true), 5000);
