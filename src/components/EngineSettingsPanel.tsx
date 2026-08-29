import { useEffect, useMemo, useRef, useState } from 'react';
import { Braces, Bug, BrainCircuit, Cpu, Loader2, Mic, MicOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TranscriptEntry, ExtractedField } from '@/hooks/use-call-capture';
import type { WhisperStatus } from '@/hooks/use-local-transcriber';
import type { LlmParserStatus, LlmParseStats } from '@/hooks/use-llm-parser';
import {
  WHISPER_MODELS,
  WHISPER_MODEL_META,
  WHISPER_RAM_ESTIMATE_MB,
  type WhisperDtype,
  type WhisperModelName,
} from '@/lib/whisper-models';
import {
  LLM_MODEL_META,
  LLM_MODELS,
  LLM_RAM_ESTIMATE_MB,
  buildPromptWindow,
  getTranscriptCharCap,
  type LlmModelName,
} from '@/lib/llm-parser';

/** Local Whisper engine state (same shape as VoiceCaptionPanel's) */
export interface EngineState {
  isSupported: boolean;
  model: WhisperModelName;
  status: WhisperStatus;
  progress: number;
  dtype: string | null;
  error: string | null;
  lastInferenceMs: number | null;
  memStats?: { heapUsedMb: number; heapLimitMb: number } | null;
  onSwitchModel: (model: WhisperModelName) => void;
}

/** LLM parser state */
export interface ParserState {
  enabled: boolean;
  model: LlmModelName;
  models: LlmModelName[];
  status: LlmParserStatus;
  progress: number;
  error: string | null;
  isParsing: boolean;
  isParaphrasing?: boolean;
  lastParseMs: number | null;
  device?: 'gpu' | 'cpu' | null;
  dtype?: 'q8' | 'fp32' | null;
  genProgress?: number;
  memStats?: { heapUsedMb: number; heapLimitMb: number } | null;
  failedAttempts?: Array<{ device: 'gpu' | 'cpu'; dtype: 'q8' | 'fp32'; message: string }> | null;
  window?: { entryIndexes: number[]; chars: number; text: string } | null;
  lastReply?: string | null;
  lastStats?: LlmParseStats | null;
  onLoadDevice?: (model: LlmModelName, device: 'gpu' | 'cpu') => void;
  onToggleEnabled: (enabled: boolean) => void;
  onSwitchModel: (model: LlmModelName) => void;
  onLoad: () => void;
}

interface EngineSettingsPanelProps {
  engine: EngineState;
  parser?: ParserState;
  /** Live transcript (drives the parse-debug window preview) */
  transcript: TranscriptEntry[];
  /** True while capture is live (enables the start/stop transcription button) */
  isCapturing: boolean;
  isTranscribing: boolean;
  onToggleCapture: () => void;
  onClose: () => void;
}

/**
 * Download-manager variant metadata — the CPU/GPU build options for each
 * LLM, with the numbers the agent needs to decide (one-time download,
 * approximate RAM, expected speed on a plain office CPU).
 */
const LLM_VARIANTS: Record<LlmModelName, Array<{
  device: 'gpu' | 'cpu';
  dtype: 'q8' | 'fp32';
  label: string;
  download: string;
  ram: string;
  speed: string;
  note: string;
}>> = {
  'smollm2-360m': [
    {
      device: 'cpu', dtype: 'q8', label: 'CPU · q8',
      download: '~200 MB', ram: '~300 MB', speed: '~10–20 tok/s',
      note: 'Fastest download; weakest reading',
    },
    {
      device: 'gpu', dtype: 'fp32', label: 'GPU · fp32',
      download: '~700 MB', ram: '~900 MB', speed: '~40–80 tok/s',
      note: 'WebGPU; discrete GPU — iGPU auto-falls back to CPU at load',
    },
  ],
  'qwen2.5-0.5b': [
    {
      device: 'cpu', dtype: 'q8', label: 'CPU · q8',
      download: '~350 MB', ram: '~450 MB', speed: '~5–12 tok/s',
      note: 'Default build; reliable on any machine',
    },
    {
      device: 'gpu', dtype: 'fp32', label: 'GPU · fp32',
      download: '~1.4 GB', ram: '~1.4 GB', speed: '~25–50 tok/s',
      note: 'WebGPU; needs a discrete GPU — iGPU auto-falls back to CPU at load',
    },
  ],
  'qwen2.5-1.5b': [
    {
      device: 'cpu', dtype: 'q8', label: 'CPU · q8',
      download: '~1.1 GB', ram: '~1.1 GB', speed: '~2–5 tok/s',
      note: 'Sharpest reading; slowest parses. CPU-only (fp32 on GPU is 3.4 GB)',
    },
  ],
};

/** Worker RAM badge — measured heap or the model's approximate footprint (≈) */
function RamBadge({
  stats,
  estimateMb,
  titleBase,
}: {
  stats?: { heapUsedMb: number; heapLimitMb: number } | null;
  estimateMb?: number | null;
  titleBase: string;
}) {
  if (stats) {
    const pct = stats.heapLimitMb > 0 ? stats.heapUsedMb / stats.heapLimitMb : 0;
    return (
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase leading-none tracking-wide',
          pct > 0.75
            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
            : 'bg-foreground/10 text-muted-foreground/80'
        )}
        title={`${titleBase} · worker JS heap ${stats.heapUsedMb} MB / ${stats.heapLimitMb} MB`}
      >
        RAM {stats.heapUsedMb}MB
      </span>
    );
  }
  if (estimateMb) {
    return (
      <span
        className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[8px] font-bold uppercase leading-none tracking-wide text-muted-foreground/80"
        title={`${titleBase} · ≈${estimateMb} MB estimated resident footprint (weights + runtime)`}
      >
        RAM ≈{estimateMb}MB
      </span>
    );
  }
  return null;
}

/**
 * Inference duty-cycle: what fraction of the trailing `windowMs` the given
 * activity flag has been true (0–100) — the honest per-worker CPU signal.
 */
function useDutyCycle(active: boolean, windowMs = 15_000): number {
  const spansRef = useRef<Array<{ start: number; end: number }>>([]);
  const activeRef = useRef(active);
  const startRef = useRef<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (active && !activeRef.current) startRef.current = performance.now();
    if (!active && activeRef.current && startRef.current !== null) {
      spansRef.current.push({ start: startRef.current, end: performance.now() });
      startRef.current = null;
    }
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(t);
  }, []);

  const now = performance.now();
  spansRef.current = spansRef.current.filter((s) => now - s.end < windowMs);
  let busy = spansRef.current.reduce((sum, s) => sum + (s.end - s.start), 0);
  if (startRef.current !== null) busy += now - startRef.current;
  return Math.min(100, Math.round((busy / windowMs) * 100));
}

/**
 * ENGINE SETTINGS PANEL — opened by the gear icon in the floating toolbar.
 * Everything engine-related lives here: Whisper & LLM model selectors,
 * download management (CPU/GPU builds), start/stop transcription, resource
 * indicators, and the parse debug view. The live caption panel stays just
 * captions.
 */
export default function EngineSettingsPanel({
  engine,
  parser,
  transcript,
  isCapturing,
  isTranscribing,
  onToggleCapture,
  onClose,
}: EngineSettingsPanelProps) {
  const [showLlmDebug, setShowLlmDebug] = useState(false);
  const [showJsonWindow, setShowJsonWindow] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);

  // Live parse window — what the NEXT parse will send (debounced 1s)
  const [windowTick, setWindowTick] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setWindowTick((n) => n + 1), 1000);
    return () => window.clearTimeout(t);
  }, [windowTick]);
  const liveWindow = useMemo(
    () =>
      parser?.enabled && parser.status === 'ready'
        ? buildPromptWindow(transcript, getTranscriptCharCap(parser.device))
        : null,
    // windowTick re-runs this up to 1×/s
    [parser?.enabled, parser?.status, parser?.device, windowTick, transcript.length === 0]
  );

  // RAM estimates (fallback when the worker cannot measure its heap)
  const llmRamEstimate =
    parser?.enabled && parser.status === 'ready' && parser.dtype
      ? LLM_RAM_ESTIMATE_MB[parser.model][parser.dtype]
      : null;
  const whisperRamEstimate =
    engine.status === 'ready' && engine.dtype
      ? WHISPER_RAM_ESTIMATE_MB[engine.model][engine.dtype as WhisperDtype]
      : null;
  const llmBusy = !!parser?.isParsing || !!parser?.isParaphrasing;
  const cpuDuty = useDutyCycle(isTranscribing || llmBusy);

  const prettyReply = useMemo(() => {
    const raw = parser?.lastReply ?? '';
    if (!raw) return '';
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }, [parser?.lastReply]);

  const copyJson = () => {
    const text = parser?.lastReply ?? '';
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      setJsonCopied(true);
      window.setTimeout(() => setJsonCopied(false), 1500);
    });
  };

  return (
    <div
      className="glass-panel custom-scrollbar max-h-[70vh] w-[min(440px,calc(100vw-24px))] overflow-y-auto rounded-xl p-3"
      role="dialog"
      aria-label="Engine settings"
    >
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <p className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Engine settings
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        {/* ---- Whisper engine ---- */}
        {engine.isSupported && (
          <div>
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Whisper (transcription)
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold leading-none text-emerald-600 dark:text-emerald-400"
                title="Transcription runs on this machine — audio never leaves the browser"
              >
                <Cpu className="size-2.5" />
                Local
              </span>
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
              {/* Start / pause transcription */}
              <Button
                variant={isCapturing ? 'destructive' : 'default'}
                size="sm"
                onClick={onToggleCapture}
                className="h-6 gap-1 rounded-full px-2.5 text-[10px]"
                title={isCapturing ? 'Stop transcription' : 'Start transcription'}
              >
                {isCapturing ? <MicOff className="size-2.5" /> : <Mic className="size-2.5" />}
                {isCapturing ? 'Stop' : 'Start'}
              </Button>
            </div>
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

        {/* ---- LLM parser ---- */}
        {parser && (
          <div>
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              AI parser (LLM)
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => parser.onToggleEnabled(!parser.enabled)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none transition-colors',
                  parser.enabled
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-foreground/10 text-muted-foreground'
                )}
                title="The on-device LLM reads the whole conversation and fills the ticket — pattern matches are only provisional until then"
              >
                <BrainCircuit className="size-2.5" />
                {parser.enabled ? 'AI parser on' : 'AI parser off'}
              </button>
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
              {parser.lastParseMs !== null && !parser.isParsing && (
                <span
                  className="text-[10px] text-muted-foreground/70"
                  title="Duration of the last parse over the whole conversation"
                >
                  {(parser.lastParseMs / 1000).toFixed(1)}s/parse
                </span>
              )}
              {parser.lastStats && parser.lastStats.tokensPerSec > 0 && (
                <span
                  className="text-[10px] text-muted-foreground/70"
                  title="Model output speed of the last parse"
                >
                  {parser.lastStats.tokensPerSec} tok/s
                </span>
              )}
            </div>
            {parser.enabled && parser.status === 'loading' && (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${Math.max(3, parser.progress)}%` }}
                />
              </div>
            )}
            {parser.error && (
              <p className="mt-1 text-[10px] leading-snug text-destructive/90">{parser.error}</p>
            )}
          </div>
        )}

        {/* ---- Resource indicators ---- */}
        <div>
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Resources
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {parser?.device && parser.status === 'ready' && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase leading-none tracking-wide',
                  parser.device === 'gpu'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-foreground/10 text-muted-foreground/80'
                )}
                title={
                  parser.device === 'gpu'
                    ? 'WebGPU acceleration active — inference runs on the GPU'
                    : 'Running on CPU (WASM) — no WebGPU available, inference is slower'
                }
              >
                {parser.device === 'gpu' ? 'GPU' : 'CPU'}
              </span>
            )}
            {cpuDuty > 0 && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase leading-none tracking-wide',
                  cpuDuty > 80
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-foreground/10 text-muted-foreground/80'
                )}
                title="Engine inference load — % of the last 15s that Whisper or the LLM was actually computing"
              >
                CPU {cpuDuty}%
              </span>
            )}
            <RamBadge stats={parser?.memStats} estimateMb={llmRamEstimate} titleBase="LLM parser worker" />
            <RamBadge stats={engine.memStats} estimateMb={whisperRamEstimate} titleBase="Whisper worker" />
          </div>
        </div>

        {/* ---- Download manager (CPU/GPU builds) ---- */}
        {parser?.onLoadDevice && (
          <div>
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Model downloads — CPU (q8) vs GPU (fp32)
            </p>
            <div className="flex flex-col gap-1.5">
              {parser.models.map((name) => (
                <div key={name} className="rounded-md bg-foreground/[0.04] p-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-foreground">
                      {LLM_MODEL_META[name].label}
                    </span>
                    {parser.model === name && parser.status === 'ready' && parser.device && (
                      <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase leading-none tracking-wide text-emerald-600 dark:text-emerald-400">
                        active · {parser.device} · {parser.dtype}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {LLM_VARIANTS[name].map((variant) => {
                      const isActive =
                        parser.model === name &&
                        parser.status === 'ready' &&
                        parser.device === variant.device &&
                        parser.dtype === variant.dtype;
                      const isFailed = parser.failedAttempts?.some(
                        (f) => f.device === variant.device && f.dtype === variant.dtype
                      );
                      return (
                        <button
                          key={variant.label}
                          type="button"
                          disabled={isActive || (parser.status === 'loading' && parser.model === name)}
                          onClick={() => parser.onLoadDevice?.(name, variant.device)}
                          className={cn(
                            'flex flex-col items-start gap-0.5 rounded-md border px-2 py-1 text-left transition-colors',
                            isActive
                              ? 'border-emerald-400/50 bg-emerald-500/10'
                              : 'border-border/50 hover:bg-foreground/[0.06]',
                            isFailed && 'border-destructive/40'
                          )}
                          title={`${variant.note}${isFailed ? ' · this build failed to initialize last time — the error is shown below' : ''}`}
                        >
                          <span className="flex items-center gap-1 text-[9px] font-bold uppercase leading-none tracking-wide text-foreground">
                            <Cpu className="size-2.5 text-muted-foreground/70" />
                            {variant.label}
                            {isFailed && <span className="text-destructive">!</span>}
                          </span>
                          <span className="text-[8px] leading-none text-muted-foreground/80">
                            ↓{variant.download} · RAM {variant.ram} · {variant.speed}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {parser.failedAttempts && parser.failedAttempts.length > 0 && (
              <div className="mt-1.5 rounded-md bg-destructive/10 p-1.5">
                <p className="text-[9px] font-bold uppercase tracking-wide text-destructive">
                  failed builds
                </p>
                {parser.failedAttempts.map((f, i) => (
                  <p key={i} className="mt-0.5 break-all text-[8px] leading-snug text-destructive/80">
                    {f.device}/{f.dtype}: {f.message.slice(0, 200)}
                  </p>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-[8px] leading-snug text-muted-foreground/70">
              Each build is a separate one-time download cached by the browser. GPU builds need
              WebGPU (Chrome/Edge 113+); if a GPU build fails, the CPU build is the reliable
              fallback. Only one model is resident at a time.
            </p>
          </div>
        )}

        {/* ---- Parse debug ---- */}
        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Parse debug
            </p>
            {parser?.enabled && parser.status === 'ready' && (
              <button
                type="button"
                onClick={() => setShowLlmDebug((v) => !v)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] leading-none transition-colors',
                  showLlmDebug
                    ? 'bg-foreground/10 text-foreground'
                    : 'text-muted-foreground/70 hover:text-foreground'
                )}
              >
                <Bug className="size-2.5" />
                {showLlmDebug ? 'hide' : 'show'}
              </button>
            )}
            {parser?.enabled && parser.status === 'ready' && (parser.lastReply || parser.lastStats) && (
              <button
                type="button"
                onClick={() => setShowJsonWindow(true)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] leading-none transition-colors',
                  parser.lastStats?.timedOut
                    ? 'text-destructive/80 hover:text-destructive'
                    : 'text-muted-foreground/70 hover:text-foreground'
                )}
                title={
                  parser.lastStats?.timedOut
                    ? 'The last parse TIMED OUT — open for details'
                    : 'The raw reply the LLM last returned'
                }
              >
                <Braces className="size-2.5" />
                json
              </button>
            )}
          </div>
          {showLlmDebug && (
            <div className="rounded-md bg-foreground/[0.04] p-1.5 font-mono text-[9px] leading-relaxed">
              {liveWindow || parser?.window ? (
                <>
                  <p className="text-muted-foreground">
                    {parser?.isParsing ? 'parsing — window sent: ' : 'next parse window (live): '}
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {(liveWindow ?? parser?.window)!.entryIndexes.length}
                    </span>
                    /{transcript.length} lines · {(liveWindow ?? parser?.window)!.chars} chars ·
                    ~{Math.ceil((liveWindow ?? parser?.window)!.chars / 4)} tokens
                    {(liveWindow ?? parser?.window)!.entryIndexes.length <
                      transcript.length && ' · grey lines will NOT be sent'}
                  </p>
                  <pre className="custom-scrollbar mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded bg-foreground/5 p-1.5 text-foreground/80">
                    {(liveWindow ?? parser?.window)!.text}
                  </pre>
                </>
              ) : (
                <p className="text-muted-foreground">no transcript yet</p>
              )}
              {parser?.lastStats && (
                <p className="mt-1 text-muted-foreground">
                  <span className="font-bold text-foreground/80">speed:</span>{' '}
                  {parser.lastStats.promptChars.toLocaleString()} chars in (~
                  {parser.lastStats.promptTokens.toLocaleString()} tok) →{' '}
                  {parser.lastStats.replyChars.toLocaleString()} chars out (~
                  {parser.lastStats.replyTokens.toLocaleString()} tok) · gen{' '}
                  {(parser.lastStats.genMs / 1000).toFixed(1)}s · wall{' '}
                  {(parser.lastStats.wallMs / 1000).toFixed(1)}s ·{' '}
                  {parser.lastStats.timedOut ? (
                    <span className="font-bold text-destructive">TIMED OUT</span>
                  ) : (
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {parser.lastStats.tokensPerSec} tok/s
                    </span>
                  )}
                  {parser.lastStats.attempts > 1 && ' · retried'}
                </p>
              )}
              {parser?.lastReply ? (
                <p className="mt-1 break-all whitespace-pre-wrap text-foreground/80">
                  reply: {parser.lastReply}
                </p>
              ) : parser?.lastStats?.timedOut ? (
                <p className="mt-1 text-destructive/80">
                  reply: (empty — generation TIMED OUT, the model never finished)
                </p>
              ) : parser?.window ? (
                <p className="mt-1 text-destructive/80">
                  reply: (empty — model produced nothing)
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Floating window: raw reply JSON */}
      {showJsonWindow && parser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowJsonWindow(false)}
          role="presentation"
        >
          <div
            className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="LLM reply JSON"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2">
              <Braces className="size-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                LLM reply · raw
              </span>
              <span className="truncate text-[10px] text-muted-foreground">
                {parser.model}
                {parser.lastStats
                  ? ` · ${parser.lastStats.replyChars.toLocaleString()} chars · ${parser.lastStats.tokensPerSec} tok/s`
                  : ''}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={copyJson}
                  className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-1 text-[10px] leading-none text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                >
                  {jsonCopied ? 'copied!' : 'copy'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowJsonWindow(false)}
                  className="inline-flex items-center rounded-full p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
            <pre className="custom-scrollbar flex-1 overflow-y-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
              {prettyReply ||
                (parser.lastStats?.timedOut
                  ? `(no reply — the model TIMED OUT after ${(parser.lastStats.wallMs / 1000).toFixed(0)}s and never finished generating. A slower model or a shorter conversation may complete.)`
                  : '(no reply yet — run a parse first)')}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export types used by the caption panel's props
export type { ExtractedField };
