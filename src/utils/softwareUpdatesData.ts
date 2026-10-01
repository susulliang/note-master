import { tokenize } from '@/utils/sopIndexer';

/**
 * Software updates index — firmware OTA history + ECOVACS HOME app release
 * notes, curated from the Feishu "Ecovacs NA 查询宝典" spreadsheet and stored
 * as bilingual markdown files under the workspace-level `software_updates/`
 * folder (numbered ASCII-slug files, one `###` section per release entry).
 *
 * Loaded LAZILY via import.meta.glob (no `eager`) — the markdown is fetched
 * as async chunks after the app shell has painted, keeping first-load fast.
 * Two consumers:
 *   • ProductLookupPanel's "Firmwares" / "App Updates" tabs → searchSoftwareUpdates()
 *   • The Robot Model gridbox expansion (FlowNode) → getLatestFirmwareForModel()
 */

export interface SoftwareUpdateEntry {
  id: string;
  /** 'firmware' = robot OTA history, 'app' = ECOVACS HOME app release notes. */
  kind: 'firmware' | 'app';
  /** ISO date (YYYY-MM-DD) parsed from the entry header; '' when undated. */
  date: string;
  /** Original date label from the header (e.g. "2025/08/25–08/28"). */
  dateLabel: string;
  /** Models covered — split on "/" from the header; app entries use ['ECOVACS HOME App']. */
  models: string[];
  /** Firmware or app version string (e.g. "1.75.0", "3.16.0"). */
  version: string;
  /** `## ` group heading the entry lives under (e.g. "X9 Series"). */
  group: string;
  /** Entry body lines (everything below the `### ` header). */
  bodyLines: string[];
  /** Lowercased title tokens for search scoring. */
  titleTokens: Set<string>;
  /** Lowercased body tokens for search scoring. */
  bodyTokens: Set<string>;
}

export interface SoftwareUpdateHit {
  item: SoftwareUpdateEntry;
  score: number;
}

const suLoaders = import.meta.glob('/software_updates/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

/** "2025/08/25–08/28" | "2025/04" | "(未注明日期 …)" → "2025-08-25" | "2025-04-01" | "" */
function toIsoDate(label: string): string {
  const m = label.match(/(\d{4})[./-](\d{1,2})(?:[./-](\d{1,2}))?/);
  if (!m) return '';
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${(d ?? '1').padStart(2, '0')}`;
}

function buildEntry(
  id: string,
  kind: 'firmware' | 'app',
  dateLabel: string,
  models: string[],
  version: string,
  group: string,
  bodyLines: string[]
): SoftwareUpdateEntry {
  const title =
    kind === 'app' ? `ECOVACS HOME App ${version}` : `${models.join(' / ')} ${version}`;
  const body = bodyLines.join('\n').toLowerCase();
  return {
    id,
    kind,
    date: toIsoDate(dateLabel),
    dateLabel,
    models,
    version,
    group,
    bodyLines,
    titleTokens: new Set(tokenize(title)),
    bodyTokens: new Set(tokenize(body)),
  };
}

/**
 * Parse one markdown file into entries. Entry headers look like:
 *   firmware: `### 2025/06/10–06/17 · X12 Series · 1.73.1`
 *   app:      `### 3.16.0 · 2026/09/07`
 * Parts are split on "·"; firmware headers put the date first, app headers
 * the version first. The `## ` group heading the entry lives under is kept
 * so firmware sections can be browsed per model family.
 */
function parseFile(key: string, raw: string): SoftwareUpdateEntry[] {
  const filename = key.split('/').pop() ?? key;
  const kind: 'firmware' | 'app' = /^04_/.test(filename) ? 'app' : 'firmware';
  const lines = raw.split('\n');
  const out: SoftwareUpdateEntry[] = [];

  let group = '';
  let current: SoftwareUpdateEntry | null = null;
  let currentBody: string[] = [];

  const finalize = () => {
    if (current) {
      current.bodyLines = currentBody;
      out.push(current);
    }
    current = null;
    currentBody = [];
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      finalize();
      group = line.slice(3).trim();
      continue;
    }
    if (line.startsWith('### ')) {
      finalize();
      const parts = line
        .slice(4)
        .split('·')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length < 2) continue;
      // Firmware headers put the date first, app headers the version first
      // (undated firmware headers like "(未注明日期 …) · T80 · 1.36.0" still
      // use the firmware order — the file kind decides, not the content).
      const dateFirst = kind === 'firmware';
      const dateLabel = dateFirst ? parts[0] : parts[1] ?? '';
      const version = dateFirst ? parts[2] ?? '' : parts[0];
      const modelsRaw = dateFirst ? parts[1] ?? '' : 'ECOVACS HOME App';
      const models = modelsRaw
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean);
      current = buildEntry(
        `${filename.replace(/\.md$/, '')}#${out.length}`,
        kind,
        dateLabel,
        models,
        version,
        group,
        []
      );
      continue;
    }
    if (current) currentBody.push(line);
  }
  finalize();
  return out;
}

/** Lazily load + parse every software-updates markdown file (cached promise). */
let suIndexPromise: Promise<SoftwareUpdateEntry[]> | null = null;
export function loadSoftwareUpdatesIndex(): Promise<SoftwareUpdateEntry[]> {
  if (!suIndexPromise) {
    suIndexPromise = (async () => {
      const entries = await Promise.all(
        Object.entries(suLoaders).map(async ([key, load]) => [key, await load()] as const)
      );
      const all = entries.flatMap(([key, raw]) => parseFile(key, raw));
      // Standardize order once at the data entry: newest first. The Firmwares
      // and App Updates browse tabs slice the first N entries off the index,
      // so it must already be newest-first here. searchSoftwareUpdates() and
      // getLatestFirmwareForModel() re-sort explicitly and are unaffected.
      all.sort((a, b) => b.date.localeCompare(a.date));
      return all;
    })();
  }
  return suIndexPromise;
}

/**
 * Keyword search over a RESOLVED index. Same bilingual tokenizer + scoring
 * as the news index (title ×4, body ×1); ties break newest-first.
 * Pass `kind` to restrict to one tab's content.
 */
export function searchSoftwareUpdates(
  index: SoftwareUpdateEntry[],
  query: string,
  limit = 10,
  kind?: 'firmware' | 'app'
): SoftwareUpdateHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const hits: SoftwareUpdateHit[] = [];
  for (const item of index) {
    if (kind && item.kind !== kind) continue;
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

/* ------------------------------------------------------------------ */
/* Fuzzy model matching (Robot Model gridbox expansion)                */
/* ------------------------------------------------------------------ */

/**
 * Reduce a raw model string to its series token: the first whitespace-run
 * word that contains a digit ("T30S Combo Complete" → "T30S", "GOAT O1000
 * RTK" → "O1000", "X8 Pro OMNI" → "X8"). Digit-less names ("WINBOT MINI")
 * fall back to the concatenated words ("WINBOTMINI").
 */
function modelSeriesToken(raw: string): string {
  const words = raw.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const withDigit = words.find((w) => /\d/.test(w));
  return withDigit ?? words.join('');
}

/**
 * How well a selected model matches a firmware entry's model list:
 *   2 = same series token (exact)
 *   1 = prefix match at a series boundary — "T30S" matches "T30" (next char
 *       is a letter, i.e. a suffix like S/C/PRO), but "X11" does NOT match
 *       "X1" (next char is a digit → different series)
 *   0 = no match
 */
export function firmwareMatchScore(selected: string, entryModels: string[]): 0 | 1 | 2 {
  const t = modelSeriesToken(selected);
  if (!t) return 0;
  let best: 0 | 1 | 2 = 0;
  for (const m of entryModels) {
    const f = modelSeriesToken(m);
    if (!f) continue;
    let s: 0 | 1 | 2 = 0;
    if (t === f) s = 2;
    else if (t.startsWith(f) && !/[0-9]/.test(t[f.length] ?? '')) s = 1;
    else if (f.startsWith(t) && !/[0-9]/.test(f[t.length] ?? '')) s = 1;
    if (s > best) best = s;
  }
  return best;
}

/**
 * Newest firmware entry for a selected model, preferring the most specific
 * match (exact series beats prefix) and then the newest date. Returns null
 * when the model has no firmware record (e.g. T20 OMNI).
 */
export function getLatestFirmwareForModel(
  index: SoftwareUpdateEntry[],
  model: string
): SoftwareUpdateEntry | null {
  let best: { entry: SoftwareUpdateEntry; score: 0 | 1 | 2 } | null = null;
  for (const entry of index) {
    if (entry.kind !== 'firmware') continue;
    const score = firmwareMatchScore(model, entry.models);
    if (score === 0) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && entry.date.localeCompare(best.entry.date) > 0)
    ) {
      best = { entry, score };
    }
  }
  return best?.entry ?? null;
}
