/**
 * Challenge panel — NPC role-play challenge opened from the Challenge Tent in
 * the COMMUNE. The NPC (persona in src/data/npc-personas) plays a difficult
 * customer via the same remote DeepSeek pipeline as the transcript parser /
 * Kitty Help (kittyChat); the agent picks one of four suggested replies each
 * turn. The success ending's spice award is granted server-side.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Mic, RefreshCw, Square, Star, Trash2, Trophy, Volume2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  awardChallenge,
  sendChallengeNpcTurn,
  startChallengeNpc,
  submitTestAward,
  type ChallengeMessage,
  type ChallengeTurn as ApiChallengeTurn,
} from '@/lib/auth-client';
import { kittyChat, type ChatMsg } from '@/lib/kitty-help';
import { useLocalTranscriber } from '@/hooks/use-local-transcriber';
import { NPC_PERSONAS } from '@/data/npc-personas';

/** Crazy-Dave-style gargle gibberish played while the NPC "speaks". */
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

function parseTurn(raw: string, messageKey: string): ChallengeTurn | null {
  const parsed = extractJsonObject(raw);
  if (parsed) {
    const msg = String(parsed[messageKey] ?? '').trim();
    const choices = Array.isArray(parsed.agent_choices)
      ? parsed.agent_choices.map((c) => String(c).trim()).filter(Boolean)
      : [];
    if (msg && choices.length > 0) {
      const rawStars = Number(parsed.stars);
      return {
        message: msg,
        agent_choices: choices,
        status: parsed.status === 'success' || parsed.status === 'fail' ? parsed.status : 'ongoing',
        stars:
          Number.isFinite(rawStars) && parsed.status !== 'ongoing'
            ? Math.max(0, Math.min(5, Math.round(rawStars)))
            : undefined,
      };
    }
  }
  return salvageTruncatedTurn(raw, messageKey);
}

/** Salvage a truncated reply: long rambles can hit the token cap and cut the
 *  JSON mid-object. Pull the NPC message string and whatever choices made it
 *  out before the cut; the turn stays 'ongoing'. */
function salvageTruncatedTurn(raw: string, messageKey: string): ChallengeTurn | null {
  const msgMatch = raw.match(new RegExp(`"${messageKey}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  if (!msgMatch) return null;
  let message: string;
  try {
    message = JSON.parse(`"${msgMatch[1]}"`) as string;
  } catch {
    return null;
  }
  if (!message.trim()) return null;
  // Whatever choice strings appeared after the message are the choices.
  const after = raw.slice((msgMatch.index ?? 0) + msgMatch[0].length);
  const choiceMatches = after.matchAll(/"((?:[^"\\]|\\.)+)"\s*(?=,|\])/g);
  const choices: string[] = [];
  for (const m of choiceMatches) {
    try {
      const text = (JSON.parse(`"${m[1]}"`) as string).trim();
      if (text && !choices.includes(text)) choices.push(text);
    } catch {
      /* skip malformed fragment */
    }
  }
  if (choices.length === 0) return null;
  return { message: message.trim(), agent_choices: choices, status: 'ongoing' };
}

/** The NPC's end-of-call satisfaction rating (0–5 stars). */
function StarRow({ stars }: { stars: number }) {
  return (
    <div className="mt-1 flex items-center gap-1" title={`Satisfaction: ${stars}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={cn('size-4', i < stars ? 'fill-yellow-400 text-yellow-400' : 'text-foreground/25')} />
      ))}
      <span className="ml-1 text-[10px] font-bold uppercase tracking-wide opacity-80">{stars}/5</span>
    </div>
  );
}

interface ChallengePanelProps {
  /** Which persona to run — key into NPC_PERSONAS. */
  personaId: string;
  npcName?: string;
  onSpiceChange: (spice: number) => void;
  onClose: () => void;
}

type ChallengeTurn = ApiChallengeTurn & { stars?: number; scorePct?: number };

export default function ChallengePanel({ personaId, npcName, onSpiceChange, onClose }: ChallengePanelProps) {
  const builtInPersona = NPC_PERSONAS[personaId] ?? null;
  const persona = builtInPersona ?? NPC_PERSONAS.gb_poolius;
  const customNpc = !builtInPersona;
  const displayName = builtInPersona?.name ?? npcName ?? 'Commune NPC';
  const blurb = builtInPersona?.blurb ?? 'Use verified troubleshooting steps to find the correct resolution.';
  const [log, setLog] = useState<ChallengeMessage[]>([]);
  const [turn, setTurn] = useState<ChallengeTurn | null>(null);
  const [awarded, setAwarded] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resultSubmitted, setResultSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /* ── voice replies — local Whisper (mic → PCM → transcript → free reply) ── */
  const transcriber = useLocalTranscriber();
  const [recState, setRecState] = useState<'idle' | 'recording' | 'transcribing' | 'draft'>('idle');
  const [draft, setDraft] = useState('');
  const [recError, setRecError] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRafRef = useRef(0);
  const chunksRef = useRef<Float32Array[]>([]);

  const stopRecording = useCallback(async () => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    cancelAnimationFrame(analyserRafRef.current);
    setMicLevel(0);
    const ctx = ctxRef.current;
    ctxRef.current = null;
    await ctx?.close().catch(() => undefined);
    setRecState('transcribing');
    try {
      const total = chunksRef.current.reduce((n, c) => n + c.length, 0);
      const audio = new Float32Array(total);
      let off = 0;
      for (const c of chunksRef.current) {
        audio.set(c, off);
        off += c.length;
      }
      chunksRef.current = [];
      if (total < 16_000) {
        setRecError('Clip too short — hold the mic button a little longer.');
        setRecState('idle');
        return;
      }
      if (transcriber.status !== 'ready') await transcriber.load();
      const text = (await transcriber.transcribe(audio)).trim();
      if (!text) {
        setRecError('Nothing heard — try again a bit closer to the mic.');
        setRecState('idle');
        return;
      }
      setDraft(text);
      setRecState('draft');
    } catch (err) {
      setRecError(err instanceof Error ? err.message : 'Transcription failed');
      setRecState('idle');
    }
  }, [transcriber]);

  const startRecording = useCallback(async () => {
    setRecError(null);
    setDraft('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext({ sampleRate: 16_000 });
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      chunksRef.current = [];
      processor.onaudioprocess = (e) => chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      source.connect(processor);
      processor.connect(ctx.destination);
      // live mic meter drives the listening bars
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) {
          const d = (v - 128) / 128;
          sum += d * d;
        }
        setMicLevel(Math.min(1, Math.sqrt(sum / data.length) * 3));
        analyserRafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setRecState('recording');
    } catch {
      setRecError('Microphone unavailable — check browser permissions.');
    }
  }, []);

  // Stop the mic if the modal closes mid-recording.
  useEffect(
    () => () => {
      processorRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(analyserRafRef.current);
      void ctxRef.current?.close().catch(() => undefined);
    },
    []
  );

  const sendDraft = () => {
    const text = draft.trim();
    if (!text) return;
    setRecState('idle');
    setDraft('');
    void choose(text);
  };

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
    setResultSubmitted(false);
    if (customNpc) {
      setSessionId(null);
      setLog([]);
      setTurn(null);
      try {
        const result = await startChallengeNpc(personaId);
        setSessionId(result.sessionId);
        setLog([{ role: 'npc', content: result.turn.message }]);
        setTurn(result.turn);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not start this challenge');
      } finally {
        setBusy(false);
      }
      return;
    }
    const initial = persona.data.initial_output;
    setLog([{ role: 'npc', content: String(initial[persona.messageKey] ?? '') }]);
    setTurn({
      message: String(initial[persona.messageKey] ?? ''),
      agent_choices: Array.isArray(initial.agent_choices) ? initial.agent_choices.map(String) : [],
      status: 'ongoing',
    });
    setBusy(false);
    speak();
  }, [speak, persona, personaId, customNpc]);

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
    if (customNpc) {
      try {
        if (!sessionId) throw new Error('Challenge session expired. Restart this NPC challenge.');
        const result = await sendChallengeNpcTurn(sessionId, choice);
        setLog([...history, { role: 'agent', content: choice }, { role: 'npc', content: result.turn.message }]);
        setTurn(result.turn);
        setResultSubmitted(result.submitted);
        if (result.submitted) {
          try {
            const award = await submitTestAward(`commune-npc:${personaId}`, result.turn.scorePct ?? 0);
            if (award.spice > 0) {
              setAwarded(award.awarded);
              onSpiceChange(award.spice);
            }
          } catch {
            // Score submission is already saved; test rewards are best-effort.
          }
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The challenge engine did not respond');
        setLog(history);
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      const baseMessages: ChatMsg[] = [
        { role: 'system', content: persona.data.system_prompt.join('\n') },
        ...history.map((m) => ({ role: m.role === 'npc' ? ('assistant' as const) : ('user' as const), content: m.content })),
      ];
      const choiceMessages: ChatMsg[] = [...baseMessages, { role: 'user', content: choice }];
      let raw = await kittyChat(choiceMessages, 8_192);
      let next = parseTurn(raw, persona.messageKey);
      if (!next) {
        // One corrective retry — ask for the complete JSON object again.
        const retryMessages: ChatMsg[] = [
          ...baseMessages,
          { role: 'user', content: choice },
          { role: 'assistant', content: raw.slice(-1_000) },
          { role: 'user', content: `Your previous reply was cut off or invalid. Re-output ONLY the complete JSON object with ${persona.messageKey}, agent_choices (all 4), and status.` },
        ];
        raw = await kittyChat(retryMessages, 8_192);
        next = parseTurn(raw, persona.messageKey);
      }
      if (!next) throw new Error('The challenge engine returned an invalid turn');
      setLog([...history, { role: 'agent', content: choice }, { role: 'npc', content: next.message }]);
      setTurn(next);
      speak();
      if (next.status === 'success') {
        const out = await awardChallenge(personaId);
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
        aria-label={`NPC Challenge — ${displayName}`}
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-2xl backdrop-blur-md"
      >
        {/* header */}
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <Trophy className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <h3 className="font-mono text-sm font-extrabold text-foreground">NPC Challenge — {displayName}</h3>
            <p className="text-[11px] text-muted-foreground">{blurb}</p>
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
                {m.role === 'npc' && <p className="mb-1 font-mono text-[10px] font-bold uppercase text-muted-foreground">{displayName}</p>}
                <span className={cn('leading-relaxed', m.role === 'npc' ? 'text-sm' : 'text-xs')}>{m.content}</span>
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> {displayName} is thinking…
            </div>
          )}
          {!busy && speaking && (
            <div className="flex items-center gap-2 text-[11px] font-semibold text-accent">
              <Volume2 className="size-3.5 animate-pulse" /> {displayName} is speaking
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
              {customNpc
                ? `Challenge score saved (${turn?.scorePct ?? 0}/100). +${awarded} spice awarded.`
                : `Call defused — ${displayName} is staying with us. +${awarded} spice awarded.`}
              {!customNpc && <StarRow stars={turn?.stars ?? 0} />}
            </div>
          )}
          {customNpc && turn?.status === 'success' && (
            <div className="rounded-lg border border-primary/50 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
              {resultSubmitted
                ? `Correct resolution. Test submitted to the score database: ${turn.scorePct ?? 0}/100.`
                : 'Correct resolution confirmed.'}
            </div>
          )}
          {turn?.status === 'fail' && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
              {customNpc ? `${displayName} ended the conversation.` : `${displayName} hung up on you.`}
              {!customNpc && <StarRow stars={turn.stars ?? 0} />}
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

          {/* voice reply — mic → Whisper → editable draft → send */}
          {!ended && (
            <div className="mt-2.5">
              {recState === 'idle' && (
                <button
                  type="button"
                  onClick={() => void startRecording()}
                  disabled={busy}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors',
                    'hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    busy && 'cursor-not-allowed opacity-50'
                  )}
                >
                  <Mic className="size-3.5" /> Or answer with your voice
                </button>
              )}
              {recState === 'recording' && (
                <button
                  type="button"
                  onClick={() => void stopRecording()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/60 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive transition-colors hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                >
                  <Square className="size-3 fill-current" /> Listening — tap to stop
                  <span className="flex items-end gap-0.5" aria-hidden>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className="w-1 rounded-sm bg-destructive/80 transition-all duration-100"
                        style={{ height: 3 + Math.max(2, micLevel * 10 * (1 - Math.abs(i - 2) / 3)) }}
                      />
                    ))}
                  </span>
                </button>
              )}
              {recState === 'transcribing' && (
                <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  {transcriber.status === 'loading'
                    ? `Loading Whisper model… ${Math.round(transcriber.progress * 100)}%`
                    : 'Transcribing your reply…'}
                </div>
              )}
              {recState === 'draft' && (
                <div className="rounded-lg border border-accent/40 bg-accent/5 p-2">
                  <p className="mb-1 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wide text-accent">
                    <Check className="size-3" /> Your reply — edit before sending
                  </p>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={2}
                    autoFocus
                    className="w-full resize-none rounded-md border border-border/60 bg-background/70 px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  />
                  <div className="mt-1.5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRecState('idle');
                        setDraft('');
                      }}
                      className="flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Trash2 className="size-3" /> Discard
                    </button>
                    <button
                      type="button"
                      onClick={sendDraft}
                      disabled={busy || !draft.trim()}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                    >
                      Send reply
                    </button>
                  </div>
                </div>
              )}
              {recError && <p className="mt-1.5 text-[11px] text-destructive">{recError}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
