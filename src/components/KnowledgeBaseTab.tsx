import { useEffect, useMemo, useState } from 'react';
import { CloudUpload, FileText, Plus, Save, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import {
  createKbDoc,
  deleteKbDoc,
  exportKbToR2,
  fetchKbDocs,
  fetchKbFaqDoc,
  fetchKbFaqIndex,
  saveKbDoc,
  type KbDoc,
  type KbKind,
  type KbR2Progress,
} from '@/lib/kb-sync';
import { resetFaqCaches } from '@/utils/faqData';
import {
  refreshProductIndexFromD1,
  resetProductIndexD1Cache,
} from '@/utils/productData';
import { resetSoftwareUpdatesCache } from '@/utils/softwareUpdatesData';
import { resetGbuModelsCache } from '@/data/gbuModels';

/** Admin tab labels for the KB kinds. FAQ covers the Q&A documents, product
 *  the numbered reference sheets (SPECS / Error Codes / Scientist / Pitch /
 *  GBU sheets), gbu the barcode map, app/firmware the update markdown. */
const KIND_LABELS: Array<{ kind: KbKind; label: string; hint: string }> = [
  { kind: 'faq', label: 'FAQ', hint: 'Q&A documents (markdown + frontmatter)' },
  { kind: 'product', label: 'Sheets', hint: 'SPECS · Error Codes · Scientist · Pitch · GBU sheets' },
  { kind: 'gbu', label: 'GBU map', hint: 'Barcode map (internal code → marketing name)' },
  { kind: 'app_update', label: 'App updates', hint: 'ECOVACS HOME release notes' },
  { kind: 'firmware_update', label: 'Firmware', hint: 'Firmware OTA history' },
  { kind: 'app_photo', label: 'App photos', hint: 'app-photos index + binaries · also lands SOP handbook + AMR templates + manifest (R2 finale)' },
];

/** R2 export segments per tab — the Sync button copies only the current
 *  tab's data, one toast-confirmed chunk at a time. The App photos tab
 *  finishes the job: photo binaries + SOP + AMR + manifest.json. */
const KIND_R2_SOURCES: Record<KbKind, string[]> = {
  faq: ['faq'],
  product: ['product'],
  gbu: ['gbu'],
  app_update: ['app_update'],
  firmware_update: ['firmware_update'],
  app_photo: ['app_photo', 'photos', 'sop', 'amr'],
};

const NEW_FAQ_TEMPLATE = `---
category: DEEBOT
model:
model_slug: general
lang: en
version: 1
---

# New FAQ

## Question

What does the agent ask?

## Answer

What the agent should answer.
`;

/** Admin Knowledge Base editor — D1 is the first line of truth for the
 *  product knowledge content; the bundled blobs stay as fallback and are
 *  overridden per document id. Markdown documents are edited as-is (the
 *  client parsers are unchanged). FAQ docs list from the parsed index and
 *  stream their body on demand; every other kind ships full bodies. */
export default function KnowledgeBaseTab() {
  const { user } = useAuth();
  const [kind, setKind] = useState<KbKind>('product');
  const [docs, setDocs] = useState<KbDoc[] | null>(null);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [r2, setR2] = useState<KbR2Progress | null>(null);

  const isAdmin = user?.canAccessAdmin ?? false;
  const meta = KIND_LABELS.find((k) => k.kind === kind)!;

  useEffect(() => {
    setDocs(null);
    setFilter('');
    setSelectedId(null);
    setDraft(null);
    setIsNew(false);
    let cancelled = false;
    const load = async () => {
      if (kind === 'faq') {
        // FAQ list comes from the parsed index; bodies stream per doc.
        const entries = await fetchKbFaqIndex();
        if (cancelled) return;
        setDocs(
          (entries ?? []).map((e) => ({
            id: e.id,
            title: e.question,
            body: '',
            updatedBy: 'faq-index',
            updatedAt: '',
          }))
        );
        return;
      }
      const list = await fetchKbDocs(kind);
      if (cancelled) return;
      setDocs(list ? list.docs : []);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const filtered = useMemo(() => {
    if (!docs) return null;
    const q = filter.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) => d.id.toLowerCase().includes(q) || d.title.toLowerCase().includes(q)
    );
  }, [docs, filter]);

  const selectDoc = async (doc: KbDoc) => {
    setSelectedId(doc.id);
    setIsNew(false);
    if (kind === 'faq') {
      setDraft({ id: doc.id, title: doc.title, body: 'Loading…' });
      const body = await fetchKbFaqDoc(doc.id);
      setDraft((d) =>
        d && d.id === doc.id ? { ...d, body: body ?? 'Could not load the document body.' } : d
      );
    } else {
      setDraft({ id: doc.id, title: doc.title, body: doc.body });
    }
  };

  const startNew = () => {
    setSelectedId(null);
    setIsNew(true);
    setDraft({
      id: '',
      title: '',
      body: kind === 'faq' ? NEW_FAQ_TEMPLATE : '',
    });
  };

  /** Bust the client caches for the edited dataset so live panels pick the
   *  change up without a reload. */
  const bustCaches = (target: KbKind) => {
    if (target === 'faq') resetFaqCaches();
    if (target === 'product' || target === 'gbu') {
      resetProductIndexD1Cache();
      void refreshProductIndexFromD1();
      resetGbuModelsCache();
    }
    if (target === 'app_update' || target === 'firmware_update') resetSoftwareUpdatesCache();
  };

  const save = async () => {
    if (!draft || busy) return;
    if (!draft.body.trim()) {
      toast.error('Body is required');
      return;
    }
    setBusy(true);
    try {
      let savedId: string | null = null;
      if (isNew) {
        savedId = await createKbDoc(kind, {
          id: draft.id.trim() || undefined,
          title: draft.title.trim() || undefined,
          body: draft.body,
        });
        if (!savedId) {
          toast.error('Could not create the document (id taken, invalid, or not admin)');
          return;
        }
        toast.success(`Created ${savedId}`);
      } else if (selectedId) {
        const ok = await saveKbDoc(kind, selectedId, {
          title: draft.title.trim(),
          body: draft.body,
        });
        if (!ok) {
          toast.error('Could not save the document (not admin?)');
          return;
        }
        savedId = selectedId;
        toast.success(`Saved ${selectedId}`);
      } else return;
      bustCaches(kind);
      // Keep the editor open on the saved doc and patch the local list
      // (a full reload would reset the selection).
      setIsNew(false);
      setSelectedId(savedId);
      const savedDoc: KbDoc = {
        id: savedId,
        title: draft.title.trim(),
        body: draft.body,
        updatedBy: user?.username ?? '',
        updatedAt: 'just now',
      };
      setDraft({ id: savedId, title: draft.title.trim(), body: draft.body });
      setDocs((prev) =>
        prev
          ? prev.some((d) => d.id === savedId)
            ? prev.map((d) => (d.id === savedId ? savedDoc : d))
            : [...prev, savedDoc].sort((a, b) => a.id.localeCompare(b.id))
          : prev
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selectedId || busy || isNew) return;
    setBusy(true);
    try {
      const ok = await deleteKbDoc(kind, selectedId);
      if (!ok) {
        toast.error('Could not delete the document (not admin?)');
        return;
      }
      toast.success(`Deleted ${selectedId}`);
      bustCaches(kind);
      setDocs((prev) => (prev ? prev.filter((d) => d.id !== selectedId) : prev));
      setSelectedId(null);
      setDraft(null);
    } finally {
      setBusy(false);
    }
  };

  /** Copy the current tab's D1 data into the eco-kb R2 bucket (AI Search
   *  "Ask" source), streaming per-page progress into the progress bar. */
  const syncR2 = async () => {
    if (r2) return;
    const label = meta.label;
    try {
      const total = await exportKbToR2(KIND_R2_SOURCES[kind], (p) => setR2(p));
      if (total === null) toast.error('R2 export failed (not admin?)');
      else
        toast.success(
          `Copied ${total.toLocaleString()} objects to R2 (${label})${kind === 'app_photo' ? ' — manifest.json written' : ''}`
        );
    } finally {
      setR2(null);
    }
  };

  const syncNewsR2 = async () => {
    if (r2) return;
    try {
      const total = await exportKbToR2(['news', 'news_assets'], (p) => setR2(p));
      if (total === null) toast.error('News R2 export failed (not admin?)');
      else toast.success(`Copied ${total.toLocaleString()} News & Updates articles and images to R2`);
    } finally {
      setR2(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Kind selector */}
      <div className="flex flex-wrap items-center gap-1.5">
        {KIND_LABELS.map(({ kind: k, label, hint }) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            title={hint}
            className={cn(
              'rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors',
              kind === k
                ? 'border-sky-400/50 bg-sky-400/20 text-sky-300'
                : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/70'
            )}
          >
            {label}
          </button>
        ))}
        {!isAdmin && (
          <span className="ml-auto text-[10px] font-semibold text-muted-foreground">
            read-only — admin account required to edit
          </span>
        )}
        {isAdmin && (
          <>
            <button
              type="button"
              disabled={!!r2}
              onClick={() => void syncR2()}
              title={`Copy this tab's D1 data into the eco-kb R2 bucket (AI Search source)`}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-sky-400/50 bg-sky-400/15 px-2.5 py-1 text-[11px] font-bold text-sky-300 transition-colors hover:bg-sky-400/25 disabled:opacity-50"
            >
              <CloudUpload className={cn('size-3.5', r2 && 'animate-pulse')} /> Sync {meta.label} to R2
            </button>
            <button
              type="button"
              disabled={!!r2}
              onClick={() => void syncNewsR2()}
              title="Copy every News & Updates article and referenced image into the AI Search R2 bucket"
              className="flex items-center gap-1.5 rounded-lg border border-emerald-400/50 bg-emerald-400/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300 transition-colors hover:bg-emerald-400/25 disabled:opacity-50"
            >
              <CloudUpload className={cn('size-3.5', r2?.label.startsWith('News') && 'animate-pulse')} />
              Sync News to R2
            </button>
          </>
        )}
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {meta.hint} · D1 first line, bundled blob fallback ·{' '}
        {docs === null ? 'loading…' : `${filtered?.length ?? 0} docs`}
      </p>
      {r2 && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/60">
            <div
              className={cn(
                'h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-[width] duration-300',
                r2.total === null && 'w-1/3 animate-pulse'
              )}
              style={
                r2.total
                  ? { width: `${Math.max(2, Math.round((r2.exported / r2.total) * 100))}%` }
                  : undefined
              }
            />
          </div>
          <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
            Syncing {r2.label} · {r2.exported.toLocaleString()}
            {r2.total ? ` / ${r2.total.toLocaleString()}` : ''} · {r2.totalSoFar.toLocaleString()} total
          </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-2">
        {/* Document list */}
        <div className="flex w-[38%] min-w-0 flex-col gap-1.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter documents…"
              className="glass-input w-full rounded-lg py-1.5 pl-8 pr-2 text-xs"
            />
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={startNew}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-400/50 bg-emerald-500/15 py-1.5 text-[11px] font-bold text-emerald-300 transition-colors hover:bg-emerald-500/25"
            >
              <Plus className="size-3.5" /> New {meta.label} doc
            </button>
          )}
          <div className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
            {filtered === null &&
              [0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded-lg border border-border/50 bg-muted/40" />
              ))}
            {filtered?.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => void selectDoc(doc)}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 rounded-lg border px-2 py-1.5 text-left transition-colors',
                  selectedId === doc.id
                    ? 'border-sky-400/50 bg-sky-400/15'
                    : 'border-border/50 bg-background/35 hover:bg-muted/50'
                )}
              >
                <span className="w-full truncate font-mono text-[11px] font-bold text-foreground">
                  {doc.title || doc.id}
                </span>
                <span className="w-full truncate text-[9px] text-muted-foreground">
                  {doc.id} · {doc.updatedBy || 'bundled'} · {doc.updatedAt || '—'}
                </span>
              </button>
            ))}
            {filtered?.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">No documents match.</p>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {draft ? (
            <>
              <div className="flex items-center gap-1.5">
                <input
                  value={draft.id}
                  onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                  disabled={!isNew || kind === 'product' || kind === 'faq'}
                  placeholder="id (slug or NN_sheet-stem)"
                  className="glass-input min-w-0 flex-1 rounded-lg px-2 py-1.5 font-mono text-[11px] disabled:opacity-60"
                />
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="title (list label)"
                  className="glass-input min-w-0 flex-1 rounded-lg px-2 py-1.5 text-[11px]"
                />
              </div>
              <textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                spellCheck={false}
                className="custom-scrollbar glass-input min-h-0 flex-1 resize-none rounded-lg p-2 font-mono text-[11px] leading-relaxed"
              />
              <div className="flex items-center gap-1.5">
                {isAdmin && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save()}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-bold text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                  >
                    <Save className="size-3.5" /> {isNew ? 'Create' : 'Save'}
                  </button>
                )}
                {isAdmin && !isNew && selectedId && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove()}
                    className="flex items-center gap-1.5 rounded-lg border border-red-400/50 bg-red-500/15 px-3 py-1.5 text-[11px] font-bold text-red-300 transition-colors hover:bg-red-500/25 disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" /> Delete
                  </button>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {draft.body.length.toLocaleString()} chars
                </span>
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/50 text-center">
              <FileText className="size-6 text-muted-foreground/60" />
              <p className="max-w-[240px] text-xs leading-relaxed text-muted-foreground">
                Select a document to edit its markdown. Bundled fallback data serves every
                viewer; D1 overrides the bundled copy per document id.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
