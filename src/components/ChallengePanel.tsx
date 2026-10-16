/**
 * Challenge panel — NPC role-play challenge opened from the Challenge Tent in
 * the COMMUNE. The NPC (persona in src/data/npc-personas) plays a difficult
 * customer via the same remote DeepSeek pipeline as the transcript parser /
 * Kitty Help (kittyChat); the agent picks one of four suggested replies each
 * turn. The success ending's spice award is granted server-side.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Trophy, Volume2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { awardChallenge, type ChallengeMessage, type ChallengeTurn } from '@/lib/auth-client';
import { kittyChat } from '@/lib/kitty-help';
import { NPC_PERSONAS } from '@/data/npc-personas';

const PERSONA_ID = 'gb_poolius';

/** Crazy-Dave-style gargle gibberish played while GB "speaks". */
const GARGLE_TRACKS = ['/assets/npc/crazydavelong2.mp3', '/assets/npc/crazydavelong3.mp3'];

/** Best-effort JSON extraction from an LLM reply (handles code fences and
 *  stray prose around the JSON object). */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseTurn(raw: string): ChallengeTurn | null {
  const parsed = extractJsonObject(raw);
  if (!parsed) return null;
  const gb = String(parsed.gb_message ?? '').trim();
  const choices = Array.isArray(parsed.agent_choices)
    ? parsed.agent_choices.map((c) => String(c).trim()).filter(Boolean)
    : [];
  if (!gb || choices.length === 0) return null;
  return {
    gb_message: gb,
    agent_choices: choices,
    status: parsed.status === 'success' || parsed.status === 'fail' ? parsed.status : 'ongoing',
  };
}

interface ChallengePanelProps {
  onSpiceChange: (spice: number) => void;
  onClose: () => void;
}

export default function ChallengePanel({ onSpiceChange, onClose }: ChallengePanelProps) {
  const [log, setLog] = useState<ChallengeMessage[]>([]);
  const [turn, setTurn] = useState<ChallengeTurn | null>(null);
  const [awarded, setAwarded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /** Play a random gargle track while GB talks over his message. */
  const speak = useCallback(() => {
    audioRef.current?.pause();
    const audio = new Audio(GARGLE_TRACKS[Math.floor(Math.random() * GARGLE_TRACKS.length)]);
    audio.volume = 0.5;
    audio.onended = () => setSpeaking(false);
    audioRef.current = audio;
    setSpeaking(true);
    void audio.play().catch(() => setSpeaking(false));
  }, []);

  // Stop any gargle when the modal unmounts.
  useEffect(() => () => audioRef.current?.pause(), []);

  const restart = useCallback(async () => {
    setBusy(true);
    setError(null);
    setAwarded(null);
    const persona = NPC_PERSONAS[PERSONA_ID];
    setLog([{ role: 'npc', content: persona.initial_output.gb_message }]);
    setTurn(persona.initial_output);
    setBusy(false);
    speak();
  }, [speak]);

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
    const persona = NPC_PERSONAS[PERSONA_ID];
    const history = [...log];
    setLog([...history, { role: 'agent', content: choice }]);
    try {
      const raw = await kittyChat(
        [
          { role: 'system', content: persona.system_prompt.join('\n') },
          ...history.map((m) => ({ role: m.role === 'npc' ? ('assistant' as const) : ('user' as const), content: m.content })),
          { role: 'user', content: choice },
        ],
        1_200
      );
      const next = parseTurn(raw);
      if (!next) throw new Error('The challenge engine returned an invalid turn');
      setLog([...history, { role: 'agent', content: choice }, { role: 'npc', content: next.gb_message }]);
      setTurn(next);
      speak();
      if (next.status === 'success') {
        const out = await awardChallenge(PERSONA_ID);
        if (out.awarded > 0) {
          setAwarded(out.awarded);
          onSpiceChange(out.spice);
        }
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
              <Loader2 className="size-3.5 animate-spin" /> GB Poolius is thinking…
            </div>
          )}
          {!busy && speaking && (
            <div className="flex items-center gap-2 text-[11px] font-semibold text-accent">
              <Volume2 className="size-3.5 animate-pulse" /> GB Poolius is speaking
              <span className="flex items-end gap-0.5" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1 rounded-sm bg-accent/70"
                    style={{ height: 4 + ((i * 3) % 7), animation: `pulse 0.6s ease-in-out ${i * 0.15}s infinite alternate` }}
                  />
                ))}
              </span>
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
