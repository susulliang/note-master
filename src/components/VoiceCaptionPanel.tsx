import { useEffect, useRef } from 'react';
import { BrainCircuit, Cpu, Loader2, Mic, MicOff, MonitorPlay, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FIELD_PATTERNS } from '@/hooks/use-voice-transcription';
import type { ExtractedField } from '@/hooks/use-voice-transcription';
import type { TranscriptEntry } from '@/hooks/use-call-capture';
import type { WhisperStatus } from '@/hooks/use-local-transcriber';
import type { LlmParserStatus } from '@/hooks/use-llm-parser';
import {
  WHISPER_MODELS,
  WHISPER_MODEL_META,
  type WhisperModelName,
} from '@/lib/whisper-models';
import {
  LLM_MODEL_META,
  LLM_MODELS,
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
  onSwitchModel: (model: WhisperModelName) => void;
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
  lastParseMs: number | null;
  onToggleEnabled: (enabled: boolean) => void;
  onSwitchModel: (model: LlmModelName) => void;
  onLoad: () => void;
}

interface VoiceCaptionPanelProps {
  mic: MicPanelState;
  call: CallPanelState;
  engine: EnginePanelState;
  parser?: ParserPanelState;
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
export default function VoiceCaptionPanel({ mic, call, engine, parser }: VoiceCaptionPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

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
    <div className="fixed bottom-3 left-3 z-40 w-[min(420px,calc(100vw-24px))]">
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

          <Button
            variant={isActive ? 'destructive' : 'ghost'}
            size="sm"
            onClick={activeSource === 'call' ? call.onToggle : mic.onToggle}
            className="h-7 gap-1.5 rounded-full px-2.5 text-[11px]"
            aria-label={isActive ? 'Stop capture' : 'Resume capture'}
            title={isActive ? 'Stop capture' : 'Resume capture'}
          >
            {activeSource === 'call' ? (
              <MonitorPlay className="size-3" />
            ) : isActive ? (
              <MicOff className="size-3" />
            ) : (
              <Mic className="size-3" />
            )}
            {isActive ? 'Stop' : 'Listen'}
          </Button>
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

        {/* Per-speaker audio level meters — proves each channel is live */}
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

        {/* Local Whisper engine — model toggle + status (call mode) */}
        {activeSource === 'call' && engine.isSupported && (
          <div className="mt-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold leading-none text-emerald-600 dark:text-emerald-400"
                title="Transcription runs on this machine — audio never leaves the browser"
              >
                <Cpu className="size-2.5" />
                Local
              </span>

              {/* base.en ⇄ tiny.en segmented toggle */}
              <span className="inline-flex overflow-hidden rounded-full border border-border/40">
                {WHISPER_MODELS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => engine.onSwitchModel(name)}
                    disabled={engine.status === 'loading' && engine.model === name}
                    className={cn(
                      'px-2 py-0.5 text-[10px] font-medium leading-none transition-colors',
                      engine.model === name
                        ? 'bg-foreground/10 text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    title={WHISPER_MODEL_META[name].note}
                  >
                    {WHISPER_MODEL_META[name].label}
                  </button>
                ))}
              </span>

              {/* Engine status */}
              {engine.status === 'loading' && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Loader2 className="size-2.5 animate-spin" />
                  downloading {engine.progress}%
                </span>
              )}
              {engine.status === 'ready' && (
                <span className="text-[10px] text-muted-foreground">
                  on-device{engine.dtype ? ` · ${engine.dtype}` : ''}
                </span>
              )}
              {engine.status === 'error' && (
                <span className="text-[10px] text-destructive">model failed to load</span>
              )}
              {engine.lastInferenceMs !== null && engine.status === 'ready' && (
                <span
                  className="text-[10px] text-muted-foreground/70"
                  title="Inference time for the last 15s segment"
                >
                  {(engine.lastInferenceMs / 1000).toFixed(1)}s/seg
                </span>
              )}
            </div>

            {/* Download progress */}
            {engine.status === 'loading' && (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${Math.max(3, engine.progress)}%` }}
                />
              </div>
            )}

            {engine.error && (
              <p className="mt-1 text-[10px] leading-snug text-destructive/90">{engine.error}</p>
            )}
          </div>
        )}

        {/* On-device LLM — the PRIMARY parser: reads the whole conversation
            (agent + customer) and overrides pattern-matched values */}
        {activeSource === 'call' && parser && (
          <div className="mt-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Enable / disable the AI parser */}
              <button
                type="button"
                onClick={() => parser.onToggleEnabled(!parser.enabled)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none transition-colors',
                  parser.enabled
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-foreground/10 text-muted-foreground'
                )}
                title={
                  parser.enabled
                    ? 'The on-device LLM reads the whole conversation (agent + customer) and fills the ticket — pattern matches are only provisional until then'
                    : 'Enable the on-device LLM to parse the conversation (pattern matching only, without it)'
                }
              >
                <BrainCircuit className="size-2.5" />
                {parser.enabled ? 'AI parser on' : 'AI parser off'}
              </button>

              {/* Model segmented toggle */}
              {parser.enabled && (
                <span className="inline-flex overflow-hidden rounded-full border border-border/40">
                  {parser.models.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => parser.onSwitchModel(name)}
                      disabled={parser.status === 'loading' && parser.model === name}
                      className={cn(
                        'px-2 py-0.5 text-[10px] font-medium leading-none transition-colors',
                        parser.model === name
                          ? 'bg-foreground/10 text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      title={LLM_MODEL_META[name].note}
                    >
                      {LLM_MODEL_META[name].label}
                    </button>
                  ))}
                </span>
              )}

              {/* Status */}
              {parser.enabled && parser.status === 'idle' && (
                <button
                  type="button"
                  onClick={parser.onLoad}
                  className="text-[10px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                  title="Download the model now (one-time, cached by the browser)"
                >
                  load model
                </button>
              )}
              {parser.enabled && parser.status === 'loading' && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Loader2 className="size-2.5 animate-spin" />
                  downloading {parser.progress}%
                </span>
              )}
              {parser.enabled && parser.status === 'ready' && (
                <span className="text-[10px] text-muted-foreground">standby</span>
              )}
              {parser.enabled && parser.status === 'error' && (
                <span className="text-[10px] text-destructive" title={parser.error ?? undefined}>
                  model failed to load
                </span>
              )}
              {parser.isParsing && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                  <Sparkles className="size-2.5 animate-pulse" />
                  reading the conversation…
                </span>
              )}
              {parser.lastParseMs !== null && !parser.isParsing && (
                <span
                  className="text-[10px] text-muted-foreground/70"
                  title="Duration of the last parse over the whole conversation"
                >
                  {(parser.lastParseMs / 1000).toFixed(1)}s/parse
                </span>
              )}
            </div>

            {/* Download progress */}
            {parser.enabled && parser.status === 'loading' && (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${Math.max(3, parser.progress)}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Errors */}
        {error && (
          <p className="mt-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] leading-snug text-destructive">
            {error}
          </p>
        )}

        {/* Transcript area */}
        <div
          ref={scrollRef}
          className="custom-scrollbar mt-2 max-h-[132px] overflow-y-auto rounded-lg bg-background/50 p-2"
        >
          {showCallEntries ? (
            call.transcript.length > 0 ? (
              <div className="flex flex-col gap-1">
                {call.transcript.map((entry, i) => (
                  <p key={i} className="flex items-start gap-1.5">
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
                ))}
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
