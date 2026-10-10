import { useMemo, useState } from 'react';
import { BookOpen, ExternalLink, FileText, Search, X } from 'lucide-react';
import { MANUAL_COUNT, MANUAL_GROUPS } from '@/data/manuals';
import { openExternal } from '@/lib/open-external';
import { cn } from '@/lib/utils';

interface ManualsPanelProps {
  onClose: () => void;
}

/**
 * Product Manuals panel — toggleable from the left rail (MANUAL pill under
 * the QA button). Lists every official Ecovacs instruction-manual PDF from
 * the global help center (DEEBOT / WINBOT / GOAT) with a search filter; each
 * entry opens the PDF in a new browser window for quick referencing during a
 * call. Frosted-glass styling matches the QA / App Use Photos panels.
 */
export default function ManualsPanel({ onClose }: ManualsPanelProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MANUAL_GROUPS;
    return MANUAL_GROUPS.map((g) => ({
      ...g,
      manuals: g.manuals.filter((m) => m.title.toLowerCase().includes(q)),
    })).filter((g) => g.manuals.length > 0);
  }, [query]);

  const shownCount = filtered.reduce((n, g) => n + g.manuals.length, 0);

  return (
    <div className="flex h-full w-[560px] max-w-[calc(100vw-7rem)] flex-col rounded-2xl border-[1.5px] border-foreground/10 bg-card/30 shadow-[inset_0_1.5px_0_rgba(255,255,255,0.12),0_8px_24px_-6px_rgba(0,0,0,0.24)] backdrop-blur-md backdrop-saturate-125">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-foreground/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-primary" />
          <div>
            <div className="text-[13px] font-semibold text-foreground">Product Manuals</div>
            <div className="text-[10px] text-muted-foreground">
              Official Ecovacs instruction manuals — {MANUAL_COUNT} PDFs from the global help center
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          title="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 border-b border-foreground/10 px-4 py-2">
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-foreground/[0.04] px-2.5 py-1.5 focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/30">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search manuals (e.g. T30, WINBOT, X2)…"
            className="w-full bg-transparent text-[11.5px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              title="Clear"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        {query && (
          <div className="mt-1.5 text-[9.5px] text-muted-foreground">
            {shownCount} of {MANUAL_COUNT} manuals
          </div>
        )}
      </div>

      {/* Body — grouped manual links */}
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <FileText className="size-8 opacity-40" />
            <div className="text-[11px]">No manuals match “{query}”</div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((g) => (
              <div key={g.group} className="overflow-hidden rounded-lg border border-border/60">
                {/* Group header */}
                <div className="flex items-center justify-between border-b border-border/60 bg-foreground/[0.04] px-3 py-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                    <BookOpen className="size-3.5" />
                    {g.group}
                  </div>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                    {g.manuals.length}
                  </span>
                </div>
                {/* Manual links */}
                <div className="divide-y divide-border/40">
                  {g.manuals.map((m) => (
                    <a
                      key={m.url}
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open "${m.title}" PDF in a new window`}
                      onClick={(e) => { e.preventDefault(); void openExternal(m.url); }}
                      className="group/link flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-accent/10"
                    >
                      <FileText className="size-3.5 shrink-0 text-muted-foreground group-hover/link:text-accent" />
                      <span className="flex-1 truncate text-[11px] font-semibold text-foreground/90 group-hover/link:text-foreground">
                        {m.title}
                      </span>
                      <ExternalLink className="size-3 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover/link:opacity-100 group-hover/link:text-accent" />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className={cn(
          'shrink-0 border-t border-foreground/10 px-4 py-2 text-[9.5px] text-muted-foreground'
        )}
      >
        Source: help.ecovacs.com — Instruction Manual · PDFs open in a new window
      </div>
    </div>
  );
}
