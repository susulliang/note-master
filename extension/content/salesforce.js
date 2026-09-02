/**
 * salesforce.js — DOM scraper for the Salesforce Console / Lightning Case /
 * Contact tab. Runs on *.lightning.force.com and the other SF host patterns
 * listed in manifest.content_scripts.
 *
 * Two tiers of field extraction:
 *   1. LABELLED LIGHTNING INPUTS — walk every lightning-input /
 *      lightning-textarea / lightning-combobox / <records-record-layout-item>,
 *      reading the paired <label> (Lightning renders it either with
 *      class="slds-form-element__label" or a data-render-label attribute).
 *      Most Case layout fields ship this way out-of-the-box.
 *   2. STATIC VISUALFORCE TEXT — on Console layouts that render the Case as
 *      a Visualforce iframe, the scraper reads the left-hand label column
 *      (td.slds-page-header__detail-block-label, detailList pairs, etc.)
 *
 * Field names are intentionally mapped onto the same flat shape that the
 * CCP scraper and the web-app's regex engines produce: customerName,
 * contactNumber, emailAddress, shippingAddress, serialNumber, skuNumber,
 * deebotModel, purchaseInfo, issueType, issueTitle, detailedIssue,
 * resolutionSummary, caseNumber, caseOwner.
 */

(function () {
  if (window.__NM_SF_SCRAPER_INSTALLED__) return;
  window.__NM_SF_SCRAPER_INSTALLED__ = true;

  const FIELD_ALIASES = {
    customerName:    [/^(contact\s*)?name|account\s*name|customer|contact\s*full\s*name|first\s*name|last\s*name/i, /(person|client)\s*name/i],
    firstName:       [/^first\s*name|given\s*name/i],
    lastName:        [/^last\s*name|surname|family\s*name/i],
    contactNumber:   [/phone|phone\s*number|mobile|cell|direct|work\s*phone|home\s*phone|contact\s*(phone|number)|callback\s*phone/i],
    emailAddress:    [/email|e-?mail/i],
    shippingAddress: [/^address|shipping\s*address|street|mailing\s*address|city|state|zip|postal\s*code|country/i],
    serialNumber:    [/serial\s*(no\.?|number)|s\/?n|product\s*serial/i],
    skuNumber:       [/sku|stock\s*keeping|part\s*(no\.?|number)|product\s*code/i],
    deebotModel:     [/model|product(?!\s*(family|group))|robot\s*model|device\s*model|machine\s*model|item|deebot\s*model|goat\s*model|winbot\s*model/i],
    purchaseInfo:    [/purchase\s*date|date\s*(of|sold|purchased)|purchase\s*channel|retailer|where\s*purchased|warranty\s*start|order\s*date|store/i],
    issueType:       [/type|case\s*type|ticket\s*type|reason|category|queue|origin|priority|issue\s*classification/i],
    issueTitle:      [/subject|case\s*subject|title|summary|inquiry/i],
    detailedIssue:   [/description|case\s*description|details|customer\s*description|problem\s*description|issue\s*details/i],
    resolutionSummary: [/resolution|case\s*resolution|workaround|fix\s*applied|resolution\s*summary/i],
    caseNumber:      [/case\s*(number|id|#)|ticket\s*(number|id)|case\s*number|incident\s*id/i],
    caseOwner:       [/owner|case\s*owner|assigned\s*(to|agent)/i],
    caseStatus:      [/status|case\s*status/i],
    accountName:     [/^account\s*name|account$/i],
  };

  const CASE_NUMBER_HARD_RE = /\b(?:CASE|CAS|INC|TKT)?-?\d{8,}\b|\b[0-9A-Z]{3}-[0-9]{4,8}\b/i;
  const SF_ID_RE = /\b[0-9A-Za-z]{15,18}\b/;

  // -------------------------------------------------------------------------
  //  Utilities
  // -------------------------------------------------------------------------

  function visible(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.hidden) return false;
    const style = globalThis.getComputedStyle?.(el);
    if (!style) return true;
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
    const r = el.getBoundingClientRect?.();
    if (r && (r.width < 2 || r.height < 2)) return false;
    return true;
  }

  function clean(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
  }

  function findFieldForLabel(raw) {
    const label = clean(raw);
    if (!label) return null;
    for (const [field, patterns] of Object.entries(FIELD_ALIASES)) {
      for (const re of patterns) if (re.test(label)) return field;
    }
    return null;
  }

  /** Given a label element, find the paired "value" element. Walks the
   *  nearest Lightning form-group / flex row / detail row. */
  function findValueNear(labelEl) {
    // 1. Classic <label for="id"> → #id's value.
    const forAttr = labelEl.getAttribute && labelEl.getAttribute('for');
    if (forAttr) {
      const tgt = document.getElementById(forAttr);
      if (tgt) {
        const v = readElementValue(tgt);
        if (v) return v;
      }
    }
    // 2. Walk a short distance sideways / descend from shared parent — the
    //    usual Lightning "slds-form-element" row: label + slds-form-element__control.
    let cursor = labelEl;
    for (let i = 0; i < 5 && cursor; i += 1) {
      const sibs = cursor.parentElement?.children;
      if (sibs) {
        const labelIndex = Array.prototype.indexOf.call(sibs, cursor);
        for (let j = labelIndex + 1; j < sibs.length; j += 1) {
          const val = readElementValue(sibs[j]);
          if (val) return val;
        }
      }
      const val = readElementValue(cursor.nextElementSibling);
      if (val) return val;
      cursor = cursor.parentElement;
    }
    return '';
  }

  function readElementValue(el) {
    if (!el) return '';
    if (!visible(el)) {
      // Exception: hidden <input> / <select> mirroring a Lightning combobox —
      // its sibling <button> renders the current value.
    }
    const tag = el.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return clean(el.value || '');
    if (tag === 'select') {
      const opts = Array.from(el.options || []).filter((o) => o.selected);
      return clean(opts.map((o) => clean(o.textContent || o.value)).filter(Boolean).join(', '));
    }
    if (tag === 'button') return clean(el.getAttribute('title') || el.textContent);
    // lightning-combobox / lightning-select render the chosen value in a
    // <span class="slds-truncate" title="..."> element; prefer title over
    // text because it's the full value when truncated.
    const trunc = el.querySelector?.('[title][class*="truncate"]');
    if (trunc && clean(trunc.getAttribute('title'))) return clean(trunc.getAttribute('title'));
    const slot = el.querySelector?.('slot');
    if (slot) {
      const slotted = Array.from(slot.assignedNodes?.() || []).map((n) => n.textContent || '').join(' ');
      const v = clean(slotted + ' ' + (el.textContent || ''));
      if (v) return v;
    }
    const valueAttr = el.getAttribute && clean(el.getAttribute('data-value') || el.getAttribute('value'));
    if (valueAttr) return valueAttr;
    return clean(el.textContent || '');
  }

  // -------------------------------------------------------------------------
  //  Tier 1 — Lightning form-element rows
  // -------------------------------------------------------------------------

  function scrapeLightningForm(acc) {
    const selectors = [
      'label',
      'span.slds-form-element__label',
      'span[class*="label"]',
      'lightning-formatted-text + *',
      'records-record-layout-item',
      'dt',
      'th',
    ];
    const labels = new Set(Array.from(document.querySelectorAll(selectors.join(','))));
    for (const labelEl of labels) {
      if (!visible(labelEl) && labelEl.tagName?.toLowerCase() !== 'label') continue;
      const labelText = clean(labelEl.textContent || labelEl.getAttribute('aria-label') || '');
      if (!labelText) continue;
      const field = findFieldForLabel(labelText);
      if (!field) continue;
      if (acc[field]) continue;
      const value = findValueNear(labelEl);
      if (value) acc[field] = value;
    }
    return acc;
  }

  // -------------------------------------------------------------------------
  //  Tier 2 — Visualforce / Classic detail rows and page-header blocks
  // -------------------------------------------------------------------------

  function scrapeDetailLists(acc) {
    // <dl class="slds-page-header__detail-list">  <dt>Label</dt>  <dd>Value</dd>
    const dls = document.querySelectorAll('dl, ul.slds-page-header__detail-list, div.slds-page-header__detail-block, .slds-detail-list');
    for (const dl of dls) {
      const pairs = dl.querySelectorAll('dt, dd, .slds-page-header__detail-label, .slds-page-header__detail-value, .labelCol, .dataCol, th, td');
      let lastLabel = null;
      for (const el of pairs) {
        const isLabel = /^(dt|th)$/i.test(el.tagName)
          || /label/i.test(el.className || '')
          || /labelCol/.test(el.className || '');
        if (isLabel) { lastLabel = el; continue; }
        if (!lastLabel) continue;
        const labelText = clean(lastLabel.textContent);
        const field = findFieldForLabel(labelText);
        if (!field || acc[field]) { lastLabel = null; continue; }
        const value = readElementValue(el);
        if (value) acc[field] = value;
        lastLabel = null;
      }
    }
    return acc;
  }

  /** Case page header usually carries Case Number / Case Owner / Status /
   *  Contact Name as badges in the record home header. Extract them from
   *  the <records-highlights-details-item> or force-list-menu-item pills. */
  function scrapeHighlights(acc) {
    const items = document.querySelectorAll('records-highlights-details-item, .forceHighlightsDetailsItem, .slds-page-header__detail-row span');
    for (const it of items) {
      const parts = it.innerText?.split(/\r?\n/).map(clean).filter(Boolean) || [];
      if (parts.length < 2) continue;
      const label = parts[0];
      const val = parts.slice(1).join(' ');
      const field = findFieldForLabel(label);
      if (field && val && !acc[field]) acc[field] = val;
    }
    return acc;
  }

  /** SFDC Classic / Console layouts: labels in left column, values right. */
  function scrapeConsoleLayout(acc) {
    const rows = document.querySelectorAll('.bPageBlock .detailList .dataCol, .bPageBlock .pbBody .data2Col, td.dataCell');
    for (const col of rows) {
      const lbl = col.previousElementSibling || col.parentElement?.querySelector('th, .labelCol, td.labelCol');
      if (!lbl) continue;
      const labelText = clean(lbl.textContent);
      const field = findFieldForLabel(labelText);
      if (!field || acc[field]) continue;
      const value = readElementValue(col);
      if (value) acc[field] = value;
    }
    return acc;
  }

  /** Case-number / contact-id regex sweep over visible document text, for
   *  pages the label tier missed. */
  function scrapeRegexFallback(acc) {
    const text = document.body.innerText || '';
    if (!acc.caseNumber) {
      const m1 = text.match(CASE_NUMBER_HARD_RE);
      if (m1) acc.caseNumber = m1[0];
      else {
        const sfid = [...text.matchAll(new RegExp(SF_ID_RE, 'g'))].map((x) => x[0]);
        // The first 18-char id that starts with "500" is the Case object
        // key prefix — that's almost certainly this page's Case Number Id.
        const caseObj = sfid.find((x) => /^500[a-zA-Z0-9]{12,15}$/.test(x));
        if (caseObj) acc.caseNumber = caseObj;
      }
    }
    return acc;
  }

  // -------------------------------------------------------------------------
  //  Public surface
  // -------------------------------------------------------------------------

  function scrapeNow() {
    const acc = {};
    scrapeLightningForm(acc);
    scrapeDetailLists(acc);
    scrapeHighlights(acc);
    scrapeConsoleLayout(acc);
    scrapeRegexFallback(acc);
    // Derive customerName from first + last when only the granular pair was
    // captured in Classic contact layouts.
    if (!acc.customerName && (acc.firstName || acc.lastName)) {
      acc.customerName = clean(`${acc.firstName || ''} ${acc.lastName || ''}`);
    }
    for (const k of Object.keys(acc)) {
      if (typeof acc[k] === 'string') acc[k] = clean(acc[k]);
    }
    return acc;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'SCRAPE_SF') return false;
    try {
      sendResponse({ ok: true, data: scrapeNow(), url: location.href, title: document.title });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  });

  let lastHash = '';
  function hashObj(obj) { try { return JSON.stringify(obj); } catch { return ''; } }
  function reportIfChanged() {
    try {
      const data = scrapeNow();
      const h = hashObj(data);
      if (!h || h === lastHash) return;
      lastHash = h;
      chrome.runtime.sendMessage({ type: 'SF_SCRAPED', data, url: location.href, title: document.title })
        .catch(() => {/* SW asleep — next tick re-sends */});
    } catch { /* ignore */ }
  }
  // SF Lightning SPA uses `history.pushState` heavily; watch URL + a 30s
  // heartbeat. Also re-scrape whenever the record-header finishes rendering
  // (after a tab switch).
  setTimeout(reportIfChanged, 2500);
  setTimeout(reportIfChanged, 7000);
  setInterval(reportIfChanged, 30_000);
  window.addEventListener('hashchange', reportIfChanged);
  window.addEventListener('popstate', reportIfChanged);
  // Monkey-patch pushState for pure SPA navigation between Case tabs.
  try {
    const orig = history.pushState;
    history.pushState = function (...args) {
      const ret = orig.apply(this, args);
      setTimeout(reportIfChanged, 2000);
      return ret;
    };
  } catch { /* ignore — some iframes seal history */ }
})();
