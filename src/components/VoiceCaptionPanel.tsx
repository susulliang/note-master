import { useEffect, useRef } from 'react';
import { Mic, MicOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FIELD_PATTERNS } from '@/hooks/use-voice-transcription';
import type { ExtractedField } from '@/hooks/use-voice-transcription';

interface VoiceCaptionPanelProps {
  isListening: boolean;
  onToggle: () => void;
  onClear: () => void;
  finalTranscript: string;
  interimText: string;
  suggestions: ExtractedField[];
}

/**
 * Live-caption panel for the voice auto-fill prototype. Shows the streaming
 * transcript (finalized text + live interim words), auto-scrolls as new text
 * arrives, and lists fields extracted from the conversation so the agent can
 * see exactly what was captured.
 */
export default function VoiceCaptionPanel({
  isListening,
  onToggle,
  onClear,
  finalTranscript,
  interimText,
  suggestions,
}: VoiceCaptionPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest caption line in view as text streams in
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [finalTranscript, interimText]);

  const hasContent = finalTranscript.length > 0 || suggestions.length > 0;
  const label = (fieldId: string) =>
    FIELD_PATTERNS.find((p) => p.fieldId === fieldId)?.label ?? fieldId;

  // Hidden entirely when idle with nothing captured
  if (!isListening && !hasContent) return null;

  return (
    <div className="fixed bottom-3 left-3 z-40 w-[min(420px,calc(100vw-24px))]">
      <div
        className={cn(
          'glass-panel rounded-xl p-3 transition-all duration-300',
          isListening && 'border border-red-500/40 shadow-[0_0_24px_rgba(239,68,68,0.12)]'
        )}
      >
        {/* Header: status + controls */}
        <div className="flex items-center gap-2">
          {isListening ? (
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
            </span>
          ) : (
            <Mic className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <p className="flex-1 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isListening ? 'Live captions' : 'Captured transcript'}
          </p>
          <Button
            variant={isListening ? 'destructive' : 'ghost'}
            size="sm"
            onClick={onToggle}
            className="h-7 gap-1.5 rounded-full px-2.5 text-[11px]"
            aria-label={isListening ? 'Stop listening' : 'Resume listening'}
            title={isListening ? 'Stop listening' : 'Resume listening'}
          >
            {isListening ? <MicOff className="size-3" /> : <Mic className="size-3" />}
            {isListening ? 'Stop' : 'Listen'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClear}
            className="size-7 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
            aria-label="Clear transcript"
            title="Clear transcript"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        {/* Live caption area */}
        <div
          ref={scrollRef}
          className="custom-scrollbar mt-2 max-h-[132px] overflow-y-auto rounded-lg bg-background/50 p-2"
        >
          <p className="text-[13px] leading-relaxed">
            {finalTranscript && (
              <span className="text-foreground">{finalTranscript}</span>
            )}
            {isListening && interimText && (
              <span className="italic text-muted-foreground"> {interimText}</span>
            )}
            {!finalTranscript && !interimText && (
              <span className="text-muted-foreground/60">
                {isListening ? 'Listening — start speaking…' : 'No speech captured.'}
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
                  title={`${label(field.fieldId)}: ${field.value}`}
                >
                  <span className="shrink-0 opacity-70">{label(field.fieldId)}</span>
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
