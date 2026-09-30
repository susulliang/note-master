import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Warehouse, Search, Loader2, PackageSearch, ImageOff, Unlink } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  loadSkuDb,
  loadSkuMeta,
  matchSkuModels,
  searchSkuParts,
  skuFieldValue,
  skuThumbUrl,
  REGION_BUCKETS,
  type RegionId,
  type SkuDb,
  type SkuMeta,
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
 *      With NOTHING typed, the dropdown lists every part matching the
 *      classifiers above (browse mode, alphabetical by SKU).
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
  const [meta, setMeta] = useState<SkuMeta | null>(null);
  const [dbError, setDbError] = useState(false);
  const [station, setStation] = useState<'robot' | 'station'>('robot');
  const [region, setRegion] = useState<RegionId>('NA');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<SkuPart | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [wantsDb, setWantsDb] = useState(false);
  // Auxiliary/override model picker — when set, forces a specific DB model
  // (from _meta.uniqueModelList) instead of the fuzzy match from the model
  // gridbox. Empty string = "use fuzzy match".
  const [overrideModel, setOverrideModel] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Load the index + meta lazily: once a model is picked OR the agent focuses
  // the part search — never on app start.
  useEffect(() => {
    if (db || dbError) return;
    if (!robotModel.trim() && !wantsDb) return;
    let alive = true;
    Promise.all([loadSkuDb(), loadSkuMeta()])
      .then(([d, m]) => {
        if (!alive) return;
        setDb(d);
        setMeta(m);
      })
      .catch(() => alive && setDbError(true));
    return () => {
      alive = false;
    };
  }, [db, dbError, robotModel, wantsDb]);

  // Click anywhere outside the card closes the results dropdown.
  useEffect(() => {
    if (!showResults) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showResults]);

  // Debounce the part-name query. 500 ms gives the agent time to finish a
  // word before we re-filter the (large) parts list — keeps typing smooth
  // and stops the dropdown from re-rendering on every single keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  // Fuzzy-match the form's model against the database's model families.
  const modelMatch = useMemo(
    () => (db && robotModel.trim() ? matchSkuModels(robotModel, db) : null),
    [db, robotModel]
  );

  // Effective model filter: override dropdown wins over fuzzy match. The
  // override lets the agent force an exact DB model when the fuzzy match
  // misfires (e.g. form has "X12" but no list auto-matched).
  const effectiveModels = overrideModel ? [overrideModel] : (modelMatch?.models ?? []);

  // With an EMPTY query this lists every part matching the classifiers
  // (model → robot/station → region), alphabetical by SKU — browse mode.
  const results = useMemo(() => {
    if (!db) return [];
    return searchSkuParts(db, {
      models: effectiveModels,
      station,
      region,
      query: debounced,
      limit: 50,
    });
  }, [db, debounced, effectiveModels, station, region]);

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

  // Model / station / region / override changes invalidate the current pick.
  useEffect(() => {
    setSelected(null);
    setShowResults(false);
  }, [robotModel, station, region, overrideModel]);

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
        {robotModel.trim() || wantsDb ? (
          <>
            <Loader2 className="size-3 animate-spin text-accent" />
            Loading spare-parts database…
          </>
        ) : (
          <>
            <PackageSearch className="size-3 text-accent/70" />
            Pick a model or focus the search to browse all parts
          </>
        )}
      </div>
    );
  }

  // ── Active card ─────────────────────────────────────────────────────────
  // NOTE: no overflow-hidden on the root — the results dropdown is absolutely
  // positioned below the search input and must be able to overflow the card.
  // Rounded corners are preserved per-row (header gets rounded-t, preview
  // gets rounded-b).
  return (
    <div ref={rootRef} className="rounded-md border border-accent/25 bg-accent/[0.04]">
      {/* Row 1 — classifier controls: Robot/Station toggle on its own line,
          region selector on the next line (per v0.2.5 layout request). */}
      <div className="border-b border-accent/15 bg-accent/10 px-1.5 py-1.5 rounded-t-md overflow-hidden">
        {/* Line A — Robot ↔ Station sheet classifier */}
        <div className="flex items-center gap-1.5">
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

          {/* Model classifier status — override (forced) or fuzzy match */}
          <span
            className={cn(
              'ml-auto flex min-w-0 max-w-[55%] items-center gap-1 truncate text-[9px]',
              overrideModel
                ? 'text-accent'
                : modelMatch?.models.length
                  ? 'text-muted-foreground'
                  : 'text-amber-500/90'
            )}
            title={
              overrideModel
                ? `Forced model (override): ${overrideModel}`
                : modelMatch?.models.length
                  ? modelMatch.models.join(' / ')
                  : robotModel.trim()
                    ? `No parts list matches "${robotModel}" — searching all models. Use the Model dropdown below to force one.`
                    : 'Pick a Robot Model above to narrow the search'
            }
          >
            {overrideModel ? (
              <>
                <Unlink className="size-3 shrink-0" />
                <span className="truncate">{overrideModel}</span>
              </>
            ) : robotModel.trim() ? (
              modelMatch?.models.length ? (
                modelMatch.models.length === 1 ? (
                  modelMatch.models[0]
                ) : (
                  `${modelMatch.models[0]} +${modelMatch.models.length - 1}`
                )
              ) : (
                `No list for “${robotModel}” — all models`
              )
            ) : (
              'Model: pick above'
            )}
          </span>
        </div>

        {/* Line B — Region filter (default NA) */}
        <div className="mt-1 flex items-center gap-1.5">
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
        </div>

        {/* Line C — Auxiliary model override (exception handling). Lists every
            unique model in the DB (from _meta.json). Selecting one FORCES that
            exact model, overriding the fuzzy match from the model gridbox. */}
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Model
          </span>
          <select
            value={overrideModel}
            onChange={(e) => setOverrideModel(e.target.value)}
            title="Force a specific parts-list model (overrides the fuzzy match from the Robot Model box above)"
            className={cn(
              'h-5 min-w-0 flex-1 rounded border bg-card/60 px-1 text-[10px] font-semibold text-foreground outline-none transition-colors hover:border-accent/50 focus-visible:ring-2 focus-visible:ring-ring/40',
              overrideModel ? 'border-accent/60 text-accent' : 'border-border/60'
            )}
          >
            <option value="">Auto (fuzzy match)</option>
            {meta?.uniqueModelList.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2 — debounced part-name search */}
      <div className="relative px-1.5 py-1.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/60" />
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => {
            setWantsDb(true);
            setShowResults(true);
          }}
          placeholder="Search part name / 零件名 / SKU…"
          className="h-6 w-full rounded border border-border/60 bg-card/60 pl-7 pr-2 text-[11px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 hover:border-accent/40 focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-ring/30"
        />

        {/* Results dropdown — browse-all when the query is empty, filtered
            matches when typing; click a row to pick */}
        {showResults && (
          <div className="custom-scrollbar absolute left-1.5 right-1.5 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-card shadow-xl backdrop-blur-xl">
            {results.length === 0 ? (
              <div className="px-2 py-2 text-[10px] text-muted-foreground">
                {debounced.trim()
                  ? `No ${station === 'station' ? 'station ' : ''}parts${region !== 'ALL' ? ` (${region})` : ''} match “${debounced}”`
                  : `No ${station === 'station' ? 'station ' : ''}parts${region !== 'ALL' ? ` (${region})` : ''}${robotModel.trim() ? ` for “${robotModel}”` : ' found'}`}
              </div>
            ) : (
              <>
              {results.map((p) => (
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
              ))}
              {results.length === 50 && (
                <div className="border-t border-border/40 bg-background/40 px-2 py-1 text-[9px] text-muted-foreground/70">
                  First 50 matches — type to narrow down
                </div>
              )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Row 3 — picked-part preview (picture + details) */}
      {selected && (
        <div className="flex items-center gap-2 border-t border-accent/15 bg-card/40 px-1.5 py-1.5 rounded-b-md">
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
