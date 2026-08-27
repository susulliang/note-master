/**
 * Support templates bundled at build time:
 * - AMR email/TBS templates from /AMR_Templates (HTML)
 * - Macro TBS steps from /Macro/split (Markdown)
 * - GOAT error codes from /QNA/GOAT_Error_Codes (Markdown)
 * - Product FAQs from /QNA/FAQ (Markdown)
 * Filenames are the search index ("026_Driving_Wheel_Stuck.html" →
 * "driving wheel stuck"); content is parsed on demand for the viewer panel.
 */

export interface TemplateEntry {
  /** Numeric prefix from the filename, e.g. "026" */
  id: string;
  /** Full filename, e.g. "026_Driving_Wheel_Stuck.html" */
  file: string;
  /** Display name (filename-derived, or the markdown heading) */
  name: string;
  /** Pre-tokenized (stemmed) name for fuzzy matching */
  tokens: string[];
  /** Stemmed name joined with spaces, for phrase matching */
  nameStem: string;
  /** Raw content: HTML for AMR templates, Markdown otherwise */
  raw: string;
  /** Where the template came from */
  kind: 'amr' | 'tbs' | 'err' | 'faq';
  /** Grouping label, e.g. "AMR Email" / "TBS · General" */
  category: string;
}

const rawModules = import.meta.glob('/AMR_Templates/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const macroModules = import.meta.glob('/Macro/split/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const goatErrorModules = import.meta.glob('/QNA/GOAT_Error_Codes/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const faqModules = import.meta.glob('/QNA/FAQ/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Very common English words that add noise, not signal */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'as', 'by',
  'is', 'are', 'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those',
  'with', 'for', 'from', 'my', 'our', 'your', 'their', 'his', 'her',
  'i', 'we', 'you', 'they', 'them', 'he', 'she',
  'has', 'have', 'had', 'was', 'were', 'will', 'would', 'shall', 'should',
  'can', 'could', 'may', 'might', 'must', 'do', 'does', 'did',
  'when', 'where', 'what', 'which', 'who', 'whom', 'whose', 'why',
  'there', 'here', 'then', 'than', 'so', 'such', 'both', 'each', 'all',
  'any', 'some', 'other', 'another', 'more', 'most', 'much', 'many',
  'very', 'too', 'also', 'just', 'only', 'own', 'same', 's', 't', 'don',
  'now', 'out', 'off', 'up', 'down', 'over', 'under', 'again', 'about',
  'into', 'through', 'during', 'before', 'after', 'between',
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Light stemming: singularize plurals and strip -ing so word forms match */
function stem(token: string): string {
  let s = token;
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 3 && s.endsWith('s') && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  return s;
}

function fileNameToName(file: string): string {
  return file
    .replace(/\.(html|md)$/i, '')
    .replace(/^\d+_/, '')
    .replace(/_/g, ' ')
    .trim();
}

/** GOAT error-code filenames carry the code, e.g. "001_504_Positioning_Abnormal" → "504" */
function extractErrorCode(file: string): string | null {
  const m = file.match(/(?:^|_)(\d{3,4})(?=_|$)/);
  return m && m[1].length >= 3 ? m[1] : null;
}

function makeEntry(
  path: string,
  raw: string,
  kind: TemplateEntry['kind'],
  category: string,
  nameOverride?: string
): TemplateEntry {
  const file = path.split('/').pop() ?? path;
  const name = nameOverride ?? fileNameToName(file);
  const tokens = tokenize(name).map(stem);
  // Error codes (e.g. "504") are tokenized for exact matching too
  const code = extractErrorCode(file);
  if (code) tokens.push(code);
  return {
    file,
    id: file.slice(0, 3),
    name,
    tokens,
    nameStem: tokens.join(' '),
    raw,
    kind,
    category,
  };
}

/** All searchable templates: AMR emails, macro TBS steps, error codes, FAQs */
export const ALL_TEMPLATES: TemplateEntry[] = [
  ...Object.entries(rawModules).map(([path, raw]) =>
    makeEntry(path, raw, 'amr', 'AMR Email')
  ),
  ...Object.entries(macroModules)
    .filter(([path]) => !/INDEX/i.test(path))
    .map(([path, raw]) =>
      makeEntry(path, raw, 'tbs', path.includes('/general/') ? 'TBS · General' : 'TBS')
    ),
  ...Object.entries(goatErrorModules)
    .filter(([path]) => !/INDEX/i.test(path))
    .map(([path, raw]) => {
      const code = extractErrorCode(path);
      const entry = makeEntry(path, raw, 'err', 'Error Code');
      // Display "Error 504 · Positioning Abnormal" when a code is present
      if (code && !/^ERR/i.test(entry.name)) {
        entry.name = `Error ${code} · ${entry.name.replace(/^Error\s*\d*\s*/i, '').trim()}`;
      }
      return entry;
    }),
  ...Object.entries(faqModules)
    .filter(([path]) => !/(INDEX|FAQ_\d+)/i.test(path) || /FAQ_by_Product/i.test(path))
    .map(([path, raw]) => makeEntry(path, raw, 'faq', 'FAQ')),
].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

// ---------------------------------------------------------------------
//  Scoring: IDF-weighted fuzzy matching
// ---------------------------------------------------------------------

/** Document frequency of each (stemmed) token across template names */
const DF = new Map<string, number>();
for (const t of ALL_TEMPLATES) {
  for (const tok of new Set(t.tokens)) {
    DF.set(tok, (DF.get(tok) ?? 0) + 1);
  }
}

/** Rare tokens (e.g. "winbot", "dustbag") rank higher than common ones ("water") */
function idf(token: string): number {
  const df = DF.get(token) ?? 0;
  return Math.max(0.4, Math.log10(ALL_TEMPLATES.length / (df + 1)));
}

/**
 * Synonym groups derived from the AMR / TBS template-title vocabulary.
 * Words in the same group count as matches during scoring — e.g. the
 * agent types "cleaning sink" and matches "Mop Washing Tray" (clean ↔
 * wash, sink ↔ tray), "tangle" matches "entanglement". Each group is
 * stemmed at build time into a symmetric lookup.
 */
const SYNONYM_GROUPS: string[][] = [
  // Mop / tray / sink
  ['sink', 'tray', 'basin'],
  ['mop', 'mopping', 'pad', 'cloth', 'plate', 'wiping', 'wipe', 'wiper'],
  ['clean', 'cleaning', 'wash', 'washing', 'cleaned', 'rinse'],
  ['tangle', 'tangled', 'entangle', 'entangled', 'entanglement', 'knot', 'twist', 'wrap'],
  // Power / charging
  ['charge', 'charging', 'recharge', 'recharging', 'charger', 'juice'],
  ['battery', 'batteries', 'power', 'drain', 'runtime'],
  ['dock', 'docking', 'station', 'base', 'charger'],
  // Connectivity
  ['network', 'wifi', 'internet', 'router', 'hotspot', 'connect', 'connection', 'connecting', 'bluetooth', 'pairing', 'pair'],
  ['offline', 'disconnect', 'disconnected', 'unreachable'],
  // Navigation / movement
  ['map', 'mapping', 'mapp'],
  ['route', 'path', 'routing', 'messy', 'erratic', 'chaotic', 'random', 'pattern'],
  ['circle', 'circles', 'spin', 'spinning', 'spinn', 'rotate', 'rotating', 'rotat'],
  ['backward', 'reverse', 'backing', 'back'],
  ['navigation', 'navigating', 'sensor', 'lds', 'dtof', 'lidar', 'camera', 'aivi', 'gyroscope'],
  ['stuck', 'jam', 'jammed', 'blocked', 'block', 'trapped', 'obstruction'],
  ['wheel', 'drive', 'driving', 'driv'],
  ['climb', 'climbing', 'slope', 'threshold', 'ramp', 'stairs'],
  ['zone', 'zones', 'area', 'areas', 'room', 'rooms', 'region', 'divide', 'dividing', 'divid', 'boundary', 'boundarie', 'boundaries', 'wall', 'walls', 'designated', 'timezone'],
  ['obstacle', 'avoid', 'avoidance', 'object', 'detect', 'detection', 'recognize', 'recognition', 'recognizing'],
  ['video', 'live', 'view', 'footage', 'recording', 'videomanager'],
  // Faults / alarms
  ['error', 'fault', 'failure', 'fail', 'malfunction', 'malfunctioning', 'alarm', 'warning', 'code', 'broken', 'defect'],
  ['bumper', 'bump', 'collision', 'crash', 'hit'],
  ['drop', 'drops', 'fall', 'falling', 'dropping'],
  ['stop', 'stops', 'stopping', 'shutdown', 'shuts', 'interrupted', 'pause', 'intermittent', 'suddenly'],
  // Water / wetness
  ['spill', 'overflow', 'overflowing', 'seep', 'seepage', 'leak', 'leaking', 'leak', 'drip', 'dripping', 'droplet', 'droplets', 'damp', 'wet', 'moisture'],
  ['recycle', 'recycling', 'recycled', 'drain', 'drainage', 'wastewater'],
  ['waste', 'dirty', 'sewage', 'unclean'],
  ['tank', 'reservoir'],
  ['spray', 'sprayer', 'spraying', 'squirt', 'nozzle'],
  ['foam', 'bubble', 'bubbles', 'suds'],
  ['streak', 'streaks', 'mark', 'marks', 'stain', 'stains', 'smear', 'smudge'],
  // Sound / smell / heat
  ['noise', 'sound', 'humming', 'humm', 'hum', 'buzz', 'rattle', 'rattling', 'squeak', 'squeaking', 'loud'],
  ['smell', 'odor', 'stink', 'stinky', 'scent', 'burning', 'burnt'],
  ['hot', 'heat', 'warm', 'temperature', 'overheat', 'overheating'],
  // Consumables / parts
  ['dustbin', 'bin', 'dustbox', 'dustbag', 'bag', 'container'],
  ['debris', 'dust', 'dirt', 'litter', 'garbage'],
  ['brush', 'bristles'],
  ['filter', 'hepa'],
  ['solution', 'detergent', 'fluid', 'soap', 'cleaner'],
  ['edge', 'edges', 'corner', 'corners', 'baseboard', 'skirting', 'perimeter', 'side'],
  ['missed', 'missing', 'incomplete', 'skip', 'skipped', 'spot', 'spots', 'partial', 'unfinished'],
  ['lift', 'lifting', 'raise', 'raising', 'extension', 'extend', 'extending', 'retract'],
  // Software / account
  ['upgrade', 'update', 'firmware', 'flash', 'flashing', 'upgrading'],
  ['reset', 'reboot', 'restart', 'rebooting', 'restarting'],
  ['account', 'login', 'logout', 'signin', 'registration', 'register', 'verify', 'verification'],
  ['app', 'application', 'mobile'],
  ['schedule', 'scheduled', 'scheduling', 'timer', 'automation'],
  ['pin', 'password', 'lock', 'unlock'],
  // GOAT / mowing
  ['blade', 'trimmer', 'trimming', 'cut', 'cutting', 'mow', 'mowing', 'mower', 'lawn', 'grass'],
  ['satellite', 'gps', 'rtk', 'signal', 'positioning', 'location', 'coverage'],
  // Support flows
  ['escalation', 'escalate', 'support', 'tech', 'technical'],
  ['replacement', 'warranty', 'exchange', 'guarantee'],
  ['return', 'refund', 'rma', 'exchange', 'returning'],
  ['tracking', 'shipment', 'shipping', 'delivery', 'package', 'logistics', 'courier', 'carrier'],
  ['order', 'purchase', 'amazon', 'walmart', 'ebay', 'webstore', 'buy', 'bought', 'invoice'],
  ['gift', 'present'],
  ['light', 'led', 'indicator', 'blinking', 'blinks', 'flickering'],
  ['winter', 'cold', 'freezing', 'frost'],
];

/** Stemmed symmetric synonym lookup: word → set of same-group stems */
const SYNONYMS = new Map<string, Set<string>>();
for (const group of SYNONYM_GROUPS) {
  const stems = [...new Set(group.map(stem))];
  for (const s of stems) {
    if (!SYNONYMS.has(s)) SYNONYMS.set(s, new Set());
    for (const other of stems) {
      if (other !== s) SYNONYMS.get(s)!.add(other);
    }
  }
}

/** Subsequence check for lenient fuzzy matching */
function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return false;
}

/**
 * Match strength between a query token and a template-name token.
 * exact (after stemming) > synonym (same group) > prefix > substring >
 * subsequence.
 */
function tokenPairScore(qt: string, nt: string): number {
  if (qt === nt) return 3;
  // Synonym match: both stems sit in the same synonym group
  if (SYNONYMS.get(qt)?.has(nt)) return 2.4;
  if (qt.length >= 4 && nt.length >= 4 && (nt.startsWith(qt) || qt.startsWith(nt))) return 2.2;
  if (qt.length >= 4 && nt.length >= 4 && (nt.includes(qt) || qt.includes(nt))) return 1.6;
  if (qt.length >= 5 && isSubsequence(qt, nt)) return 0.8;
  return 0;
}

/**
 * Fuzzy-search template names (AMR emails + macro TBS steps) against the
 * query text (typically the issue type + model + detailed issue description).
 *
 * - Each query token is matched to its best keyword per template; tokens
 *   that match nothing simply contribute zero — not all words need to match.
 * - Matches are weighted by IDF: rare keywords count more, common words
 *   ("water", "charging") count less, so results reflect the *distinctive*
 *   words in the query.
 * - Synonyms count too: query and template tokens in the same synonym
 *   group score just below exact matches ("sink" ↔ "tray", "tangle" ↔
 *   "entanglement", "cleaning sink" ↔ "Mop Washing Tray").
 * - Consecutive query word pairs that appear verbatim in a template name
 *   earn a phrase bonus (e.g. "wheel stuck" → Driving Wheel Stuck).
 * - Weak matches are pruned relative to the best hit, keeping the list
 *   accurate rather than exhaustive.
 */
export function searchTemplates(query: string, limit = 8): TemplateEntry[] {
  const rawTokens = tokenize(query);
  const queryTokens = [
    ...new Set(rawTokens.filter((t) => t.length >= 3 && !STOPWORDS.has(t)).map(stem)),
  ];
  if (queryTokens.length === 0) return [];

  // Consecutive (stemmed) bigrams from the original token order, for the
  // phrase bonus — stopword positions break the phrase
  const bigrams: string[] = [];
  for (let i = 0; i < rawTokens.length - 1; i++) {
    const a = stem(rawTokens[i]);
    const b = stem(rawTokens[i + 1]);
    if (a.length >= 3 && b.length >= 3 && !STOPWORDS.has(rawTokens[i]) && !STOPWORDS.has(rawTokens[i + 1])) {
      bigrams.push(`${a} ${b}`);
    }
  }

  const scored = ALL_TEMPLATES.map((t) => {
    let score = 0;
    for (const qt of queryTokens) {
      let best = 0;
      for (const nt of t.tokens) {
        const s = tokenPairScore(qt, nt);
        if (s > best) best = s;
        if (best === 3) break;
      }
      if (best > 0) score += best * idf(qt);
    }
    for (const bg of bigrams) {
      if (t.nameStem.includes(bg)) score += 2.5;
    }
    return { t, score };
  });

  const withScore = scored.filter((s) => s.score > 0);
  if (withScore.length === 0) return [];
  const topScore = withScore.reduce((m, s) => Math.max(m, s.score), 0);

  return withScore
    .filter((s) => s.score >= 2.5 && s.score >= 0.18 * topScore)
    .sort((a, b) => b.score - a.score || a.t.id.localeCompare(b.t.id))
    .slice(0, limit)
    .map((s) => s.t);
}

/** A single clickable line of template content */
export interface TemplateLine {
  text: string;
}

/** Parsed template: title + muted metadata + clickable content lines */
export interface ParsedTemplate {
  title: string;
  meta: string[];
  lines: TemplateLine[];
}

/** Extract the display title (h1, falling back to <title>) from raw HTML */
function extractTitle(doc: Document): string {
  return (
    doc.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() ||
    doc.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() ||
    ''
  );
}

/** Strip markdown formatting and mojibake/non-ASCII artifacts from a TBS line */
function cleanMarkdownLine(s: string): string {
  return s
    // Unescape escaped punctuation (the source files escape . ( ) [ ] _ - etc.)
    .replace(/\\([._\-()[\]~`>#*])/g, '$1')
    // Drop embedded images entirely (internal authcode URLs won't render)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // Links → their text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Bold / italic / code markers
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    // Non-ASCII (CJK notes + encoding mojibake) — the steps are English
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a markdown entry (TBS steps / GOAT error code / FAQ) into a title
 * (first heading) and clickable step lines. Standalone image lines and
 * video file references are dropped; numbered/bulleted items and
 * paragraphs become lines.
 */
function parseMarkdown(md: string, fallbackName: string): ParsedTemplate {
  const lines: TemplateLine[] = [];
  let title = '';

  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // Standalone image or video reference — not useful as an insertable line
    if (/^!\[[^\]]*\]\([^)]*\)$/.test(line)) continue;
    if (/^\[.*\.(mp4|mov|avi|mkv)\]$/i.test(line)) continue;

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      if (!title) {
        title = cleanMarkdownLine(heading[1]).replace(/[:\s]+$/, '');
      }
      continue;
    }
    // Strip a leading list marker (1. / - / *)
    const listItem = line.replace(/^(\d+[.)]|[-*+])\s+/, '');
    const text = cleanMarkdownLine(listItem);
    if (text) lines.push({ text });
  }

  return { title: title || fallbackName, meta: [], lines };
}

/**
 * Parse a template entry into a title + clickable content lines.
 * AMR entries parse their HTML body (metadata before the first <hr>);
 * markdown entries (TBS steps, error codes, FAQs) parse their steps.
 */
export function parseTemplate(entry: TemplateEntry): ParsedTemplate {
  if (entry.kind === 'amr') {
    return parseAmrHtml(entry.raw);
  }
  return parseMarkdown(entry.raw, entry.name);
}

/** Parse an AMR template's HTML body (see parseTemplate) */
function parseAmrHtml(html: string): ParsedTemplate {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style').forEach((el) => el.remove());

  const meta: string[] = [];
  const lines: TemplateLine[] = [];

  const cleanText = (el: Element | null) =>
    (el?.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

  // Push each <br>-separated segment of an element as its own line
  const pushBrLines = (el: Element) => {
    const tmp = document.createElement('div');
    for (const seg of el.innerHTML.split(/<br\s*\/?>/i)) {
      tmp.innerHTML = seg;
      const text = cleanText(tmp);
      if (text) lines.push({ text });
    }
  };

  // Everything before the first <hr> is metadata (Description/Folder/ID)
  let inHeader = true;
  for (const child of Array.from(doc.body.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'hr') {
      inHeader = false;
      continue;
    }
    if (tag === 'h1') continue; // title handled separately
    if (inHeader) {
      const text = cleanText(child);
      if (text) meta.push(text);
      continue;
    }
    if (tag === 'ol' || tag === 'ul') {
      child.querySelectorAll(':scope > li').forEach((li) => {
        const text = cleanText(li);
        if (text) lines.push({ text });
      });
    } else if (child.querySelector('br')) {
      pushBrLines(child);
    } else {
      const text = cleanText(child);
      if (text) lines.push({ text });
    }
  }

  // No <hr> found: treat everything non-title as content lines
  if (lines.length === 0) {
    return { title: extractTitle(doc), meta: [], lines: meta.map((text) => ({ text })) };
  }
  return { title: extractTitle(doc), meta, lines };
}
