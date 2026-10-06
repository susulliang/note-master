/**
 * SKU spare-parts database (v0.3.0).
 *
 * Built offline from the 124 Ecovacs spare-parts workbooks (SKU_202610) by
 * scripts/build-sku-db.mjs → public/sku-db/sku-index.json + images/*.webp.
 * ~19,000 parts × 170 models, ~8 MB JSON + ~7 MB thumbnails (64×64 WebP).
 *
 * This module lazily fetches that JSON once, then serves:
 *   - fuzzy model matching (form's "X2 OMNI" → db "DEEBOT X2 OMNI Station")
 *   - region buckets (messy free-text Market column → NA / EU / JP / …)
 *   - part search (SKU / EN name / ZH name)
 */

export interface SkuPart {
  sku: string;
  en: string;
  zh?: string;
  type?: string;
  model: string;
  sheet: string;
  isStation: boolean;
  regions: string[];
  price?: string;
  moq?: string;
  thumb?: string;
  _en_lower?: string;
  _zh_lower?: string;
  _model_lower?: string;
  _sku_lower?: string;
}

export interface SkuDb {
  format: string;
  builtAt: string;
  parts: SkuPart[];
}

export interface SkuMeta {
  filesProcessed: number;
  rowsExtracted: number;
  partsDeduped: number;
  uniqueModels: number;
  uniqueModelList: string[];
  workbookOrigMB: number;
  outputJsonKB: number;
  outputImagesKB: number;
  imagesMatchedInSources: number;
  imagesThumbnailed: number;
}

let skuDbPromise: Promise<SkuDb> | null = null;
let skuMetaPromise: Promise<SkuMeta> | null = null;

/** Fetch + memoize the SKU index (single ~8 MB JSON, browser-cached). */
export function loadSkuDb(): Promise<SkuDb> {
  if (!skuDbPromise) {
    skuDbPromise = fetch('/sku-db/sku-index.json')
      .then((r) => {
        if (!r.ok) throw new Error(`sku-index.json HTTP ${r.status}`);
        return r.json() as Promise<SkuDb>;
      })
      .catch((err) => {
        skuDbPromise = null; // allow retry after a transient failure
        throw err;
      });
  }
  return skuDbPromise;
}

/** Fetch + memoize the build meta (uniqueModelList for the override dropdown). */
export function loadSkuMeta(): Promise<SkuMeta> {
  if (!skuMetaPromise) {
    skuMetaPromise = fetch('/sku-db/_meta.json')
      .then((r) => {
        if (!r.ok) throw new Error(`_meta.json HTTP ${r.status}`);
        return r.json() as Promise<SkuMeta>;
      })
      .catch((err) => {
        skuMetaPromise = null;
        throw err;
      });
  }
  return skuMetaPromise;
}

// ---------------------------------------------------------------------------
// Region buckets
// ---------------------------------------------------------------------------

/**
 * The workbook "Market" column is free text ("US,EU,JP,UK,AU,KR",
 * "All except US and Russia", "SGP,MY,TH,VT,INA", …). We tokenize each entry
 * on non-alphanumerics, uppercase, and map known spellings/typos ("Thaliand",
 * "Malasiya", "Janpan", "Isreal", "Swizerland") to a bucket. Parts with NO
 * region tag are always included — hiding an untagged part from an agent
 * mid-call is worse than showing it.
 */
export const REGION_BUCKETS = [
  { id: 'NA', label: 'NA', aliases: ['US', 'USA', 'CA', 'AMR', 'AMAZON', 'TARGET', 'NORTH', 'BEST', 'BUY'] },
  { id: 'EU', label: 'EU', aliases: ['EU', 'EUROPE', 'DE', 'CH', 'FR', 'IT', 'ES', 'ITRLY', 'TUR', 'TR', 'IL', 'ISR', 'ISREAL', 'ISRAEL', 'ME', 'CZECH', 'NORWAY', 'SWIZERLAND', 'SWITZERLAND', 'BULGARIA', 'UKR', 'UKRAINE', 'UKRAIN', 'RUS', 'RUSSIA', 'BRAZIL', 'MEXICO', 'CHILE', 'ARGENTINA', 'IR', 'IRAN', 'POLAND'] },
  { id: 'UK', label: 'UK', aliases: ['UK', 'BRITAIN'] },
  { id: 'JP', label: 'JP', aliases: ['JP', 'JAPAN', 'JANPAN'] },
  { id: 'KR', label: 'KR', aliases: ['KR', 'KOREA'] },
  { id: 'AU', label: 'AU/NZ', aliases: ['AU', 'AUS', 'ANZ', 'NZ', 'AUSTRALIA', 'ZEALAND'] },
  { id: 'SEA', label: 'SEA', aliases: ['SEA', 'SG', 'SGP', 'SINGAPORE', 'MY', 'MALASIYA', 'MALAYSIA', 'TH', 'THA', 'THAILAND', 'THALIAND', 'VT', 'VN', 'INA', 'IND', 'ID', 'INDONESIA', 'HK', 'HONGKONG', 'PH', 'PHILIPPINES', 'UAE', 'AE', 'SA'] },
  { id: 'TW', label: 'TW', aliases: ['TW', 'TAIWAN'] },
  { id: 'CN', label: 'CN', aliases: ['CN', 'CHINA'] },
] as const;

export type RegionId = (typeof REGION_BUCKETS)[number]['id'] | 'ALL';

const aliasToBucket = new Map<string, string>();
for (const b of REGION_BUCKETS) {
  for (const a of b.aliases) aliasToBucket.set(a, b.id);
}

/** All region buckets a part's Market text touches (["US,EU"] → NA,EU). */
export function partRegionBuckets(part: SkuPart): Set<string> {
  const out = new Set<string>();
  for (const raw of part.regions) {
    if (!raw) continue;
    for (const tok of raw.toUpperCase().split(/[^A-Z]+/).filter(Boolean)) {
      const b = aliasToBucket.get(tok);
      if (b) out.add(b);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fuzzy model matching
// ---------------------------------------------------------------------------

/**
 * Reduce a model string to its series token — the first word containing a
 * digit ("Deebot T30S Pro" → "T30S", "GOAT O1000 RTK" → "O1000", "WINBOT
 * MINI" → "WINBOTMINI"). Mirrors softwareUpdatesData's modelSeriesToken.
 */
function seriesToken(raw: string): string {
  const words = raw.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const withDigit = words.find((w) => /\d/.test(w));
  return withDigit ?? words.join('');
}

/** Strip the synthetic " Station" suffix db models carry, so "DEEBOT X2 OMNI
 *  Station" tokenizes the same as "DEEBOT X2 OMNI". */
function baseModel(model: string): string {
  return model.replace(/\s*station$/i, '');
}

/**
 * All db models matching the selected form model, best score first.
 *   2 = same series token ("X2 OMNI" ↔ "DEEBOT X2 OMNI")
 *   1 = prefix at a series boundary ("T30S" ↔ "T30", "X8" ↔ "X8 PRO")
 */
export function matchSkuModels(selected: string, db: SkuDb): { models: string[]; score: 0 | 1 | 2 } {
  const t = seriesToken(selected);
  if (!t) return { models: [], score: 0 };
  const scored: Array<{ m: string; s: 0 | 1 | 2 }> = [];
  for (const p of db.parts) {
    const m = p.model;
    if (scored.some((x) => x.m === m)) continue;
    const f = seriesToken(baseModel(m));
    if (!f) continue;
    let s: 0 | 1 | 2 = 0;
    if (t === f) s = 2;
    else if (t.startsWith(f) && !/[0-9]/.test(t[f.length] ?? '')) s = 1;
    else if (f.startsWith(t) && !/[0-9]/.test(f[t.length] ?? '')) s = 1;
    if (s) scored.push({ m, s });
  }
  if (!scored.length) return { models: [], score: 0 };
  const best = Math.max(...scored.map((x) => x.s)) as 0 | 1 | 2;
  return { models: scored.filter((x) => x.s === best).map((x) => x.m).sort(), score: best };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SkuSearchParams {
  /** Db models to search within (from matchSkuModels); empty = all models. */
  models: string[];
  station: 'robot' | 'station';
  region: RegionId;
  /** Part name (EN or 中文) or a SKU fragment. */
  query: string;
  limit?: number;
}

/**
 * Filter + rank parts. Order: exact SKU → SKU prefix → EN name → ZH name →
 * SKU substring, each group alphabetical. Region filter keeps untagged parts.
 */
export function searchSkuParts(db: SkuDb, params: SkuSearchParams): SkuPart[] {
  const { models, station, region, query, limit = 30 } = params;
  const modelSet = models.length ? new Set(models) : null;
  const q = query.trim().toLowerCase();
  const isCjk = /[\u4e00-\u9fff]/.test(q);

  type Ranked = { p: SkuPart; rank: number };
  const hits: Ranked[] = [];

  for (const p of db.parts) {
    if (modelSet && !modelSet.has(p.model)) continue;
    if (p.isStation !== (station === 'station')) continue;
    if (region !== 'ALL') {
      const buckets = partRegionBuckets(p);
      if (buckets.size > 0 && !buckets.has(region)) continue;
    }
    if (!q) {
      hits.push({ p, rank: 3 });
      continue;
    }
    const skuL = p._sku_lower ?? p.sku.toLowerCase();
    if (skuL === q) { hits.push({ p, rank: 0 }); continue; }
    if (skuL.startsWith(q)) { hits.push({ p, rank: 1 }); continue; }
    const enL = p._en_lower ?? (p.en || '').toLowerCase();
    if (enL.includes(q)) { hits.push({ p, rank: isCjk ? 3 : 2 }); continue; }
    const zhL = p._zh_lower ?? (p.zh || '').toLowerCase();
    if (zhL.includes(q)) { hits.push({ p, rank: isCjk ? 2 : 3 }); continue; }
    if (skuL.includes(q)) { hits.push({ p, rank: 4 }); continue; }
  }

  hits.sort((a, b) => a.rank - b.rank || a.p.sku.localeCompare(b.p.sku));
  return hits.slice(0, limit).map((h) => h.p);
}

/** Web URL of a part's thumbnail (served from public/sku-db/). */
export function skuThumbUrl(part: SkuPart): string {
  return part.thumb ? `/sku-db/${part.thumb}` : '';
}

/** Value written into the SKU Number field: "SKU — English part name". */
export function skuFieldValue(part: SkuPart): string {
  const en = part.en?.trim();
  return en ? `${part.sku} — ${en}` : part.sku;
}
