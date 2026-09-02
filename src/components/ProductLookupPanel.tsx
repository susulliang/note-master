import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Package,
  Search,
  Sparkles,
  ChevronRight,
  AlertTriangle,
  X,
  Link2,
  BookOpen,
  Cpu,
  Tag,
  Info,
  Lightbulb,
  Loader2,
} from 'lucide-react';
import {
  findModels,
  freeSearch,
  getProductIndex,
  type FreeSearchHit,
  type GoatErrorCode,
  type ModelMatch,
} from '@/utils/productData';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { renderBodyMarkdown, resolveSopImageSrc } from './SopPanel.md';

interface ProductLookupPanelProps {
  /** Current robot model value from the form (DEEBOT_MODEL node). */
  robotModel: string;
  /**
   * Additional optional fields that feed into the auto fuzzy search:
   *  - issueDescription: cross-checks error codes + troubleshooting.
   */
  issueDescription?: string;
  issueType?: string;
}

type TabKind = 'specs' | 'errors' | 'selling' | 'scientist' | 'free';

interface Tab {
  kind: TabKind;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
}

const TABS_META: Array<Omit<Tab, 'count'>> = [
  { kind: 'specs', label: 'Specs', icon: Cpu },
  { kind: 'errors', label: 'Error Codes', icon: AlertTriangle },
  { kind: 'selling', label: '卖点 · Pitch', icon: Sparkles },
  { kind: 'scientist', label: '代号 · Scientist', icon: Tag },
  { kind: 'free', label: 'All Search', icon: Search },
];

/**
 * Product Lookup gridbox — the companion panel that watches the DEEBOT_MODEL
 * field and, the moment the agent selects a model, pulls up:
 *   • Cross-category comparison specs (DEEBOT / GOAT / WINBOT / TechSpecs)
 *   • GOAT error codes + solutions (if the issue description mentions E000)
 *   • 核心卖点 selling points + customer-facing script
 *   • 科学家代号 internal scientist code
 *   • Free-text keyword search across troubleshooting + navigation sheets
 *
 * A manual search input sits at the top for spot queries (e.g. "water tank
 * capacity", "error 601", "scientist code for X2 OMNI").
 */
export default function ProductLookupPanel({
  robotModel,
  issueDescription = '',
  issueType = '',
}: ProductLookupPanelProps) {
  const index = useMemo(() => getProductIndex(), []);
  const [manualQuery, setManualQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabKind>('specs');
  const [pinnedModel, setPinnedModel] = useState<string | null>(null);
  const [errorCodeQuery, setErrorCodeQuery] = useState('');

  // --- Debounced manual search ------------------------------------------------
  const debounceRef = useRef<number | null>(null);
  const [manualQueryDebounced, setManualQueryDebounced] = useState('');
  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setManualQueryDebounced(manualQuery), 250);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [manualQuery]);

  // --- Auto-search: combine robot model + issue text + manual query ----------
  const effectiveQuery = useMemo(() => {
    const parts = [robotModel, issueType, issueDescription, manualQueryDebounced].filter(Boolean);
    return parts.join(' ');
  }, [robotModel, issueType, issueDescription, manualQueryDebounced]);

  // --- Error code extraction -------------------------------------------------
  useEffect(() => {
    const m = effectiveQuery.match(/E?\s*(\d{3,4})/i);
    setErrorCodeQuery(m ? m[1] : '');
  }, [effectiveQuery]);

  // --- Model matches ---------------------------------------------------------
  const modelHits: ModelMatch[] = useMemo(() => {
    const primaryQuery = pinnedModel ?? robotModel;
    const q = pinnedModel ? pinnedModel : primaryQuery || manualQueryDebounced;
    return findModels(index, q, 12);
  }, [index, pinnedModel, robotModel, manualQueryDebounced]);

  const selectedModelName = useMemo(() => {
    if (pinnedModel) return pinnedModel;
    const topHit = modelHits.find((m) => !m.errorCode);
    return topHit?.name ?? '';
  }, [pinnedModel, modelHits]);

  // Specs: group across comparisons for the chosen model name
  const specSections = useMemo(() => {
    if (!selectedModelName) return [];
    // Need to token-match because "T90 PRO OMNI CARE" might be stored as
    // "T90 PRO OMNI Care" or a different case variant depending on sheet.
    const tokens = new Set<string>();
    for (const t of index.allModels) {
      if (t.name.toLowerCase() === selectedModelName.toLowerCase()) {
        for (const tk of t.tokens) tokens.add(tk);
      }
    }
    const results: Array<{
      sheetTitle: string;
      section: string;
      rows: Array<{ spec: string; value: string }>;
    }> = [];
    for (const c of index.comparisons) {
      // Find best-matching model in this sheet
      let best: { name: string; score: number } | null = null;
      for (const m of c.models) {
        const ts = c.modelTokens.get(m);
        if (!ts) continue;
        let score = 0;
        for (const tok of ts) if (tokens.has(tok)) score += 1;
        if (score > 0 && (!best || score > best.score)) best = { name: m, score };
        // Direct string hit wins instantly
        if (m.toLowerCase() === selectedModelName.toLowerCase()) {
          best = { name: m, score: 999 };
          break;
        }
      }
      if (!best) continue;
      for (const [section, modelMap] of Object.entries(c.sections)) {
        const entries = modelMap[best.name];
        if (!entries) continue;
        const rows = Object.entries(entries).map(([spec, value]) => ({ spec, value }));
        if (rows.length === 0) continue;
        results.push({ sheetTitle: c.sheetTitle, section, rows });
      }
    }
    return results;
  }, [index, selectedModelName]);

  // --- Error code rows --------------------------------------------------------
  const errorCodeHits: GoatErrorCode[] = useMemo(() => {
    if (errorCodeQuery) {
      const hit = index.goatErrorCodes.find((e) => e.code === errorCodeQuery);
      if (hit) return [hit];
    }
    // Fallback: scan all error codes against keyword overlap with issue text
    const q = `${issueType} ${issueDescription} ${manualQueryDebounced}`.trim();
    if (!q) return [];
    const qTokens = new Set<string>();
    for (const t of q.toLowerCase().split(/\W+/)) if (t) qTokens.add(t);
    return index.goatErrorCodes
      .map((e) => {
        const text = `${e.meaning} ${e.solution}`.toLowerCase();
        let score = 0;
        for (const tok of qTokens) if (text.includes(tok)) score += 1;
        return { e, score };
      })
      .filter((r) => r.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((r) => r.e);
  }, [index, errorCodeQuery, issueType, issueDescription, manualQueryDebounced]);

  // --- Selling points ---------------------------------------------------------
  const sellingHits = useMemo(() => {
    if (!selectedModelName && !manualQueryDebounced) return index.sellingPoints.slice(0, 3);
    const q = selectedModelName || manualQueryDebounced;
    const qTokens = new Set<string>();
    for (const t of (q || '').toLowerCase().split(/\W+/)) if (t) qTokens.add(t);
    const scored = index.sellingPoints
      .map((sp) => {
        let s = 0;
        for (const tok of sp.tokens) if (qTokens.has(tok)) s += 1;
        const bodyHit = `${sp.bullets} ${sp.pitch}`.toLowerCase();
        for (const tok of qTokens) if (bodyHit.includes(tok)) s += 1;
        return { sp, score: s };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return scored.map((r) => r.sp);
  }, [index, selectedModelName, manualQueryDebounced]);

  // --- Scientist code hits ---------------------------------------------------
  const scientistHits = useMemo(() => {
    if (!selectedModelName && !manualQueryDebounced) return index.scientistCodes.slice(0, 6);
    const q = (selectedModelName || '') + ' ' + manualQueryDebounced;
    const qTokens = new Set<string>();
    for (const t of q.toLowerCase().split(/\W+/)) if (t) qTokens.add(t);
    return index.scientistCodes
      .map((s) => {
        let sc = 0;
        for (const tok of s.tokens) if (qTokens.has(tok)) sc += 1;
        const extraHit = `${s.category} ${s.scientist}`.toLowerCase();
        for (const tok of qTokens) if (extraHit.includes(tok)) sc += 1;
        return { s, score: sc };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.s);
  }, [index, selectedModelName, manualQueryDebounced]);

  // --- Free search hits -------------------------------------------------------
  const freeHits: FreeSearchHit[] = useMemo(
    () => freeSearch(index, manualQueryDebounced || `${robotModel} ${issueType} ${issueDescription}`, 6),
    [index, manualQueryDebounced, robotModel, issueType, issueDescription]
  );

  const counts = useMemo<Record<TabKind, number>>(
    () => ({
      specs: specSections.reduce((sum, s) => sum + s.rows.length, 0),
      errors: errorCodeHits.length,
      selling: sellingHits.length,
      scientist: scientistHits.length,
      free: freeHits.length,
    }),
    [specSections, errorCodeHits, sellingHits, scientistHits, freeHits]
  );

  // Auto-switch to the tab with the most useful content
  useEffect(() => {
    if (errorCodeHits.length > 0) setActiveTab((prev) => (prev === 'specs' ? 'errors' : prev));
  }, [errorCodeHits.length]);

  const tabs: Tab[] = TABS_META.map((t) => ({ ...t, count: counts[t.kind] }));

  const handlePickSuggestion = useCallback((name: string) => {
    setPinnedModel(name);
    setActiveTab('specs');
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {/* --- Top bar: search + auto indicator --- */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-2 py-1.5 backdrop-blur-sm">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <Input
          value={manualQuery}
          onChange={(e) => {
            setManualQuery(e.target.value);
            setPinnedModel(null);
          }}
          placeholder="Search model, spec, error code (E601)…"
          className="!h-7 border-0 !bg-transparent px-0 py-0 text-xs font-semibold placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        {pinnedModel && (
          <button
            type="button"
            onClick={() => setPinnedModel(null)}
            className="flex shrink-0 items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary transition-colors hover:bg-primary/25"
            title="Release pinned model → auto-follow DEEBOT model dropdown"
          >
            <Link2 className="size-3" />
            {pinnedModel}
            <X className="size-3 opacity-70 hover:opacity-100" />
          </button>
        )}
        {!pinnedModel && robotModel && (
          <div className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary/90">
            <Sparkles className="size-3" />
            Auto: {robotModel.length > 22 ? robotModel.slice(0, 22) + '…' : robotModel}
          </div>
        )}
      </div>

      {/* --- Quick-pick model chips --- */}
      {modelHits.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-foreground/5 bg-foreground/[0.02] px-2 py-1.5">
          <span className="mr-1 inline-flex items-center gap-1 rounded bg-foreground/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            <Package className="size-3" />
            Models
          </span>
          {modelHits.slice(0, 8).map((m) => {
            const isSelected = pinnedModel
              ? m.name.toLowerCase() === pinnedModel.toLowerCase()
              : !m.errorCode && m.name.toLowerCase() === (selectedModelName || '').toLowerCase();
            return (
              <button
                key={m.origin + m.name}
                type="button"
                onClick={() => m.errorCode ? setActiveTab('errors') : handlePickSuggestion(m.name)}
                className={cn(
                  'glass-chip inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold transition-colors',
                  isSelected && !m.errorCode
                    ? '!bg-primary/25 !text-primary ring-1 ring-primary/40'
                    : m.errorCode
                      ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                      : 'hover:bg-foreground/10'
                )}
                title={m.origin}
              >
                {m.errorCode && <AlertTriangle className="size-3" />}
                {m.name}
                <span className="ml-0.5 rounded bg-foreground/10 px-1 text-[9px] text-muted-foreground">
                  {Math.round(m.score * 100)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* --- Tabs --- */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border pb-1.5">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.kind;
          return (
            <button
              key={t.kind}
              type="button"
              onClick={() => setActiveTab(t.kind)}
              className={cn(
                'group inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
                active
                  ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                  : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
              )}
            >
              <Icon className={cn('size-3.5', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
              {t.label}
              <span
                className={cn(
                  'rounded px-1 text-[9px] font-bold',
                  active ? 'bg-primary/25 text-primary' : 'bg-foreground/10 text-muted-foreground'
                )}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* --- Tab content: scrollable body --- */}
      <div className="custom-scrollbar -mr-1 max-h-[340px] overflow-y-auto pr-1 text-[11px]">
        {activeTab === 'specs' && <SpecsTab sections={specSections} modelName={selectedModelName} />}
        {activeTab === 'errors' && <ErrorCodesTab rows={errorCodeHits} />}
        {activeTab === 'selling' && <SellingTab rows={sellingHits} />}
        {activeTab === 'scientist' && <ScientistTab rows={scientistHits} />}
        {activeTab === 'free' && <FreeTab hits={freeHits} />}
      </div>
    </div>
  );
}

/* ---------------- Sub components ---------------------------------------- */

function EmptyState({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <Icon className="size-6 text-muted-foreground/40" />
      <p className="text-[11px] font-semibold text-muted-foreground/70">{text}</p>
    </div>
  );
}

function SpecsTab({
  sections,
  modelName,
}: {
  sections: Array<{
    sheetTitle: string;
    section: string;
    rows: Array<{ spec: string; value: string }>;
  }>;
  modelName: string;
}) {
  if (sections.length === 0) {
    return (
      <EmptyState
        icon={Package}
        text={
          modelName
            ? `No spec sections loaded for "${modelName}". Pick a model or type a spec keyword.`
            : 'Select a DEEBOT / GOAT / WINBOT model above → specs appear here.'
        }
      />
    );
  }
  // Group sections by sheet
  const bySheet = new Map<string, typeof sections>();
  for (const s of sections) {
    if (!bySheet.has(s.sheetTitle)) bySheet.set(s.sheetTitle, []);
    bySheet.get(s.sheetTitle)!.push(s);
  }
  return (
    <div className="space-y-3">
      {Array.from(bySheet.entries()).map(([sheetTitle, secs]) => (
        <div key={sheetTitle}>
          <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary/80">
            <BookOpen className="size-3" />
            {sheetTitle}
          </div>
          {secs.map((s) => (
            <div key={s.section} className="mb-2 overflow-hidden rounded-md border border-border/60">
              <div className="flex items-center gap-1 border-b border-border/60 bg-foreground/[0.03] px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                <ChevronRight className="size-3" />
                {s.section}
              </div>
              <div className="divide-y divide-border/40">
                {s.rows.map((r) => (
                  <div
                    key={r.spec + r.value.slice(0, 10)}
                    className="grid grid-cols-[40%_1fr] gap-2 px-2 py-1.5 hover:bg-foreground/[0.03]"
                  >
                    <div className="truncate font-bold text-foreground/85">{r.spec}</div>
                    <div className="whitespace-pre-wrap break-words text-foreground/75 leading-relaxed">
                      {r.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ErrorCodesTab({ rows }: { rows: GoatErrorCode[] }) {
  if (rows.length === 0) {
    return <EmptyState icon={AlertTriangle} text="No error-code hits yet. Type E601 / 504 or describe the issue in Detailed Issue." />;
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.code} className="overflow-hidden rounded-md border border-red-500/20 bg-red-500/[0.04]">
          <div className="flex items-center gap-2 border-b border-red-500/15 bg-red-500/10 px-2 py-1">
            <AlertTriangle className="size-3.5 text-red-400" />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-red-400">E{r.code}</span>
            <span className="ml-auto truncate text-[11px] font-bold text-red-300/80">
              {(r.meaning || '').split('\n')[0]}
            </span>
          </div>
          <div className="space-y-1.5 px-2 py-1.5">
            {r.meaning && (
              <div className="grid grid-cols-[52px_1fr] gap-2">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Meaning</span>
                <div className="whitespace-pre-wrap leading-relaxed text-foreground/85">{r.meaning}</div>
              </div>
            )}
            {r.solution && (
              <div className="grid grid-cols-[52px_1fr] gap-2">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Fix</span>
                <div className="whitespace-pre-wrap leading-relaxed text-foreground/85">{r.solution}</div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SellingTab({
  rows,
}: {
  rows: Array<{ model: string; series: string; subSeries: string; bullets: string; pitch: string }>;
}) {
  if (rows.length === 0) {
    return <EmptyState icon={Sparkles} text="No selling-point hits. Pick a model or search a feature keyword." />;
  }
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.model + i} className="overflow-hidden rounded-md border border-primary/20 bg-primary/[0.03]">
          <div className="flex items-center gap-2 border-b border-primary/15 bg-primary/10 px-2 py-1">
            <Sparkles className="size-3.5 text-primary/90" />
            <span className="text-[11px] font-extrabold text-primary">{r.model}</span>
            {(r.series || r.subSeries) && (
              <span className="ml-auto truncate text-[10px] text-primary/80">
                {[r.series, r.subSeries].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          <div className="space-y-2 px-2 py-1.5">
            {r.bullets && (
              <>
                <div className="text-[10px] font-bold uppercase text-muted-foreground">Bullets</div>
                <div className="whitespace-pre-wrap leading-relaxed text-foreground/85">{r.bullets}</div>
              </>
            )}
            {r.pitch && (
              <>
                <div className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground">
                  <Lightbulb className="size-3" />
                  Pitch script
                </div>
                <div className="whitespace-pre-wrap leading-relaxed text-foreground/85">{r.pitch}</div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScientistTab({
  rows,
}: {
  rows: Array<{ model: string; category: string; scientist: string }>;
}) {
  if (rows.length === 0) {
    return <EmptyState icon={Tag} text="No scientist-code matches. Type the model name or internal codename." />;
  }
  return (
    <div className="overflow-hidden rounded-md border border-border/60">
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-1 border-b border-border/60 bg-foreground/[0.04] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>Series</span>
        <span>Model</span>
        <span>Scientist Code</span>
      </div>
      <div className="divide-y divide-border/40">
        {rows.map((r, i) => (
          <div
            key={r.model + i}
            className="grid grid-cols-[1fr_1fr_1fr] gap-1 px-2 py-1.5 text-[11px] font-semibold hover:bg-foreground/[0.03]"
          >
            <span className="truncate text-muted-foreground">{r.category}</span>
            <span className="truncate text-foreground/90">{r.model}</span>
            <span className="truncate text-accent-foreground/80">
              <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">{r.scientist}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FreeTab({ hits }: { hits: FreeSearchHit[] }) {
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLightbox(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  if (hits.length === 0) {
    return <EmptyState icon={Search} text="No free-text hits. Try keyword search: 吸力 / warranty / mop height…" />;
  }
  return (
    <div className="space-y-2">
      {hits.map((h, i) => (
        <div key={h.sheetId + h.title + i} className="overflow-hidden rounded-md border border-border/60">
          <div className="flex items-center gap-2 border-b border-border/60 bg-foreground/[0.04] px-2 py-1">
            <Info className="size-3 text-muted-foreground" />
            <span className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {h.sheetId}
            </span>
            <span className="ml-auto shrink-0 rounded bg-foreground/10 px-1 text-[9px] font-bold text-muted-foreground">
              {Math.round(h.score * 100)}
            </span>
          </div>
          <div className="px-2 py-1.5">
            <div className="mb-1 text-[11px] font-extrabold text-foreground/90">{h.title}</div>
            <div className="whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/80">
              {renderBodyMarkdown(h.body.split(/\r?\n/), {
                onImageClick: (src, alt) =>
                  setLightbox({ src: resolveSopImageSrc(src), alt }),
              })}
            </div>
          </div>
        </div>
      ))}
      {lightbox && (
        <div
          role="dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox.src}
            alt={lightbox.alt}
            className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
    </div>
  );
}
