// popup.js — popup UI controller. All scraping happens in the background
// service worker; this file wires the buttons and renders results.
//
// UI has been unified per v0.1.13 redesign:
//   • ONE "Scan Salesforce & CCP" button with a two-tier fallback:
//       Tier 1 — ask the service worker (POPUP_SCRAPE_ALL)
//       Tier 2 — after 3.5 s, fall back to popup-side self-extract which
//                runs chrome.scripting.executeScript directly from this
//                popup (bypasses a zombied SW)
//     Previously there were THREE separate scrape buttons. The user asked
//     to combine them, so everything lives behind this single entry.
//   • ONE "Push info to Ticket Notes" button. Previously it reported
//     "UNKNOWN MESSAGE TYPE POPUP_PUSH" because the SW's first message
//     listener (content-script handler) lacked a sender.tab gate and
//     replied "Unknown message type" before the POPUP_* listener could.
//     Fixed in background.js with a strict sender.tab gate on both
//     listeners.

const $ = (sel) => document.querySelector(sel);
const elVersion = $('#ver');
const elBadge = $('#badgeConnect');
const elExtId = $('#extId');

const elCcpMeta = $('#ccpMeta');
const elSfMeta = $('#sfMeta');
const elCcpKv = $('#ccpKv');
const elSfKv = $('#sfKv');
const cardCcpEl = document.getElementById('cardCcp');
const cardSfEl = document.getElementById('cardSf');
const elDiag = $('#diagBox');

const btnCcp = $('#btnCcp');
const btnSf = $('#btnSf');
// Single unified SCAN button (replaces the previous three:
// btnScrapeAll, btnScanCurrent, btnSelfExtract)
const btnScan = document.getElementById('btnScan');
const btnPush = $('#btnPush');
const cbAuto = $('#cbAuto');

const elToast = $('#toast');

let lastSeen = { ccp: null, sf: null };

// Scan fallback: how long we wait for the service worker before we decide
// it's zombied and we fall back to popup-side self-extract. Chosen to be
// ~2× the SW scrape timeout so normal scans finish before the fallback
// kicks in, but a dead SW never leaves the spinner going forever.
const SCAN_SW_TIMEOUT_MS = 3500;

// Popup-level inline extractors. These run directly via chrome.scripting
// called FROM THE POPUP — fully bypassing the service worker. If the user
// clicks the popup action, MV3 grants activeTab for the currently-active
// tab of the current window to the popup context as well, so
// chrome.scripting.executeScript works perfectly here on any URL.
//
// Keeping a copy in popup.js means even in the bizarre case where the
// extension's background service worker is permanently zombied (which
// seems to be the case for the currently installed fmopcjlg instance: the
// popup painted v0.1.3 correctly but every sendMessage times out and
// storage callbacks never fire), the user still gets field extraction.
const POPUP_INLINE_SF = function () {
  const FIELD_ALIASES = {
    caseNumber:/^(Case\s*Number|Case\s*#)$/i,caseOwner:/^Case\s*Owner$/i,status:/^Status$/i,
    subject:/^Subject$/i,accountName:/^(Account\s*Name|Account)$/i,contactName:/^Contact\s*Name$/i,
    customerName:/^(Name|Customer\s*Name)$/i,phone:/^(Phone|Contact\s*Number|Contact\s*Phone)$/i,
    email:/^(Email|Email\s*Address)$/i,address:/^Address$/i,city:/^City$/i,
    provinceState:/^(Province|State)$/i,postalCode:/^(Postal\s*Code|Zip)$/i,country:/^Country$/i,
    deebotModel:/^(AMR\s*Model\s*No\.?|Deebot\s*Model|Model)$/i,serialNumber:/^Serial\s*Number$/i,
    skuNumber:/^SKU(\s*Number)?$/i,issueType:/^Issue\s*Type$/i,
    detailedIssue:/^(Detailed\s*Issue\s*Description|Request\s*Description|Description)$/i,
    resolutionSummary:/^Resolution\s*Summary$/i,additionalNotes:/^Additional\s*Notes$/i,
    caseOrigin:/^Case\s*Origin$/i,brand:/^Brand$/i,phoneSurveyResult:/^Phone\s*Survey\s*Result$/i,
    escalationType:/^Escalation\s*Type$/i,purchasingChannel:/^Purchasing\s*Channel$/i,
    orderNumber:/^Order\s*Number$/i,purchaseDate:/^Purchase\s*Date$/i,caseTag:/^Case\s*Tag$/i,
    firstPendingTs:/^First\s*Pending\s*Timestamp$/i,lastPendingTs:/^Last\s*Pending\s*Timestamp$/i,
    mergedCaseIds:/^Merged\s*Cases?$/i,aiAgentNote:/^AI\s*Agent$/i,appVersion:/^appVersion$/i,
    phoneModel:/^model$/i,osVersion:/^systemVersion$/i,deviceTypeName:/^deviceTypeName$/i,
    marketName:/^marketName$/i,appDeviceBlock:/^App\s*Device\s*Info$/i
  };
  function clean(v){if(v==null)return'';return String(v).replace(/\u00a0/g,' ').replace(/\s+\n/g,'\n').replace(/[ \t]+/g,' ').trim();}
  function assignOnce(o,k,v){const cv=clean(v);if(!cv)return;if(!o[k])o[k]=cv;}
  function lines(t){return t.split(/\r?\n/).map(s=>s.replace(/\u00a0/g,' ').trim()).filter(s=>s.length);}
  function isLabel(l){for(const p of Object.values(FIELD_ALIASES))if(p.test(l))return true;return false;}
  function matchAlias(l){for(const [k,p] of Object.entries(FIELD_ALIASES))if(p.test(l))return k;return null;}
  function valid(k,v){const s=clean(v);if(!s)return false;if(/^select\b/i.test(s))return false;if(/^(contact\s*taggings|is\s*un-?authorized\s*seller|merged\s*cases?\(?|help\s*contact\s*name)/i.test(s))return false;if(/^edit\b/i.test(s))return false;if(k==='appDeviceBlock')return false;if(/^issue\s*type\d/i.test(s)||matchAlias(s))return false;if((k==='contactNumber'||k==='phone'||k==='caseNumber'||k==='serialNumber')&&!/\d/.test(s))return false;if((k==='email'||k==='emailAddress')&&!s.includes('@'))return false;return true;}
  const acc={};
  const txt=(typeof document!=='undefined'&&document.body&&(document.body.innerText||document.body.textContent||''))||'';
  // (0) Whole-document line-pair sweep: body.innerText renders detail fields
  // as "Label\nValue" adjacent lines — markup-agnostic, runs first.
  {const ls=lines(txt);for(let i=0;i<ls.length-1;i+=1){const k=matchAlias(ls[i]);if(!k)continue;const nx=ls[i+1];if(isLabel(nx)&&matchAlias(nx))continue;if(!valid(k,nx))continue;assignOnce(acc,k,nx);}}
  const cn=txt.match(/(?:^|\n)\s*(\d{7,8})\s*\|\s*Case\b/);if(cn)assignOnce(acc,'caseNumber',cn[1]);
  const sfids=[...(txt.matchAll(/\b500[a-zA-Z0-9]{12,15}\b/g)||[])].map(x=>x[0]);if(sfids[0])assignOnce(acc,'salesforceId',sfids[0]);
  const caller=txt.match(/Caller\s*(\+?[\d\- \.\(\)]{6,})/);if(caller)assignOnce(acc,'contactNumber',caller[1]);
  const subj=txt.match(/^Subject\s*\n\s*([^\n]+)/m);if(subj)assignOnce(acc,'issueTitle',subj[1]);
  const adi=txt.match(/App\s*Device\s*Info\s*\n([\s\S]*?)(?:\n\s*Case\s*Number\b|\n\s*\d{7,8}\s*\|\s*Case\b|$)/i);
  if(adi)for(const l of lines(adi[1])){const i=l.indexOf(':');if(i===-1)continue;const k=l.slice(0,i).trim(),v=l.slice(i+1).trim();if(k==='appVersion')assignOnce(acc,'appVersion',v);else if(k==='model')assignOnce(acc,'phoneModel',v);else if(k==='systemVersion')assignOnce(acc,'osVersion',v);else if(k==='deviceTypeName')assignOnce(acc,'deviceTypeName',v);else if(k==='marketName')assignOnce(acc,'marketName',v);else if(k==='deviceType')assignOnce(acc,'deviceType',v);}
  const cls=[];let cm;const classRe=/Issue\s*Type(\d+)\s*(Primary|Second)\s*Classification\s*\n\s*([^\n]+)/gi;
  while((cm=classRe.exec(txt))!==null){const v=clean(cm[3]);if(!v||/^issue\s*type\d/i.test(v)||matchAlias(v))continue;cls.push({n:cm[1],kind:cm[2].toLowerCase()==='primary'?'L1':'L2',value:v});}
  if(cls.length){const parts=cls.filter(c=>c.value).sort((a,b)=>a.n.localeCompare(b.n)||(a.kind==='L1'?-1:1)).map(c=>c.value);if(parts.length)assignOnce(acc,'issueType',parts.join(' · '));for(const c of cls){if(c.n==='1')assignOnce(acc,c.kind==='L1'?'issueType1L1':'issueType1L2',c.value);else if(c.n==='2')assignOnce(acc,c.kind==='L1'?'issueType2L1':'issueType2L2',c.value);else if(c.n==='3')assignOnce(acc,c.kind==='L1'?'issueType3L1':'issueType3L2',c.value);}}
  if(!acc.email){const m=txt.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/);if(m)assignOnce(acc,'email',m[0]);}
  const tp=txt.match(/First\s*Pending\s*Timestamp\s*\n\s*([^\n]+)/);if(tp)assignOnce(acc,'firstPendingTs',tp[1]);
  const tp2=txt.match(/Last\s*Pending\s*Timestamp\s*\n\s*([^\n]+)/);if(tp2)assignOnce(acc,'lastPendingTs',tp2[1]);
  const ai=txt.match(/AI\s*Agent\s*\n([\s\S]*?)(?:\n\s*Summary\b|\n\s*Related\s*Files\b|$)/i);if(ai&&clean(ai[1]))assignOnce(acc,'aiAgentNote',clean(ai[1]));
  if(typeof document!=='undefined'&&document.querySelectorAll){
    const cells=document.querySelectorAll('div[class*="slds"],div[class*="cell"],li[class*="slds"],section,article');
    for(const cell of cells){const ls=lines(cell.innerText||cell.textContent||'');if(ls.length<2||ls.length>30)continue;for(let i=0;i<ls.length-1;i+=1){const km=matchAlias(ls[i]);if(!km)continue;const nx=ls[i+1];if(isLabel(nx)&&matchAlias(nx))continue;if(!valid(km,nx))continue;assignOnce(acc,km,nx);i+=1;}}
    const sts=['Account Details','Contact Details','App Device Info','Details','Case Details'];
    for(const title of sts){const nodes=document.querySelectorAll('h1,h2,h3,h4,h5,h6,span,div,p,b,strong,th,label');for(const heading of nodes){const t=clean(heading.textContent||heading.innerText||'');if(!t||t.toLowerCase()!==title.toLowerCase())continue;let c=heading.parentElement;for(let d=0;d<5&&c;d+=1){if((c.innerText||'').split(/\n/).length>6)break;c=c.parentElement;}if(!c)continue;const sls=lines(c.innerText||'');for(let i=0;i<sls.length-1;i+=1){const key=matchAlias(sls[i]);if(!key)continue;const val=sls[i+1];if(isLabel(val)&&matchAlias(val))continue;if(!valid(key,val))continue;assignOnce(acc,key,val);}}}
  }
  if(!acc.customerName&&acc.contactName)acc.customerName=acc.contactName;
  if(!acc.customerName&&acc.accountName)acc.customerName=acc.accountName;
  if(!acc.contactNumber&&acc.phone)acc.contactNumber=acc.phone;
  if(!acc.emailAddress&&acc.email)acc.emailAddress=acc.email;
  if(!acc.deebotModel&&acc.model)acc.deebotModel=acc.model;
  const parts=[acc.address,acc.city,acc.provinceState,acc.postalCode,acc.country].map(clean).filter(Boolean);
  if(parts.length){const joined=parts.filter((v,i,a)=>i===0||!a.slice(0,i).includes(v)).join(', ');assignOnce(acc,'shippingAddress',joined);}
  for(const k of Object.keys(acc)){if(typeof acc[k]==='string'&&!acc[k])delete acc[k];else if(typeof acc[k]==='string')acc[k]=clean(acc[k]);}
  return acc;
};

const POPUP_INLINE_CCP = function () {
  const acc={};function clean(v){if(v==null)return'';return String(v).replace(/\u00a0/g,' ').trim();}
  function a(k,v){const cv=clean(v);if(!cv)return;if(!acc[k])acc[k]=cv;}
  try{const text=(typeof document!=='undefined'&&document.body&&(document.body.innerText||document.body.textContent||''))||'';
    const caller=text.match(/Caller\s*(\+?[\d\- \.\(\)]{6,})/i);if(caller)a('contactNumber',caller[1]);
    const name=text.match(/Contact\s*Name\s*\n?\s*:\s*([^\n]+)/i)||text.match(/Customer\s*Name\s*\n?\s*:\s*([^\n]+)/i);if(name)a('customerName',name[1]);
    const cid=text.match(/Customer\s*Id\s*\n?\s*:\s*([A-Za-z0-9\-]+)/i);if(cid)a('customerId',cid[1]);
    const queue=text.match(/Queue\s*\n?\s*:\s*([^\n]+)/i);if(queue)a('queue',queue[1]);
    if(/quick\s*connect/i.test(text)){const st=text.match(/\b(Offline|Available|Busy|Calling|In\s*contact|Connecting)\b/i);if(st)a('ccpStatus',st[1]);const pm=text.match(/\+?\d[\d\s\-().]{7,}\d/);if(pm)a('contactNumber',pm[0]);}
    try{const w=(typeof window!=='undefined'?window:{});if(w.connect&&w.connect.contact&&w.connect.contact.getAttributes){const attrs=w.connect.contact.getAttributes()||{};for(const [k,v] of Object.entries(attrs)){const val=v&&(v.value!=null?v.value:v);const lk=String(k).toLowerCase();if(lk.includes('phone')||lk==='phonenumber'||lk.includes('number'))a('contactNumber',val);else if(lk==='customername'||lk==='name')a('customerName',val);else if(lk==='caseid'||lk==='ticket')a('caseNumber',val);else if(lk==='email')a('emailAddress',val);else a(k,val);}}}catch{/*noop*/}
  }catch{/*noop*/}return acc;
};

function escHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

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
  return Promise.resolve()
    .then(() => new Promise((resolve, reject) => {
      // Timeout-fuse storage.local: some Edge builds silently never call the
      // callback when the SW extension context is a zombie installed from
      // an older unpacked-load. Force-resolve after 900 ms so popup never
      // freezes at "Loading…". Use Promise API as first attempt (preferred
      // over callback API because Chrome 116+ fixed lastError ambiguity for
      // Promise-returning chrome.* calls).
      const t = setTimeout(() => resolve(null), 900);
      try {
        const pr = chrome.storage.local.get([STATE_KEY]);
        if (pr && typeof pr.then === 'function') {
          pr.then((items) => { clearTimeout(t); resolve(items?.[STATE_KEY] ?? null); })
            .catch((e) => { clearTimeout(t); resolve(null); void e; });
        } else {
          chrome.storage.local.get([STATE_KEY], (items) => {
            clearTimeout(t);
            if (chrome.runtime.lastError) resolve(null);
            else resolve(items?.[STATE_KEY] ?? null);
          });
        }
      } catch (syncErr) { clearTimeout(t); resolve(null); void syncErr; }
    }))
    .catch(() => null);
}
/** @returns {Promise<chrome.tabs.Tab[]>} */
function getTabsLocal() {
  return Promise.resolve().then(() => new Promise((resolve) => {
    const fail = setTimeout(() => resolve([]), 1200);
    try {
      const pr = chrome.tabs.query({ currentWindow: true });
      if (pr && typeof pr.then === 'function') {
        pr.then((tabs) => { clearTimeout(fail); resolve(Array.isArray(tabs) ? tabs : []); })
          .catch(() => { clearTimeout(fail); resolve([]); });
      } else {
        chrome.tabs.query({ currentWindow: true }, (tabs) => {
          clearTimeout(fail);
          resolve(Array.isArray(tabs) ? tabs : []);
        });
      }
    } catch { clearTimeout(fail); resolve([]); }
  })).catch(() => []);
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
  if (elBadge) { elBadge.textContent = 'Idle'; elBadge.className = 'bdg'; }
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

function renderCapture(card, data, elKv, elMeta, cardEl, extra) {
  // cardEl is the <article class="card ccp/sf"> wrapper. We set classes on
  // it (.captured / .warn / none) and the CSS styles the inner .dot
  // accordingly — avoids needing a direct ref to the dot element.
  const cardWrapper = cardEl;
  function setCardState(kind /* 'ok' | 'warn' | null */) {
    if (!cardWrapper) return;
    cardWrapper.classList.remove('captured', 'warn');
    if (kind === 'ok') cardWrapper.classList.add('captured');
    else if (kind === 'warn') cardWrapper.classList.add('warn');
  }
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
      setCardState('ok');
      elMeta.textContent = 'Captured inside the Salesforce utility bar.';
      elMeta.classList.add('hasData');
      elKv.innerHTML = '<li class="empty">No standalone CCP tab; embedded probe was used.</li>';
      return;
    }
    setCardState(null);
    elMeta.textContent = 'Not captured yet.';
    elMeta.classList.remove('hasData');
    elKv.innerHTML = '<li class="empty">Open this tab type to auto-capture.</li>';
    return;
  }
  setCardState('ok');
  elMeta.classList.add('hasData');
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
  // No 24-row cap — the .kv list is scrollable (max-height + overflow-y:
  // auto), and the cap made alphabetically-late fields (phone, serialNumber,
  // status, subject…) invisible, which looked like "not captured".
  elKv.innerHTML =
    `<li class="ok-row" style="color:var(--primary)"><span class="kv__k">Fields</span><span class="kv__v">${entries.length} captured · scroll ↓</span></li>` +
    entries
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
  if (ccpOk && sfOk) { elBadge.textContent = 'Both'; elBadge.className = 'bdg on'; return; }
  if (ccpOk || sfOk) { elBadge.textContent = 'Partial'; elBadge.className = 'bdg warn'; return; }
  elBadge.textContent = 'Idle'; elBadge.className = 'bdg';
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
      toast('Service worker is offline — showing cached state. Click the green Scan button to force-scan current page.', 'warn');
    }
    // Attach swError to each card so the panel explains why the SW didn't
    // answer — it's actionable feedback.
    state._swError = swError;
  }

  // ------------- Stale-snapshot eviction (paint-time) -------------------
  //
  // Even before the user clicks Scan, we don't want to paint a card with a
  // "Cong Ta" account captured from a tab they closed 21 hours ago.  We
  // look up each snapshot's tabId via chrome.tabs. If the tab no longer
  // exists, we null the snapshot before renderCapture runs.
  {
    const stale = { sf: false, ccp: false };
    try {
      if (state.sf?.tabId != null && state.sf.tabId >= 0) {
        try { await chrome.tabs.get(state.sf.tabId); } catch { stale.sf = true; }
      }
      if (state.ccp?.tabId != null && state.ccp.tabId >= 0) {
        try { await chrome.tabs.get(state.ccp.tabId); } catch { stale.ccp = true; }
      }
    } catch { /* ignore — tabs API permission revoked */ }
    if (stale.sf)  state.sf  = null;
    if (stale.ccp) state.ccp = null;
    // Persist eviction so a page that's truly closed disappears from the
    // cards across popup re-opens (popup context is recreated every click).
    if (stale.sf || stale.ccp) {
      try { await chrome.storage.local.set({ [STATE_KEY]: state, 'nm-extension-state-v1': state }); } catch { /* ignore */ }
      // Also poke background if it's alive to sync.
      try { chrome.runtime.sendMessage({ type: 'POPUP_EVICT_STALE' }, () => { /* swallow lastError */ }); } catch { /* ignore */ }
    }
  }
  // ---------------------------------------------------------------------

  // Re-paint version header with runtimeVersion from SW if available.
  if (elVersion) elVersion.textContent = `v${runtimeVersion || localDiag().version} · ${(chrome.runtime.id || '').slice(0, 8)}…`;
  if (elExtId) elExtId.textContent = chrome.runtime.id || localDiag().id;

  const swExtra = state._swError ? { lastError: state._swError, diagnostic: { swOffline: true } } : {};
  renderCapture('ccp', state.ccp, elCcpKv, elCcpMeta, cardCcpEl, {
    openMatch: !(diag && Array.isArray(diag.matchesCcp) && (state.ccp == null) && diag.matchesCcp.length === 0),
    ...swExtra,
  });
  renderCapture('sf',  state.sf,  elSfKv,  elSfMeta,  cardSfEl, {
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
  else toast(`CCP ${r?.viaActive ? 'current tab' : 'tab'} re-scraped${r?.embedded ? ' (embedded in SF tab)' : ''}.`, 'ok');
}

async function onClickSf() {
  const r = await withLoading(btnSf, () => sendWithTimeout({ type: 'POPUP_SCRAPE_SF' }, 12000));
  await refreshState(true);
  if (!r?.ok) toast(explainError(r, 'Salesforce scrape failed.'), 'err');
  else toast(`Salesforce ${r?.viaActive ? 'current tab' : 'tab'} re-scraped.`, 'ok');
}

async function selfExtractFromPopup(showSpinner) {
  // 100% service-worker independent: popup's own chrome.scripting + the
  // POPUP_INLINE_* copies below. activeTab permission from popup click
  // grants scripting on ANY URL.
  let sfData = null; let ccpData = null; let sfErr = null; let ccpErr = null;
  let framesSf = 0; let framesCcp = 0; let activeTabUrl = ''; let activeTabTitle = ''; let activeTabId = -1;
  try {
    const tabs = await getTabsLocal();
    const active = tabs.find((t) => t.active) || null;
    if (!active?.id) return { ok: false, error: 'No active tab in current window.' };
    activeTabId = active.id; activeTabUrl = active.url || ''; activeTabTitle = active.title || '';
    const runScript = async (fn) => {
      try {
        const world = (chrome.scripting && chrome.scripting.ExecutionWorld)
          ? chrome.scripting.ExecutionWorld.MAIN : 'MAIN';
        const r = await chrome.scripting.executeScript({
          target: { tabId: active.id, allFrames: true },
          func: fn,
          // @ts-ignore typing mismatch between popup ExtensionTypes and chrome.scripting union.
          world,
        });
        return Array.isArray(r) ? r : [];
      } catch (e) { return { __err: String(e?.message || e) }; }
    };
    const [sfRes, ccpRes] = await Promise.all([runScript(POPUP_INLINE_SF), runScript(POPUP_INLINE_CCP)]);
    const mergeExtract = (results) => {
      if (results && (results).__err) return { data: null, error: (results).__err, frames: 0 };
      const arr = Array.isArray(results) ? results : [];
      const merged = {}; let best = 0;
      for (const frame of arr) {
        const obj = (frame && typeof frame.result === 'object' && !Array.isArray(frame.result)) ? frame.result : null;
        if (!obj) continue;
        const size = Object.keys(obj).filter((k) => obj[k] !== '' && obj[k] != null).length;
        best = Math.max(best, size);
        for (const [k, v] of Object.entries(obj)) {
          if (v === '' || v == null) continue;
          if (merged[k] == null) merged[k] = v;
          else if (String(merged[k]).length < String(v).length) merged[k] = v;
        }
      }
      return { data: Object.keys(merged).length ? merged : null, error: null, frames: arr.length, best };
    };
    const sfM = mergeExtract(sfRes); framesSf = sfM.frames; sfErr = sfM.error; sfData = sfM.data;
    const cM = mergeExtract(ccpRes); framesCcp = cM.frames; ccpErr = cM.error; ccpData = cM.data;
  } catch (outer) { return { ok: false, error: String(outer?.message || outer) }; }

  const nowStr = new Date().toISOString();
  const snapshot = (await readStateFromStorage()) || { ccp: null, sf: null, settings: { autoPush: false } };
  if (!snapshot.settings) snapshot.settings = { autoPush: false };
  // IMPORTANT: when popup self-extract runs, it's the fallback for a dead
  // service worker.  User intent is still "force-scan the current page"
  // — so current-page result (even empty) must WIN over stale snapshots
  // from closed tabs.  Without the explicit nulls below, the snapshot.sf
  // / snapshot.ccp from a 24-hour-old closed tab would survive
  // self-extract forever and paint the wrong fields on the cards.
  if (sfData) {
    snapshot.sf = {
      capturedAt: nowStr, url: activeTabUrl, title: activeTabTitle, tabId: activeTabId,
      data: sfData, diagnostic: { via: 'popup-self-extract', framesExtracted: framesSf, bestFrameFieldCount: Object.keys(sfData).length },
    };
  } else {
    snapshot.sf = null;
  }
  if (ccpData) {
    snapshot.ccp = {
      capturedAt: nowStr, url: activeTabUrl, title: activeTabTitle, tabId: activeTabId,
      data: ccpData, embedded: !!sfData,
      diagnostic: { via: 'popup-self-extract', framesExtracted: framesCcp, bestFrameFieldCount: Object.keys(ccpData).length },
    };
  } else {
    snapshot.ccp = null;
  }
  if (snapshot.sf && snapshot.ccp) snapshot.sf.ccpEmbedded = true;
  else if (snapshot.sf) snapshot.sf.ccpEmbedded = false;

  // Persist to storage so popup shows it across reopens AND so background
  // (if ever revived) picks up the same snapshot on next boot.
  try {
    await chrome.storage.local.set({ [STATE_KEY]: snapshot, 'nm-extension-state-v1': snapshot });
  } catch { /* ignore */ }

  renderCapture('ccp', snapshot.ccp, elCcpKv, elCcpMeta, cardCcpEl, sfData ? { openMatch: true, lastError: ccpErr || null } : { lastError: ccpErr || null });
  renderCapture('sf', snapshot.sf, elSfKv, elSfMeta, cardSfEl, sfData ? { openMatch: true, lastError: sfErr || null } : { lastError: sfErr || null });
  updateBadge(snapshot);

  if ((sfData && Object.keys(sfData).length) || (ccpData && Object.keys(ccpData).length)) {
    return { ok: true, sfData, ccpData };
  }
  return {
    ok: false,
    error: `Self-extract ran ${framesSf + framesCcp} frame(s), but matched zero fields. SF lastError: ${sfErr || 'n/a'}. CCP lastError: ${ccpErr || 'n/a'}.`,
  };
}

async function onClickScan() {
  // Unified Scan button — three tiers of fallback, all behind the single
  // "Scan Salesforce & CCP" entry.
  //
  // Tier 1 → POPUP_SCRAPE_ALL via background SW (normal path):
  //   SW scrapes all open CCP + SF tabs; popup shows what SW found.
  //   Success = continue normally. SW is reachable.
  // Tier 2 → POPUP_SCRAPE_ACTIVE via background SW:
  //   SW scrapes the tab the user is currently looking at (covers "my
  //   branded URL isn't in pattern list" + "I want to re-scan right now"
  //   cases that the previous Force-scan button addressed).
  // Tier 3 (after the 3.5 s timeout fuse on tier 1 / 2) →
  //   popup-side selfExtractFromPopup bypasses the SW entirely (covers
  //   the zombied-service-worker case the old Self-extract button was for).
  //
  // Why this arrangement: user explicitly asked to "Combine all scrape/SCAN
  // buttons into one with fallbacks down to self extract."

  // --- Tier 1 + Tier 3 fuse: try SW POPUP_SCRAPE_ALL; if it takes longer
  //     than SCAN_SW_TIMEOUT_MS or returns SEND_TIMED_OUT, give up and go
  //     straight to self-extract. The fusePromise wins the race if SW is
  //     zombied → no visible spinner stuck.
  const tier1Promise = withLoading(btnScan, async () => {
    const r = await sendWithTimeout({ type: 'POPUP_SCRAPE_ALL' }, 16000);
    return { tier: 1, result: r };
  });
  const fusePromise = new Promise((resolve) =>
    setTimeout(() => resolve({ tier: 'fuse' }), SCAN_SW_TIMEOUT_MS)
  );
  const first = await Promise.race([tier1Promise, fusePromise]);

  // Fast path: Tier 1 produced a meaningful result. Paint and return.
  if (first && first.tier === 1) {
    const r = first.result;
    await refreshState(true);
    if (r === SEND_TIMED_OUT) {
      toast(`SW timeout — falling back to self-extract.`, 'warn');
    } else {
      const errors = [r?.ccp, r?.sf].filter((x) => x && x.ok === false).map((x) => x.error);
      // New scrapeAll() also returns an `activeTab` summary that tells us
      // whether we did scan the tab the user was actually looking at.
      // Surface this in the toast so the agent can confirm "yes, you did
      // scrape THIS Salesforce/CCP page, not the stale one."
      const at = r?.activeTab;
      let via = '';
      if (at?.scanned && (at.sf || at.ccp)) {
        via = ' · current tab';
        if (at.sf && at.ccp) via += ' (SF + CCP)';
        else if (at.sf) via += ' (SF)';
        else via += ' (CCP)';
      } else if (r?.fillInSf === false || r?.fillInCcp === false) {
        via = ' · current tab provided some data';
      }
      if (errors.length === 2) toast((errors[0] || 'Nothing scraped yet.') + via, 'warn');
      else if (errors.length === 1) toast(`Partial: ${errors[0]}${via}`, 'warn');
      else toast(`Scanned fresh${via}.`, 'ok');
      return;
    }
  }

  // --- Tier 2 didn't exist yet: fall through to Tier 3. (If Tier 2 is ever
  //     explicitly added it goes here.)

  // --- Tier 3 → popup-side self-extract (no SW required).
  //     If Tier 1 won the race but said "SW timeout" we intentionally also
  //     don't show a spinner again for the self-extract path — the user's
  //     button was already marked is-loading for 3.5 s, marking it again
  //     would be redundant flicker. We pass showSpinner via tier.
  const showSpinnerForTier3 = (first && first.tier === 1) ? false : true;
  const tier3 = showSpinnerForTier3
    ? await withLoading(btnScan, () => selfExtractFromPopup(true))
    : await selfExtractFromPopup(false);
  if (tier3?.ok) toast('Scanned via popup-side self-extract.', 'ok');
  else toast(tier3?.error || 'Scan found nothing on active frame trees.', 'warn');
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

// -------- Button wiring ------------------------------------------------
// Per the redesign: ONE Scan button (new consolidated one), individual
// card-level Refresh buttons, ONE Push button, one Auto toggle, one
// Ext-ID click-to-copy footer chip.
btnCcp.addEventListener('click', onClickCcp);
btnSf.addEventListener('click', onClickSf);
if (btnScan) btnScan.addEventListener('click', onClickScan);
btnPush.addEventListener('click', onClickPush);
cbAuto.addEventListener('change', onToggleAuto);
elExtId.addEventListener('click', onCopyExtId);

// -------- Bootstrap: wrap everything in a try/catch so a script crash
// becomes a VISIBLE row on the diagnostic panel + a long toast, instead of
// silently leaving the page at "Loading…" forever (which is what the user
// reported for v0.1.3 on their fmopcjlg instance). --------------
window.addEventListener('error', (e) => {
  const msg = `JS error: ${e.message || String(e.error || '')} (${e.filename || ''}:${e.lineno || ''})`;
  try { toast(msg, 'err'); } catch { /* ignore */ }
  if (elDiag) {
    const row = document.createElement('li');
    row.className = 'warn-row';
    row.innerHTML = `<span class="kv__k">JS crash</span><span class="kv__v" style="word-break:break-all;color:var(--warn)"></span>`;
    row.querySelector('.kv__v').textContent = msg;
    elDiag.insertBefore(row, elDiag.firstChild);
  }
});
async function bootstrap() {
  try {
    paintHeaderNow();
    // Cheap synchronous pre-pop of the diag panel so "Loading…" never
    // remains when boot completes, even if the following storage.get fuses
    // never fire.
    if (elDiag && elDiag.children.length <= 1) {
      const { version, id } = localDiag();
      elDiag.innerHTML = `<li><span class="kv__k">Extension version</span><span class="kv__v"><code>${escHtml(version)}</code></span></li>` +
        `<li><span class="kv__k">Extension ID</span><span class="kv__v"><code>${escHtml(id)}</code></span></li>` +
        `<li class="warn-row"><span class="kv__k">Tip</span><span class="kv__v">If still showing an older version → click ⟳ Reload on the extensions page.</span></li>`;
    }
    // If SW is zombied, refreshState() will: try SW 1.5s + 2.5s → fall back
    // to storage.local fuse 900ms → tabs.query fuse 1.2s → render with
    // locally-computed diag. Total worst case before paint: ~6.1 s. We also
    // manually paint one more time at +750 ms regardless, as belt-and-braces:
    void refreshState(true, 1);
    setTimeout(() => refreshState(true, 0), 750);
    // Bridge / Push Trace panel boot:
    try {
      const btnBridgeRefresh = document.getElementById('btnBridgeRefresh');
      const btnBridgeClear = document.getElementById('btnBridgeClear');
      const elBridgeCount = document.getElementById('bridgeCount');
      const elBridgeSummary = document.getElementById('bridgeSummary');
      const elEvlog = document.getElementById('evlog');
      const elTabsSnap = document.getElementById('tabsSnap');
      const elPlBridge = document.getElementById('plBridge');
      const elPlExternal = document.getElementById('plExternal');
      const elPlHost = document.getElementById('plHost');
      const elAgentBadge = document.getElementById('agentBadge');
      const elExtMgrUrlHint = document.getElementById('extMgrUrlHint');
      const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
      const isEdge = /Edg\//i.test(ua);
      const isChrome = !isEdge && /Chrome\//i.test(ua);
      const extMgrUrl = isEdge ? 'edge://extensions' : 'chrome://extensions';
      const browserLabel = isEdge ? 'Microsoft Edge (Chromium)' : (isChrome ? 'Google Chrome' : 'Chromium-based browser');
      if (elAgentBadge) {
        elAgentBadge.innerHTML = `<strong>${escHtml(browserLabel)}</strong> · extensions at <code>${escHtml(extMgrUrl)}</code>`;
      }
      if (elExtMgrUrlHint) elExtMgrUrlHint.textContent = extMgrUrl;
      // Tab switching
      document.querySelectorAll('.bridge__tab').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tab = btn.getAttribute('data-tab');
          document.querySelectorAll('.bridge__tab').forEach((b) => b.classList.toggle('is-active', b === btn));
          document.querySelectorAll('.bridge__pane').forEach((p) => {
            p.hidden = p.getAttribute('data-pane') !== tab;
          });
        });
      });
      // Open the Event log pane immediately when the details opens (the
      // default HTML hidden on panes still means first paint hides the
      // is-active-linked log pane unless we flip it once).
      document.querySelectorAll('.bridge__tab.is-active').forEach((btn) => {
        const tab = btn.getAttribute('data-tab');
        document.querySelectorAll('.bridge__pane').forEach((p) => {
          if (p.getAttribute('data-pane') === tab) p.hidden = false;
        });
      });

      function formatDetailString(rawDetail) {
        if (typeof rawDetail !== 'string') return escHtml(String(rawDetail ?? ''));
        // The diag log stores either a plain string OR JSON.stringify(details).
        // Try to parse as JSON; if successful, pretty-print as a short
        // object literal so you can read wasSectionFound / error easily.
        try {
          const parsed = JSON.parse(rawDetail);
          if (parsed && typeof parsed === 'object') return `<pre class="djson">${escHtml(JSON.stringify(parsed, null, 2)).replace(/\n/g, '<br/>')}</pre>`;
        } catch { /* fall through to original */ }
        return escHtml(rawDetail);
      }
      // Helper: run an injectability live probe on a tab and update the row.
      async function probeTabOnce(rowRoot, tabId) {
        if (!rowRoot || typeof tabId !== 'number') return;
        const meta = rowRoot.querySelector('.tlist__probeState');
        if (meta) meta.innerHTML = `<span class="bdg bdg--muted">probing…</span>`;
        let r;
        try { r = await chrome.runtime.sendMessage({ type: 'POPUP_DIAG_PROBE_TAB', tabId }); }
        catch (err) {
          if (meta) meta.innerHTML = `<span class="bdg bdg--warn" title="${escHtml(String(err?.message || err))}">🚫 SW unreachable</span>`;
          return;
        }
        if (!r || !r.ok) {
          const reason = r?.reason || 'blocked';
          const reasonLabel = {
            'blocked:host-permissions':  '🚫 BLOCKED (host permissions / matches not loaded → reload extension or grant site access)',
            'blocked:tab-discarded':    '🚫 DISCARDED TAB → focus the tab once first, then retry probe',
            'blocked:tab-gone':         '🚫 TAB GONE',
            'blocked:internal-url':     '🚫 INTERNAL URL (edge:// / chrome://)',
            'blocked:no-listener':      '🚫 No listener (content script not loaded)',
            'blocked':                  '🚫 BLOCKED',
          }[reason] || `🚫 ${escHtml(reason)}`;
          if (meta) {
            meta.innerHTML = `<span class="bdg bdg--warn">${reasonLabel}</span>${r?.error ? `<div class="tlist__probeErr" title="${escHtml(String(r.error))}">${escHtml(String(r.error).slice(0, 240))}</div>` : ''}`;
          }
          return;
        }
        const ok = r?.result?.ok === true;
        const bi = ok && r?.result?.bridgeInjected ? true : false;
        const bv = ok && r?.result?.bridgeVersion ? r.result.bridgeVersion : null;
        const bfp = ok && r?.result?.bridgeFingerprint ? r.result.bridgeFingerprint : null;
        const ready = ok && r?.result?.readyState ? r.result.readyState : null;
        if (meta) {
          meta.innerHTML = `
            <span class="bdg ${ok ? 'bdg--ok' : 'bdg--err'}">Injectable: ${ok ? 'YES' : 'NO'}</span>
            ${ok
                ? `<span class="bdg ${bi ? 'bdg--ok' : 'bdg--muted'}">Bridge: ${bi ? `v${escHtml(String(bv))}` : 'not loaded yet'}</span>`
                : ''}
            ${bfp ? `<div class="tlist__probeMore" title="bridge fingerprint">fp: <code>${escHtml(String(bfp))}</code></div>` : ''}
            ${ready ? `<div class="tlist__probeMore">readyState: ${escHtml(String(ready))}</div>` : ''}
          `;
        }
      }
      async function injectNow(rowRoot, tabId) {
        if (!rowRoot || typeof tabId !== 'number') return;
        const meta = rowRoot.querySelector('.tlist__probeState');
        if (meta) meta.innerHTML = `<span class="bdg bdg--muted">injecting bridge…</span>`;
        let r;
        try { r = await chrome.runtime.sendMessage({ type: 'POPUP_DIAG_INJECT_NOW_TAB', tabId }); }
        catch (err) {
          if (meta) meta.innerHTML = `<span class="bdg bdg--err">Inject failed: ${escHtml(String(err?.message || err).slice(0, 100))}</span>`;
          return;
        }
        if (r?.ok) {
          if (meta) meta.innerHTML = `<span class="bdg bdg--ok">✅ Bridge injected. Wait 2s → re-probe</span>`;
          toast('Bridge injected now on that tab. The ticket app Push button should un-gray within 10s.', 'ok');
          setTimeout(() => probeTabOnce(rowRoot, tabId), 2200);
        } else {
          if (meta) meta.innerHTML = `<span class="bdg bdg--err" title="${escHtml(String(r?.error || ''))}">Inject failed. ${escHtml(String(r?.error || '').slice(0, 140))}</span>`;
        }
      }
      // Wire up delegated button clicks (rows are recreated on every refresh).
      elTabsSnap?.addEventListener?.('click', (ev) => {
        const target = ev.target instanceof HTMLElement ? ev.target.closest('button[data-action]') : null;
        if (!target || !(target instanceof HTMLButtonElement)) return;
        const tabId = Number(target.getAttribute('data-tabid'));
        if (!Number.isFinite(tabId)) return;
        const row = target.closest('[data-rowid]');
        const action = target.getAttribute('data-action');
        if (action === 'probe') void probeTabOnce(row, tabId);
        else if (action === 'inject') void injectNow(row, tabId);
      });
      async function refreshBridgePanel() {
        if (!chrome.runtime?.sendMessage) return;
        let r;
        try { r = await chrome.runtime.sendMessage({ type: 'POPUP_DIAG_QUERY_LOG' }); }
        catch (err) {
          if (elBridgeSummary) elBridgeSummary.innerHTML = `<span class="pane__hint" style="color:var(--err)"><strong>Service worker not reachable</strong> (${escHtml(String(err?.message || err))}). Click Scan Salesforce &amp; CCP once (wakes SW via scripting.executeScript), then Refresh.</span>`;
          return;
        }
        if (!r || !r.ok) {
          if (elBridgeSummary) elBridgeSummary.textContent = `Failed to read log: ${String(r?.error || 'unknown error')}`;
          return;
        }
        const entries = Array.isArray(r.entries) ? r.entries : [];
        if (elBridgeCount) elBridgeCount.textContent = String(entries.length);
        const counts = Object.create(null);
        entries.forEach((e) => { counts[e.cat] = (counts[e.cat] || 0) + 1; });
        const handshakeCount = entries.filter((e) => String(e.cat).startsWith('bridge:')).length;
        const extInCount = entries.filter((e) => String(e.cat) === 'external:in').length;
        const pushOk = entries.filter((e) => String(e.cat) === 'push:ok').length;
        const sfApplyOk = entries.filter((e) => String(e.cat) === 'sf:apply:ok').length;
        const sfApplyNonOk = entries.filter((e) => String(e.cat) === 'sf:apply:nonOk' || String(e.cat) === 'sf:apply:error' || String(e.cat) === 'sf:apply:throw').length;
        if (elBridgeSummary) {
          elBridgeSummary.innerHTML = `
            <div class="summ__grid">
              <div class="summ__k"><span class="dot dot--ok"></span> Extension manifest version</div>
              <div class="summ__v"><code>${escHtml(String(r.manifestVersion ?? ''))}</code></div>
              <div class="summ__k">Bridge events (boot, probes, handshakes)</div>
              <div class="summ__v">${handshakeCount}</div>
              <div class="summ__k">External (Ticket Notes app) API calls received</div>
              <div class="summ__v">${extInCount}</div>
              <div class="summ__k">Popup pushes to Ticket Notes (ack OK)</div>
              <div class="summ__v">${pushOk}</div>
              <div class="summ__k">Salesforce Case field writes OK / non-OK</div>
              <div class="summ__v">${sfApplyOk} / <span style="color:${sfApplyNonOk > 0 ? 'var(--err)' : 'inherit'}">${sfApplyNonOk}</span></div>
              <div class="summ__k">Category counts (top)</div>
              <div class="summ__v">${Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `<code>${escHtml(k)}</code> × ${v}`).join(' · ') || '(none)'}</div>
            </div>
          `;
        }
        if (elEvlog) {
          if (entries.length === 0) {
            elEvlog.innerHTML = '<li class="empty">Log empty. Try: Probe in the Ticket Notes app Diagnostics panel, then Refresh here. Or click Scan or Push and then Refresh.</li>';
          } else {
            elEvlog.innerHTML = entries.slice(0, 100).map((e) => {
              const cat = String(e.cat || '');
              const isWarn = cat.includes('error') || cat.includes('nonOk') || cat.includes('throw') || cat.includes('unknown') || cat.includes('no_reply');
              const isOk = cat.includes(':ok') || cat.includes('start') || cat.includes(':trace') || cat.includes('boot') || cat.includes('received');
              const cls = isWarn ? 'is-warn' : (isOk ? 'is-ok' : '');
              return `<li class="${cls}">
                <div class="ev__hd">
                  <span class="ev__ts">${escHtml(new Date(e.ts).toLocaleTimeString())}</span>
                  <span class="ev__cat ${cls ? '' : ''}"><code>${escHtml(cat)}</code></span>
                </div>
                <div class="ev__detail">${formatDetailString(e.detail)}</div>
              </li>`;
            }).join('');
          }
        }
        if (elTabsSnap) {
          // (a) Ticket Notes tabs: render per-row Injectable state + 🔬 probe
          // and 🚀 inject-now buttons. On subsequent refreshes we preserve
          // probe results on rows that haven't changed by storing them in a
          // WeakMap.
          const ticketGroupHtml = (() => {
            const arr = r.ticketAppTabs;
            if (!arr || arr.length === 0) return `<h4 class="shead">Ticket Notes tabs</h4><div class="empty">No ticket notes tabs open. Open note-master-roan.vercel.app or localhost first.</div>`;
            return `<h4 class="shead">Ticket Notes tabs · ${arr.length}</h4>
              <ul class="tlist tlist--withProbe">${arr.map((t) => `
                <li data-rowid="tkt-${Number(t.id)}">
                  <div class="tlist__rowTop">
                    <div class="tlist__titleWrap">
                      <div class="tlist__title"><a href="${escHtml(t.url || '#')}" target="_blank" rel="noreferrer">${escHtml(String(t.title || t.url || '(no title)'))}${t.active ? ' <span class="bdg bdg--muted">active</span>' : ''}</a></div>
                      <div class="tlist__meta">${t.status || '?'}${t.discarded ? ' · <strong style="color:var(--warn)">discarded (content scripts will NOT load until activated)</strong>' : ''} · tab id ${t.id}</div>
                      <div class="tlist__url">${escHtml(String(t.url || ''))}</div>
                    </div>
                    <div class="tlist__actions">
                      <button type="button" class="btn btn-ghost btn--sm" data-action="probe" data-tabid="${Number(t.id)}" title="Run a live scripting.executeScript probe and return bridgeInjected / version.">🔬 Injectable?</button>
                      <button type="button" class="btn btn-ghost btn--sm" data-action="inject" data-tabid="${Number(t.id)}" title="Force-inject bridge.js via scripting.executeScript right now — bypasses the cached document_start registration that browsers sometimes hold after manifest edits.">🚀 Inject bridge now</button>
                    </div>
                  </div>
                  <div class="tlist__probeState"><span class="bdg bdg--muted">Not yet probed. Click 🔬 Injectable?</span></div>
                </li>`).join('')}</ul>`;
          })();
          const simpleGroup = (arr, title, emptyMsg) => {
            if (!arr || arr.length === 0) return `<h4 class="shead">${escHtml(title)}</h4><div class="empty">${escHtml(emptyMsg)}</div>`;
            return `<h4 class="shead">${escHtml(title)} · ${arr.length}</h4>
              <ul class="tlist">${arr.map((t) => `
                <li>
                  <div class="tlist__title"><a href="${escHtml(t.url || '#')}" target="_blank" rel="noreferrer">${escHtml(String(t.title || t.url || '(no title)'))}${t.active ? ' <span class="bdg bdg--muted">active</span>' : ''}</a></div>
                  <div class="tlist__meta">${t.status || '?'}${t.discarded ? ' · discarded (content scripts will NOT load until activated)' : ''} · tab id ${t.id}</div>
                  <div class="tlist__url">${escHtml(String(t.url || ''))}</div>
                </li>`).join('')}</ul>`;
          };
          elTabsSnap.innerHTML = [
            ticketGroupHtml,
            simpleGroup(r.salesforceTabs, 'Salesforce / Lightning tabs', 'No SF tabs open (patterns: *.lightning.force.com / *.salesforce.com / *.my.salesforce.com).'),
            simpleGroup(r.ccpTabs, 'CCP / Phone Panel tabs', 'No CCP panel tabs open. Extension uses broad URL patterns; your SF Console-embedded phone panel may appear under Salesforce tabs instead.'),
          ].join('');
        }
        if (elPlHost) {
          const host = (Array.isArray(r.manifestHostPermissions) ? r.manifestHostPermissions : []).slice();
          const opt = Array.isArray(r.manifestOptionalHostPermissions) ? r.manifestOptionalHostPermissions : [];
          if (host.length === 0 && opt.length === 0) elPlHost.innerHTML = '<li class="empty">Empty — scripting.executeScript injection via live probe will be blocked everywhere.</li>';
          else elPlHost.innerHTML = host.map((p) => `<li><code>${escHtml(String(p))}</code> <span class="bdg bdg--muted" style="margin-left:6px">host</span></li>`).concat(
            opt.map((p) => `<li><code>${escHtml(String(p))}</code> <span class="bdg bdg--muted" style="margin-left:6px">optional</span></li>`)
          ).join('');
        }
        if (elPlBridge) elPlBridge.innerHTML = (Array.isArray(r.manifestBridgePatterns) && r.manifestBridgePatterns.length > 0)
          ? r.manifestBridgePatterns.map((p) => `<li><code>${escHtml(String(p))}</code></li>`).join('')
          : '<li class="empty">Empty — bridge content script has no matches. The browser will never inject bridge.js anywhere via document_start content-script registration (Inject bridge now still works if host_permissions cover the URL).</li>';
        if (elPlExternal) elPlExternal.innerHTML = (Array.isArray(r.manifestExternalPatterns) && r.manifestExternalPatterns.length > 0)
          ? r.manifestExternalPatterns.map((p) => `<li><code>${escHtml(String(p))}</code></li>`).join('')
          : '<li class="empty">Empty — no externally_connectable matches. chrome.runtime.sendMessage(EXT_ID) from any origin is blocked.</li>';
      }
      btnBridgeRefresh?.addEventListener('click', () => {
        void refreshBridgePanel();
      });
      btnBridgeClear?.addEventListener('click', async () => {
        try { await chrome.runtime.sendMessage({ type: 'POPUP_DIAG_CLEAR' }); }
        catch (err) { toast('Service worker not reachable for clear: ' + String(err?.message || err), 'err'); }
        await refreshBridgePanel();
        toast('Bridge log cleared. Next probe/push/scan will log into a fresh log.', 'ok');
      });
      // Auto-open Bridge details when the Bootstrap header button is clicked
      // is optional; instead just refresh once on boot and every 7s.
      void refreshBridgePanel();
      setInterval(() => refreshBridgePanel(), 7000);
    } catch (panelBootErr) {
      toast('Bridge panel failed to wire up: ' + String(panelBootErr?.message || panelBootErr), 'err');
    }
  } catch (bootErr) {
    try { toast(`Boot error: ${String(bootErr?.message || bootErr)}`, 'err'); } catch { /* ignore */ }
    if (elDiag) {
      const row = document.createElement('li');
      row.className = 'warn-row';
      row.innerHTML = `<span class="kv__k">Boot crash</span><span class="kv__v" style="color:var(--warn)"></span>`;
      row.querySelector('.kv__v').textContent = String(bootErr?.message || bootErr);
      elDiag.insertBefore(row, elDiag.firstChild);
    }
  }
}
// Initial paint, then refresh every 5s.
setInterval(() => refreshState(true), 5000);
void bootstrap();
