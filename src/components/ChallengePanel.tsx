/**
 * Challenge panel — NPC role-play challenge opened from the Challenge Tent in
 * the COMMUNE. The NPC (persona served by the Worker, driven by Workers AI)
 * plays a difficult customer; the agent picks one of four suggested replies
 * each turn. Success (+5 spice) / fail endings are decided server-side.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Trophy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { challengeTurn, startChallenge, type ChallengeMessage, type ChallengeTurn } from '@/lib/auth-client';

const PERSONA_ID = 'gb_poolius';

interface ChallengePanelProps {
  onSpiceChange: (spice: number) => void;
  onClose: () => void;
}

export default function ChallengePanel({ onSpiceChange, onClose }: ChallengePanelProps) {
  const [log, setLog] = useState<ChallengeMessage[]>([]);
  const [turn, setTurn] = useState<ChallengeTurn | null>(null);
  const [awarded, setAwarded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const restart = useCallback(async () => {
    setBusy(true);
    setError(null);
    setAwarded(null);
    try {
      const out = await startChallenge(PERSONA_ID);
      setLog([{ role: 'npc', content: out.turn.gb_message }]);
      setTurn(out.turn);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open the challenge');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void restart();
  }, [restart]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, busy]);

  const choose = async (choice: string) => {
    if (busy || !turn || turn.status !== 'ongoing') return;
    setBusy(true);
    setError(null);
    const history = [...log];
    setLog([...history, { role: 'agent', content: choice }]);
    try {
      const out = await challengeTurn(PERSONA_ID, history, choice);
      setLog([...history, { role: 'agent', content: choice }, { role: 'npc', content: out.turn.gb_message }]);
      setTurn(out.turn);
      if (out.awarded > 0) {
        setAwarded(out.awarded);
        onSpiceChange(out.spice);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The challenge engine did not respond');
      setLog(history); // roll back the optimistic agent line
    } finally {
      setBusy(false);
    }
  };

  const ended = !!turn && turn.status !== 'ongoing';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="NPC Challenge — GB Poolius"
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-2xl backdrop-blur-md"
      >
        {/* header */}
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <Trophy className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <h3 className="font-mono text-sm font-extrabold text-foreground">NPC Challenge — GB Poolius</h3>
            <p className="text-[11px] text-muted-foreground">
              A furious pool-robot owner on the line. Talk him down — pick one reply per turn.
            </p>
          </div>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide',
              !turn && 'border-border/60 text-muted-foreground',
              turn?.status === 'ongoing' && 'border-accent/50 bg-accent/10 text-accent',
              turn?.status === 'success' && 'border-primary/60 bg-primary/10 text-primary',
              turn?.status === 'fail' && 'border-destructive/60 bg-destructive/10 text-destructive'
            )}
          >
            {turn?.status ?? 'loading'}
          </span>
          <button
            type="button"
            onClick={() => void restart()}
            disabled={busy}
            title="Restart the challenge"
            className="rounded-md border border-border/60 p-1.5 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          >
            <RefreshCw className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Leave the tent"
            className="rounded-md border border-border/60 p-1.5 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* chat log */}
        <div ref={logRef} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
          {log.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'agent' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] whitespace-pre-wrap rounded-xl border px-3 py-2 text-xs leading-relaxed',
                  m.role === 'agent'
                    ? 'rounded-br-sm border-accent/40 bg-accent/10 text-foreground'
                    : 'rounded-bl-sm border-border/60 bg-background/60 text-foreground'
                )}
              >
                {m.role === 'npc' && <p className="mb-0.5 font-mono text-[10px] font-bold uppercase text-muted-foreground">GB Poolius</p>}
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> GB Poolius is typing…
            </div>
          )}
          {awarded !== null && (
            <div className="rounded-lg border border-primary/50 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
              🌶 Call defused — GB is staying with us. +{awarded} spice awarded.
            </div>
          )}
          {turn?.status === 'fail' && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
              GB hung up. Hit the restart button above and try another approach.
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>
          )}
        </div>

        {/* choices */}
        <div className="border-t border-border/60 px-4 py-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {(turn?.agent_choices ?? []).map((c, i) => (
              <button
                key={i}
                type="button"
                disabled={busy || ended}
                onClick={() => void choose(c)}
                className={cn(
                  'rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-left text-xs leading-snug text-foreground transition-colors',
                  'hover:border-accent/50 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  (busy || ended) && 'cursor-not-allowed opacity-50'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
