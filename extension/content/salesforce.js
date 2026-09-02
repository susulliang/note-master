/**
 * salesforce.js — aggressive DOM scraper for the Salesforce Console Case
 * layout. Tuned against the real sample an Ecovacs agent pasted (Sep 2026):
 *
 *   - Case console header: "04057968 | Case" breadcrumbs + tabs
 *   - Section cards: "Account Details", "App Device Info", "Contact Details",
 *     "... Details", each containing rows of LABEL + VALUE as stacked
 *     flexbox/grid cells (not <dt>/<dd> pairs, not slds-form-element labels).
 *   - Classification rows: "Issue TypeN Primary Classification", "Issue
 *     TypeN Second Classification" — six separate rows, no section header.
 *   - Subject row contains the embedded CCP inbound dial string:
 *     "Connected Phone Call from: Caller +12506138156" — we extract the
 *     caller phone there since the CCP lives in a utility bar iframe and
 *     we cannot (always) run content scripts inside Locker-fenced
 *     lightning-components.
 *   - "App Device Info" block contains `key: value` lines separated by \n,
 *     with keys (appVersion, model, systemVersion, deviceType,
 *     deviceTypeName, marketName) that we translate into customerName /
 *     serial / deebotModel later.
 *   - "Contact Details" block: Name / Phone / Email / City / Address /
 *     Province / Postal Code stacked label-value rows with 2-line grid
 *     cells (label on line 1, value on line 2).
 *   - Request Description, Status, Owner, Case Tag, Case Origin, Country,
 *     Purchasing Channel, Order Number, Purchase Date, Escalation Type, AI
 *     Agent notes, Summary, Voice Record / recording link.
 *
 * This script uses FOUR tiers of extraction, in order:
 *
 *   (1) FULL-TEXT regex sweep over document.body.innerText — cheapest,
 *       gets us Case Number / phone in Subject / timestamps / structured
 *       `key: value` blocks even before DOM layout is analysed.
 *   (2) STACKED-LABEL row walk — walks every 2-line block (grid cell,
 *       inline-block label + text, span stacks) whose first non-empty line
 *       matches one of the FIELD_ALIAS patterns; assigns the remaining
 *       lines (or sibling cell content) as the value. This is the tier
 *       that actually matches the 2026 Console design.
 *   (3) SECTION-SCOPED blocks — for "App Device Info" / "Account Details"
 *       / "Contact Details" headings, crawl the nearest container and
 *       parse with custom per-section rules (key:value split for App
 *       Device, label-value pairs for the rest).
 *   (4) CLASSIC/LIGHTNING legacy tiers from the previous script are kept
 *       as fallbacks so the scraper degrades gracefully on older skins.
 *
 * Amazon Connect embedded in the SF Utility Bar is handled separately in
 * the background service worker via executeScript (MAIN world injection)
 * on the same SF tab — because Locker wraps lightning-components in opaque
 * iframes whose origins are still *.my.connect.aws / *.awsapps.com. The
 * CCP content script already matches those origins with all_frames:true.
 */

(function () {
  if (window.__NM_SF_SCRAPER_INSTALLED__) return;
  window.__NM_SF_SCRAPER_INSTALLED__ = true;

  // -------------------------------------------------------------------------
  //  Alias dictionary. Grows the original list with *exact* label tokens the
  //  Ecovacs Console skin uses (Case Tag, Escalation Type, Voice Record,
  //  Issue Type1 Primary Classification, etc.).
  // -------------------------------------------------------------------------
  const FIELD_ALIASES = {
    customerName: [
      /(customer|client|caller)\s*(full\s*)?name|^name$/i,
      /(contact|person)\s*(full\s*)?name|^contact\s*name$/i,
    ],
    firstName:       [/^first\s*name$|^given\s*name$/i],
    lastName:        [/^last\s*name$|^surname$|^family\s*name$/i],
    contactNumber:   [
      /^phone$|^telephone$|^mobile$|^cell$|^callback\s*phone|^home\s*phone|^work\s*phone/i,
      /^contact\s*(phone|number)|^phone\s*number$/i,
    ],
    emailAddress:    [/^e?-?mail$/i],
    shippingAddress: [
      /^address$|^shipping\s*address$|^street$|^mailing\s*address$/i,
      /^city$|^province$|^state$|^postal\s*code$|^zip$|^country$/i,
    ],
    city:            [/^city$/i],
    provinceState:   [/^province$|^state$/i],
    postalCode:      [/^postal\s*code$|^zip$/i],
    country:         [/^country$/i],
    serialNumber:    [/^serial\s*(no\.?|number)$|^s\/?n$|^station\s*serial\s*number$/i],
    skuNumber:       [/^sku$|^part\s*(no\.?|number)$|^product\s*code$/i],
    deebotModel:     [
      /^model$/i, /^model\s*no\.?$/i, /^product(?!\s*(family|group|list))$/i,
      /^device\s*model|^robot\s*model|^machine\s*model|^item$/i,
      /^amr\s*model\s*no\.?$|^deebot\s*model|^goat\s*model|^winbot\s*model/i,
      /^market\s*name$/i, // "iPhone 14 Pro Max" type hint; stored in marketName extra too
    ],
    purchaseInfo:    [
      /^purchase\s*(date|channel)$|^date\s*(of|purchased|sold)$|^purchasing\s*channel$/i,
      /^retailer|^where\s*purchased|^warranty\s*start|^order\s*date|^store$/i,
      /^order\s*number$|^purchase\s*date$/i,
      /^escalation\s*type|^is\s*un-?authorized\s*seller$/i,
    ],
    orderNumber:     [/^order\s*number$/i],
    purchaseDate:    [/^purchase\s*date|^date\s*purchased$/i],
    purchasingChannel: [/^purchasing\s*channel$/i],
    issueType:       [
      /^type$|^case\s*type$|^ticket\s*type$/i,
      /^reason$|^category$|^queue$|^origin$|^case\s*origin$/i,
      /^issue\s*type\s*\d+\s*(primary|second)\s*classification$/i,
    ],
    issueTypeClassifications: [/^issue\s*type\s*(\d+)\s*(primary|second)\s*classification$/i],
    issueTitle:      [/^subject$|^case\s*subject|^title$|^inquiry$|^case\s*title$/i],
    detailedIssue:   [/^description$|^case\s*description|^request\s*description|^problem\s*description|^details$/i],
    resolutionSummary: [/^resolution$|^case\s*resolution|^workaround|^fix\s*applied|^resolution\s*summary|^summary$/i],
    caseNumber:      [/^case\s*(number|id|\#)|^ticket\s*(number|id|\#)|^incident\s*id$/i],
    caseOwner:       [/^owner$|^case\s*owner|^assigned\s*(to|agent)$/i],
    caseStatus:      [/^status$|^case\s*status$/i],
    accountName:     [/^account\s*name$|^account$/i],
    accountCode:     [/^account\s*code$/i],
    caseOrigin:      [/^case\s*origin$/i],
    caseTag:         [/^case\s*tag$/i],
    followUpDate:    [/^follow\s*up\s*date$/i],
    firstPendingTs:  [/^first\s*pending\s*timestamp$/i],
    lastPendingTs:   [/^last\s*pending\s*timestamp$/i],
    aiAgentNote:     [/^ai\s*agent$/i],
    // Contact / voice / chat metadata
    voiceRecord:     [/^voice\s*record$/i],
    dtcConvId:       [/^dtc\s*conversation\s*id$/i],
    brand:           [/^brand$/i],
    chatUnavailableReason: [/^chat\s*unavailable\s*reason$/i],
    phoneSurveyResult: [/^phone\s*survey\s*result$/i],
    taggingRemark:   [/^tagging\s*remark$/i],
  };

  // -------------------------------------------------------------------------
  //  Utilities
  // -------------------------------------------------------------------------
  function clean(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  }
  function matchAlias(labelText) {
    const t = clean(labelText).replace(/[*:：]$/, '');
    if (!t) return null;
    for (const [field, patterns] of Object.entries(FIELD_ALIASES)) {
      for (const re of patterns) {
        // Classification patterns may carry capture groups — ignore them,
        // return the field id regardless.
        if (re.test(t)) return { field, matches: t.match(re) };
      }
    }
    return null;
  }
  function assignOnce(acc, field, value) {
    if (!value) return;
    if (Array.isArray(value)) value = value.map(clean).filter(Boolean).join(' / ');
    else value = clean(value);
    if (!value) return;
    if (acc[field]) return; // first-write wins
    acc[field] = value;
  }
  function appendText(acc, field, value) {
    if (!value) return;
    value = clean(value);
    if (!value) return;
    const prior = clean(acc[field] || '');
    if (!prior) acc[field] = value;
    else if (prior.includes(value) || value.includes(prior)) return;
    else acc[field] = `${prior}\n${value}`;
  }

  // -------------------------------------------------------------------------
  //  Tier 1 — whole-document innerText regex sweeps
  // -------------------------------------------------------------------------
  function sweepFullText(acc, text) {
    if (!text) return;
    // Case Number: "04057968" either on a line beginning "Case Number" OR on
    // a top breadcrumb "04057968 | Case".
    let m = text.match(/Case\s*Number\s*\n\s*([0-9A-Z\-]{6,})/i);
    if (m) assignOnce(acc, 'caseNumber', m[1]);
    if (!acc.caseNumber) {
      m = text.match(/^([0-9]{6,10})\s*\|\s*Case/m);
      if (m) assignOnce(acc, 'caseNumber', m[1]);
    }
    // Subject line: "Subject\nConnected Phone Call from: Caller +1 250 613 8156"
    m = text.match(/Subject\s*\n([^\n]+)/i);
    if (m) {
      assignOnce(acc, 'issueTitle', clean(m[1]));
      // Extract caller id out of the dial string
      const subject = m[1];
      const caller = subject.match(/(?:from|caller|ani)\s*[:：]?\s*(\+?[\d\s().\-]{7,})/i);
      if (caller) assignOnce(acc, 'contactNumber', caller[1]);
    }
    // App Device Info block: "App Device Info\nkey1: value1\nkey2: value2\n..."
    const deviceBlock = text.match(/App\s*Device\s*Info\s*\n([\s\S]*?)(?:\n\s*\n[^\s]|\nCase\s*Number|\nContact\s*Details|\nCase\s+Owner|\n$)/i);
    if (deviceBlock && deviceBlock[1]) {
      const lines = deviceBlock[1].split(/\n+/).map(clean).filter(Boolean);
      const info = {};
      for (const line of lines) {
        const kv = line.split(/\s*:\s*/);
        if (kv.length >= 2) {
          const k = kv[0].trim();
          const v = kv.slice(1).join(': ').trim();
          if (k && v) info[k] = v;
        }
      }
      if (info.model) assignOnce(acc, 'phoneModel', info.model);       // raw: iPhone15,3
      if (info.marketName) assignOnce(acc, 'marketName', info.marketName); // iPhone 14 Pro Max
      if (info.appVersion) assignOnce(acc, 'appVersion', info.appVersion);
      if (info.systemVersion) assignOnce(acc, 'osVersion', info.systemVersion);
      if (info.deviceTypeName) assignOnce(acc, 'deviceTypeName', info.deviceTypeName);
      // If the user called through the Ecovacs app, the device block is the
      // closest hint we have to the phone model — it's not the robot, so we
      // ONLY fill additionalNotes with it, never deebotModel. We'll still
      // use it as part of Additional Information later via the extras.
    }
    // Classification lines:
    //   "Issue Type1 Primary Classification\nFailure"
    //   "Issue Type1 Second Classification\nRoller extension / lift abnormally"
    const classes = [];
    const classRe = /Issue\s*Type(\d+)\s*(Primary|Second)\s*Classification\s*\n\s*([^\n]+)/gi;
    let cm;
    while ((cm = classRe.exec(text)) !== null) {
      const n = cm[1];
      const kind = cm[2].toLowerCase() === 'primary' ? 'L1' : 'L2';
      const value = clean(cm[3]);
      if (value) classes.push({ n, kind, value });
    }
    if (classes.length > 0) {
      // Build: issueType = "Failure / Roller extension / lift abnormally"
      // (collapse top-issue first L1, then its L2). Keep individual fields too.
      const byL1 = {};
      for (const c of classes) {
        if (c.kind === 'L1') byL1[c.n + '.L1'] = c.value;
        else byL1[c.n + '.L2'] = c.value;
      }
      const pieces = [];
      for (let i = 1; i <= 3; i += 1) {
        if (byL1[i + '.L1']) pieces.push(byL1[i + '.L1']);
        if (byL1[i + '.L2']) pieces.push(byL1[i + '.L2']);
      }
      const summary = pieces.filter(Boolean).join(' · ');
      if (summary) assignOnce(acc, 'issueType', summary);
      for (const c of classes) assignOnce(acc, `issueType${c.n}${c.kind}`, c.value);
    }
    // First / Last Pending Timestamp
    m = text.match(/First\s*Pending\s*Timestamp\s*\n\s*([^\n]+)/i);
    if (m) assignOnce(acc, 'firstPendingTs', m[1]);
    m = text.match(/Last\s*Pending\s*Timestamp\s*\n\s*([^\n]+)/i);
    if (m) assignOnce(acc, 'lastPendingTs', m[1]);
    // AI Agent note
    m = text.match(/AI\s*Agent\s*\n([\s\S]*?)(?:\n\s*\n|\n\s*Summary\s*\n)/i);
    if (m) appendText(acc, 'resolutionSummary', `AI Agent note: ${clean(m[1])}`);
  }

  // -------------------------------------------------------------------------
  //  Tier 2 — stacked-label cell walk (the Console 2026 layout tier)
  //
  //  For any candidate DOM element whose *inline text* has 2 to 12 non-empty
  //  lines and whose FIRST line matches an alias, lines 2..end become the
  //  field value (joined with spaces / \n as appropriate).
  // -------------------------------------------------------------------------
  function blockLines(el) {
    // Split visual lines: either real newlines in textContent, or flex
    // children rendered as their own <div>/<span> text chunks joined with
    // \n if they stack vertically (2 children => 2 => lines). Heuristic
    // works on the 2026 Console where each grid cell is two stacked spans
    // without a hard CSS label/value class.
    if (!el) return [];
    const hasBr = el.querySelector('br');
    const direct = el.querySelectorAll(':scope > br, :scope > div, :scope > span, :scope > p, :scope > lightning-formatted-text, :scope > slot, :scope > a, :scope > lightnings-formatted-text');
    if (hasBr || direct.length >= 2) {
      const parts = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      let node;
      let lastBlock = null;
      while ((node = walker.nextNode())) {
        const p = node.parentElement;
        if (p && (p.tagName === 'BR')) { parts.push('\n'); lastBlock = null; continue; }
        const txt = node.nodeValue;
        if (txt == null) continue;
        if (/\n/.test(txt)) { parts.push(txt); lastBlock = null; continue; }
        if (!txt.trim()) { if (parts[parts.length - 1] !== '\n' && lastBlock !== null) parts.push(' '); continue; }
        parts.push(txt.trimStart());
        lastBlock = node;
      }
      const lines = parts.join('').split(/\s*\n\s*/).map((s) => clean(s)).filter(Boolean);
      if (lines.length >= 2) return lines;
    }
    return (el.textContent || '').split(/\s*\n\s*/).map(clean).filter(Boolean);
  }

  function sweepStackedCells(acc) {
    // Candidate elements: any cell-sized block with 2–6 non-empty innerText
    // lines. This catches the Console detail rows where a label div sits
    // atop a value div without accessible semantics.
    const candidates = document.querySelectorAll(
      [
        'li', 'div[class*="field"]', 'div[class*="item"]',
        'div[class*="card"] > div > div > div',
        'records-record-layout-item',
        'div[class*="slds-col"]', 'div[class*="slds-size"]',
        'section > div > div',
        'div[slot="outputField"]',
        'lightning-output-field',
      ].join(',')
    );
    for (const el of candidates) {
      if (el.offsetParent === null) continue;
      const lines = blockLines(el);
      if (lines.length < 2 || lines.length > 8) continue;
      // First (and only first) line must match an alias
      const alias = matchAlias(lines[0]);
      if (!alias) continue;
      const valueLines = lines.slice(1);
      // Classification cases: matchAlias returns issueType OR the
      // specific issueTypeNL1/NL2. Use the capture-group to write both.
      if (alias.field === 'issueTypeClassifications' && alias.matches && alias.matches[1] && alias.matches[2]) {
        const n = alias.matches[1];
        const kind = alias.matches[2].toLowerCase() === 'primary' ? 'L1' : 'L2';
        const val = valueLines.join(' / ');
        assignOnce(acc, `issueType${n}${kind}`, val);
        // Append to aggregate issueType
        const prior = clean(acc.issueType || '');
        if (!prior) acc.issueType = val;
        else if (!prior.includes(val)) acc.issueType = `${prior} · ${val}`;
        continue;
      }
      // Value join: single line = space; multi = newlines.
      const value = valueLines.length === 1 ? valueLines[0] : valueLines.join('\n');
      // Postal code, city, province, address, country get merged into the
      // shippingAddress composite (as well as retained as granular fields)
      const merged = mergeAddressFromGranular(alias.field, value);
      assignOnce(acc, alias.field, value);
      if (merged) appendText(acc, 'shippingAddress', merged);
    }
    return acc;
  }

  function mergeAddressFromGranular(field, value) {
    if (field === 'country') return clean(value);
    if (field === 'city') return `${clean(value)},`;
    if (field === 'provinceState') return clean(value);
    if (field === 'postalCode') return clean(value);
    if (field === 'shippingAddress') return null; // handled directly
    if (field === 'address') return clean(value);
    return null;
  }

  // -------------------------------------------------------------------------
  //  Tier 3 — section-scoped blocks for "Account Details", "Contact
  //  Details", "Details" cards.
  // -------------------------------------------------------------------------
  function sweepSectionHeadings(acc) {
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, span, div, strong');
    for (const h of headings) {
      const title = clean(h.textContent);
      if (!title) continue;
      if (!/^(Account|App\s*Device|Contact|Details|Case|Related|Issue)\s*Details?$/i.test(title)) continue;
      // Climb up 1-3 levels to find the enclosing card, then extract all
      // descendants that look like label-value cells via the stacked tier.
      let container = h.parentElement;
      for (let i = 0; i < 3 && container; i += 1, container = container.parentElement) {
        if (!container) break;
        const cls = (container.className || '').toString();
        if (/(card|slds-card|layout-container|flexipage|region|tabset|panel|record-layout)/i.test(cls) || container.tagName === 'SECTION' || container.tagName === 'ARTICLE') break;
      }
      if (!container) continue;
      const subacc = {};
      const originalBodyInner = document.body.innerText;
      // Reuse tiers within the sub-container scope by temporarily narrowing
      // the text sweep.
      sweepFullText(subacc, container.innerText);
      sweepStackedCellsInContainer(subacc, container);
      // Lift subacc (address composites, subject already handled globally
      // may re-appear harmlessly because assignOnce skips existing keys)
      for (const [k, v] of Object.entries(subacc)) assignOnce(acc, k, v);
    }
    void originalBodyInner; // eslint-disable-line no-unused-expressions
  }

  function sweepStackedCellsInContainer(acc, root) {
    const saved = { body: document.body };
    // Reuse blockLines with a narrowed candidate pool: only elements *inside*
    // the provided container.
    const candidates = root.querySelectorAll(
      'li, div[class*="field"], div[class*="item"], div[class*="slds-col"], lightning-output-field, records-record-layout-item > *, div[slot="outputField"]'
    );
    for (const el of candidates) {
      if (el.offsetParent === null) continue;
      const lines = blockLines(el);
      if (lines.length < 2 || lines.length > 8) continue;
      const alias = matchAlias(lines[0]);
      if (!alias) continue;
      if (alias.field === 'issueTypeClassifications' && alias.matches && alias.matches[1] && alias.matches[2]) {
        const n = alias.matches[1];
        const kind = alias.matches[2].toLowerCase() === 'primary' ? 'L1' : 'L2';
        const val = lines.slice(1).join(' / ');
        assignOnce(acc, `issueType${n}${kind}`, val);
        const prior = clean(acc.issueType || '');
        if (!prior) acc.issueType = val;
        else if (!prior.includes(val)) acc.issueType = `${prior} · ${val}`;
        continue;
      }
      const val = lines.slice(1).length === 1 ? lines[1] : lines.slice(1).join('\n');
      assignOnce(acc, alias.field, val);
    }
    return acc;
  }

  // -------------------------------------------------------------------------
  //  Tier 4 — legacy (lightning slds form elements, Visualforce dl/dt/dd
  //  lists, Classic console bPageBlock, regex sf id / case tag)
  // -------------------------------------------------------------------------
  function legacyLightningLabels(acc) {
    const labels = document.querySelectorAll('label, span.slds-form-element__label, span[class*="label"]');
    for (const labelEl of labels) {
      const labelText = clean(labelEl.textContent || '');
      const alias = matchAlias(labelText);
      if (!alias || alias.field === 'issueTypeClassifications') continue;
      if (acc[alias.field]) continue;
      let value = '';
      const forAttr = labelEl.getAttribute && labelEl.getAttribute('for');
      if (forAttr) {
        const tgt = document.getElementById(forAttr);
        if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT')) {
          value = tgt.tagName === 'SELECT'
            ? (tgt.options?.[tgt.selectedIndex]?.text || '')
            : (tgt.value || '');
        }
      }
      if (!value) {
        const siblings = labelEl.parentElement?.children;
        if (siblings) {
          const idx = Array.prototype.indexOf.call(siblings, labelEl);
          for (let j = idx + 1; j < siblings.length && !value; j += 1) {
            const sib = siblings[j];
            if (sib.tagName === 'INPUT' || sib.tagName === 'TEXTAREA') value = sib.value || '';
            else value = clean(sib.textContent || sib.getAttribute?.('data-value') || sib.getAttribute?.('title') || '');
          }
        }
      }
      if (value) assignOnce(acc, alias.field, value);
    }
    return acc;
  }

  function legacyDetailLists(acc) {
    const dls = document.querySelectorAll('dl, div.slds-page-header__detail-block, div.labelCol + div.dataCol');
    for (const dl of dls) {
      const items = dl.querySelectorAll('dt, dd, th, td, .labelCol, .dataCol');
      let lastLabel = null;
      for (const el of items) {
        const isLabel = /^(dt|th)$/.test(el.tagName) || /label/i.test(el.className || '');
        if (isLabel) { lastLabel = el; continue; }
        if (!lastLabel) continue;
        const alias = matchAlias(lastLabel.textContent);
        if (alias && alias.field !== 'issueTypeClassifications' && !acc[alias.field]) {
          assignOnce(acc, alias.field, el.textContent);
        }
        lastLabel = null;
      }
    }
    return acc;
  }

  function legacyHighlights(acc) {
    const items = document.querySelectorAll('records-highlights-details-item, .forceHighlightsDetailsItem, .slds-page-header__detail-row span, .listViewHighlightPanel span');
    for (const it of items) {
      const text = it.innerText || it.textContent || '';
      const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
      if (lines.length < 2) continue;
      const alias = matchAlias(lines[0]);
      if (!alias || alias.field === 'issueTypeClassifications') continue;
      const value = lines.slice(1).join(' / ');
      assignOnce(acc, alias.field, value);
    }
    return acc;
  }

  function legacyConsoleCols(acc) {
    const rows = document.querySelectorAll('.bPageBlock .detailList .dataCol, .bPageBlock .pbBody .data2Col, td.dataCell');
    for (const col of rows) {
      const lbl = col.previousElementSibling || col.parentElement?.querySelector('th, .labelCol, td.labelCol');
      if (!lbl) continue;
      const alias = matchAlias(lbl.textContent);
      if (!alias || alias.field === 'issueTypeClassifications' || acc[alias.field]) continue;
      const t = (col.tagName === 'INPUT' || col.tagName === 'TEXTAREA') ? (col.value || '') : (col.textContent || '');
      assignOnce(acc, alias.field, t);
    }
    return acc;
  }

  function regexSweep(acc, text) {
    if (!acc.caseNumber) {
      let m = text.match(/\b(\d{7,10})\s*\|\s*Case\b/);
      if (m) assignOnce(acc, 'caseNumber', m[1]);
    }
    // Contact Name / Phone / Email — these regexes are so cheap we apply
    // them even when the structured tiers miss.
    if (!acc.contactNumber) {
      const m = text.match(/(?:\+[\d\s.\-()]+?\d)/);
      if (m) assignOnce(acc, 'contactNumber', m[0]);
    }
    if (!acc.emailAddress) {
      const m = text.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/);
      if (m) assignOnce(acc, 'emailAddress', m[0]);
    }
    if (!acc.caseNumber) {
      const sfid = [...(text.matchAll(/\b500[a-zA-Z0-9]{12,15}\b/g) || [])].map((x) => x[0]);
      if (sfid[0]) assignOnce(acc, 'caseNumber', sfid[0]);
    }
  }

  // -------------------------------------------------------------------------
  //  Orchestrator
  // -------------------------------------------------------------------------
  function scrapeNow() {
    const acc = {};
    const text = document.body.innerText || '';
    sweepFullText(acc, text);
    sweepStackedCells(acc);
    sweepSectionHeadings(acc);
    legacyLightningLabels(acc);
    legacyDetailLists(acc);
    legacyHighlights(acc);
    legacyConsoleCols(acc);
    regexSweep(acc, text);

    // customerName = Contact Name (top of Contact Details section) else
    // Account Name — already covered, but let's synthesize Name from
    // firstName + lastName when only that granular pair was picked up.
    if (!acc.customerName && (acc.firstName || acc.lastName)) {
      acc.customerName = clean(`${acc.firstName || ''} ${acc.lastName || ''}`);
    }
    if (!acc.customerName && acc.accountName) acc.customerName = acc.accountName;

    // Concatenate address components into a single shippingAddress block.
    const addressParts = [acc.address, acc.city, acc.provinceState, acc.postalCode, acc.country]
      .map(clean).filter(Boolean);
    if (addressParts.length > 0) {
      const joined = addressParts.filter((v, i, arr) => i === 0 || !arr.slice(0, i).includes(v)).join(', ');
      const prior = clean(acc.shippingAddress || '');
      if (!prior) acc.shippingAddress = joined;
      else if (!prior.includes(joined)) acc.shippingAddress = `${prior}\n${joined}`;
    }

    // Issue description: if Request Description was empty but the agent
    // typed a comment under "follow up on previous ... verification" inside
    // Case Feed, pull it as Additional Notes (append). Case Feed posts are
    // hard to parse reliably, so we don't try — the main LLM parser handles
    // them. All this tier does is preserve fields the DOM directly names.

    // Final clean: drop empty strings.
    for (const k of Object.keys(acc)) {
      if (typeof acc[k] === 'string' && !acc[k]) delete acc[k];
      if (typeof acc[k] === 'string') acc[k] = clean(acc[k]);
    }
    return acc;
  }

  // -------------------------------------------------------------------------
  //  Messaging hooks
  // -------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'SCRAPE_SF') return false;
    try {
      sendResponse({ ok: true, data: scrapeNow(), url: location.href, title: document.title });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  });

  // Heartbeat reports + SPA navigation listeners
  let lastHash = '';
  const hash = (o) => { try { return JSON.stringify(o); } catch { return ''; } };
  function reportIfChanged() {
    try {
      const data = scrapeNow();
      const h = hash(data);
      if (!h || h === lastHash) return;
      lastHash = h;
      chrome.runtime.sendMessage({ type: 'SF_SCRAPED', data, url: location.href, title: document.title })
        .catch(() => { /* SW asleep; next tick re-sends */ });
    } catch { /* ignore */ }
  }
  setTimeout(reportIfChanged, 1800);
  setTimeout(reportIfChanged, 5000);
  setTimeout(reportIfChanged, 11000);
  setInterval(reportIfChanged, 25_000);
  window.addEventListener('hashchange', reportIfChanged);
  window.addEventListener('popstate', reportIfChanged);
  try {
    const orig = history.pushState;
    history.pushState = function (...args) {
      const ret = orig.apply(this, args);
      setTimeout(reportIfChanged, 1500);
      setTimeout(reportIfChanged, 4000);
      return ret;
    };
  } catch { /* ignore */ }
})();
