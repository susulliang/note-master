/**
 * Product data indexer. Parses the Markdown files generated from the
 * 科沃斯 products XLSX (under /workspace/products/*.md) into in-memory
 * searchable indexes.
 *
 * Sheets are grouped into four kinds:
 *   1. Comparison tables      — 01 DEEBOT, 02 GOAT, 04 WINBOT, 09 核心技术参数
 *                               ### Section → GFM table with models as cols 2..N
 *   2. Row-keyed lookup      — 03 GOAT Error Codes (key: error code number)
 *                               05 机型与科学家代号 (key: model)
 *   3. Model selling points  — 08 核心卖点 (cols: 系列 / 子系列 / 型号 · 卖点 · 话术)
 *   4. Free-text reference   — 06 全品类故障问题快查, 07 导航窗口
 *
 * Everything is pre-indexed eagerly at module load time (total ~2MB of MD).
 */

import sheet01 from '../../products/01-DEEBOT 北美在售地宝型号对比.md?raw';
import sheet02 from '../../products/02-GOAT 北美在售割草机型号对比.md?raw';
import sheet03 from '../../products/03-GOAT 割草机错误代码对照.md?raw';
import sheet04 from '../../products/04-WINBOT 北美在售窗宝型号对比.md?raw';
import sheet05 from '../../products/05-机型与科学家代号 (仅内部).md?raw';
import sheet06 from '../../products/06-全品类故障问题快查.md?raw';
import sheet07 from '../../products/07-导航窗口.md?raw';
import sheet08 from '../../products/08-核心卖点.md?raw';
import sheet09 from '../../products/09-核心技术参数.md?raw';

export const PRODUCT_SHEETS_RAW: Record<string, string> = {
  '01-DEEBOT': sheet01,
  '02-GOAT': sheet02,
  '03-GOAT-Error-Codes': sheet03,
  '04-WINBOT': sheet04,
  '05-Scientist-Codes': sheet05,
  '06-Troubleshooting': sheet06,
  '07-Navigation': sheet07,
  '08-Selling-Points': sheet08,
  '09-Tech-Specs': sheet09,
};

/* -------------------------------------------------------------------------- */
/*                               Token Utilities                              */
/* -------------------------------------------------------------------------- */

/**
 * Normalize a model name / user input into tokens suitable for fuzzy
 * intersection scoring. Drops whitespace, punctuation, common filler
 * words, and lowercases everything. Returns a Set<String> so scoring
 * is O(1) per token.
 */
const STOP_WORDS = new Set([
  'series',
  'renewed',
  'refurbished',
  'care',
  'kit',
  'complete',
  'combo',
  'white',
  'black',
  'silver',
  'gold',
  'pro',
  'omni',
  'omniclone',
  'omnicyclone',
  'plus',
  'max',
  'mini',
  'turbo',
  'dtc',
  'sku',
  'version',
  'model',
  'deebot',
  'goat',
  'winbot',
  'ecovacs',
  'ozmo',
  'ultramarine',
  'lilmilo',
  'and',
]);

export function normalizeTokens(input: string): Set<string> {
  const raw = String(input ?? '')
    .toLowerCase()
    .replace(/[（(（][^）)）]*[）)）]/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .trim();
  const parts = raw.split(/\s+/).filter((t) => t.length > 0);
  const out = new Set<string>();
  for (const p of parts) {
    if (STOP_WORDS.has(p)) continue;
    if (p.length === 0) continue;
    // drop pure-digit segments unless they're a 3+ digit model#
    if (/^\d+$/.test(p) && p.length < 2) continue;
    out.add(p);
    // also register numeric chunks like "t30" as "30" for cross-match
    const numOnly = p.replace(/[a-z]/g, '');
    if (numOnly && numOnly.length >= 2 && numOnly.length <= 4) out.add(numOnly);
  }
  return out;
}

export function tokenJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const tok of a) if (b.has(tok)) inter += 1;
  if (inter === 0) return 0;
  const uni = a.size + b.size - inter;
  return uni > 0 ? inter / uni : 0;
}

/** Full-text token overlap (for generic keyword queries). */
export function textTokenOverlap(haystack: string, needle: string): number {
  if (!needle.trim()) return 0;
  const a = normalizeTokens(haystack);
  const b = normalizeTokens(needle);
  return tokenJaccard(a, b);
}

/* -------------------------------------------------------------------------- */
/*                               GFM Table Parser                             */
/* -------------------------------------------------------------------------- */

interface ParsedTable {
  headers: string[];
  rows: string[][];
}

/** Parse a single GFM table block. The input includes the full
 *  `| head1 | head2 |\n|---|---|\n| … | … |` body with no surrounding
 *  sections; caller has already split the MD by `### ` headings. */
function parseGfmTable(block: string): ParsedTable | null {
  const lines = block
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'));
  if (lines.length < 3) return null; // header + separator + 1 row minimum
  const sep = lines[1];
  if (!/^[\s|:\-—–]+$/.test(sep)) return null;

  const splitRow = (line: string): string[] =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim().replace(/<br\s*\/?>/gi, '\n'));

  const headers = splitRow(lines[0]);
  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const row = splitRow(lines[i]);
    if (row.every((c) => !c || c === '-' || c === '—')) continue;
    rows.push(row);
  }
  return { headers, rows };
}

/**
 * Comparison sheet parser. For 01/02/04 and 09 we split the MD by `###`
 * sections. The first table under each section reuses the top-level sheet
 * column header (the header of the first `### Section` in the document —
 * because the converter copies the shared model header beneath every
 * section heading). We translate each spec-row keyed by the **model**
 * (the last non-col-N, non-filler token in the column header).
 *
 * Returns an index shape:
 *   {
 *     [sheetId]: {
 *       models: string[]                 // ordered by sheet columns
 *       modelTokens: Map<model, Set>     // pre-normalized tokens
 *       sections: {
 *         [sectionName]: {
 *           [model]: { [specName]: value }
 *         }
 *       }
 *     }
 *   }
 */
interface ComparisonIndex {
  sheetId: string;
  sheetTitle: string;
  models: string[];
  modelTokens: Map<string, Set<string>>;
  /** sectionName → model → specName → value */
  sections: Record<string, Record<string, Record<string, string>>>;
  /** Flat key lookup across sections: model → all specs (joined section name). */
  flatSpecs: Record<string, Array<{ section: string; spec: string; value: string }>>;
}

function parseSheetTitle(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : 'Product Sheet';
}

/**
 * Extract the short model label from a concatenated comparison-sheet
 * column header such as `T Series · T90 Series · T90 PRO OMNI`.
 * Prefer the last ` · ` segment; strip stop-words only for matching;
 * the returned label is the human-readable short name to display.
 */
function shortenModelHeader(colHeader: string): string {
  const parts = colHeader.split(/\s*·\s*/).map((p) => p.trim());
  // Skip `col-1`, `col-5` sentinel names produced by the converter for empty cols
  if (/^col-\d+$/.test(parts[parts.length - 1])) {
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!/^col-\d+$/.test(parts[i])) return parts[i];
    }
    return colHeader;
  }
  return parts[parts.length - 1];
}

function parseComparisonSheet(sheetId: string, md: string): ComparisonIndex {
  const sectionBlocks = md.split(/^###\s+/m).slice(1); // drop preamble (title, > meta)
  const sheetTitle = parseSheetTitle(md);

  const models: string[] = [];
  const modelTokens = new Map<string, Set<string>>();
  const sections: Record<string, Record<string, Record<string, string>>> = {};
  const flatSpecs: Record<string, Array<{ section: string; spec: string; value: string }>> = {};

  let sheetHeaders: string[] | null = null;
  let sheetModelLabels: string[] | null = null;

  for (const block of sectionBlocks) {
    const [heading, rest] = splitFirstLine(block);
    const sectionName = heading.trim();
    // First GFM table inside the section
    const tableMatch = rest.match(/(^|\n)(\|[\s\S]*?)(?=\n###\s|\n#\s|$)/);
    if (!tableMatch) continue;
    const parsed = parseGfmTable(tableMatch[2]);
    if (!parsed) continue;

    // Memorize the shared column header from the very first section we meet
    if (!sheetHeaders) {
      sheetHeaders = parsed.headers;
      sheetModelLabels = sheetHeaders.map((h) => shortenModelHeader(h));
      // register models for cols 2..N (col 1 is spec name)
      for (let i = 1; i < sheetModelLabels.length; i++) {
        const label = sheetModelLabels[i];
        if (/^col-\d+$/.test(label)) continue;
        if (!models.includes(label)) {
          models.push(label);
          modelTokens.set(label, normalizeTokens(`${sheetHeaders[i]} ${label}`));
        }
      }
    }
    if (!sheetHeaders || !sheetModelLabels) continue;

    const sectionMap: Record<string, Record<string, string>> = {};
    for (const row of parsed.rows) {
      const specName = row[0] ?? '';
      if (!specName || /^col-\d+$/.test(specName)) continue;
      for (let i = 1; i < Math.min(sheetHeaders.length, row.length); i++) {
        const modelLabel = sheetModelLabels[i];
        if (/^col-\d+$/.test(modelLabel)) continue;
        const value = (row[i] ?? '').trim();
        if (!value || value === '-' || value === '—' || value === '✘') continue;
        if (!sectionMap[modelLabel]) sectionMap[modelLabel] = {};
        sectionMap[modelLabel][specName] = value;
        if (!flatSpecs[modelLabel]) flatSpecs[modelLabel] = [];
        flatSpecs[modelLabel].push({ section: sectionName, spec: specName, value });
      }
    }
    sections[sectionName] = sectionMap;
  }

  return { sheetId, sheetTitle, models, modelTokens, sections, flatSpecs };
}

function splitFirstLine(s: string): [string, string] {
  const nl = s.search(/\r?\n/);
  if (nl === -1) return [s, ''];
  return [s.slice(0, nl), s.slice(nl + 1)];
}

/* -------------------------------------------------------------------------- */
/*                           03 GOAT Error Codes                              */
/* -------------------------------------------------------------------------- */

export interface GoatErrorCode {
  code: string; // e.g. "504", "E606"
  meaning: string;
  solution: string;
  raw: string;
}

function parseGoatErrorCodes(md: string): GoatErrorCode[] {
  // Find the only big table in the sheet
  const tableMatch = md.match(/(^|\n)(\|[\s\S]*)$/);
  if (!tableMatch) return [];
  const parsed = parseGfmTable(tableMatch[2]);
  if (!parsed) return [];
  const codes: GoatErrorCode[] = [];
  // headers are concatenated — real data starts at the second row (index 1 of data = rows[0] in rows)
  for (const row of parsed.rows) {
    // Column indices (after header pollution the *actual* data still matches):
    // [0] = 序号 / [1] = 错误代码 (numeric) / [2] = 含义 / [3] = 解决方案 / [4,5] = refs
    const rawCode = (row[1] ?? '').trim();
    if (!rawCode) continue;
    if (/^\d+$/.test(rawCode) || /^E\d+/i.test(rawCode)) {
      const codeNum = rawCode.replace(/^E/i, '');
      codes.push({
        code: codeNum,
        meaning: (row[2] ?? '').trim(),
        solution: (row[3] ?? '').trim(),
        raw: row.join(' | '),
      });
    }
  }
  return codes;
}

/* -------------------------------------------------------------------------- */
/*                            05 Scientist Code Map                           */
/* -------------------------------------------------------------------------- */

function parseScientistCodes(md: string): Array<{ model: string; tokens: Set<string>; category: string; scientist: string }> {
  const tableMatch = md.match(/(^|\n)(\|[\s\S]*)$/);
  if (!tableMatch) return [];
  const parsed = parseGfmTable(tableMatch[2]);
  if (!parsed) return [];
  const out: Array<{ model: string; tokens: Set<string>; category: string; scientist: string }> = [];
  for (const row of parsed.rows) {
    // The sheet has multi-row merged headers, walk until we find rows
    // where the rightmost columns contain a scientist name (non-empty)
    for (let i = row.length - 1; i >= 0; i--) {
      const cell = (row[i] ?? '').trim();
      if (!cell) continue;
      // Heuristic: scientist names are typically one Chinese token or
      // very short (< 6 chars for model names). Since we can't easily tell
      // from structure alone, register every non-empty value that looks
      // model-ish. The search layer does token matching against all rows.
      break;
    }
    const last = row[row.length - 1]?.trim() ?? '';
    if (!last) continue;
    // take first column as 系列/型号, last as scientist
    const modelBits: string[] = [];
    for (let i = 0; i < row.length - 1; i++) {
      const c = row[i]?.trim();
      if (c) modelBits.push(c);
    }
    const models = modelBits;
    if (models.length === 0) continue;
    for (const mb of models) {
      // split ` · ` concatenated cells
      for (const piece of mb.split(/\s*·\s*/)) {
        const p = piece.trim();
        if (!p || /^col-\d+$/.test(p)) continue;
        if (/^[系列型号产品]$/.test(p)) continue;
        out.push({
          model: p,
          tokens: normalizeTokens(p),
          category: models[0] ?? '',
          scientist: last,
        });
      }
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                          08 核心卖点 Selling Points                        */
/* -------------------------------------------------------------------------- */

export interface SellingPoint {
  series: string;
  subSeries: string;
  model: string;
  tokens: Set<string>;
  bullets: string;
  pitch: string;
}

function parseSellingPoints(md: string): SellingPoint[] {
  const tableMatch = md.match(/(^|\n)(\|[\s\S]*)$/);
  if (!tableMatch) return [];
  const parsed = parseGfmTable(tableMatch[2]);
  if (!parsed) return [];
  const out: SellingPoint[] = [];
  for (const row of parsed.rows) {
    if (row.length < 5) continue;
    const series = (row[0] ?? '').trim();
    const subSeries = (row[1] ?? '').trim();
    const model = (row[2] ?? '').trim();
    const bullets = (row[3] ?? '').trim();
    const pitch = (row[4] ?? '').trim();
    if (!model || /^col-\d+$/.test(model)) continue;
    for (const piece of model.split(/\s*·\s*/)) {
      const m = piece.trim();
      if (!m) continue;
      out.push({
        series,
        subSeries,
        model: m,
        tokens: normalizeTokens(`${series} ${subSeries} ${m}`),
        bullets,
        pitch,
      });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                      06 Troubleshooting + 07 Navigation                    */
/* -------------------------------------------------------------------------- */

interface FreeTextRecord {
  id: string;
  sheetId: string;
  title: string;
  body: string;
}

function parseFreeTextSheet(sheetId: string, md: string): FreeTextRecord[] {
  const title = parseSheetTitle(md);
  const sectionBlocks = md.split(/^###\s+/m).slice(1);
  if (sectionBlocks.length === 0) {
    // No ### sections — index the whole table as rows of keyword-searchable cells
    const tableMatch = md.match(/(^|\n)(\|[\s\S]*)$/);
    if (!tableMatch) return [];
    const parsed = parseGfmTable(tableMatch[2]);
    if (!parsed) return [];
    return parsed.rows.map((row, i) => ({
      id: `${sheetId}-row-${i}`,
      sheetId,
      title,
      body: row.join(' | '),
    }));
  }
  const out: FreeTextRecord[] = [];
  for (const block of sectionBlocks) {
    const [heading, rest] = splitFirstLine(block);
    out.push({
      id: `${sheetId}-${heading}`,
      sheetId,
      title: heading.trim() || title,
      body: `${heading}\n${rest}`,
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                                Public Index                                */
/* -------------------------------------------------------------------------- */

export interface ProductIndex {
  comparisons: ComparisonIndex[]; // 01, 02, 04, 09
  goatErrorCodes: GoatErrorCode[];
  scientistCodes: ReturnType<typeof parseScientistCodes>;
  sellingPoints: SellingPoint[];
  freeText: FreeTextRecord[];
  /** Flat list of all model display names and their token sets for fuzzy match. */
  allModels: Array<{ name: string; tokens: Set<string>; origin: string }>;
}

let _index: ProductIndex | null = null;

export function getProductIndex(): ProductIndex {
  if (_index) return _index;

  const deebot = parseComparisonSheet('DEEBOT', sheet01);
  const goat = parseComparisonSheet('GOAT', sheet02);
  const winbot = parseComparisonSheet('WINBOT', sheet04);
  const techSpecs = parseComparisonSheet('TechSpecs', sheet09);
  const goatErrors = parseGoatErrorCodes(sheet03);
  const scientistCodes = parseScientistCodes(sheet05);
  const sellingPoints = parseSellingPoints(sheet08);
  const freeText = [
    ...parseFreeTextSheet('Troubleshooting', sheet06),
    ...parseFreeTextSheet('Navigation', sheet07),
  ];

  const allModels: Array<{ name: string; tokens: Set<string>; origin: string }> = [];
  const seen = new Set<string>();
  const push = (name: string, tokens: Set<string>, origin: string) => {
    const key = `${origin}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    allModels.push({ name, tokens, origin });
  };
  for (const c of [deebot, goat, winbot, techSpecs]) {
    for (const m of c.models) push(m, c.modelTokens.get(m) ?? normalizeTokens(m), c.sheetTitle);
  }
  for (const s of sellingPoints) push(s.model, s.tokens, '卖点');
  for (const s of scientistCodes) push(s.model, s.tokens, '科学家代号');

  _index = {
    comparisons: [deebot, goat, winbot, techSpecs],
    goatErrorCodes: goatErrors,
    scientistCodes,
    sellingPoints,
    freeText,
    allModels,
  };
  return _index;
}

/* -------------------------------------------------------------------------- */
/*                               Search Scoring                               */
/* -------------------------------------------------------------------------- */

export interface ModelMatch {
  name: string;
  score: number;
  origin: string;
  /** When the user searches an error code like E601, this is the match row. */
  errorCode?: GoatErrorCode;
}

/**
 * Find the closest model names from the indexed sheets. Handles the
 * following user-query shapes:
 *   1. A model string from the DEEBOT dropdown (fuzzy tokens).
 *   2. Error code literal (E000, 数字) → GOAT error code match first, then
 *      try model token intersection.
 *   3. Free keyword (e.g. "station water tank") → treated as token overlap.
 */
export function findModels(index: ProductIndex, query: string, topN = 8): ModelMatch[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Quick hit: error code.
  const errMatch = trimmed.match(/E?\s*(\d{3,4})/i);
  const errorHits: ModelMatch[] = [];
  if (errMatch) {
    const num = errMatch[1];
    for (const row of index.goatErrorCodes) {
      if (row.code === num) {
        errorHits.push({
          name: `GOAT 错误代码 ${num}`,
          score: 1.0,
          origin: 'GOAT Error Codes',
          errorCode: row,
        });
      }
    }
  }

  const qTokens = normalizeTokens(trimmed);
  const modelHits: Array<{ name: string; score: number; origin: string }> = [];
  if (qTokens.size > 0) {
    for (const m of index.allModels) {
      const s = tokenJaccard(qTokens, m.tokens);
      if (s > 0) modelHits.push({ name: m.name, score: s, origin: m.origin });
    }
  }
  modelHits.sort((a, b) => b.score - a.score);

  const dedup = new Map<string, ModelMatch>();
  for (const m of errorHits) dedup.set(`${m.origin}:${m.name}`, m);
  for (const m of modelHits.slice(0, topN)) {
    const k = `${m.origin}:${m.name}`;
    if (!dedup.has(k)) dedup.set(k, { ...m });
  }
  return Array.from(dedup.values()).sort((a, b) => b.score - a.score).slice(0, topN);
}

/**
 * Generic full-text search across selling points + troubleshooting +
 * navigation sheets. Used when the user types a manual query that isn't
 * a model match (e.g. "suction power" "tank size" "warranty").
 */
export interface FreeSearchHit {
  sheetId: string;
  title: string;
  body: string;
  score: number;
}

export function freeSearch(index: ProductIndex, query: string, topN = 8): FreeSearchHit[] {
  if (!query.trim()) return [];
  const qTokens = normalizeTokens(query);
  const rawHits: Array<FreeSearchHit & { _scoreN?: number }> = [];

  // 1. Selling points → treat each model as a "row"
  for (const sp of index.sellingPoints) {
    const hay = `${sp.model} ${sp.series} ${sp.subSeries} ${sp.bullets} ${sp.pitch}`;
    const score = textTokenOverlap(hay, query);
    if (score <= 0) continue;
    // Strong model-name substring bonus
    const bonus = query.trim().length >= 2 && sp.model.toLowerCase().includes(query.toLowerCase().trim()) ? 0.3 : 0;
    rawHits.push({
      sheetId: 'Selling Points',
      title: `${sp.model} · 核心卖点`,
      body: `### 卖点\n${sp.bullets}\n\n### 话术\n${sp.pitch}`,
      score: score + bonus,
    });
  }

  // 2. Scientist codes
  for (const s of index.scientistCodes) {
    const hay = `${s.model} ${s.category} ${s.scientist}`;
    const score = textTokenOverlap(hay, query);
    if (score <= 0) continue;
    rawHits.push({
      sheetId: 'Scientist Codes',
      title: `${s.model} · 科学家代号`,
      body: `- 系列：${s.category}\n- 机型：${s.model}\n- 内部代号：${s.scientist}`,
      score,
    });
  }

  // 3. Comparison sheet flat specs — for every model matched above
  //    we already show specs per-model; here we search flatSpecs values
  //    directly for queries like "8000Pa 吸力".
  for (const c of index.comparisons) {
    for (const [model, specs] of Object.entries(c.flatSpecs)) {
      // Build a haystack from every value + spec name
      const pieces: string[] = [];
      for (const s of specs) pieces.push(`${s.section} ${s.spec} ${s.value}`);
      const hay = pieces.join(' | ');
      const score = textTokenOverlap(`${model} ${hay}`, query);
      if (score <= 0) continue;
      const topSpecs = specs
        .filter((s) => textTokenOverlap(`${s.spec} ${s.value}`, query) > 0)
        .slice(0, 6)
        .map((s) => `- [${s.section}] ${s.spec}: ${s.value}`);
      if (topSpecs.length === 0) continue;
      rawHits.push({
        sheetId: c.sheetTitle,
        title: `${model} · ${c.sheetTitle}`,
        body: topSpecs.join('\n'),
        score,
      });
    }
  }

  // 4. Free-text sheets (troubleshooting / navigation)
  for (const r of index.freeText) {
    const score = textTokenOverlap(r.body, query);
    if (score <= 0) continue;
    rawHits.push({ sheetId: r.sheetId, title: r.title, body: r.body, score });
  }

  rawHits.sort((a, b) => b.score - a.score);
  return rawHits.slice(0, topN);
}
