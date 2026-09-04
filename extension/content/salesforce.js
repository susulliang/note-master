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
  // Value shape validation — kills garbage pairs from the real Console
  // ("Phone" → "Minimize", "Purchasing Channel" → "Select Purchasing
  // Channel" placeholder, an empty classification whose "value" is actually
  // the next label).
  function validValue(field, v) {
    const s = clean(v);
    if (!s) return false;
    if (/^select\b/i.test(s)) return false; // picklist placeholder
    if (/^(contact\s*taggings|is\s*un-?authorized\s*seller|merged\s*cases?\(?|help\s*contact\s*name)/i.test(s)) return false; // follow-on label / help icon of an empty field
    if (/^edit\b/i.test(s)) return false; // hover "Edit …" button next to an empty field
    if (/^issue\s*type\d/i.test(s) || matchAlias(s)) return false; // "value" is actually the next label
    if (field === 'contactNumber' || field === 'caseNumber' || field === 'serialNumber') return /\d/.test(s);
    if (field === 'emailAddress') return s.includes('@');
    return true;
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
      // Empty classification → the captured "value" is actually the NEXT
      // label line ("Issue Type3 Second Classification" / "AMR Model No.").
      if (!value || /^issue\s*type\d/i.test(value) || matchAlias(value)) continue;
      classes.push({ n, kind, value });
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
  //  Tier 1b — whole-document line-pair sweep. body.innerText renders every
  //  detail field as "Label\nValue" on adjacent lines on the 2026 Console
  //  (verified against the Sep 2026 agent sample). Markup-agnostic: works
  //  even when the DOM-cell tiers below can't find their class hooks.
  // -------------------------------------------------------------------------
  function sweepLinePairs(acc, text) {
    if (!text) return;
    const ls = text.split(/\r?\n/).map((s) => clean(s)).filter(Boolean);
    for (let i = 0; i < ls.length - 1; i += 1) {
      const alias = matchAlias(ls[i]);
      if (!alias || alias.field === 'issueTypeClassifications') continue;
      const val = ls[i + 1];
      if (matchAlias(val)) continue; // value is actually the next label
      if (!validValue(alias.field, val)) continue;
      assignOnce(acc, alias.field, val);
      const merged = mergeAddressFromGranular(alias.field, val);
      if (merged) appendText(acc, 'shippingAddress', merged);
    }
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
      if (!validValue(alias.field, value)) continue;
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
      if (!validValue(alias.field, val)) continue;
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
    sweepLinePairs(acc, text);
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
    if (msg?.type === 'SCRAPE_SF') {
      try {
        sendResponse({ ok: true, data: scrapeNow(), url: location.href, title: document.title });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
      return true;
    }
    if (msg?.type === 'APPLY_CASE_FIELDS') {
      // Called by the ticket notes app after "Generate Note" to push the
      // formatted note body + a handful of case fields back into the
      // current Case record (Post feed item via the Post tab, plus the
      // editable Highlights / Details layout fields — AMR Model No.,
      // Account Name, Name, Phone).  Returns a per-field result so the
      // caller can surface successes / failures as toasts.
      Promise.resolve()
        .then(() => applyCaseFields(msg?.fields || {}, { saveEach: msg?.saveEach !== false }))
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
      return true;
    }
    return false;
  });

  // =========================================================================
  //  WRITE: push values back into the Case page (Post feed + inline fields)
  // =========================================================================
  //
  // Salesforce Console uses LWC shadow DOM + aura components, with
  // *controlled* inputs — setting .value via assignment doesn't update
  // LWC state (see the ExperienceRecall rule: never fill() or assign when
  // the element is a framework-managed controlled input).  All the setters
  // below use the focus → selectAll → document.execCommand('insertText')
  // → dispatchEvent('input' + 'change' + 'blur') event chain, which
  // mirrors keyboard typing and reliably triggers LWC onChange listeners
  // plus combobox/lookup dropdowns.  For readonly output fields we first
  // click the inline-edit button (title="Edit <Label>") then wait for the
  // editor to render, then set.
  //
  //  Messaging contract (msg.fields.*):
  //
  //    postBody            (string)  the formatted ticket note text; we
  //                                  click the Post tab, write it into the
  //                                  chatter publisher and (optionally)
  //                                  click the Publish button.
  //    postPublish         (bool)    if true, click Publish after writing
  //                                  the body. Default: false so the agent
  //                                  can proofread before sending.
  //    amrModelNo          (string)  e.g. "DEEBOT T30S" — fills AMR Model
  //                                  No. (a lookup / formatted-lookup edit)
  //    customerName        (string)  e.g. "Fay Young" — fills the editable
  //                                  Contact "Name" OR "Account Name" when
  //                                  Account lookup is writable,
  //                                  preferring Contact.
  //    accountName         (string)  override — fills Account Name lookup
  //    contactPhone        (string)  e.g. "+12157673984" — fills editable
  //                                  Phone field (Contact Details block).
  // -------------------------------------------------------------------------

  const $sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function $fire(el, type, detail) {
    if (!el) return;
    const evt = detail instanceof Event ? detail : new Event(type, { bubbles: true, cancelable: true, composed: true });
    if (detail && !(detail instanceof Event)) Object.assign(evt, detail);
    (el.dispatchEvent || el.fireEvent).call(el, evt);
  }

  /** Find an element, optionally inside one or more open shadow roots. */
  function $qs(root, sel) {
    try {
      return root.querySelector ? root.querySelector(sel) : null;
    } catch { return null; }
  }
  function $qa(root, sel) {
    try { return Array.from(root.querySelectorAll ? root.querySelectorAll(sel) : []); }
    catch { return []; }
  }

  /** Resolve input element from a lightning-input / lightning-input-field
   *  wrapper by walking into the LWC shadowRoot when open. */
  function resolveNativeInput(wrapperOrInput) {
    if (!wrapperOrInput) return null;
    // Native <input>/<textarea>/<select>
    const tn = (wrapperOrInput.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tn)) return wrapperOrInput;
    // lightning-primitive-input-simple → shadow → <input>
    if (wrapperOrInput.shadowRoot) {
      const inner = wrapperOrInput.shadowRoot.querySelector('input, textarea, select');
      if (inner) return inner;
    }
    // lightning-input → contains lightning-primitive-input-simple as a
    // light child; try slotted / direct children recursively
    for (const child of wrapperOrInput.children || []) {
      const found = resolveNativeInput(child);
      if (found) return found;
    }
    // Some LWCs render input into shadow of a light child
    for (const child of wrapperOrInput.children || []) {
      if (child?.shadowRoot) {
        const inner = child.shadowRoot.querySelector('input, textarea, select');
        if (inner) return inner;
      }
    }
    // ContentEditable (rich-text editor)
    if (wrapperOrInput.isContentEditable) return wrapperOrInput;
    // Last resort: text node container with [contenteditable] descendent
    const ce = wrapperOrInput.querySelector?.('[contenteditable="true"]');
    if (ce) return ce;
    return null;
  }

  /**
   * Native-type a string value into an input/textarea, using real DOM
   * events. This triggers the full LWC event chain and avoids the "looks
   * filled but Save is still disabled" problem. Steps:
   *   1. focus → 2. selectAll → 3. delete (so the old value is gone) →
   *   4. fire keydown/keyup with synthetic printable keys →
   *   5. execCommand('insertText',…) for each printable batch →
   *   6. dispatch 'input', 'change', 'blur'.
   * For contentEditable containers, execCommand handles insertion directly.
   */
  function nativeTypeText(nativeEl, value) {
    if (!nativeEl) return false;
    value = value == null ? '' : String(value);
    try { nativeEl.focus({ preventScroll: false }); } catch { try { nativeEl.focus(); } catch { /* ignore */ } }
    // Select-all old contents
    try {
      if (nativeEl.setSelectionRange && typeof nativeEl.value === 'string') {
        nativeEl.setSelectionRange(0, nativeEl.value.length);
      } else {
        document.execCommand('selectAll', false, null);
      }
    } catch { try { document.execCommand('selectAll', false, null); } catch { /* ignore */ } }
    $fire(nativeEl, 'focus');
    $fire(nativeEl, new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Backspace', code: 'Backspace', which: 8 }));
    try { document.execCommand('delete', false, null); } catch { try { if ('value' in nativeEl) nativeEl.value = ''; } catch { /* ignore */ } }
    $fire(nativeEl, new KeyboardEvent('input', { bubbles: true, cancelable: true, data: null, inputType: 'deleteContentBackward' }));
    if (value.length > 0) {
      // execCommand('insertText') works for both textareas/text inputs AND
      // contentEditable editors. We use 2 big chunks to avoid flicker:
      // a single insertText call is fastest.
      try {
        const ok = document.execCommand('insertText', false, value);
        if (!ok) throw new Error('execCommand returned false');
      } catch {
        // Fallback: assign value + dispatch input/change (non-native). Only
        // activates when the page CSP blocked execCommand — which should
        // not happen in Ecovacs SF pages, but keeps the fill from failing
        // silently.
        if ('value' in nativeEl) { nativeEl.value = value; }
        else if (nativeEl.isContentEditable) { nativeEl.textContent = value; }
      }
      $fire(nativeEl, new InputEvent('input', { bubbles: true, cancelable: true, data: value, inputType: 'insertText' }));
    }
    $fire(nativeEl, new InputEvent('change', { bubbles: true, cancelable: true }));
    $fire(nativeEl, new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'End' }));
    try { nativeEl.blur(); } catch { /* ignore */ }
    $fire(nativeEl, 'blur');
    return true;
  }

  /**
   * For combobox / lookups (lightning-combobox, lightning-lookup), type the
   * desired value then pick the first matching item from the popover. Used
   * by Account Name (lookup to Account record) & AMR Model No (lookup to
   * custom object). Fallback (if no popover): leave the typed string in —
   * the agent can finish it manually.
   */
  async function nativeSetCombobox(pickerWrapper, value) {
    const nativeInput = resolveNativeInput(pickerWrapper);
    if (!nativeInput) return { ok: false, reason: 'combobox has no native input' };
    // Open dropdown: comboboxes open after focus + click + typing
    try { nativeInput.focus?.(); } catch { /* ignore */ }
    try { nativeInput.click?.(); } catch { /* ignore */ }
    await $sleep(80);
    nativeTypeText(nativeInput, value);
    await $sleep(350); // let the combobox query + render result popover
    // Look for a dropdown cell (<ul role="listbox" + <li role="option">,
    // or the LWC popover containing a match whose innerText begins/equals
    // the typed value).  Prefer: closest combobox element document-wide,
    // search all dropdowns open right now.
    const popovers = Array.from(document.querySelectorAll('[role="listbox"], .slds-listbox, .slds-dropdown, lightning-base-combobox-item, [data-dropdown-root="true"]'));
    for (const pop of popovers) {
      const opts = Array.from(pop.querySelectorAll('[role="option"], li, .slds-listbox__item, .slds-dropdown__item, lightning-base-combobox-item'));
      for (const opt of opts) {
        const t = (opt.innerText || opt.textContent || '').trim().toLowerCase();
        const v = value.trim().toLowerCase();
        if (!t) continue;
        if (t === v || t.includes(v)) {
          try {
            opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            opt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            opt.click?.();
            await $sleep(100);
            opt.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            return { ok: true, matched: t };
          } catch (e) { return { ok: false, reason: String(e?.message || e) }; }
        }
      }
    }
    // Couldn't pick → value is typed, blur so it saves best-effort
    try { nativeInput.blur?.(); $fire(nativeInput, 'blur'); } catch { /* ignore */ }
    return { ok: true, picked: false, note: 'typed-only' };
  }

  /**
   * Find the inline-edit button that matches the given label. Strategy:
   *   1. Collect slds-form-element__label texts that equal the alias OR
   *      records-record-layout-item containing labelText as formatted
   *      label/legend.
   *   2. Walk up to the layout-item container.
   *   3. Click the button[title="Edit <labelText>"].
   *   4. Wait ~250ms then return the editor wrapper element inside.
   */
  async function clickInlineEdit(labelAliases) {
    const aliases = Array.isArray(labelAliases) ? labelAliases : [labelAliases];
    const labels = $qa(document, '.slds-form-element__label, legend, label');
    let hit = null;
    for (const lbl of labels) {
      const txt = (lbl.textContent || '').replace(/\s+/g, ' ').trim();
      if (!txt) continue;
      const matched = aliases.some((a) => typeof a === 'string'
        ? txt.toLowerCase() === a.toLowerCase() || txt.toLowerCase().includes(a.toLowerCase())
        : a.test(txt));
      if (matched) { hit = lbl; break; }
    }
    if (!hit) {
      // Fallback: look for layout items that have the inline-edit button
      // title matching the alias
      const btns = $qa(document, 'button[title]');
      for (const b of btns) {
        const t = (b.getAttribute('title') || '').replace(/^Edit\s+/, '');
        const ok = aliases.some((a) => typeof a === 'string'
          ? t.toLowerCase() === a.toLowerCase() || t.toLowerCase().includes(a.toLowerCase())
          : a.test(t));
        if (ok && /^Edit\s+/.test(b.getAttribute('title') || '')) { hit = b; break; }
      }
      if (hit?.tagName === 'BUTTON') {
        try { hit.click(); await $sleep(260); return { wrapper: hit.closest('records-record-layout-item, .slds-form-element, .test-id__field-label-container, lightning-output-field, div') || document.body }; }
        catch (e) { return { ok: false, error: String(e?.message || e) }; }
      }
      return { ok: false, error: `No label "${aliases[0]}" found for inline edit.` };
    }
    const layoutItem = hit.closest(
      'records-record-layout-item, lightning-output-field, .slds-form-element, .test-id__field-label-container, li, div'
    );
    if (!layoutItem) return { ok: false, error: `Couldn't find layout item for label "${aliases[0]}".` };
    const btn = $qs(layoutItem, 'button.inline-edit-trigger, button[title^="Edit "], button.test-id__inline-edit-trigger');
    if (!btn) return { ok: false, error: `No inline-edit button for label "${aliases[0]}". Field might be read-only or not on this page.` };
    try { btn.click(); } catch (e) { return { ok: false, error: String(e?.message || e) }; }
    await $sleep(320); // let LWC swap the editor in
    return { wrapper: layoutItem, aliasUsed: aliases[0] };
  }

  /** Click the docked footer's Save button. */
  async function clickFooterSave() {
    // 2026 Console modal/docked-form-footer button with label Save
    const candidates = Array.from(document.querySelectorAll('footer button, .slds-docked-form-footer button, [data-render-mode-inline="form"] button, button'));
    for (const b of candidates) {
      const txt = ((b.innerText || b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')).toLowerCase();
      if (/^(save|保存)\b|(^|\s)save($|\s)/.test(txt) || txt.includes('save changes')) {
        try { b.click(); await $sleep(260); return true; }
        catch { /* ignore */ }
      }
    }
    return false;
  }
  /** Click Cancel when an edit goes badly so the next field doesn't error. */
  async function clickFooterCancel() {
    const candidates = Array.from(document.querySelectorAll('footer button, .slds-docked-form-footer button, button'));
    for (const b of candidates) {
      const txt = ((b.innerText || b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')).toLowerCase();
      if (/^(cancel|取消)\b/.test(txt) || /\bcancel\b/.test(txt)) {
        try { b.click(); await $sleep(120); return true; } catch { /* ignore */ }
      }
    }
    return false;
  }

  /**
   * Find one editable field by label aliases, enter edit mode, write value,
   * then click Save footer.  Returns a per-field result shape:
   *   { ok, aliasUsed, editorKind, detail? } | { ok:false, error }.
   *   kind: 'text' | 'combobox' | 'textarea' | 'lookup'
   */
  async function editAndSet(labelAliases, value, editorKind = 'auto') {
    if (value == null || String(value).trim() === '') {
      return { ok: true, skipped: true, reason: 'empty value' };
    }
    const e = await clickInlineEdit(labelAliases);
    if (!e || e.ok === false) return { ok: false, error: e?.error || `couldn't open editor for ${labelAliases[0]}` };
    const wrap = e.wrapper;
    // Detect editor: combobox = lightning-combobox, else input/textarea.
    let kind = editorKind;
    let combobox = null;
    if (kind === 'auto') {
      combobox = $qs(wrap, 'lightning-combobox, [role="combobox"]');
      if (combobox) kind = 'combobox';
      else {
        const ta = $qs(wrap, 'textarea, [data-textarea]');
        kind = ta ? 'textarea' : 'text';
      }
    }
    let result = { ok: false, error: 'editor not resolved' };
    if (kind === 'combobox' || kind === 'lookup') {
      const picker = combobox || $qs(wrap, 'lightning-combobox, [role="combobox"]');
      const r = await nativeSetCombobox(picker, String(value));
      result = r.ok
        ? { ok: true, editorKind: kind, value: String(value).slice(0, 80), detail: r }
        : { ok: false, error: r.reason || 'combobox pick failed' };
    } else {
      const wrapperEl = $qs(wrap, 'lightning-input, lightning-input-field, lightning-textarea, textarea, input');
      const native = resolveNativeInput(wrapperEl) || $qs(wrap, 'input, textarea');
      const ok = nativeTypeText(native, String(value));
      result = ok
        ? { ok: true, editorKind: kind, value: String(value).slice(0, 80) }
        : { ok: false, error: `couldn't set native input for ${labelAliases[0]}` };
    }
    await $sleep(120);
    // Save (if the page has a single footer Save it will commit the batch
    // and the next edit will re-open its inline edit fresh).
    const saved = await clickFooterSave();
    if (!saved) {
      // Maybe auto-saved, that's fine for combobox lookups with blur commit
      // but we warn the caller.
      result.saveTried = false;
    }
    return result;
  }

  /**
   * Click the "Post" tab in the chatter feed and (if provided) write the
   * post body into the lightning-input-rich-text contenteditable.
   * Publisher steps:
   *   1. Find the Post tab header (the exact anchor the user gave:
   *      <a title="Post" class="tabHeader" data-target-selection-name="FeedItem.TextPostTab">).
   *   2. Click it, wait ~420ms.
   *   3. Locate the chatter publisher's rich text editor (any
   *      contenteditable="true" inside a forceChatter* area or the
   *      element with role="textbox" aria-multiline="true").
   *   4. Clear existing placeholder (if any), execCommand('insertText', body).
   *   5. If publish=true, click the Publish/Share button.
   */
  async function clickPostTabAndWrite(body, opts) {
    const publish = !!opts?.publish;
    const result = { postBody: { ok: false, length: 0, tabFound: false, editorFound: false, publishClicked: false, detail: '' } };
    // --- (1) locate the Post tab header --------------------------------
    // Try the canonical tabHeader anchor first, then progressively looser
    // text matches (button/a with title or text exactly "Post").
    const findPostTab = () => {
      const direct = document.querySelector(
        'a.tabHeader[data-target-selection-name="FeedItem.TextPostTab"], a[title="Post"].tabHeader'
      );
      if (direct) return { el: direct, via: 'tabHeader[data-target-selection-name]' };
      const spans = Array.from(document.querySelectorAll('span.title, a[role="tab"], button[role="tab"], li.tabs__item a, .tabHeader, a[title="Post"], button[title="Post"]'));
      const s = spans.find((x) => {
        const t = (x.textContent || '').trim();
        const ttl = (x.getAttribute('title') || '').trim();
        return t === 'Post' || ttl === 'Post';
      });
      if (s) return { el: s.closest('a, button') || s, via: 'text/title="Post"' };
      return null;
    };
    const tabHit = findPostTab();
    if (!tabHit) { result.postBody.detail = 'no "Post" tab header found on the Case feed'; return result; }
    result.postBody.tabFound = true;
    result.postBody.tabVia = tabHit.via;
    try { tabHit.el.click(); } catch (e) { result.postBody.error = String(e?.message || e); return result; }

    // --- (2) wait for the publisher's rich-text editor -----------------
    // Lightning lazily swaps the publisher panel in AFTER the tab click —
    // a single fixed sleep raced that swap on slower Console tabs, which
    // is why the note body sometimes never landed. Poll instead.
    const inPublishedFeedItem = (el) => !!el.closest?.('.feeditem, article, .forceChatterFeedItemBody, .cuf-comment, .slds-feed__item');
    const findEditor = () => {
      const pool = [];
      // Priority 1: editors inside a publisher container.
      const containers = document.querySelectorAll(
        '.forceChatterPublisher, .forceChatterPublisherContainer, .cuf-publisherContainer, [data-component-id="publisher"], .slds-rich-text-editor, .picker-shell, .template-input-row'
      );
      for (const c of containers) {
        for (const el of c.querySelectorAll('[contenteditable="true"], [role="textbox"][aria-multiline="true"]')) {
          if (el.getAttribute('disabled') != null) continue;
          if (inPublishedFeedItem(el)) continue;
          pool.push(el);
        }
      }
      // Priority 2: any visible multiline textbox outside published feed
      // items (old posts are contenteditable too once edited — never type
      // into those).
      if (pool.length === 0) {
        for (const el of document.querySelectorAll('[contenteditable="true"], [role="textbox"][aria-multiline="true"]')) {
          if (el.getAttribute('disabled') != null) continue;
          if (inPublishedFeedItem(el)) continue;
          pool.push(el);
        }
      }
      // Score: an EMPTY editor always beats a filled one (the fresh
      // publisher starts empty; a stale edit-mode box has content) —
      // otherwise largest rendered area wins.
      let best = null; let score = -1;
      for (const el of pool) {
        const rect = el.getBoundingClientRect();
        const sz = (rect.width || 0) * (rect.height || 0);
        const emptyBonus = (el.innerText || '').trim() === '' ? 1e7 : 0;
        const s = sz + emptyBonus;
        if (s > score) { score = s; best = el; }
      }
      return best;
    };
    let editor = null;
    for (let i = 0; i < 14 && !editor; i++) {
      editor = findEditor();
      if (!editor) await $sleep(150);
    }
    if (!editor) { result.postBody.detail = 'Post tab opened but the publisher rich-text editor never appeared (layout may hide the feed publisher)'; return result; }
    result.postBody.editorFound = true;
    try {
      result.postBody.editorKind = editor.tagName.toLowerCase()
        + (editor.className ? '.' + String(editor.className).trim().split(/\s+/).slice(0, 2).join('.') : '');
    } catch { /* ignore */ }

    // --- (3) write the note body ---------------------------------------
    if (body != null) {
      const ok = nativeTypeText(editor, body);
      result.postBody.ok = ok;
      result.postBody.length = String(body).length;
      if (!ok) result.postBody.detail = 'nativeTypeText returned false';
      await $sleep(220);
      // VERIFY the text actually landed: execCommand('insertText') can
      // silently no-op on some LWC rich-text builds, and a green "ok"
      // with an empty editor is exactly the janky fill agents reported.
      const landed = (editor.innerText || '').length;
      result.postBody.landedChars = landed;
      const expected = String(body).replace(/[*#>`]/g, '').length;
      if (ok && landed < Math.max(10, expected * 0.4)) {
        result.postBody.ok = false;
        result.postBody.detail = `editor stayed near-empty after insertText (landed ${landed}/${expected} chars) — paste the note from clipboard instead`;
      }
    } else {
      result.postBody.ok = true;
    }

    // --- (4) optional publish ------------------------------------------
    if (publish) {
      // Find Publish button (Share / Post) near the editor first, then
      // anywhere — it's a primary action button.
      const scope = editor.closest('.forceChatterPublisher, .cuf-publisherContainer, form') || document;
      const btns = Array.from(scope.querySelectorAll('button'));
      let pub = null;
      for (const b of btns) {
        const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
        if (/(^publish$|^post$|^share$)/.test(txt)) { pub = b; break; }
      }
      if (!pub) {
        for (const b of document.querySelectorAll('button')) {
          const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
          if (/(^publish$|^post$|^share$)/.test(txt)) { pub = b; break; }
        }
      }
      if (pub) {
        try { pub.click(); result.postBody.publishClicked = true; await $sleep(400); }
        catch (e) { result.postBody.error = String(e?.message || e); }
      }
    }
    return result;
  }

  /**
   * Orchestrator — apply a whole bundle and return per-field results.
   * Runs in serial so inline edits don't stomp on each other (each edit
   * commits via Save footer before the next field opens).
   */
  async function applyCaseFields(fields, _opts) {
    const out = {
      postBody: null,
      fields: {},
      saveEach: _opts?.saveEach === true,
    };
    // (1) Post tab + note body
    if (fields.postBody != null) {
      const r = await clickPostTabAndWrite(fields.postBody, { publish: !!fields.postPublish });
      Object.assign(out, r);
    }
    // (2) Editable layout fields — each open-save serial
    const defs = [
      { key: 'contactPhone', labelAliases: ['Phone', 'Contact Phone', 'Mobile Phone', 'Mobile', 'Telephone'], kind: 'text' },
      { key: 'customerName', labelAliases: [/^Contact Name$/, /^Name$/, /^Contact$/], kind: 'auto' },
      { key: 'accountName',  labelAliases: [/^Account Name$/], kind: 'lookup' },
      { key: 'amrModelNo',   labelAliases: [/^AMR Model No\.?$/i, 'AMR Model', 'Model No'], kind: 'lookup' },
    ];
    for (const d of defs) {
      const v = fields[d.key];
      if (v == null || String(v).trim() === '') { out.fields[d.key] = { ok: true, skipped: true }; continue; }
      try {
        const r = await editAndSet(d.labelAliases, v, d.kind);
        out.fields[d.key] = r;
      } catch (e) {
        out.fields[d.key] = { ok: false, error: String(e?.message || e) };
        // If an edit got stuck open, cancel so the next one is clean
        await clickFooterCancel();
      }
    }
    // Aggregate status for caller
    const all = [out.postBody, ...Object.values(out.fields)].filter(Boolean);
    const okCount = all.filter((x) => x.ok).length;
    const total = all.length;
    out.summary = { ok: okCount === total, okCount, total };
    return out;
  }

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
