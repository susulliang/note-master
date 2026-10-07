import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  QA_CALL_CHECKLIST,
  QA_CHECKLIST_TOTAL,
  type QaScores,
} from '@/data/qaCallChecklist';

interface QaChecklistMenuProps {
  scores: QaScores | null;
  scoring: boolean;
  summary: string;
  className?: string;
}

/** Progress-bar color by completion ratio — red / amber / green bands. */
function ratioColor(ratio: number | null): string {
  if (ratio === null) return 'bg-muted-foreground/25';
  if (ratio >= 0.8) return 'bg-emerald-500';
  if (ratio >= 0.5) return 'bg-amber-500';
  return 'bg-red-500';
}

function ratioTextClass(ratio: number | null): string {
  if (ratio === null) return 'text-muted-foreground/60';
  if (ratio >= 0.8) return 'text-emerald-500';
  if (ratio >= 0.5) return 'text-amber-500';
  return 'text-red-500';
}

/**
 * QA Checklist — yellow pill in the bottom call bar (between Fill Notes and
 * End Call). Click toggles a frosted dropdown listing the call-channel QA
 * items with weighted progress bars. Scores come from the LLM scoring pass
 * that runs alongside the cloud parse; before the first parse the bars sit
 * gray at zero.
 */
export default function QaChecklistMenu({ scores, scoring, summary, className }: QaChecklistMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  /** Fixed-position anchor (viewport coords) for the portaled dropdown. */
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);

  // Measure the button and convert to a fixed-position anchor whenever the
  // dropdown opens (or the viewport resizes while open).
  useLayoutEffect(() => {
    if (!open) return undefined;
    const measure = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setAnchor({ left: r.left + r.width / 2, bottom: window.innerHeight - r.top });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  // Outside click closes the dropdown.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const total = scores
    ? Object.values(scores).reduce((n, v) => n + v, 0)
    : 0;
  const overallRatio = scores ? total / QA_CHECKLIST_TOTAL : null;

  return (
    <div ref={rootRef} className={cn('relative flex shrink-0 items-center', className)}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 whitespace-nowrap rounded-full bg-amber-600 font-bold text-white shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-[0_0_20px_color-mix(in_oklab,#d97706_55%,transparent)] active:scale-95',
          'px-3 py-1.5 text-xs'
        )}
        title="QA checklist — live completion status from the last AI parse"
      >
        {scoring ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <ClipboardCheck className="size-3.5" />
        )}
        QA
        {overallRatio !== null && (
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[9px] font-extrabold tabular-nums',
              ratioTextClass(overallRatio)
            )}
          >
            {Math.round(overallRatio * 100)}%
          </span>
        )}
      </button>

      {/* Dropdown — portaled to <body> so its backdrop-blur samples the PAGE,
          not the already-blurred bottom bar (a backdrop-filter ancestor would
          clip the child's blur to its own surface, making the glass vanish). */}
      {open &&
        anchor &&
        createPortal(
          <div
            className={cn(
              'fixed z-[70] w-[340px] -translate-x-1/2 transition-[opacity,transform] duration-200',
              open ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-1.5 opacity-0'
            )}
            style={{ left: anchor.left, bottom: anchor.bottom + 8 }}
          >
        <div className="max-h-[min(60vh,30rem)] overflow-y-auto rounded-2xl border-[1.5px] border-foreground/10 bg-card/75 shadow-[inset_0_1.5px_0_rgba(255,255,255,0.12),0_8px_24px_-6px_rgba(0,0,0,0.24)] backdrop-blur-xl backdrop-saturate-150">
          {/* Header + overall bar */}
          <div className="sticky top-0 z-10 border-b border-foreground/10 bg-card/85 px-3 py-2 backdrop-blur-xl">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                <ClipboardCheck className="size-3.5 text-amber-500" />
                Call QA Checklist
              </div>
              <div className={cn('text-[11px] font-extrabold tabular-nums', ratioTextClass(overallRatio))}>
                {scores ? `${Math.round(total)} / ${QA_CHECKLIST_TOTAL}` : scoring ? 'Scoring…' : 'Not scored'}
              </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
              <div
                className={cn('h-full rounded-full transition-all duration-500', ratioColor(overallRatio))}
                style={{ width: overallRatio !== null ? `${Math.max(2, overallRatio * 100)}%` : '0%' }}
              />
            </div>
            {summary && scores && (
              <div className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                <span className="font-bold text-foreground/70">Weakest area:</span> {summary}
              </div>
            )}
          </div>

          {/* Checklist items grouped by dimension */}
          <div className="space-y-2.5 p-3">
            {QA_CALL_CHECKLIST.map((dim) => (
              <div key={dim.dimension}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">
                    {dim.dimension}
                  </span>
                  <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                    {dim.weight}
                  </span>
                </div>
                <div className="space-y-2">
                  {dim.items.map((item) => {
                    const val = scores?.[item.id];
                    const ratio = typeof val === 'number' ? val / item.max : null;
                    return (
                      <div key={item.id} title={item.criteria}>
                        <div className="mb-0.5 flex items-baseline justify-between gap-2">
                          <span className="truncate text-[10.5px] font-semibold text-foreground/85">
                            {item.label}
                          </span>
                          <span
                            className={cn(
                              'shrink-0 text-[10px] font-bold tabular-nums',
                              ratioTextClass(ratio)
                            )}
                          >
                            {typeof val === 'number' ? `${val}/${item.max}` : `—/${item.max}`}
                          </span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-foreground/10">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-500',
                              ratioColor(ratio)
                            )}
                            style={{
                              width: ratio !== null ? `${Math.max(2, ratio * 100)}%` : '0%',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {scores === null && !scoring && (
              <div className="pt-1 text-center text-[10px] text-muted-foreground/70">
                Run <span className="font-bold">Fill Notes</span> to score this call against the QA
                standard (AI reads the transcript and grades every item).
              </div>
            )}
          </div>
        </div>
          </div>,
          document.body
        )}
    </div>
  );
}
