/**
 * content.js — generic CCP (Contact Center) DOM scraper.
 *
 * Runs on every tab whose URL matches a softphone / CCaaS domain
 * (Amazon Connect CCP, Five9, Genesys Cloud, Zendesk Agent Workspace,
 * Talkdesk, Freshdesk). Nothing is uploaded — extracted fields are sent
 * to the extension background via chrome.runtime.sendMessage, which the
 * background then forwards to the Ticket Notes page.
 *
 * Scraping strategy: it walks THREE tiers so most customers' unbranded /
 * lightly skinned CCPs still work:
 *
 *   1. LABELLED INPUT FIELDS — find any <input>/<textarea>/<select> whose
 *      visible <label> text, aria-label, or placeholder matches one of the
 *      known keywords (customer name, phone, email, serial, case id, etc.).
 *      This is the broadest tier; it catches 90% of Lightning / CCP hybrid
 *      forms without knowing their data-testids ahead of time.
 *
 *   2. ARIA-LABELLED ICONS / STATIC TEXT: for platforms like Amazon Connect
 *      CCP that render customer contact info as <p>/<span>/<div> text next
 *      to a Person / Phone icon — look for static values that match the
 *      regex shapes of a phone / email / serial / SKU / case id, then pair
 *      them with the nearest preceding label phrase.
 *
 *   3. KNOWN DATA-* / CLASS TOKENS of a few popular CCPs — Amazon Connect
 *      (ccp-*), Five9 (agentWorkspace-*), Genesys (cx-*), Zendesk (zd-*).
 *
 * Everything is best-effort: missing fields just stay absent, and the
 * Ticket Notes page's LLM/regex engines take over the remaining blanks.
 */

(function () {
  if (window.__NM_CCP_SCRAPER_INSTALLED__) return;
  window.__NM_CCP_SCRAPER_INSTALLED__ = true;

  const LABEL_PATTERNS = [
    { field: 'customerName',    re: /(customer|contact|client|caller|customer\s*name|full\s*name|first\s*name|last\s*name)/i },
    { field: 'firstName',       re: /first\s*name|given\s*name/i },
    { field: 'lastName',        re: /last\s*name|surname|family\s*name/i },
    { field: 'contactNumber',   re: /(phone|contact|telephone|mobile|cell|caller\s*(id|number)|cli|ani|dialed\s*number|dnis|direct|callback)/i },
    { field: 'emailAddress',    re: /(email|e-mail|e\s*mail|customer\s*email|contact\s*email)/i },
    { field: 'shippingAddress', re: /(address|shipping|street|billing|postal|zip|city|state|country)/i },
    { field: 'serialNumber',    re: /(serial\s*number|s\/?n|product\s*serial)/i },
    { field: 'skuNumber',       re: /(sku|stock\s*keeping|part\s*number|product\s*code)/i },
    { field: 'deebotModel',     re: /(model|product|device|robot|machine|item)\s*(name|number|type|id)?$/i },
    { field: 'purchaseInfo',    re: /(purchase|order|channel|retailer|store|warranty|date\s*of\s*purchase|date\s*sold)/i },
    { field: 'issueType',       re: /(reason|issue|subject|problem|case\s*type|ticket\s*type|category|queue)/i },
    { field: 'issueTitle',      re: /(case\s*title|ticket\s*title|subject|summary|inquiry)/i },
    { field: 'caseNumber',      re: /(case\s*(id|number|#)|ticket\s*(id|number|#)|incident\s*id|interaction\s*id|contact\s*id)/i },
  ];

  const PHONE_RE = /(?:\+?\d[\d\s\-().]{7,}\d)|(?:\(\d{3}\)\s*\d{3}[\- ]?\d{4})/;
  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  const SF_ID_RE = /\b[0-9A-Za-z]{15,18}\b/;
  const SERIAL_RE = /\b(?:[A-Za-z]{2,}[\- ]?[A-Za-z0-9]{4,}|[0-9]{8,})\b/;
  const CASE_TAG_RE = /\b(?:case|ticket|incident)\s*#?\s*([A-Za-z0-9\-]{6,})\b/i;

  // -------------------------------------------------------------------------
  //  Scrapers
  // -------------------------------------------------------------------------

  function visible(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.hidden) return false;
    const style = globalThis.getComputedStyle(el);
    if (!style) return false;
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    return true;
  }

  function allInputs(root) {
    return Array.from((root || document).querySelectorAll('input, textarea, select'))
      .filter((el) => visible(el) && !el.disabled);
  }

  function closestLabel(el) {
    const id = el.id;
    if (id) {
      const labelDoc = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (labelDoc && visible(labelDoc)) return labelDoc.textContent.trim();
    }
    const p = el.closest('label');
    if (p && visible(p)) return p.textContent.trim();
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.trim();
    const labelled = el.getAttribute('aria-labelledby');
    if (labelled) {
      const parts = labelled.split(/\s+/).map((lid) => document.getElementById(lid)?.textContent?.trim()).filter(Boolean);
      if (parts.length) return parts.join(' ');
    }
    const ph = el.getAttribute('placeholder');
    if (ph) return ph.trim();
    // Walk up 3 levels of siblings to find a label-like <span>/<div> above.
    let node = el;
    for (let i = 0; i < 3 && node && node !== document.body; i += 1) {
      node = node.previousElementSibling || node.parentElement;
      if (!node) break;
      if (node.matches('label, span, div, p, h1, h2, h3, h4, h5, h6, legend, th, td')) {
        const t = node.textContent.trim();
        if (t && t.length < 80) return t;
      }
    }
    return '';
  }

  function matchField(label) {
    if (!label) return null;
    for (const p of LABEL_PATTERNS) {
      if (p.re.test(label)) return p.field;
    }
    return null;
  }

  function readInputValue(el) {
    if (!el) return '';
    if (el.tagName === 'SELECT') return el.options[el.selectedIndex]?.text ?? '';
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? (el.value || 'checked') : '';
    return el.value || '';
  }

  function scrapeInputs(acc) {
    for (const el of allInputs(document)) {
      const label = closestLabel(el);
      const field = matchField(label);
      if (!field) continue;
      const value = readInputValue(el);
      if (!value) continue;
      if (!acc[field]) acc[field] = value.trim();
    }
    return acc;
  }

  /** Amazon Connect CCP specifics — customer info panel, queue, contact ID. */
  function scrapeAmazonConnectSpecific(acc) {
    // The official Connect Streams API exposes agent contact details on
    // window.connect.agent if it's loaded. Prefer it because it's not DOM-
    // skin dependent and never breaks when AWS re-themes the CCP.
    try {
      const c = window.connect?.agent?.getContacts?.();
      const activeContact = Array.isArray(c)
        ? (c.find((x) => x?.getType?.() === 'voice') || c[0])
        : null;
      if (activeContact) {
        const attrs = activeContact.getAttributes?.() || {};
        const initial = activeContact.getInitialContactId?.();
        if (initial && !acc.caseNumber) acc.caseNumber = initial;
        const ani = activeContact.getInitialContactInfo?.()?.customerEndpoint?.address
          || activeContact.getConnection?.()?.getAddress?.();
        if (ani && !acc.contactNumber) acc.contactNumber = ani;
        const queue = activeContact.getQueue?.()?.name;
        if (queue && !acc.issueType) acc.issueType = queue;
        for (const [k, v] of Object.entries(attrs || {})) {
          const vv = String(v?.value ?? v ?? '').trim();
          if (!vv) continue;
          const key = k.toLowerCase();
          if (!acc.customerName && /(name|customer|caller)/.test(key)) acc.customerName = vv;
          if (!acc.emailAddress && /email/.test(key)) acc.emailAddress = vv;
          if (!acc.shippingAddress && /address/.test(key)) acc.shippingAddress = vv;
          if (!acc.serialNumber && /(serial|^sn$)/i.test(key)) acc.serialNumber = vv;
          if (!acc.deebotModel && /(model|robot|product|sku|part)/.test(key)) acc.deebotModel = vv;
          if (!acc.caseNumber && /(case|ticket|order)/i.test(key)) acc.caseNumber = vv;
        }
      }
    } catch { /* Streams API not injected yet — fall back to DOM */ }

    // DOM fallback: the CCP v2 customer info pane usually renders contact
    // details as structured divs with data-testid "customer.*" or class
    // "ccp-Contact". Customer name is a heading; phone/email sit next to
    // the Phone / Email icon labels.
    if (!acc.customerName) {
      const nameH = document.querySelector('[data-testid*="customerName"], [data-testid*="customer-name"], .ccp-ContactName, .customer-name, span[title*="@"] + strong, h3.ccp-Header');
      if (nameH?.textContent?.trim()) acc.customerName = nameH.textContent.trim();
    }
    return acc;
  }

  /** Zendesk / Freshdesk / Genesys ticket panes — fallback heuristics. */
  function scrapeStaticTextHeuristics(acc) {
    // Whole-document-text regex sweeps; anchored to label text when possible.
    const docText = document.body.innerText || '';
    if (!acc.contactNumber) {
      const m = docText.match(PHONE_RE);
      if (m) acc.contactNumber = m[0].trim();
    }
    if (!acc.emailAddress) {
      const m = docText.match(EMAIL_RE);
      if (m) acc.emailAddress = m[0].trim();
    }
    if (!acc.caseNumber) {
      const m = docText.match(CASE_TAG_RE);
      if (m) acc.caseNumber = m[1];
      else {
        const sf = [...docText.matchAll(new RegExp(SF_ID_RE, 'g'))]
          .map((x) => x[0])
          .filter((x) => /^[a-zA-Z0-9]{15,18}$/.test(x));
        if (sf.length) acc.caseNumber = sf[0];
      }
    }
    if (!acc.serialNumber) {
      const m = [...docText.matchAll(new RegExp(SERIAL_RE, 'g'))]
        .map((x) => x[0])
        .filter((x) => !/^\d{8,}$/.test(x) || x.length >= 10)
        .slice(0, 3);
      if (m.length) acc.serialNumber = m[0];
    }
    return acc;
  }

  function scrapeNow() {
    const acc = {};
    scrapeInputs(acc);
    scrapeAmazonConnectSpecific(acc);
    scrapeStaticTextHeuristics(acc);

    // Merge first/last → customerName when the aggregate is missing.
    if (!acc.customerName && (acc.firstName || acc.lastName)) {
      acc.customerName = [acc.firstName, acc.lastName].filter(Boolean).join(' ').trim();
    }
    // Cleanup: strip excess whitespace.
    for (const k of Object.keys(acc)) {
      if (typeof acc[k] === 'string') acc[k] = acc[k].replace(/\s+/g, ' ').trim();
    }
    return acc;
  }

  // Expose to background's runtime messages.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'SCRAPE_CCP') return false;
    try {
      const data = scrapeNow();
      sendResponse({ ok: true, data, url: location.href });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  });

  // Auto-report on SPA page transitions (many CCPs don't reload): if the
  // customer info swaps during a warm transfer, re-report.
  let lastHash = '';
  function hashObj(obj) {
    try { return JSON.stringify(obj); } catch { return ''; }
  }
  function reportIfChanged() {
    try {
      const data = scrapeNow();
      const h = hashObj(data);
      if (!h || h === lastHash) return;
      lastHash = h;
      chrome.runtime.sendMessage({ type: 'CCP_SCRAPED', data, url: location.href, title: document.title })
        .catch(() => {/* SW was asleep; next scrape will resend */});
    } catch { /* ignore */ }
  }
  // First shot ~1.5s after load (let the CCP render customer info), then
  // every 15s, plus any time the URL hash or title changes.
  setTimeout(reportIfChanged, 1500);
  setInterval(reportIfChanged, 15_000);
  window.addEventListener('hashchange', reportIfChanged);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setTimeout(reportIfChanged, 500);
  });
})();
