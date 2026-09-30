import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Warehouse, Search, Loader2, PackageSearch, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  loadSkuDb,
  matchSkuModels,
  searchSkuParts,
  skuFieldValue,
  skuThumbUrl,
  REGION_BUCKETS,
  type RegionId,
  type SkuDb,
  type SkuPart,
} from '@/utils/skuData';

/**
 * SKU spare-parts lookup rendered under the SKU Number gridbox (v0.3.0).
 *
 * Classifier chain — each level narrows the ~11.8k-part database:
 *   1. Robot Model (from the model gridbox, FUZZY: "T30S PRO" matches the
 *      "DEEBOT T30S PRO" parts list; falls back to all models when no list
 *      matches)
 *   2. Robot ↔ Base Station toggle (workbooks ship separate sheets per side)
 *   3. Region filter (messy Market column → NA/EU/JP/… buckets; parts with
 *      no market tag are always kept — never hide a part mid-call). NA by
 *      default.
 *   4. Free-text part-name search (English AND 中文), debounced 250 ms.
 *
 * One match → auto-fills the SKU field with "SKU — English part name".
 * Multiple matches → dropdown list to pick from. The picked part's picture
 * preview shows at the bottom of the card.
 */
export default function SkuLookupCard({
  robotModel,
  value,
  onChange,
}: {
  robotModel: string;
  value: string;
  onChange: (val: string) => void;
}) {
  const [db, setDb] = useState<SkuDb | null>(null);
  const [dbError, setDbError] = useState(false);
  const [station, setStation] = useState<'robot' | 'station'>('robot');
  const [region, setRegion] = useState<RegionId>('NA');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<SkuPart | null>(null);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Load the 5 MB index lazily: once a model is picked OR the agent focuses
  // the part search — never on app start.
  useEffect(() => {
    if (db || dbError) return;
    if (!robotModel.trim() && document.activeElement !== searchRef.current) return;
    let alive = true;
    loadSkuDb()
      .then((d) => alive && setDb(d))
      .catch(() => alive && setDbError(true));
    return () => {
      alive = false;
    };
  }, [db, dbError, robotModel]);

  // Debounce the part-name query.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Fuzzy-match the form's model against the database's model families.
  const modelMatch = useMemo(
    () => (db && robotModel.trim() ? matchSkuModels(robotModel, db) : null),
    [db, robotModel]
  );

  const results = useMemo(() => {
    if (!db || !debounced.trim()) return [];
    return searchSkuParts(db, {
      models: modelMatch?.models ?? [],
      station,
      region,
      query: debounced,
      limit: 30,
    });
  }, [db, debounced, modelMatch, station, region]);

  // Auto-pick a single unambiguous hit; a fresh pick overwrites the field.
  useEffect(() => {
    if (!db || !debounced.trim() || results.length === 0) return;
    if (results.length === 1) {
      const part = results[0];
      setSelected(part);
      onChange(skuFieldValue(part));
    }
    setShowResults(true);
    // onChange is the node's field setter — stable per node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  // Model / station / region changes invalidate the current pick.
  useEffect(() => {
    setSelected(null);
    setShowResults(false);
  }, [robotModel, station, region]);

  const pick = (part: SkuPart) => {
    setSelected(part);
    setShowResults(false);
    onChange(skuFieldValue(part));
  };

  // ── Idle states ─────────────────────────────────────────────────────────
  if (dbError) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-card/30 px-2 py-1 text-[10px] text-muted-foreground">
        <PackageSearch className="size-3 text-muted-foreground/60" />
        SKU database unavailable
      </div>
    );
  }
  if (!db) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-card/30 px-2 py-1 text-[10px] text-muted-foreground">
        {robotModel.trim() ? (
          <>
            <Loader2 className="size-3 animate-spin text-accent" />
            Loading spare-parts database…
          </>
        ) : (
          <>
            <PackageSearch className="size-3 text-accent/70" />
            Type a part name to search the SKU database
          </>
        )}
      </div>
    );
  }

  const searching = debounced.trim().length > 0;

  // ── Active card ─────────────────────────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-md border border-accent/25 bg-accent/[0.04]">
      {/* Row 1 — station toggle + region filter */}
      <div className="flex items-center gap-1.5 border-b border-accent/15 bg-accent/10 px-1.5 py-1">
        <div className="flex overflow-hidden rounded border border-border/60" role="group" aria-label="Part side">
          <button
            type="button"
            onClick={() => setStation('robot')}
            title="Robot parts"
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors',
              station === 'robot'
                ? 'bg-accent/25 text-accent'
                : 'text-muted-foreground/70 hover:text-foreground'
            )}
          >
            <Bot className="size-3" />
            Robot
          </button>
          <button
            type="button"
            onClick={() => setStation('station')}
            title="Base-station parts"
            className={cn(
              'flex items-center gap-1 border-l border-border/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors',
              station === 'station'
                ? 'bg-accent/25 text-accent'
                : 'text-muted-foreground/70 hover:text-foreground'
            )}
          >
            <Warehouse className="size-3" />
            Station
          </button>
        </div>

        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Region
        </span>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value as RegionId)}
          title="Market region filter (parts with no market tag are always shown)"
          className="h-5 rounded border border-border/60 bg-card/60 px-1 text-[10px] font-semibold text-foreground outline-none transition-colors hover:border-accent/50 focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {REGION_BUCKETS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
          <option value="ALL">All</option>
        </select>

        {/* Model classifier status */}
        <span
          className={cn(
            'ml-auto min-w-0 max-w-[45%] truncate text-[9px]',
            modelMatch?.models.length
              ? 'text-muted-foreground'
              : 'text-amber-500/90'
          )}
          title={
            modelMatch?.models.length
              ? modelMatch.models.join(' / ')
              : robotModel.trim()
                ? `No parts list matches "${robotModel}" — searching all models`
                : 'Pick a Robot Model above to narrow the search'
          }
        >
          {robotModel.trim()
            ? modelMatch?.models.length
              ? modelMatch.models.length === 1
                ? modelMatch.models[0]
                : `${modelMatch.models[0]} +${modelMatch.models.length - 1}`
              : `No list for “${robotModel}” — all models`
            : 'Model: pick above'}
        </span>
      </div>

      {/* Row 2 — debounced part-name search */}
      <div className="relative px-1.5 py-1.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/60" />
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setShowResults(true)}
          placeholder="Search part name / 零件名 / SKU…"
          className="h-6 w-full rounded border border-border/60 bg-card/60 pl-7 pr-2 text-[11px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 hover:border-accent/40 focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-ring/30"
        />

        {/* Results dropdown — click to pick when several parts match */}
        {searching && showResults && (
          <div className="custom-scrollbar absolute left-1.5 right-1.5 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-card shadow-xl backdrop-blur-xl">
            {results.length === 0 ? (
              <div className="px-2 py-2 text-[10px] text-muted-foreground">
                No {station === 'station' ? 'station ' : ''}parts
                {region !== 'ALL' ? ` (${region})` : ''} match “{debounced}”
              </div>
            ) : (
              results.map((p) => (
                <button
                  key={`${p.model}|${p.sku}`}
                  type="button"
                  onClick={() => pick(p)}
                  className={cn(
                    'flex w-full items-center gap-2 border-b border-border/40 px-1.5 py-1 text-left transition-colors last:border-b-0',
                    selected?.sku === p.sku && selected?.model === p.model
                      ? 'bg-accent/15'
                      : 'hover:bg-accent/10'
                  )}
                  title={`${p.model} · ${p.zh || ''}`}
                >
                  {p.thumb ? (
                    <img
                      src={skuThumbUrl(p)}
                      alt=""
                      loading="lazy"
                      className="size-7 shrink-0 rounded-sm border border-border/40 bg-background object-contain"
                    />
                  ) : (
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-border/40 bg-background">
                      <ImageOff className="size-3 text-muted-foreground/40" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[10px] font-semibold text-foreground">
                      {p.sku}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {p.en || p.zh || '—'}
                      {p.zh && p.en ? ` · ${p.zh}` : ''}
                    </span>
                  </span>
                  {p.isStation && (
                    <span className="shrink-0 rounded bg-accent/15 px-1 text-[8px] font-bold uppercase text-accent">
                      STN
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Row 3 — picked-part preview (picture + details) */}
      {selected && (
        <div className="flex items-center gap-2 border-t border-accent/15 bg-card/40 px-1.5 py-1.5">
          {selected.thumb ? (
            <img
              src={skuThumbUrl(selected)}
              alt={selected.en}
              loading="lazy"
              className="size-14 shrink-0 rounded-md border border-border/60 bg-background object-contain p-0.5"
            />
          ) : (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background">
              <ImageOff className="size-4 text-muted-foreground/40" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[11px] font-bold text-foreground">
              {selected.sku}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              {selected.en || '—'}
            </div>
            {selected.zh && (
              <div className="truncate text-[10px] text-muted-foreground/70">{selected.zh}</div>
            )}
            <div className="mt-0.5 flex flex-wrap gap-1 text-[8px] font-semibold uppercase tracking-wide">
              <span className="rounded bg-border/40 px-1 py-px text-muted-foreground">
                {selected.model.replace(/\s*station$/i, ' STN')}
              </span>
              {selected.type && (
                <span className="rounded bg-border/40 px-1 py-px text-muted-foreground">
                  {selected.type}
                </span>
              )}
              {selected.moq && (
                <span className="rounded bg-border/40 px-1 py-px text-muted-foreground">
                  MOQ {selected.moq}
                </span>
              )}
            </div>
          </div>
          {/* The SKU field above already carries "SKU — EN name". */}
          {!value.startsWith(selected.sku) && (
            <button
              type="button"
              onClick={() => onChange(skuFieldValue(selected))}
              className="shrink-0 rounded border border-accent/50 bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent transition-colors hover:bg-accent/25"
            >
              Fill
            </button>
          )}
        </div>
      )}
    </div>
  );
}
