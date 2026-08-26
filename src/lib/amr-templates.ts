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
  /** Pre-tokenized name for fuzzy matching */
  tokens: string[];
  /** Raw HTML content */
  html: string;
}

const rawModules = import.meta.glob('/AMR_Templates/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
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
    return { file, id, name, tokens: tokenize(name), html };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

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
 * Fuzzy-search template names against the issue-description text.
 * Tokens from the typed text score against each template's name tokens
 * (exact > substring either way > subsequence). Anything scoring at least
 * 2 is returned, best first.
 */
export function searchTemplates(query: string, limit = 8): AmrTemplate[] {
  const queryTokens = tokenize(query).filter((t) => t.length >= 3);
  if (queryTokens.length === 0) return [];

  const scored = AMR_TEMPLATES.map((t) => {
    let score = 0;
    for (const qt of queryTokens) {
      for (const nt of t.tokens) {
        if (nt === qt) {
          score += 3;
          break;
        }
        if (nt.includes(qt) || qt.includes(nt)) {
          score += 2;
          break;
        }
        if (qt.length >= 4 && isSubsequence(qt, nt)) {
          score += 1;
          break;
        }
      }
    }
    return { t, score };
  });

  return scored
    .filter((s) => s.score >= 2)
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
