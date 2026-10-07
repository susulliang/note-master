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
  HelpCircle,
  Languages,
  FileSearch,
  Newspaper,
  ChevronDown,
  CircuitBoard,
  Smartphone,
  GitCompare,
} from 'lucide-react';
import {
  findModels,
  freeSearch,
  getProductIndex,
  searchFaqs,
  type FaqSearchHit,
  type FreeSearchHit,
  type GoatErrorCode,
  type ModelMatch,
  type ProductIndex,
} from '@/utils/productData';
import type { TemplateEntry } from '@/lib/amr-templates';
import {
  loadNewsIndex,
  searchNews,
  type NewsHit,
  type NewsItem,
} from '@/utils/newsData';
import {
  loadSoftwareUpdatesIndex,
  searchSoftwareUpdates,
  type SoftwareUpdateEntry,
  type SoftwareUpdateHit,
} from '@/utils/softwareUpdatesData';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DEEBOT_MODELS } from '@/data/ticket';
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
  /** Hide clickable quick-pick model chips during voice capture */
  quickInsertHidden?: boolean;
  /** AMR / TBS / ERR / MACRO / FAQ template matches (from the Detailed
   *  Issue Description) — folded in as the "Matches" tab (v0.2.0). */
  templateMatches?: TemplateEntry[];
  onOpenTemplate?: (template: TemplateEntry) => void;
}

type TabKind = 'specs' | 'errors' | 'faq' | 'templates' | 'news' | 'firmware' | 'appupdates' | 'scientist' | 'free' | 'selling';

interface Tab {
  kind: TabKind;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
}

const TABS_META: Array<Omit<Tab, 'count'>> = [
  { kind: 'specs', label: 'Specs', icon: Cpu },
  { kind: 'errors', label: 'Error Codes', icon: AlertTriangle },
  // FAQ tab inserted here (after Errors). Selling/Pitch moved to last (pitch demoted).
  { kind: 'faq', label: 'FAQ', icon: HelpCircle },
  // Matching templates (AMR / TBS / ERR / MACRO / FAQ) folded in as a tab
  // (v0.2.0) instead of a standalone drawer panel.
  { kind: 'templates', label: 'Matches', icon: FileSearch },
  // Knowledge updates curated from the Feishu 知识点分享群 (v0.2.0).
  { kind: 'news', label: 'News & Updates', icon: Newspaper },
  // Firmware OTA history + ECOVACS HOME app release notes pulled from the
  // Feishu "Ecovacs NA 查询宝典" spreadsheet (v0.2.1).
  { kind: 'firmware', label: 'Firmwares', icon: CircuitBoard },
  { kind: 'appupdates', label: 'App Updates', icon: Smartphone },
  { kind: 'scientist', label: '代号 · Scientist', icon: Tag },
  { kind: 'free', label: 'All Search', icon: Search },
  { kind: 'selling', label: '卖点 · Pitch', icon: Sparkles },
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

export interface SpecSection {
  sheetTitle: string;
  section: string;
  rows: Array<{ spec: string; value: string }>;
}

/**
 * Resolve all spec sections for a given model name by token-matching against
 * each comparison sheet. Returns sections grouped by sheet with {spec, value}
 * rows. Token matching handles case variants ("T90 PRO OMNI Care" vs "CARE").
 */
function getSpecSectionsForModel(index: ProductIndex, modelName: string): SpecSection[] {
  if (!modelName) return [];
  const tokens = new Set<string>();
  for (const t of index.allModels) {
    if (t.name.toLowerCase() === modelName.toLowerCase()) {
      for (const tk of t.tokens) tokens.add(tk);
    }
  }
  const results: SpecSection[] = [];
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
      if (m.toLowerCase() === modelName.toLowerCase()) {
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
}

export default function ProductLookupPanel({
  robotModel,
  issueDescription = '',
  issueType = '',
  quickInsertHidden = false,
  templateMatches,
  onOpenTemplate,
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

  // --- Debounced model/issue props --------------------------------------------
  // The robot model combobox + issue description inputs live on the main
  // form and change on every keystroke. Feeding those raw values straight
  // into findModels / freeSearch re-runs fuzzy matching on every render,
  // which is what agents describe as "laggy" when typing the model. We
  // debounce here instead of in the form so SF-scrape / LLM / combobox
  // selection (the three main write paths to these fields) update the
  // panel promptly — only live keystrokes get the 300ms debounce.
  const modelDebounceRef = useRef<number | null>(null);
  const [robotModelDebounced, setRobotModelDebounced] = useState(robotModel);
  useEffect(() => {
    if (modelDebounceRef.current !== null) window.clearTimeout(modelDebounceRef.current);
    modelDebounceRef.current = window.setTimeout(() => setRobotModelDebounced(robotModel), 300);
    return () => {
      if (modelDebounceRef.current !== null) window.clearTimeout(modelDebounceRef.current);
    };
  }, [robotModel]);

  const issueDebounceRef = useRef<number | null>(null);
  const [issueTypeDebounced, setIssueTypeDebounced] = useState(issueType);
  const [issueDescDebounced, setIssueDescDebounced] = useState(issueDescription);
  useEffect(() => {
    if (issueDebounceRef.current !== null) window.clearTimeout(issueDebounceRef.current);
    issueDebounceRef.current = window.setTimeout(() => {
      setIssueTypeDebounced(issueType);
      setIssueDescDebounced(issueDescription);
    }, 300);
    return () => {
      if (issueDebounceRef.current !== null) window.clearTimeout(issueDebounceRef.current);
    };
  }, [issueType, issueDescription]);

  // --- Auto-search: combine robot model + issue text + manual query ----------
  const effectiveQuery = useMemo(() => {
    const parts = [robotModelDebounced, issueTypeDebounced, issueDescDebounced, manualQueryDebounced].filter(Boolean);
    return parts.join(' ');
  }, [robotModelDebounced, issueTypeDebounced, issueDescDebounced, manualQueryDebounced]);

  // --- Error code extraction -------------------------------------------------
  useEffect(() => {
    const m = effectiveQuery.match(/E?\s*(\d{3,4})/i);
    setErrorCodeQuery(m ? m[1] : '');
  }, [effectiveQuery]);

  // --- Model matches ---------------------------------------------------------
  const modelHits: ModelMatch[] = useMemo(() => {
    const primaryQuery = pinnedModel ?? robotModelDebounced;
    const q = pinnedModel ? pinnedModel : primaryQuery || manualQueryDebounced;
    return findModels(index, q, 12);
  }, [index, pinnedModel, robotModelDebounced, manualQueryDebounced]);

  const selectedModelName = useMemo(() => {
    if (pinnedModel) return pinnedModel;
    const topHit = modelHits.find((m) => !m.errorCode);
    return topHit?.name ?? '';
  }, [pinnedModel, modelHits]);

  // Specs: group across comparisons for the chosen model name
  const specSections = useMemo(
    () => getSpecSectionsForModel(index, selectedModelName),
    [index, selectedModelName]
  );

  // --- Spec comparison (second model) ---------------------------------------
  // A separate model selector lets agents compare two models' specs side by
  // side. Only active when a compare model is picked AND its specs load.
  const [compareModel, setCompareModel] = useState<string | null>(null);
  const compareSpecSections = useMemo(
    () => (compareModel ? getSpecSectionsForModel(index, compareModel) : []),
    [index, compareModel]
  );
  // All unique model names from the product index — drives the compare dropdown.
  // Reuses the exact same list as the Robot Model dropdown (DEEBOT_MODELS) so
  // agents compare against models they can actually select in the form.
  const allModelNames = useMemo(() => DEEBOT_MODELS, []);

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
    () => freeSearch(index, manualQueryDebounced || `${robotModelDebounced} ${issueTypeDebounced} ${issueDescDebounced}`, 6),
    [index, manualQueryDebounced, robotModelDebounced, issueTypeDebounced, issueDescDebounced]
  );

  // --- FAQ search hits --------------------------------------------------------
  const faqHits: FaqSearchHit[] = useMemo(() => {
    const activeModel = pinnedModel ?? robotModelDebounced;
    const query = manualQueryDebounced || `${issueTypeDebounced} ${issueDescDebounced}`;
    if (!activeModel && !query.trim()) {
      // Browse case: show 15 newest/most relevant FAQs across the index
      return index.faqs && index.faqs.length
        ? index.faqs
            .slice()
            .sort((a, b) => b.version - a.version)
            .slice(0, 15)
            .map((f) => ({ ...f, score: 0.05, modelMatchScore: 0 }))
        : [];
    }
    return searchFaqs(index, { model: activeModel, query, limit: 25 });
  }, [index, pinnedModel, robotModelDebounced, manualQueryDebounced, issueTypeDebounced, issueDescDebounced]);

  // --- News & Updates hits (Feishu knowledge-sharing digest) -----------------
  // The news markdown chunks load asynchronously AFTER first paint so the
  // app shell renders immediately (see loadNewsIndex); hits stay empty
  // until the index resolves.
  const [newsIndex, setNewsIndex] = useState<NewsItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadNewsIndex().then((idx) => {
      if (alive) setNewsIndex(idx);
    });
    return () => {
      alive = false;
    };
  }, []);
  const newsHits: NewsHit[] = useMemo(
    () =>
      newsIndex
        ? searchNews(
            newsIndex,
            manualQueryDebounced || `${robotModelDebounced} ${issueTypeDebounced} ${issueDescDebounced}`,
            8
          )
        : [],
    [newsIndex, manualQueryDebounced, robotModelDebounced, issueTypeDebounced, issueDescDebounced]
  );

  // --- Software updates (Firmwares / App Updates tabs) ----------------------
  // Parsed from the software_updates/ markdown chunks, loaded async after
  // first paint (same pattern as the news index above).
  const [suIndex, setSuIndex] = useState<SoftwareUpdateEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadSoftwareUpdatesIndex().then((idx) => {
      if (alive) setSuIndex(idx);
    });
    return () => {
      alive = false;
    };
  }, []);
  const firmwareHits: SoftwareUpdateHit[] = useMemo(
    () =>
      suIndex
        ? searchSoftwareUpdates(
            suIndex,
            manualQueryDebounced || `${robotModelDebounced} ${issueTypeDebounced} ${issueDescDebounced}`,
            8,
            'firmware'
          )
        : [],
    [suIndex, manualQueryDebounced, robotModelDebounced, issueTypeDebounced, issueDescDebounced]
  );
  const appHits: SoftwareUpdateHit[] = useMemo(
    () =>
      suIndex
        ? searchSoftwareUpdates(
            suIndex,
            manualQueryDebounced || `${robotModelDebounced} ${issueTypeDebounced} ${issueDescDebounced}`,
            8,
            'app'
          )
        : [],
    [suIndex, manualQueryDebounced, robotModelDebounced, issueTypeDebounced, issueDescDebounced]
  );

  const counts = useMemo<Record<TabKind, number>>(
    () => ({
      specs: specSections.reduce((sum, s) => sum + s.rows.length, 0),
      errors: errorCodeHits.length,
      faq: faqHits.length,
      templates: templateMatches?.length ?? 0,
      // Show live matches when a query is active, otherwise the total
      // number of curated updates (browse case). 0 while still loading.
      news: newsIndex ? (newsHits.length > 0 ? newsHits.length : newsIndex.length) : 0,
      firmware: suIndex
        ? firmwareHits.length > 0
          ? firmwareHits.length
          : suIndex.filter((e) => e.kind === 'firmware').length
        : 0,
      appupdates: suIndex
        ? appHits.length > 0
          ? appHits.length
          : suIndex.filter((e) => e.kind === 'app').length
        : 0,
      selling: sellingHits.length,
      scientist: scientistHits.length,
      free: freeHits.length,
    }),
    [specSections, errorCodeHits, faqHits, sellingHits, scientistHits, freeHits, templateMatches, newsIndex, newsHits]
  );

  // Auto-switch to the tab with the most useful content
  useEffect(() => {
    if (errorCodeHits.length > 0) setActiveTab((prev) => (prev === 'specs' ? 'errors' : prev));
    else if (faqHits.length > 0 && manualQueryDebounced.trim().length >= 3)
      setActiveTab((prev) => (prev === 'specs' || prev === 'errors' ? 'faq' : prev));
  }, [errorCodeHits.length, faqHits.length, manualQueryDebounced]);

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
        {/* Compare-with model selector — renders a 2-column spec table when set */}
        <div className="flex shrink-0 items-center gap-1">
          <GitCompare className="size-3 text-muted-foreground" />
          <Select
            value={compareModel ?? '__none__'}
            onValueChange={(v) => setCompareModel(v === '__none__' ? null : v)}
          >
            <SelectTrigger
              className="h-6 w-[130px] !border-border/50 !bg-card/60 px-2 text-[10px] font-semibold text-foreground/80 hover:!border-primary/40"
              title="Compare specs side by side with another model"
            >
              <SelectValue placeholder="Compare…" />
            </SelectTrigger>
            <SelectContent className="max-h-[320px] text-[11px]">
              <SelectItem value="__none__">— No comparison —</SelectItem>
              {allModelNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {compareModel && (
            <button
              type="button"
              onClick={() => setCompareModel(null)}
              className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              title="Clear comparison"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* --- Quick-pick model chips — hidden during voice capture --- */}
      {!quickInsertHidden && modelHits.length > 0 && (
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
      <div className="custom-scrollbar -mr-1 min-h-0 flex-1 overflow-y-auto pr-1 text-[11px]">
        {activeTab === 'specs' && (
          <SpecsTab
            modelA={{ name: selectedModelName, sections: specSections }}
            modelB={
              compareModel && compareSpecSections.length > 0
                ? { name: compareModel, sections: compareSpecSections }
                : undefined
            }
          />
        )}
        {activeTab === 'errors' && <ErrorCodesTab rows={errorCodeHits} />}
        {activeTab === 'faq' && <FaqTab hits={faqHits} />}
        {activeTab === 'templates' && (
          <MatchesTab matches={templateMatches ?? []} onOpenTemplate={onOpenTemplate} />
        )}
        {activeTab === 'news' && <NewsTab hits={newsHits} index={newsIndex} />}
        {activeTab === 'firmware' && (
          <SoftwareUpdatesTab hits={firmwareHits} index={suIndex} kind="firmware" />
        )}
        {activeTab === 'appupdates' && (
          <SoftwareUpdatesTab hits={appHits} index={suIndex} kind="app" />
        )}
        {activeTab === 'selling' && <SellingTab rows={sellingHits} />}
        {activeTab === 'scientist' && <ScientistTab rows={scientistHits} />}
        {activeTab === 'free' && <FreeTab hits={freeHits} />}
      </div>
    </div>
  );
}

/* ---------------- Sub components ---------------------------------------- */

/**
 * News & Updates tab — knowledge updates curated from the Feishu
 * 知识点分享群 (one accordion item per markdown file under news/).
 * Body renders through the shared SOP markdown renderer; relative
 * `assets/…` image refs are rewritten to the served `${BASE}news/assets/…`
 * URL prefix before rendering.
 */
function NewsTab({ hits, index }: { hits: NewsHit[]; index: NewsItem[] | null }) {
  const [openId, setOpenId] = useState<string | null>(null);

  // Markdown chunks still loading — async skeleton (see loadNewsIndex).
  if (index === null) {
    return (
      <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span className="text-[11px]">Loading knowledge updates…</span>
      </div>
    );
  }

  const matched = hits.length > 0;
  const items = matched ? hits.map((h) => h.item) : index.slice(0, 12);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Newspaper}
        text="No knowledge updates available yet."
      />
    );
  }

  // Rewrite relative image refs to the dev-served news assets URL. Leading
  // "/" keeps resolveSopImageSrc in pass-through mode (no SOP/ rewrite).
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  const prepare = (lines: string[]) =>
    lines.map((l) => l.replace(/\]\(assets\//g, `](${base}news/assets/`));

  return (
    <div className="space-y-2">
      <p className="px-1 text-[10px] text-muted-foreground/80">
        {matched
          ? `Matched ${items.length} update${items.length > 1 ? 's' : ''} for the current ticket.`
          : `Latest ${items.length} knowledge updates (newest first).`}
      </p>
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div
            key={item.id}
            className={cn(
              'overflow-hidden rounded-md border transition-all',
              'border-primary/20 bg-primary/[0.03] hover:bg-primary/[0.05]'
            )}
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : item.id)}
              className="flex w-full items-start gap-2 border-b border-primary/15 bg-primary/10 px-2 py-1 text-left"
            >
              <span className="mt-0.5 shrink-0 rounded bg-primary/20 px-1 text-[9px] font-bold text-primary">
                {item.date.slice(5)}
              </span>
              <span className="min-w-0 flex-1 text-[11px] font-semibold leading-snug">
                {item.title}
              </span>
              {item.author && (
                <span className="mt-0.5 shrink-0 text-[9px] text-muted-foreground/80">
                  {item.author}
                </span>
              )}
              <ChevronDown
                className={cn(
                  'mt-0.5 size-3 shrink-0 text-muted-foreground/60 transition-transform',
                  isOpen && 'rotate-180'
                )}
              />
            </button>
            {isOpen && (
              <div className="markdown-body px-2 py-1.5 text-[11px] leading-relaxed">
                {renderBodyMarkdown(prepare(item.bodyLines))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Firmwares / App Updates tab — OTA history parsed from the
 *  software_updates/ markdown chunks (one accordion item per release
 *  entry). Mirrors the News & Updates accordion; firmware entries show the
 *  model list + version as the title, app entries the app version. */
function SoftwareUpdatesTab({
  hits,
  index,
  kind,
}: {
  hits: SoftwareUpdateHit[];
  index: SoftwareUpdateEntry[] | null;
  kind: 'firmware' | 'app';
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  // Markdown chunks still loading — async skeleton (see loadSoftwareUpdatesIndex).
  if (index === null) {
    return (
      <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span className="text-[11px]">
          {kind === 'firmware' ? 'Loading firmware history…' : 'Loading app updates…'}
        </span>
      </div>
    );
  }

  const kindEntries = index.filter((e) => e.kind === kind);
  const matched = hits.length > 0;
  const items = matched ? hits.map((h) => h.item) : kindEntries.slice(0, 12);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={kind === 'firmware' ? CircuitBoard : Smartphone}
        text={
          kind === 'firmware'
            ? 'No firmware records yet.'
            : 'No app update records yet.'
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      <p className="px-1 text-[10px] text-muted-foreground/80">
        {matched
          ? `Matched ${items.length} ${kind === 'firmware' ? 'firmware update' : 'app update'}${items.length > 1 ? 's' : ''} for the current ticket.`
          : `Latest ${items.length} ${kind === 'firmware' ? 'firmware updates' : 'app versions'} (newest first).`}
      </p>
      {items.map((item) => {
        const isOpen = openId === item.id;
        const title =
          item.kind === 'app' ? `ECOVACS HOME ${item.version}` : item.models.join(' / ');
        return (
          <div
            key={item.id}
            className={cn(
              'overflow-hidden rounded-md border transition-all',
              'border-primary/20 bg-primary/[0.03] hover:bg-primary/[0.05]'
            )}
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : item.id)}
              className="flex w-full items-start gap-2 border-b border-primary/15 bg-primary/10 px-2 py-1 text-left"
            >
              <span className="mt-0.5 shrink-0 rounded bg-primary/20 px-1 text-[9px] font-bold text-primary">
                {item.date ? item.date.slice(2) : item.dateLabel}
              </span>
              <span className="min-w-0 flex-1 text-[11px] font-semibold leading-snug">
                {title}
              </span>
              <span className="mt-0.5 shrink-0 rounded bg-accent/20 px-1 text-[9px] font-bold text-accent">
                {item.version}
              </span>
              <ChevronDown
                className={cn(
                  'mt-0.5 size-3 shrink-0 text-muted-foreground/60 transition-transform',
                  isOpen && 'rotate-180'
                )}
              />
            </button>
            {isOpen && (
              <div className="markdown-body max-h-[320px] overflow-y-auto px-2 py-1.5 text-[11px] leading-relaxed">
                {renderBodyMarkdown(item.bodyLines)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Matching templates tab — AMR emails / TBS steps / error codes / MACRO
 *  shortcuts / real FAQs matched from the Detailed Issue Description.
 *  Chip UI ported from the former standalone templates panel (v0.2.0). */
function MatchesTab({
  matches,
  onOpenTemplate,
}: {
  matches: TemplateEntry[];
  onOpenTemplate?: (template: TemplateEntry) => void;
}) {
  if (matches.length === 0 || !onOpenTemplate) {
    return (
      <EmptyState
        icon={FileSearch}
        text="No matches yet — type in the Detailed Issue Description to find AMR emails, TBS steps, error codes, MACRO shortcuts, and real FAQs."
      />
    );
  }
  return (
    <div className="flex flex-wrap gap-1 py-1">
      {matches.map((tpl) => (
        <button
          key={`${tpl.kind}-${tpl.file}`}
          type="button"
          onClick={() => onOpenTemplate(tpl)}
          title={`Open ${tpl.category}: ${tpl.name}`}
          className={cn(
            'glass-chip h-7 min-w-0 max-w-full truncate rounded-md px-2 text-[11px] font-semibold',
            tpl.kind === 'amr' && 'glass-chip-accent'
          )}
        >
          <span
            className={cn(
              'mr-1 rounded px-1 text-[8px] font-bold uppercase tracking-wider',
              tpl.kind === 'amr' && 'bg-accent/20 text-accent',
              tpl.kind === 'tbs' && 'bg-primary/20 text-primary',
              tpl.kind === 'err' && 'bg-destructive/25 text-destructive',
              tpl.kind === 'macro' && 'bg-emerald-500/25 text-emerald-600 dark:text-emerald-300',
              tpl.kind === 'faq' && 'bg-warning/25 text-warning'
            )}
          >
            {tpl.kind === 'amr'
              ? 'AMR'
              : tpl.kind === 'tbs'
                ? 'TBS'
                : tpl.kind === 'err'
                  ? 'ERR'
                  : tpl.kind === 'macro'
                    ? 'MACRO'
                    : 'FAQ'}
          </span>
          {tpl.name}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <Icon className="size-6 text-muted-foreground/40" />
      <p className="text-[11px] font-semibold text-muted-foreground/70">{text}</p>
    </div>
  );
}

function SpecsTab({
  modelA,
  modelB,
}: {
  modelA: { name: string; sections: SpecSection[] };
  modelB?: { name: string; sections: SpecSection[] };
}) {
  const compare = !!modelB;
  if (modelA.sections.length === 0 && (!modelB || modelB.sections.length === 0)) {
    return (
      <EmptyState
        icon={Package}
        text={
          modelA.name
            ? `No spec sections loaded for "${modelA.name}". Pick a model or type a spec keyword.`
            : 'Select a DEEBOT / GOAT / WINBOT model above → specs appear here.'
        }
      />
    );
  }

  // Merge both models' sections by (sheetTitle, section) so specs align
  // row-by-row. Specs present in only one model leave the other column blank.
  const bMap = new Map<string, Map<string, string>>();
  if (modelB) {
    for (const s of modelB.sections) {
      const key = `${s.sheetTitle}|||${s.section}`;
      if (!bMap.has(key)) bMap.set(key, new Map());
      for (const r of s.rows) bMap.get(key)!.set(r.spec, r.value);
    }
  }

  interface MergedRow { spec: string; valueA: string; valueB: string; }
  interface MergedSection { sheetTitle: string; section: string; rows: MergedRow[]; }

  const merged: MergedSection[] = [];
  const seenKeys = new Set<string>();
  for (const s of modelA.sections) {
    const key = `${s.sheetTitle}|||${s.section}`;
    seenKeys.add(key);
    const bRows = bMap.get(key) ?? new Map<string, string>();
    const rows: MergedRow[] = s.rows.map((r) => ({
      spec: r.spec,
      valueA: r.value,
      valueB: bRows.get(r.spec) ?? '',
    }));
    for (const spec of bRows.keys()) {
      if (!rows.find((r) => r.spec === spec)) {
        rows.push({ spec, valueA: '', valueB: bRows.get(spec)! });
      }
    }
    merged.push({ sheetTitle: s.sheetTitle, section: s.section, rows });
  }
  if (modelB) {
    for (const s of modelB.sections) {
      const key = `${s.sheetTitle}|||${s.section}`;
      if (seenKeys.has(key)) continue;
      const rows: MergedRow[] = s.rows.map((r) => ({ spec: r.spec, valueA: '', valueB: r.value }));
      merged.push({ sheetTitle: s.sheetTitle, section: s.section, rows });
    }
  }

  const bySheet = new Map<string, MergedSection[]>();
  for (const m of merged) {
    if (!bySheet.has(m.sheetTitle)) bySheet.set(m.sheetTitle, []);
    bySheet.get(m.sheetTitle)!.push(m);
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
              {/* Column header row with bold model names (compare mode only) */}
              {compare && (
                <div
                  className={cn(
                    'grid gap-2 border-b border-border/60 bg-primary/5 px-2 py-1 text-[10px] font-extrabold',
                    'grid-cols-[28%_1fr_1fr]'
                  )}
                >
                  <div className="text-muted-foreground">Spec</div>
                  <div className="truncate text-primary" title={modelA.name}>{modelA.name}</div>
                  <div className="truncate text-primary" title={modelB!.name}>{modelB!.name}</div>
                </div>
              )}
              <div className="divide-y divide-border/40">
                {s.rows.map((r) => (
                  <div
                    key={r.spec + r.valueA.slice(0, 10) + r.valueB.slice(0, 10)}
                    className={cn(
                      'grid gap-2 px-2 py-1.5 hover:bg-foreground/[0.03]',
                      compare ? 'grid-cols-[28%_1fr_1fr]' : 'grid-cols-[40%_1fr]'
                    )}
                  >
                    <div className="truncate font-bold text-foreground/85">{r.spec}</div>
                    <div className="whitespace-pre-wrap break-words text-foreground/75 leading-relaxed">
                      {r.valueA || <span className="text-muted-foreground/40">—</span>}
                    </div>
                    {compare && (
                      <div className="whitespace-pre-wrap break-words text-foreground/75 leading-relaxed">
                        {r.valueB || <span className="text-muted-foreground/40">—</span>}
                      </div>
                    )}
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

function FaqBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded bg-warning/25 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-warning',
        className,
      )}
    >
      <HelpCircle className="size-2.5" />
      FAQ
    </span>
  );
}

function FaqTab({ hits }: { hits: FaqSearchHit[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (hits.length === 0) {
    return (
      <EmptyState
        icon={HelpCircle}
        text="No FAQ matches yet. Select a model or type a question keyword (e.g. 噪音 / wifi / red light blinking)."
      />
    );
  }
  return (
    <div className="space-y-2">
      {hits.map((f) => {
        const isOpen = openId === f.id;
        return (
          <div
            key={f.id}
            className={cn(
              'overflow-hidden rounded-md border transition-all',
              'border-warning/20 bg-warning/[0.03] hover:bg-warning/[0.05]',
            )}
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : f.id)}
              className="flex w-full items-start gap-2 border-b border-warning/15 bg-warning/10 px-2 py-1 text-left"
            >
              <div className="mt-0.5 shrink-0">
                <FaqBadge />
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[11px] font-bold leading-snug text-foreground/90">
                  {f.title.length > 110 ? f.title.slice(0, 110) + '…' : f.title}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[9px] text-muted-foreground">
                  {f.category && (
                    <span className="rounded bg-foreground/10 px-1 font-bold uppercase tracking-wider">{f.category}</span>
                  )}
                  {f.model && f.modelSlug && f.model !== f.modelSlug && (
                    <span className="truncate rounded bg-foreground/10 px-1">{f.model}</span>
                  )}
                  {f.lang && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-foreground/10 px-1">
                      <Languages className="size-2" /> {f.lang}
                    </span>
                  )}
                  {f.modelMatchScore > 0 && (
                    <span className="rounded bg-success/15 px-1 font-bold text-success/80">
                      model {Math.round(f.modelMatchScore * 100)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded bg-foreground/10 px-1 text-[9px] font-bold text-muted-foreground">
                  {Math.round(f.score * 100)}
                </span>
                <ChevronRight
                  className={cn('size-3 text-muted-foreground transition-transform', isOpen && 'rotate-90')}
                />
              </div>
            </button>
            {isOpen && (
              <div className="space-y-2 px-2 py-1.5">
                {f.question && f.question !== f.title && (
                  <div>
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <HelpCircle className="size-3" />
                      问题 / Question
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed text-foreground/85">{f.question}</div>
                  </div>
                )}
                {f.answer && (
                  <div>
                    <div className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <Lightbulb className="size-3" />
                      答案 / Answer
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed text-foreground/85">{f.answer}</div>
                  </div>
                )}
                {f.sourceSheet && (
                  <div className="text-[9px] text-muted-foreground/70">
                    来源：{f.source} · Sheet: {f.sourceSheet}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
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
