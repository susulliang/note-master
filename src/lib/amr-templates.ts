/**
 * AMR email / TBS templates bundled from /AMR_Templates at build time.
 * Filenames are the search index ("026_Driving_Wheel_Stuck.html" →
 * "driving wheel stuck"); HTML content is parsed on demand for the
 * viewer panel.
 */

export interface AmrTemplate {
  /** Numeric prefix from the filename, e.g. "026" */
  id: string;
  /** Full filename, e.g. "026_Driving_Wheel_Stuck.html" */
  file: string;
  /** Human name derived from the filename, e.g. "Driving Wheel Stuck" */
  name: string;
  /** Pre-tokenized (stemmed) name for fuzzy matching */
  tokens: string[];
  /** Stemmed name joined with spaces, for phrase matching */
  nameStem: string;
  /** Raw HTML content */
  html: string;
}

const rawModules = import.meta.glob('/AMR_Templates/*.html', {
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

export const AMR_TEMPLATES: AmrTemplate[] = Object.entries(rawModules)
  .map(([path, html]) => {
    const file = path.split('/').pop() ?? path;
    const id = file.slice(0, 3);
    const name = file
      .replace(/\.html$/i, '')
      .replace(/^\d+_/, '')
      .replace(/_/g, ' ')
      .trim();
    return {
      file,
      id,
      name,
      tokens: tokenize(name).map(stem),
      nameStem: tokenize(name).map(stem).join(' '),
      html,
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

// ---------------------------------------------------------------------
//  Scoring: IDF-weighted fuzzy matching
// ---------------------------------------------------------------------

/** Document frequency of each (stemmed) token across template names */
const DF = new Map<string, number>();
for (const t of AMR_TEMPLATES) {
  for (const tok of new Set(t.tokens)) {
    DF.set(tok, (DF.get(tok) ?? 0) + 1);
  }
}

/** Rare tokens (e.g. "winbot", "dustbag") rank higher than common ones ("water") */
function idf(token: string): number {
  const df = DF.get(token) ?? 0;
  return Math.max(0.4, Math.log10(AMR_TEMPLATES.length / (df + 1)));
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
 * exact (after stemming) > prefix > substring > subsequence.
 */
function tokenPairScore(qt: string, nt: string): number {
  if (qt === nt) return 3;
  if (qt.length >= 4 && nt.length >= 4 && (nt.startsWith(qt) || qt.startsWith(nt))) return 2.2;
  if (qt.length >= 4 && nt.length >= 4 && (nt.includes(qt) || qt.includes(nt))) return 1.6;
  if (qt.length >= 5 && isSubsequence(qt, nt)) return 0.8;
  return 0;
}

/**
 * Fuzzy-search template names against the query text (typically the issue
 * type + model + detailed issue description).
 *
 * - Each query token is matched to its best keyword per template; tokens
 *   that match nothing simply contribute zero — not all words need to match.
 * - Matches are weighted by IDF: rare keywords count more, common words
 *   ("water", "charging") count less, so results reflect the *distinctive*
 *   words in the query.
 * - Consecutive query word pairs that appear verbatim in a template name
 *   earn a phrase bonus (e.g. "wheel stuck" → Driving Wheel Stuck).
 * - Weak matches are pruned relative to the best hit, keeping the list
 *   accurate rather than exhaustive.
 */
export function searchTemplates(query: string, limit = 8): AmrTemplate[] {
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

  const scored = AMR_TEMPLATES.map((t) => {
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

/**
 * Parse a template's HTML body into metadata (before the first <hr>:
 * Folder / Template ID / Description) and clickable content lines
 * (paragraphs, list items, <br>-separated div/p segments after the <hr>).
 */
export function parseTemplate(html: string): ParsedTemplate {
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
