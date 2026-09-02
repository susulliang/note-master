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
const btnSelfExtract = document.getElementById('btnSelfExtract');
const cbAuto = $('#cbAuto');

const elToast = $('#toast');

let lastSeen = { ccp: null, sf: null };

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
    caseNumber:/^(Case\s*Number|Case\s*#?)$/i,caseOwner:/^Case\s*Owner$/i,status:/^Status$/i,
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
  const acc={};
  const txt=(typeof document!=='undefined'&&document.body&&(document.body.innerText||document.body.textContent||''))||'';
  const cn=txt.match(/(?:^|\n)\s*(\d{7,8})\s*\|\s*Case\b/);if(cn)assignOnce(acc,'caseNumber',cn[1]);
  const sfids=[...(txt.matchAll(/\b500[a-zA-Z0-9]{12,15}\b/g)||[])].map(x=>x[0]);if(sfids[0])assignOnce(acc,'salesforceId',sfids[0]);
  const caller=txt.match(/Caller\s*(\+?[\d\- \.\(\)]{6,})/);if(caller)assignOnce(acc,'contactNumber',caller[1]);
  const subj=txt.match(/^Subject\s*\n\s*([^\n]+)/m);if(subj)assignOnce(acc,'issueTitle',subj[1]);
  const adi=txt.match(/App\s*Device\s*Info\s*\n([\s\S]*?)(?:\n\s*Case\s*Number\b|\n\s*\d{7,8}\s*\|\s*Case\b|$)/i);
  if(adi)for(const l of lines(adi[1])){const i=l.indexOf(':');if(i===-1)continue;const k=l.slice(0,i).trim(),v=l.slice(i+1).trim();if(k==='appVersion')assignOnce(acc,'appVersion',v);else if(k==='model')assignOnce(acc,'phoneModel',v);else if(k==='systemVersion')assignOnce(acc,'osVersion',v);else if(k==='deviceTypeName')assignOnce(acc,'deviceTypeName',v);else if(k==='marketName')assignOnce(acc,'marketName',v);else if(k==='deviceType')assignOnce(acc,'deviceType',v);}
  const cls=[];let cm;const classRe=/Issue\s*Type(\d+)\s*(Primary|Second)\s*Classification\s*\n\s*([^\n]+)/gi;
  while((cm=classRe.exec(txt))!==null)cls.push({n:cm[1],kind:cm[2].toLowerCase()==='primary'?'L1':'L2',value:clean(cm[3])});
  if(cls.length){const parts=cls.filter(c=>c.value).sort((a,b)=>a.n.localeCompare(b.n)||(a.kind==='L1'?-1:1)).map(c=>c.value);if(parts.length)assignOnce(acc,'issueType',parts.join(' · '));for(const c of cls){if(c.n==='1')assignOnce(acc,c.kind==='L1'?'issueType1L1':'issueType1L2',c.value);else if(c.n==='2')assignOnce(acc,c.kind==='L1'?'issueType2L1':'issueType2L2',c.value);else if(c.n==='3')assignOnce(acc,c.kind==='L1'?'issueType3L1':'issueType3L2',c.value);}}
  if(!acc.email){const m=txt.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/);if(m)assignOnce(acc,'email',m[0]);}
  const tp=txt.match(/First\s*Pending\s*Timestamp\s*\n\s*([^\n]+)/);if(tp)assignOnce(acc,'firstPendingTs',tp[1]);
  const tp2=txt.match(/Last\s*Pending\s*Timestamp\s*\n\s*([^\n]+)/);if(tp2)assignOnce(acc,'lastPendingTs',tp2[1]);
  const ai=txt.match(/AI\s*Agent\s*\n([\s\S]*?)(?:\n\s*Summary\b|\n\s*Related\s*Files\b|$)/i);if(ai&&clean(ai[1]))assignOnce(acc,'aiAgentNote',clean(ai[1]));
  if(typeof document!=='undefined'&&document.querySelectorAll){
    const cells=document.querySelectorAll('div[class*="slds"],div[class*="cell"],li[class*="slds"],section,article');
    for(const cell of cells){const ls=lines(cell.innerText||cell.textContent||'');if(ls.length<2||ls.length>30)continue;for(let i=0;i<ls.length-1;i+=1){const km=matchAlias(ls[i]);if(!km)continue;const nx=ls[i+1];if(isLabel(nx)&&matchAlias(nx))continue;assignOnce(acc,km,nx);i+=1;}}
    const sts=['Account Details','Contact Details','App Device Info','Details','Case Details'];
    for(const title of sts){const nodes=document.querySelectorAll('h1,h2,h3,h4,h5,h6,span,div,p,b,strong,th,label');for(const heading of nodes){const t=clean(heading.textContent||heading.innerText||'');if(!t||t.toLowerCase()!==title.toLowerCase())continue;let c=heading.parentElement;for(let d=0;d<5&&c;d+=1){if((c.innerText||'').split(/\n/).length>6)break;c=c.parentElement;}if(!c)continue;const sls=lines(c.innerText||'');for(let i=0;i<sls.length-1;i+=1){const key=matchAlias(sls[i]);if(!key)continue;const val=sls[i+1];if(isLabel(val)&&matchAlias(val))continue;assignOnce(acc,key,val);}}}
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
    try{const w=(typeof window!=='undefined'?window:{});if(w.connect&&w.connect.contact&&w.connect.contact.getAttributes){const attrs=w.connect.contact.getAttributes()||{};for(const [k,v] of Object.entries(attrs)){const val=v&&(v.value!=null?v.value:v);const lk=String(k).toLowerCase();if(lk.includes('phone')||lk==='phonenumber'||lk.includes('number'))a('contactNumber',val);else if(lk==='customername'||lk==='name')a('customerName',val);else if(lk==='caseid'||lk==='ticket')a('caseNumber',val);else if(lk==='email')a('emailAddress',val);else a(k,val);}}}catch{/*noop*/}
  }catch{/*noop*/}return acc;
};

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
  // Race: first try the POPUP_SCRAPE_ACTIVE flow via background (which in
  // v0.1.3 already has its own 3-tier). If background still hasn't replied
  // within 3.5s, ABANDON it and run POPUP-SIDE self extraction. The user
  // currently has a zombied fmopcjlg SW that never responds to messages,
  // so this race guarantee means Force-scan will ALWAYS yield something
  // (either via background or via popup) in < 6 seconds, never "Nothing".
  const swPromise = withLoading(btnScanCurrent, async () => {
    const r = await sendWithTimeout({ type: 'POPUP_SCRAPE_ACTIVE' }, 12000);
    return { source: 'background', result: r };
  });
  const fusePromise = new Promise((resolve) => setTimeout(() => resolve({ source: 'fuse' }), 3500));
  const first = await Promise.race([swPromise, fusePromise]);
  if (first && first.source === 'background' && first.result?.ok) {
    await refreshState(true);
    toast('Scanned via background service worker.', 'ok');
    return;
  }
  // SW too slow OR timed out / not ok → fall through to self-extract.
  const self = await (first.source === 'fuse'
    ? withLoading(btnScanCurrent, () => selfExtractFromPopup(true))
    : selfExtractFromPopup(false));
  if (self.ok) toast('Scanned via popup-side self-extract (no SW needed).', 'ok');
  else toast(self.error || 'Scan found nothing. See rows inside capture cards.', 'warn');
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
  if (sfData) snapshot.sf = {
    capturedAt: nowStr, url: activeTabUrl, title: activeTabTitle, tabId: activeTabId,
    data: sfData, diagnostic: { via: 'popup-self-extract', framesExtracted: framesSf, bestFrameFieldCount: Object.keys(sfData).length },
  };
  if (ccpData) snapshot.ccp = {
    capturedAt: nowStr, url: activeTabUrl, title: activeTabTitle, tabId: activeTabId,
    data: ccpData, embedded: !!sfData,
    diagnostic: { via: 'popup-self-extract', framesExtracted: framesCcp, bestFrameFieldCount: Object.keys(ccpData).length },
  };
  if (snapshot.sf && snapshot.ccp) snapshot.sf.ccpEmbedded = true;

  // Persist to storage so popup shows it across reopens AND so background
  // (if ever revived) picks up the same snapshot on next boot.
  try {
    await chrome.storage.local.set({ [STATE_KEY]: snapshot, 'nm-extension-state-v1': snapshot });
  } catch { /* ignore */ }

  renderCapture('ccp', snapshot.ccp, elCcpKv, elCcpMeta, elCcpDot, sfData ? { openMatch: true, lastError: ccpErr || null } : { lastError: ccpErr || null });
  renderCapture('sf', snapshot.sf, elSfKv, elSfMeta, elSfDot, sfData ? { openMatch: true, lastError: sfErr || null } : { lastError: sfErr || null });
  updateBadge(snapshot);

  if ((sfData && Object.keys(sfData).length) || (ccpData && Object.keys(ccpData).length)) {
    return { ok: true, sfData, ccpData };
  }
  return {
    ok: false,
    error: `Self-extract ran ${framesSf + framesCcp} frame(s), but matched zero fields. SF lastError: ${sfErr || 'n/a'}. CCP lastError: ${ccpErr || 'n/a'}.`,
  };
}

async function onClickSelfExtract() {
  const r = await withLoading(btnSelfExtract, () => selfExtractFromPopup(true));
  if (r?.ok) toast('Self-extract completed → green cards above.', 'ok');
  else toast(r?.error || 'Self-extract found nothing on active frame trees.', 'warn');
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
if (btnSelfExtract) btnSelfExtract.addEventListener('click', onClickSelfExtract);
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
