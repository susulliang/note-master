import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Cat,
  X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ASK_MODELS, type AskModel } from '@shared/ask-models';
import type { KittyHelpResult, KittyStage } from '@/hooks/use-kitty-help';
import { hydrateSupportEvidence, type SupportEvidence } from '@/lib/support-evidence';
import { CatAskPanel } from '@/components/CatAskPanel';

interface KittyHelpWorkspaceProps {
  onClose: () => void;
  model: AskModel;
  onModelChange: (model: AskModel) => void;
  notes: string;
  transcript: string;
  customerName: string;
  agentName: string;
  resolveBusy: boolean;
  resolveStage: KittyStage | null;
  resolveError: string | null;
  result: KittyHelpResult | null;
  onResolve: () => void;
  autoAskOnOpen: boolean;
  onAutoAskConsumed: () => void;
  askEvidence: SupportEvidence[];
  onAskEvidenceChange: (evidence: SupportEvidence[]) => void;
}

function EvidenceRail({ sources }: { sources: SupportEvidence[] }) {
  return (
    <aside className="hidden min-h-0 flex-col border-l border-border bg-card/30 lg:flex">
      <div className="border-b border-border px-4 py-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <BookOpen className="size-4 text-accent" />
          Evidence rail
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          Sources retrieved for Ask and Kitty Help answers
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {sources.length ? sources.map((source, index) => (
          <article
            key={`${source.id}-${index}`}
            className="group animate-in fade-in slide-in-from-right-1 rounded-lg border border-border bg-card/50 p-3 transition-colors duration-200 hover:border-accent/40 hover:bg-accent/5"
            style={{ animationDelay: `${Math.min(index * 45, 240)}ms` }}
          >
            <div className="flex items-start gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-md border border-accent/30 bg-accent/10 text-xs font-semibold text-accent">
                {source.id.replace(/[\[\]]/g, '') || String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-[11px] leading-relaxed text-foreground/85">
                  {source.title.replace(/_/g, ' ')}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">Retrieved excerpt</p>
              </div>
            </div>
            <details className="mt-2 border-t border-border pt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                Expand source excerpt
              </summary>
              <p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-background/60 p-2 text-xs leading-relaxed text-muted-foreground">
                {source.excerpt || 'No excerpt available.'}
              </p>
            </details>
          </article>
        )) : (
          <div className="rounded-lg border border-dashed border-border bg-card/40 p-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Sources used for this task will appear here. Kitty Help keeps the evidence visible beside the answer.
            </p>
          </div>
        )}
      </div>
      <div className="border-t border-border p-3">
        <p className="text-xs text-muted-foreground">
          AI Search + Kitty Help · {sources.length} source{sources.length === 1 ? '' : 's'}
        </p>
      </div>
    </aside>
  );
}

export function KittyHelpWorkspace({
  onClose,
  model,
  onModelChange,
  notes,
  transcript,
  customerName,
  agentName,
  resolveBusy,
  resolveStage,
  resolveError,
  result,
  onResolve,
  autoAskOnOpen,
  onAutoAskConsumed,
  askEvidence,
  onAskEvidenceChange,
}: KittyHelpWorkspaceProps) {
  const rawEvidence = useMemo(() => {
    const unique = new Map<string, SupportEvidence>();
    for (const source of [...askEvidence, ...(result?.evidence ?? [])]) {
      unique.set(`${source.id}:${source.title}`, source);
    }
    return [...unique.values()];
  }, [askEvidence, result?.evidence]);
  const [evidence, setEvidence] = useState(rawEvidence);

  useEffect(() => {
    let active = true;
    setEvidence(rawEvidence);
    void hydrateSupportEvidence(rawEvidence).then((hydrated) => {
      if (active) setEvidence(hydrated);
    });
    return () => {
      active = false;
    };
  }, [rawEvidence]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(900px,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] max-w-6xl flex-col gap-0 overflow-hidden border-[1.5px] border-foreground/10 p-0 font-sans shadow-[inset_0_1.5px_0_rgba(255,255,255,0.12),0_8px_24px_-6px_rgba(0,0,0,0.24)] backdrop-blur-md backdrop-saturate-125 max-md:left-0 max-md:top-0 max-md:h-dvh max-md:max-h-dvh max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:w-full max-md:rounded-none max-md:pb-[calc(env(safe-area-inset-bottom)+5rem)] max-sm:max-w-none max-sm:w-full"
        style={{ backgroundColor: 'color-mix(in oklab, var(--card) 30%, transparent)' }}
      >
        <header className="shrink-0 border-b border-border bg-card/40 px-3 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="relative grid size-10 shrink-0 place-items-center rounded-xl border border-accent/40 bg-card text-accent">
              {resolveBusy && <span className="absolute inset-0 animate-pulse rounded-xl bg-primary/10" />}
                <Cat className="relative size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="truncate text-base font-semibold text-foreground">Kitty Help</DialogTitle>
            <span className="hidden rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground sm:inline-flex">
                  {resolveBusy ? resolveStage?.label ?? 'Kitty Help working' : 'AI Search + Kitty Help'}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                Ask a question, or leave the box empty to run both support workflows
              </p>
            </div>
            <label className="hidden shrink-0 sm:flex">
              <select
                value={model}
                onChange={(event) => onModelChange(event.target.value as AskModel)}
                disabled={resolveBusy}
                aria-label="AI Search model"
                className="h-8 max-w-40 appearance-none rounded-md border border-transparent bg-transparent px-1.5 text-xs text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
              >
                {ASK_MODELS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Kitty Help"
              className="glass-btn grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <X className="size-4" />
            </button>
          </div>

          <label className="mt-2 flex sm:hidden">
            <select
              value={model}
              onChange={(event) => onModelChange(event.target.value as AskModel)}
              disabled={resolveBusy}
              aria-label="AI Search model"
              className="h-8 max-w-40 appearance-none rounded-md border border-transparent bg-transparent px-1.5 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {ASK_MODELS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
        </header>

        <div className={`grid min-h-0 flex-1 grid-cols-1 ${evidence.length ? 'lg:grid-cols-[minmax(0,1fr)_270px]' : 'lg:grid-cols-1'}`}>
          <div className="flex min-h-0 flex-col overflow-hidden">
            <CatAskPanel
              embedded
              onClose={onClose}
              notes={notes}
              transcript={transcript}
              customerName={customerName}
              agentName={agentName}
              selectedModel={model}
              onModelChange={onModelChange}
              onEvidenceChange={onAskEvidenceChange}
              onResolveRequest={onResolve}
              resolveResult={result}
              resolveBusy={resolveBusy}
              resolveStage={resolveStage}
              resolveError={resolveError}
              autoAskOnMount={autoAskOnOpen}
              onAutoAskConsumed={onAutoAskConsumed}
            />
          </div>
            {evidence.length > 0 && <EvidenceRail sources={evidence} />}
            {evidence.length > 0 && (
            <div className="max-h-[22dvh] overflow-y-auto border-t border-border bg-card/30 p-3 lg:hidden">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <BookOpen className="size-4 text-accent" />
              Evidence · {evidence.length}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {evidence.length ? evidence.map((source, index) => (
                <details key={`${source.id}-${index}`} className="min-w-0 max-w-full rounded-md border border-border bg-card/50 px-2 py-1">
                  <summary className="cursor-pointer break-words text-xs text-foreground">
                    {source.id} {source.title.replace(/_/g, ' ')}
                  </summary>
                  <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
                    {source.excerpt}
                  </p>
                </details>
              )) : <span className="text-sm text-muted-foreground">Retrieved citations appear here.</span>}
            </div>
          </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KittyHelpWorkspace;
