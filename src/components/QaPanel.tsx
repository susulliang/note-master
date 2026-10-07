import { useState } from 'react';
import { ClipboardCheck, X } from 'lucide-react';
import { QA_STANDARDS, type QaStandard } from '@/data/qaStandards';
import { cn } from '@/lib/utils';

interface QaPanelProps {
  onClose: () => void;
}

/**
 * Quality Assurance Standards panel — toggleable from the left rail (QA pill
 * below the App button). Renders the Ecovacs NA 质检标准 V4 table in either
 * the original Chinese or an American corporate English translation, switched
 * via ZH / EN tabs. Frosted-glass styling matches the App Use Photos panel.
 */
export default function QaPanel({ onClose }: QaPanelProps) {
  const [lang, setLang] = useState<'zh' | 'en'>('en');
  const std: QaStandard = QA_STANDARDS[lang];

  return (
    <div className="flex h-full w-[600px] max-w-[calc(100vw-7rem)] flex-col rounded-2xl border-[1.5px] border-foreground/10 bg-card/30 shadow-[inset_0_1.5px_0_rgba(255,255,255,0.12),0_8px_24px_-6px_rgba(0,0,0,0.24)] backdrop-blur-md backdrop-saturate-125">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-foreground/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-primary" />
          <div>
            <div className="text-[13px] font-semibold text-foreground">{std.title}</div>
            <div className="text-[10px] text-muted-foreground">{std.subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* ZH / EN language tabs */}
          <div className="flex items-center rounded-md border border-border/60 bg-card/40 p-0.5">
            {(['zh', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={cn(
                  'rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors',
                  lang === l
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 rounded p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
            title="Close"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Body — scrollable table */}
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-3">
          {std.dimensions.map((dim) => (
            <div key={dim.dimension} className="overflow-hidden rounded-lg border border-border/60">
              {/* Dimension header */}
              <div className="flex items-center justify-between border-b border-border/60 bg-foreground/[0.04] px-3 py-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                  <ClipboardCheck className="size-3.5" />
                  {dim.dimension}
                </div>
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                  {dim.weight}
                </span>
              </div>
              {/* Assessment items */}
              <div className="divide-y divide-border/40">
                {dim.items.map((item) => (
                  <div key={item.item} className="px-3 py-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="text-[11px] font-bold text-foreground">{item.item}</div>
                      <span className="shrink-0 rounded bg-foreground/10 px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                        {item.score} pts
                      </span>
                    </div>
                    <div className="mb-1.5 whitespace-pre-wrap text-[10.5px] leading-relaxed text-foreground/80">
                      {item.detail}
                    </div>
                    {item.note && (
                      <div className="rounded-md border border-emerald-500/25 bg-emerald-500/[0.05] p-2">
                        <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                          {lang === 'zh' ? '加分情景' : 'Bonus Scenarios'}
                        </div>
                        <div className="whitespace-pre-wrap text-[10px] leading-relaxed text-emerald-300/90">
                          {item.note}
                        </div>
                      </div>
                    )}
                    {item.deductions && item.deductions.toLowerCase() !== 'none' && item.deductions !== '暂无' && (
                      <div className="rounded-md border border-red-500/20 bg-red-500/[0.04] p-2">
                        <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-red-400">
                          {lang === 'zh' ? '常见扣分点' : 'Common Deduction Points'}
                        </div>
                        <div className="whitespace-pre-wrap text-[10px] leading-relaxed text-red-300/90">
                          {item.deductions}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
