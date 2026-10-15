import { tokenize } from '@/utils/sopIndexer';

/**
 * Knowledge "News & Updates" index — bilingual product-knowledge updates
 * curated from the Feishu 知识点分享群 (Hoi / Alexia), stored as markdown
 * files under the workspace-level `news/` folder (one file per update,
 * date-prefixed filename, English H1 title, bilingual body).
 *
 * Loaded LAZILY via import.meta.glob (no `eager`) — the markdown is fetched
 * as async chunks after the app shell has painted, keeping first-load fast.
 * Callers (ProductLookupPanel's "News & Updates" tab) kick off
 * `loadNewsIndex()` in a mount effect and search the resolved index with
 * `searchNews`.
 */

export interface NewsItem {
  id: string;
  /** ISO date parsed from the date-prefixed filename (YYYY-MM-DD). */
  date: string;
  /** English H1 title from the markdown. */
  title: string;
  /** Author + group extracted from the `> Source:` line. */
  author: string;
  /** Body lines (everything below the title + source line). */
  bodyLines: string[];
  /** Lowercased title tokens for scoring. */
  titleTokens: Set<string>;
  /** Lowercased body tokens for scoring. */
  bodyTokens: Set<string>;
}

export interface NewsHit {
  item: NewsItem;
  score: number;
}

const newsLoaders = import.meta.glob('/news/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

function parseNewsFile(key: string, raw: string): NewsItem | null {
  const filename = key.split('/').pop() ?? key;
  const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return null;

  const lines = raw.split('\n');

  // Title = first H1 line.
  const titleLine = lines.find((l) => l.startsWith('# '));
  const title = (titleLine ?? filename)
    .replace(/^#\s+/, '')
    .replace(/\.md$/, '')
    .trim();

  // Author from the `> Source: 知识点分享群 · Hoi · 2026-09-30` line.
  const sourceLine = lines.find((l) => l.startsWith('> Source:'));
  const author = sourceLine
    ? (sourceLine.split('·').map((s) => s.trim())[1] ?? '')
    : '';

  // Body = everything after the title line (source line dropped — it is
  // re-rendered by the tab header itself).
  const titleIdx = lines.findIndex((l) => l === titleLine);
  const bodyLines =
    titleIdx >= 0 ? lines.slice(titleIdx + 1) : lines.slice(0);
  const body = bodyLines.join('\n').toLowerCase();

  return {
    id: filename.replace(/\.md$/, ''),
    date: dateMatch[1] ?? '',
    title,
    author,
    bodyLines,
    titleTokens: new Set(tokenize(title)),
    bodyTokens: new Set(tokenize(body)),
  };
}

/** Lazily load + parse every news markdown file (cached promise). */
let newsIndexPromise: Promise<NewsItem[]> | null = null;
export function loadNewsIndex(): Promise<NewsItem[]> {
  if (!newsIndexPromise) {
    newsIndexPromise = (async () => {
      const entries = await Promise.all(
        Object.entries(newsLoaders).map(async ([key, load]) => [key, await load()] as const)
      );
      return entries
        .map(([key, raw]) => parseNewsFile(key, raw))
        .filter((x): x is NewsItem => x !== null)
        .sort((a, b) => b.date.localeCompare(a.date));
    })();
  }
  return newsIndexPromise;
}

/** Build searchable NewsItems from the D1-backed entries (news-db). Body
 *  text is stored as the raw markdown below the title line, exactly what
 *  the tab renderer expects via bodyLines. */
export function newsItemsFromEntries(
  entries: Array<{ id: string; date: string; title: string; author: string; body: string }>
): NewsItem[] {
  return entries
    .map((e) => {
      const bodyLines = e.body.split('\n');
      const body = bodyLines.join('\n').toLowerCase();
      return {
        id: e.id,
        date: e.date,
        title: e.title,
        author: e.author,
        bodyLines,
        titleTokens: new Set(tokenize(e.title)),
        bodyTokens: new Set(tokenize(body)),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

/**
 * Keyword search over a RESOLVED news index. Uses the same bilingual
 * tokenizer as the SOP indexer (English words + Chinese 2-grams); title
 * matches weigh 4× body matches, mirroring `scoreKeywordCandidates`.
 */
export function searchNews(index: NewsItem[], query: string, limit = 8): NewsHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const hits: NewsHit[] = [];
  for (const item of index) {
    let score = 0;
    for (const t of tokens) {
      if (item.titleTokens.has(t)) score += 4;
      if (item.bodyTokens.has(t)) score += 1;
    }
    if (score > 0) hits.push({ item, score });
  }
  hits.sort((a, b) => b.score - a.score || b.item.date.localeCompare(a.item.date));
  return hits.slice(0, limit);
}
