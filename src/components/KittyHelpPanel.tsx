import { useState } from 'react';
import { Copy, Check, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KittyHelpResult } from '@/hooks/use-kitty-help';

/**
 * Render LLM free text with light structure: consecutive "1. …" lines
 * become an ordered list, "- …" lines a bullet list, everything else
 * paragraphs — so step-by-step resolutions read as steps, not a wall.
 */
function FormattedText({ text, className }: { text: string; className?: string }) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const blocks: Array<{ type: 'ol' | 'ul' | 'p'; items: string[] }> = [];
  for (const line of lines) {
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    const bulleted = line.match(/^[-•*]\s+(.*)$/);
    if (numbered) {
      const last = blocks[blocks.length - 1];
      if (last?.type === 'ol') last.items.push(numbered[1]);
      else blocks.push({ type: 'ol', items: [numbered[1]] });
    } else if (bulleted) {
      const last = blocks[blocks.length - 1];
      if (last?.type === 'ul') last.items.push(bulleted[1]);
      else blocks.push({ type: 'ul', items: [bulleted[1]] });
    } else {
      blocks.push({ type: 'p', items: [line] });
    }
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {blocks.map((block, i) =>
        block.type === 'p' ? (
          <p key={i} className="text-sm leading-relaxed text-foreground">{block.items[0]}</p>
        ) : block.type === 'ol' ? (
          <ol key={i} className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-foreground">
            {block.items.map((item, j) => <li key={j}>{item}</li>)}
          </ol>
        ) : (
          <ul key={i} className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground">
            {block.items.map((item, j) => <li key={j}>{item}</li>)}
          </ul>
        )
      )}
    </div>
  );
}

/**
 * Glass modal that renders the Kitty Help final resolution: ready-to-read
 * customer script, detailed EN resolution, Chinese TLDR, emotional-support
 * lines and the cited sources — with a one-click full-text copy.
 */
export function KittyHelpPanel({
  result,
  onClose,
}: {
  result: KittyHelpResult;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const fullText = [
    '🐱 Kitty Help — Suggested Resolution',
    '',
    '## Say to the customer (EN)',
    result.sayToCustomer || '(none)',
    '',
    '## Resolution (EN)',
    result.resolutionEn || '(none)',
    '',
    `## 解决方法（中文 TLDR）`,
    result.resolutionZhTldr || '（无）',
    '',
    '## Emotional support (if needed)',
    result.emotionalSupport || '(none)',
    '',
    '## Sources',
    result.sources.length > 0 ? result.sources.map((s) => `- ${s}`).join('\n') : '(none)',
    '',
    `Picked sources: ${result.picks.map((p) => p.id).join(', ') || '—'} · ${(result.ms / 1000).toFixed(1)}s`,
  ].join('\n');

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label="Kitty Help suggested resolution"
    >
      <div
        className="glass-panel max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Sparkles className="size-4 text-accent" />
              Kitty Help — Suggested Resolution
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {result.picks.length > 0
                ? `Grounded in ${result.picks.length} source${result.picks.length > 1 ? 's' : ''} · ${(result.ms / 1000).toFixed(1)}s`
                : `No sources picked · ${(result.ms / 1000).toFixed(1)}s`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Kitty Help panel"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {result.sayToCustomer && (
            <section className="rounded-xl border border-violet-400/50 bg-violet-500/10 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-300">Say to the customer (EN)</p>
              <FormattedText text={result.sayToCustomer} className="mt-1.5" />
            </section>
          )}

          <section className="rounded-xl border border-sky-400/50 bg-sky-500/10 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-sky-300">Resolution (EN)</p>
            <FormattedText text={result.resolutionEn} className="mt-1.5" />
          </section>

          {result.resolutionZhTldr && (
            <section className="rounded-xl border border-border/60 bg-card/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">解决方法（中文 TLDR）</p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{result.resolutionZhTldr}</p>
            </section>
          )}

          {result.emotionalSupport && (
            <section className="rounded-xl border border-emerald-400/50 bg-emerald-500/10 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Emotional support (if needed)</p>
              <FormattedText text={result.emotionalSupport} className="mt-1.5" />
            </section>
          )}

          <section className="rounded-xl border border-border/60 bg-card/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cited sources</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {result.sources.length > 0 ? (
                result.sources.map((s, i) => (
                  <span key={i} className="rounded-full border border-border/70 bg-card/60 px-2 py-0.5 text-[11px] text-foreground">
                    {s}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-muted-foreground">No sources cited</span>
              )}
            </div>
          </section>

          {result.picks.length > 0 && (
            <details className="rounded-xl border border-border/60 bg-card/40 p-3">
              <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Why these sources were picked
              </summary>
              <ul className="mt-2 space-y-1">
                {result.picks.map((p) => (
                  <li key={p.id} className={cn('text-[11px] leading-snug text-muted-foreground')}>
                    <span className="font-semibold text-foreground">{p.id}</span> — {p.title}
                    {p.reason ? ` · ${p.reason}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

export default KittyHelpPanel;
