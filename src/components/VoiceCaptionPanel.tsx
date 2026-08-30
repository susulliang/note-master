import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Mic, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FIELD_PATTERNS } from '@/hooks/use-voice-transcription';
import type { ExtractedField } from '@/hooks/use-voice-transcription';
import type { TranscriptEntry } from '@/hooks/use-call-capture';
import type { WhisperStatus } from '@/hooks/use-local-transcriber';
import type { LlmParserStatus, LlmParseStats } from '@/hooks/use-llm-parser';
import type { WhisperModelName } from '@/lib/whisper-models';
import {
  buildPromptWindow,
  getTranscriptCharCap,
  type LlmDtype,
  type LlmModelName,
} from '@/lib/llm-parser';

export interface MicPanelState {
  isListening: boolean;
  finalTranscript: string;
  interimText: string;
  suggestions: ExtractedField[];
  error: string | null;
  level: number;
  onToggle: () => void;
  onClear: () => void;
}

export interface CallPanelState {
  isCapturing: boolean;
  /** Speaker-tagged transcript: Agent = mic, Customer = tab audio */
  transcript: TranscriptEntry[];
  suggestions: ExtractedField[];
  segmentsSent: number;
  queued: number;
  isTranscribing: boolean;
  error: string | null;
  /** Live input level of the CCP tab audio (customer) */
  customerLevel: number;
  /** Live input level of the agent's microphone */
  agentLevel: number;
  hasMic: boolean;
  onToggle: () => void;
  onClear: () => void;
}

/** Local Whisper engine state (transformers.js WASM, on-device) */
export interface EnginePanelState {
  isSupported: boolean;
  model: WhisperModelName;
  status: WhisperStatus;
  progress: number;
  dtype: string | null;
  error: string | null;
  lastInferenceMs: number | null;
  /** Worker JS-heap snapshot for the RAM badge (null until reported) */
  memStats?: { heapUsedMb: number; heapLimitMb: number } | null;
  onSwitchModel: (model: WhisperModelName) => void;
}

/**
 * On-demand DeepSeek cloud parse state — the "Parse" button in the panel
 * header. One click sends the current transcript window to the DeepSeek
 * API; returned fields overwrite every provisional regex fill. The API
 * key is managed in the toolbar settings panel (Model selection).
 */
export interface CloudPanelState {
  /** True while the round-trip is in flight */
  isParsing: boolean;
  /** Last failure (bad key, network, API error) — surfaced under the header */
  error: string | null;
  /** Last successful round-trip, for the status readout */
  lastResult?: { ms: number; fields: ExtractedField[] } | null;
  /** Send the current transcript window to DeepSeek and apply the fields */
  onParse: () => void;
}

/** On-device LLM parser state — the PRIMARY field parser */
export interface ParserPanelState {
  enabled: boolean;
  model: LlmModelName;
  models: LlmModelName[];
  status: LlmParserStatus;
  progress: number;
  error: string | null;
  isParsing: boolean;
  /** True while the paraphrase (note-polish) generation is in flight */
  isParaphrasing?: boolean;
  lastParseMs: number | null;
  /** Backend the pipeline runs on: 'gpu' (WebGPU) or 'cpu' (WASM) */
  device?: 'gpu' | 'cpu' | null;
  /** Precision that actually loaded (q8 / fp32 / fp16 / q4f16) — drives the RAM estimate */
  dtype?: LlmDtype | null;
  /** Live generation progress of the in-flight parse: 0–1 */
  genProgress?: number;
  /** Worker JS-heap snapshot for the RAM badge (null until reported) */
  memStats?: { heapUsedMb: number; heapLimitMb: number } | null;
  /**
   * Debug: what the LAST parse sent to the model — which transcript lines
   * made the prompt window, the rendered text itself, and the raw model
   * reply. Powers the "what the AI sees" highlight on transcript lines +
   * the debug expander, so a mis-parsed call can be inspected in the
   * field: was the information even inside the prompt?
   */
  window?: { entryIndexes: number[]; chars: number; text: string } | null;
  lastReply?: string | null;
  /**
   * Debug: speed metrics of the last parse — prompt/reply sizes (chars +
   * ~tokens), model generation time, output tokens/s, attempt count.
   */
  lastStats?: LlmParseStats | null;
  /** Load variants that failed before the current session (manager UI) */
  failedAttempts?: Array<{ device: 'gpu' | 'cpu'; dtype: LlmDtype; message: string }> | null;
  onLoadDevice?: (model: LlmModelName, device: 'gpu' | 'cpu') => void;
  onToggleEnabled: (enabled: boolean) => void;
  onSwitchModel: (model: LlmModelName) => void;
  onLoad: () => void;
}

interface VoiceCaptionPanelProps {
  mic: MicPanelState;
  call: CallPanelState;
  engine: EnginePanelState;
  parser?: ParserPanelState;
  /** On-demand DeepSeek cloud parse (the Parse button in the header) */
  cloud?: CloudPanelState;
}

/** Bar thresholds for the audio level meters */
const LEVEL_STEPS = [0.12, 0.3, 0.5, 0.75];

type MeterTone = 'red' | 'blue' | 'amber';

const TONE_BAR: Record<MeterTone, string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
};

/** Compact labeled 4-bar level meter, one per audio channel */
function SpeakerMeter({ label, level, tone }: { label: string; level: number; tone: MeterTone }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="flex h-4 items-end gap-[3px]">
        {LEVEL_STEPS.map((threshold) => (
          <span
            key={threshold}
            className={cn(
              'w-1 rounded-full transition-colors duration-100',
              level >= threshold ? TONE_BAR[tone] : 'bg-foreground/15'
            )}
            style={{ height: `${3 + threshold * 12}px` }}
          />
        ))}
      </span>
    </span>
  );
}

const fieldLabel = (fieldId: string) =>
  FIELD_PATTERNS.find((p) => p.fieldId === fieldId)?.label ?? fieldId;

/**
 * One tiny engine-progress row: label, hairline activity bar, status text.
 *
 * Sits directly under the transcript so the agent can see at a glance what
 * the two pipeline engines are doing — STT (Whisper recognition) and AI
 * (LLM parsing). `bar` drives the strip:
 *
 *  - 'run'    → indeterminate slide (engine is working, no % exists for
 *               WASM inference, it finishes when it finishes)
 *  - number   → determinate fill percentage (model download)
 *  - null     → idle: empty track, text carries the state
 */
function EngineProgressRow({
  label,
  bar,
  text,
  tone,
  error = false,
}: {
  label: string;
  bar: 'run' | number | null;
  text: string;
  tone: 'emerald' | 'amber';
  error?: boolean;
}) {
  const toneBar = tone === 'emerald' ? 'bg-emerald-500' : 'bg-amber-500';
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-6 shrink-0 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">
        {label}
      </span>
      <div className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10">
        {bar === 'run' ? (
          <div className={cn('mini-bar-run h-full rounded-full', toneBar)} />
        ) : typeof bar === 'number' ? (
          <div
            className={cn('h-full rounded-full transition-all duration-300', toneBar)}
            style={{ width: `${Math.max(3, bar)}%` }}
          />
        ) : null}
      </div>
      <span
        className={cn(
          'max-w-[55%] shrink-0 truncate text-[9px] leading-none',
          error ? 'text-destructive' : 'text-muted-foreground/80'
        )}
        title={text}
      >
        {text}
      </span>
    </div>
  );
}

/**
 * Live-caption panel for the voice auto-fill prototype. Supports two
 * capture sources:
 *
 *  - mic:  Web Speech API on the agent's microphone (free, instant, but
 *          cannot hear the CCP call audio playing in another tab)
 *  - call: getDisplayMedia capture of the CCP tab audio + the agent's mic,
 *          each transcribed separately by a local Whisper model in a Web
 *          Worker so every line is speaker-tagged — Customer (tab audio)
 *          vs Agent (your mic). On-device, no API, no upload. base.en by
 *          default, tiny.en for a faster/lighter run.
 *
 * Shows whichever source is active: speaker-tagged transcript, per-speaker
 * audio levels, transcribe-in-flight spinner, errors, engine status, and
 * extracted field chips.
 */
export default function VoiceCaptionPanel({ mic, call, engine, parser, cloud }: VoiceCaptionPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // The SLIDING window the NEXT parse will send — computed LIVE from the
  // current transcript, so the yellow underline slides forward in real time
  // as new lines arrive (the same tail-window slicing the parser applies).
  // Highlighting the last parse's frozen snapshot instead made the window
  // look stuck on an early chunk of the call between the throttled parses.
  //
  // Debounced by 1s: the window only ever loses its OLDEST lines as the
  // call grows (new lines enter at the tail cap immediately), so a one
  // second delay on the highlight is invisible — while running
  // buildPromptWindow (regex over every turn) on EVERY transcript tick
  // was a real cost on 60-minute calls.
  const [windowTick, setWindowTick] = useState(0);
  const transcriptLen = call.transcript.length;
  useEffect(() => {
    const t = window.setTimeout(() => setWindowTick((n) => n + 1), 1000);
    return () => window.clearTimeout(t);
  }, [transcriptLen]);
  const liveWindow = useMemo(
    () =>
      parser?.enabled && parser.status === 'ready'
        ? buildPromptWindow(call.transcript, getTranscriptCharCap(parser.device))
        : null,
    // windowTick re-runs this up to 1×/s; transcriptLen===0 handles the empty case
    [parser?.enabled, parser?.status, parser?.device, windowTick, transcriptLen === 0]
  );
  const llmWindowSet = useMemo(
    () => new Set(liveWindow?.entryIndexes ?? []),
    [liveWindow]
  );
  const llmWindowFirst = useMemo(
    () => (llmWindowSet.size > 0 ? Math.min(...llmWindowSet) : null),
    [llmWindowSet]
  );
  // Highest line index the LAST parse actually sent — the boundary between
  // "already read by the AI" and "new, waiting for the next parse" inside
  // the live window
  const lastSentMax = useMemo(() => {
    const idx = parser?.window?.entryIndexes ?? [];
    return idx.length > 0 ? Math.max(...idx) : null;
  }, [parser?.window]);

  const activeSource: 'mic' | 'call' | null = mic.isListening
    ? 'mic'
    : call.isCapturing
      ? 'call'
      : null;

  const suggestions = activeSource === 'call' ? call.suggestions : mic.suggestions;
  const error = activeSource === 'call' ? call.error : mic.error;
  const isActive = !!activeSource;

  // Call mode (and the idle fallback when the mic captured nothing) renders
  // the speaker-tagged entry list; mic mode renders plain text.
  const showCallEntries =
    activeSource === 'call' || (activeSource === null && !mic.finalTranscript);
  const micText = showCallEntries ? '' : mic.finalTranscript;
  const interim = activeSource === 'mic' ? mic.interimText : '';

  const bothQuiet =
    call.customerLevel < 0.05 && (!call.hasMic || call.agentLevel < 0.05);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [call.transcript, micText, interim]);

  const hasContent =
    micText.length > 0 || call.transcript.length > 0 || suggestions.length > 0;

  const callEmptyText =
    engine.status === 'loading'
      ? `Loading Whisper ${engine.model} on this machine — one-time download, cached afterwards…`
      : engine.status === 'error'
        ? 'Whisper model failed to load — try switching models or reload the page.'
        : call.hasMic
          ? 'Capturing both speakers — Customer from the CCP tab, Agent from your mic. First captions arrive after ~15s.'
          : 'Capturing the customer from the CCP tab — no mic was shared, so your own replies are not transcribed. Restart and allow the mic to capture both speakers.';

  // Hidden when idle with nothing captured and no error to show
  if (!isActive && !hasContent && !error) return null;

  return (
    <div className="fixed bottom-3 left-3 z-40 w-[min(640px,calc(100vw-24px))]">
      <div
        className={cn(
          'glass-panel rounded-xl p-3 transition-all duration-300',
          isActive && 'border border-red-500/40 shadow-[0_0_24px_rgba(239,68,68,0.12)]'
        )}
      >
        {/* Header: source badge + status + controls */}
        <div className="flex items-center gap-2">
          {isActive ? (
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
            </span>
          ) : (
            <Mic className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <p className="flex-1 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {activeSource === 'call'
              ? 'Live captions — Agent + Customer'
              : activeSource === 'mic'
                ? 'Live captions — mic'
                : 'Captured transcript'}
          </p>

          {/* Segments sent + in-flight spinner (call mode) */}
          {activeSource === 'call' && (
            <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
              {call.isTranscribing && <Loader2 className="size-3 animate-spin" />}
              {call.queued > 0 ? `${call.queued} queued` : `${call.segmentsSent} seg`}
            </span>
          )}

          {/* DeepSeek cloud parse — the on-demand extraction trigger.
              Capture start/stop lives on the toolbar mic button. */}
          {cloud && (
            <Button
              variant="default"
              size="sm"
              disabled={cloud.isParsing || call.transcript.length === 0}
              onClick={cloud.onParse}
              className="h-7 gap-1.5 rounded-full px-2.5 text-[11px]"
              aria-label="Parse the transcript with DeepSeek"
              title={
                call.transcript.length === 0
                  ? 'Nothing to parse yet — the transcript is empty'
                  : 'Send the current transcript window to DeepSeek and fill every field (overwrites regex fills)'
              }
            >
              {cloud.isParsing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Sparkles className="size-3" />
              )}
              Parse
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={activeSource === 'call' ? call.onClear : mic.onClear}
            className="size-7 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
            aria-label="Clear transcript"
            title="Clear transcript"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        {/* Cloud parse status: failures and the last round-trip timing */}
        {cloud && (cloud.error || (cloud.lastResult && !cloud.isParsing)) && (
          <p
            className={cn(
              'mt-1 truncate text-[10px] leading-snug',
              cloud.error ? 'text-destructive/90' : 'text-muted-foreground/70'
            )}
            title={cloud.error ?? undefined}
          >
            {cloud.error ??
              `DeepSeek: ${(cloud.lastResult!.ms / 1000).toFixed(1)}s · ${cloud.lastResult!.fields.length} fields filled`}
          </p>
        )}

        {/* Per-speaker audio level meters — proves each channel is live.
            Engine controls/resources live in the toolbar's settings panel. */}
        {isActive && activeSource === 'call' && (
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <SpeakerMeter label="Customer" level={call.customerLevel} tone="amber" />
            {call.hasMic ? (
              <SpeakerMeter label="Agent" level={call.agentLevel} tone="blue" />
            ) : (
              <span
                className="text-[10px] text-muted-foreground/70"
                title="No microphone was shared — only the customer side is transcribed"
              >
                mic unavailable — customer only
              </span>
            )}
            {call.hasMic && !bothQuiet && (
              <span
                className="ml-auto text-[9px] text-muted-foreground/60"
                title="Browsers can't echo-cancel audio playing in another tab, so speakers leak the customer's voice into your mic and their words may also appear under Agent. A headset keeps the two speakers cleanly separated."
              >
                headset recommended
              </span>
            )}
            {bothQuiet && call.transcript.length === 0 && (
              <span className="text-[10px] text-muted-foreground/70">
                no audio detected
              </span>
            )}
          </div>
        )}
        {isActive && activeSource === 'mic' && (
          <div className="mt-1.5 flex items-center gap-2">
            <SpeakerMeter label="Mic" level={mic.level} tone="red" />
            {mic.level < 0.05 && !mic.finalTranscript && (
              <span className="text-[10px] text-muted-foreground/70">no audio detected</span>
            )}
          </div>
        )}


        {/* Errors */}
        {error && (
          <p className="mt-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] leading-snug text-destructive">
            {error}
          </p>
        )}

        {/* Transcript area — tall enough to hold a good stretch of dialogue
            (both speakers, several exchanges) so the agent can proofread the
            captured conversation without scrolling the page instead */}
        <div
          ref={scrollRef}
          className="custom-scrollbar mt-2 max-h-[min(480px,60vh)] overflow-y-auto rounded-lg bg-background/50 p-2"
        >
          {showCallEntries ? (
            call.transcript.length > 0 ? (
              <div className="flex flex-col gap-1">
                {call.transcript.map((entry, i) => {
                  // Sliding-window highlight: amber = inside the AI window
                  // (the text the next parse sends), dimmed = slid out of
                  // the window (older than it — extracted values live on in
                  // the form). Inside the window, lines at or below the last
                  // parse's boundary were already read; newer ones are
                  // queued for the next pass.
                  const inWindow = llmWindowSet.has(i);
                  const sent = inWindow && lastSentMax !== null && i <= lastSentMax;
                  const beforeWindow =
                    llmWindowFirst !== null && i < llmWindowFirst && !inWindow;
                  return (
                    <p
                      key={i}
                      // STATIC underlines only — no fills, rings or pulse
                      // animations: a 40-line transcript re-rendering with
                      // animated shadows on every progress tick was a
                      // measurable perf drag. Yellow underline = inside the
                      // AI window (being parsed next); grey underline =
                      // already read by the AI (its values are on the form).
                      className={cn(
                        'flex items-start gap-1.5 border-b-2 border-transparent px-1 py-0.5 -mx-1',
                        inWindow
                          ? 'border-b-amber-400/80'
                          : beforeWindow && 'border-b-foreground/15 opacity-40'
                      )}
                      title={
                        sent
                          ? 'Inside the sliding AI window — sent on the last parse'
                          : inWindow
                            ? 'New — inside the sliding AI window, sent on the next parse'
                            : beforeWindow
                              ? 'Outside the sliding AI window — not sent (its extracted values are carried forward in the form)'
                              : undefined
                      }
                    >
                      <span
                        className={cn(
                          'mt-[3px] shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide',
                          entry.speaker === 'agent'
                            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                        )}
                        title={
                          entry.speaker === 'agent'
                            ? 'Your microphone'
                            : 'CCP tab audio'
                        }
                      >
                        {entry.speaker === 'agent' ? 'Agent' : 'Customer'}
                      </span>
                      <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-foreground">
                        {entry.text}
                      </span>
                    </p>
                  );
                })}
              </div>
            ) : (
              <span className="text-[13px] leading-relaxed text-muted-foreground/60">
                {callEmptyText}
              </span>
            )
          ) : (
            <p className="text-[13px] leading-relaxed">
              {micText && <span className="text-foreground">{micText}</span>}
              {interim && <span className="italic text-muted-foreground"> {interim}</span>}
              {!micText && !interim && (
                <span className="text-muted-foreground/60">
                  Listening — the Web Speech API hears only this tab&#8217;s microphone, never
                  audio from other tabs.
                </span>
              )}
            </p>
          )}
        </div>

        {/* Legend for the sliding-window underline — always visible once a
            parse has run, so the yellow/grey lines are self-explanatory */}
        {activeSource === 'call' &&
          call.transcript.length > 0 &&
          llmWindowSet.size > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] leading-none text-muted-foreground/80">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-0.5 w-3 rounded-sm bg-amber-400/80" />
                <span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {llmWindowSet.size}
                  </span>
                  /{call.transcript.length} lines in the sliding AI window
                </span>
              </span>
              {lastSentMax !== null &&
                parser?.window &&
                parser.window.entryIndexes.length > 0 && (
                  <span className="opacity-70">
                    {parser.window.entryIndexes.length} read on the last parse
                  </span>
                )}
              {llmWindowFirst !== null && llmWindowFirst > 0 && (
                <span className="opacity-70">grey/dimmed = slid out (values live on in the form)</span>
              )}
            </div>
          )}

        {/* Tiny engine-progress strip — recognition (STT) and parsing (AI)
            status at a glance, right under the transcript they produce */}
        {activeSource === 'call' && (
          <div className="mt-1.5 flex flex-col gap-1">
            <EngineProgressRow
              label="STT"
              bar={call.isTranscribing ? 'run' : null}
              text={
                call.isTranscribing
                  ? call.queued > 0
                    ? `recognizing · ${call.queued} queued`
                    : 'recognizing…'
                  : `${call.segmentsSent} segments recognized`
              }
              tone="emerald"
            />
            {parser && (
              <EngineProgressRow
                label="AI"
                bar={
                  !parser.enabled
                    ? null
                    : parser.status === 'loading'
                      ? parser.progress
                      : parser.isParsing || parser.isParaphrasing
                        ? // Determinate when tokens are streaming, else run
                          parser.genProgress
                            ? Math.max(3, parser.genProgress * 100)
                            : 'run'
                        : null
                }
                text={
                  !parser.enabled
                    ? 'parser off'
                    : parser.status === 'loading'
                      ? `downloading model ${parser.progress}%`
                      : parser.status === 'error'
                        ? 'model failed to load'
                        : parser.isParsing
                          ? parser.genProgress
                            ? `parsing… ${Math.round(parser.genProgress * 100)}%`
                            : 'parsing conversation…'
                          : parser.isParaphrasing
                            ? parser.genProgress
                              ? `polishing… ${Math.round(parser.genProgress * 100)}%`
                              : 'polishing notes…'
                            : parser.lastParseMs !== null
                              ? `parsed · ${(parser.lastParseMs / 1000).toFixed(1)}s${
                                  parser.window
                                    ? ` · ${parser.window.entryIndexes.length} lines read`
                                    : ''
                                }`
                              : parser.status === 'ready'
                                ? 'standby'
                                : 'model not loaded'
                }
                tone="amber"
                error={parser.enabled && parser.status === 'error'}
              />
            )}
          </div>
        )}

        {/* Extracted fields */}
        {suggestions.length > 0 && (
          <div className="mt-2 border-t border-border/30 pt-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Auto-filled fields ({suggestions.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((field, i) => (
                <span
                  key={`${field.fieldId}-${i}`}
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-green-500/15 px-2 py-1 text-[10px] font-medium leading-none text-green-600 dark:text-green-400"
                  title={`${fieldLabel(field.fieldId)}: ${field.value}`}
                >
                  <span className="shrink-0 opacity-70">{fieldLabel(field.fieldId)}</span>
                  <span className="truncate font-semibold">
                    {field.value.length > 22 ? `${field.value.slice(0, 22)}…` : field.value}
                  </span>
                  <span className="shrink-0 text-[8px] opacity-70">&#10003;</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
