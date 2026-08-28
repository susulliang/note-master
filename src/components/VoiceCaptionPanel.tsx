import { useEffect, useRef } from 'react';
import { Loader2, Mic, MicOff, MonitorPlay, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FIELD_PATTERNS } from '@/hooks/use-voice-transcription';
import type { ExtractedField } from '@/hooks/use-voice-transcription';

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
  transcript: string;
  suggestions: ExtractedField[];
  segmentsSent: number;
  isTranscribing: boolean;
  error: string | null;
  level: number;
  hasMic: boolean;
  onToggle: () => void;
  onClear: () => void;
}

interface VoiceCaptionPanelProps {
  mic: MicPanelState;
  call: CallPanelState;
}

/** Bar thresholds for the audio level meter */
const LEVEL_STEPS = [0.12, 0.3, 0.5, 0.75];

const fieldLabel = (fieldId: string) =>
  FIELD_PATTERNS.find((p) => p.fieldId === fieldId)?.label ?? fieldId;

/**
 * Live-caption panel for the voice auto-fill prototype. Supports two
 * capture sources:
 *
 *  - mic:  Web Speech API on the agent's microphone (free, instant, but
 *          cannot hear the CCP call audio playing in another tab)
 *  - call: getDisplayMedia capture of the CCP tab audio (+ mic) sent to
 *          /api/transcribe (OpenAI) in ~15s segments — hears the customer
 *
 * Shows whichever source is active: streaming transcript, audio level,
 * transcribe-in-flight spinner, speech errors, and extracted field chips.
 */
export default function VoiceCaptionPanel({ mic, call }: VoiceCaptionPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeSource: 'mic' | 'call' | null = mic.isListening
    ? 'mic'
    : call.isCapturing
      ? 'call'
      : null;

  const transcript =
    activeSource === 'call' ? call.transcript : activeSource === 'mic' ? mic.finalTranscript : mic.finalTranscript || call.transcript;
  const suggestions = activeSource === 'call' ? call.suggestions : mic.suggestions;
  const error = activeSource === 'call' ? call.error : mic.error;
  const level = activeSource === 'call' ? call.level : mic.level;
  const interim = activeSource === 'mic' ? mic.interimText : '';
  const isActive = !!activeSource;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [transcript, interim]);

  const hasContent = transcript.length > 0 || suggestions.length > 0;

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
              ? 'Live captions — call audio'
              : activeSource === 'mic'
                ? 'Live captions — mic'
                : 'Captured transcript'}
          </p>

          {/* Segments sent + in-flight spinner (call mode) */}
          {activeSource === 'call' && (
            <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
              {call.isTranscribing && <Loader2 className="size-3 animate-spin" />}
              {call.segmentsSent} seg
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

        {/* Audio level meter — proves audio is actually arriving */}
        {isActive && (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              {activeSource === 'call' ? (call.hasMic ? 'Tab+Mic' : 'Tab') : 'Mic'}
            </span>
            <div className="flex h-4 items-end gap-[3px]">
              {LEVEL_STEPS.map((threshold) => (
                <span
                  key={threshold}
                  className={cn(
                    'w-1 rounded-full transition-colors duration-100',
                    level >= threshold ? 'bg-red-500' : 'bg-foreground/15'
                  )}
                  style={{ height: `${3 + threshold * 12}px` }}
                />
              ))}
            </div>
            {level < 0.05 && !transcript && (
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

        {/* Transcript area */}
        <div
          ref={scrollRef}
          className="custom-scrollbar mt-2 max-h-[132px] overflow-y-auto rounded-lg bg-background/50 p-2"
        >
          <p className="text-[13px] leading-relaxed">
            {transcript && <span className="text-foreground">{transcript}</span>}
            {activeSource === 'mic' && interim && (
              <span className="italic text-muted-foreground"> {interim}</span>
            )}
            {!transcript && !interim && (
              <span className="text-muted-foreground/60">
                {activeSource === 'call'
                  ? 'Capturing call audio — first caption appears after ~15s.'
                  : activeSource === 'mic'
                    ? 'Listening — the Web Speech API hears only this tab\u2019s microphone, never audio from other tabs.'
                    : 'No speech captured.'}
              </span>
            )}
          </p>
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
