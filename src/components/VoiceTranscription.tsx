import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface ExtractedField {
  fieldId: string;
  value: string;
  confidence: 'high' | 'medium' | 'low';
}

// ---------------------------------------------------------------------------
//  Keyword extraction patterns
// ---------------------------------------------------------------------------
type PatternEntry = {
  fieldId: string;
  label: string;
  /** If true, auto-fill without prompting for high-confidence matches */
  autoFill: boolean;
  patterns: RegExp[];
};

const FIELD_PATTERNS: PatternEntry[] = [
  {
    fieldId: 'customerName',
    label: 'Customer Name',
    autoFill: true,
    patterns: [
      /my name is\s+([A-Za-z\s'-]+?)(?:\.|,| and|$)/i,
      /i'm\s+([A-Za-z\s'-]+?)(?:\.|,| and|$)/i,
      /this is\s+([A-Za-z\s'-]+?)(?:\.|,| and|$)/i,
      /name is\s+([A-Za-z\s'-]+?)(?:\.|,| and|$)/i,
    ],
  },
  {
    fieldId: 'contactNumber',
    label: 'Contact Number',
    autoFill: true,
    patterns: [
      /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g,
      /my number is\s+([\d\s-]+?)(?:\.|,| and|$)/i,
      /phone number is\s+([\d\s-]+?)(?:\.|,| and|$)/i,
      /reach me at\s+([\d\s-]+?)(?:\.|,| and|$)/i,
    ],
  },
  {
    fieldId: 'emailAddress',
    label: 'Email Address',
    autoFill: true,
    patterns: [
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /my email is\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /email me at\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    ],
  },
  {
    fieldId: 'deebotModel',
    label: 'Product Model',
    autoFill: true,
    patterns: [
      /(?:i have a|it's a|model is|model)\s+(deebot|goat|winbot)\s+([a-z0-9+\s]+?)(?:\.|,| and|$)/i,
      /(deebot|goat|winbot)\s+([a-z0-9+\s]+?)(?:\.|,| and|$)/i,
    ],
  },
  {
    fieldId: 'skuNumber',
    label: 'SKU Number',
    autoFill: false,
    patterns: [
      /sku is\s+([a-z0-9-]+?)(?:\.|,| and|$)/i,
      /sku number\s+([a-z0-9-]+?)(?:\.|,| and|$)/i,
      /my sku\s+([a-z0-9-]+?)(?:\.|,| and|$)/i,
    ],
  },
  {
    fieldId: 'serialNumber',
    label: 'Serial Number',
    autoFill: false,
    patterns: [
      /serial number is\s+([a-z0-9-]+?)(?:\.|,| and|$)/i,
      /serial is\s+([a-z0-9-]+?)(?:\.|,| and|$)/i,
      /my sn is\s+([a-z0-9-]+?)(?:\.|,| and|$)/i,
      /s\/n is\s+([a-z0-9-]+?)(?:\.|,| and|$)/i,
    ],
  },
];

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
function cleanValue(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').replace(/[.,!?;:]+$/, '').trim();
}

function extractFields(transcript: string): ExtractedField[] {
  if (!transcript.trim()) return [];
  const results: ExtractedField[] = [];
  const seen = new Set<string>();

  for (const entry of FIELD_PATTERNS) {
    for (const pattern of entry.patterns) {
      if (pattern.global) {
        const matches = [...transcript.matchAll(pattern)];
        for (const m of matches) {
          const value = cleanValue(m[1] || m[0]);
          if (value.length > 2 && !seen.has(entry.fieldId)) {
            seen.add(entry.fieldId);
            results.push({ fieldId: entry.fieldId, value, confidence: 'high' });
          }
        }
      } else {
        const match = transcript.match(pattern);
        if (match) {
          const value = cleanValue(match[1] || match[0]);
          if (value.length > 2 && !seen.has(entry.fieldId)) {
            seen.add(entry.fieldId);
            const confidence: ExtractedField['confidence'] =
              entry.fieldId === 'emailAddress' || entry.fieldId === 'contactNumber'
                ? 'high'
                : 'medium';
            results.push({ fieldId: entry.fieldId, value, confidence });
          }
        }
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
//  React component
// ---------------------------------------------------------------------------
interface VoiceTranscriptionProps {
  onAutoFill: (fieldId: string, value: string) => void;
  isListening: boolean;
  onToggle: () => void;
}

export default function VoiceTranscription({
  onAutoFill,
  isListening,
  onToggle,
}: VoiceTranscriptionProps) {
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [suggestions, setSuggestions] = useState<ExtractedField[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptRef = useRef('');
  const autoFilledRef = useRef(new Set<string>());
  const timerRef = useRef<number | null>(null);

  const isSupported = typeof window !== 'undefined' &&
    (!!window.SpeechRecognition || !!window.webkitSpeechRecognition);

  // Initialize SpeechRecognition
  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let final = '';
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          final += r[0].transcript;
        } else {
          interim += r[0].transcript;
        }
      }

      setInterimText(interim);

      if (final) {
        const newTranscript = (transcriptRef.current + ' ' + final).trim();
        transcriptRef.current = newTranscript;
        setTranscript(newTranscript);

        const fields = extractFields(newTranscript);
        setSuggestions(fields);

        for (const field of fields) {
          if (field.confidence === 'high' && !autoFilledRef.current.has(field.fieldId)) {
            autoFilledRef.current.add(field.fieldId);
            onAutoFill(field.fieldId, field.value);
          }
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        toast.error('Microphone access denied. Please allow microphone in browser settings.');
      }
    };

    recognition.onend = () => {
      if (timerRef.current) {
        recognition.start();
      }
    };

    recognitionRef.current = recognition;

    return () => {
      try { recognition.stop(); } catch { /* ignore */ }
    };
  }, [isSupported, onAutoFill]);

  // Start/stop based on isListening
  useEffect(() => {
    const r = recognitionRef.current;
    if (!r) return;

    if (isListening) {
      timerRef.current = 1;
      try { r.start(); } catch { /* may already be running */ }
    } else {
      timerRef.current = null;
      try { r.stop(); } catch { /* ignore */ }
    }

    return () => {
      timerRef.current = null;
    };
  }, [isListening]);

  const handleClear = () => {
    setTranscript('');
    setInterimText('');
    setSuggestions([]);
    transcriptRef.current = '';
    autoFilledRef.current = new Set();
  };

  return (
    <div className="fixed bottom-3 left-3 z-40 max-w-[420px]">
      <div
        className={cn(
          'glass-panel rounded-xl transition-all duration-300',
          isListening
            ? 'p-3 border-2 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
            : 'p-2'
        )}
      >
        <div className="flex items-center gap-2">
          <Button
            variant={isListening ? 'destructive' : 'ghost'}
            size="icon"
            onClick={onToggle}
            className={cn(
              'size-8 rounded-full shrink-0 transition-all duration-300',
              isListening && 'animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.4)]'
            )}
            aria-label={isListening ? 'Stop voice transcription' : 'Start voice transcription'}
            title={isListening ? 'Stop listening' : 'Start voice transcription'}
          >
            {isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </Button>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium leading-tight">
              {isListening ? (
                <span className="text-red-500">Listening... speak clearly</span>
              ) : transcript ? (
                <span className="text-foreground">Voice captured</span>
              ) : (
                <span className="text-muted-foreground">Voice Auto-fill</span>
              )}
            </p>
            {transcript && !isListening && (
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                {transcript.length > 50 ? transcript.slice(0, 50) + '...' : transcript}
              </p>
            )}
          </div>

          {isListening ? (
            <div className="flex items-center gap-1.5">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-red-500" />
              </span>
            </div>
          ) : transcript ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
              title="Clear transcript"
            >
              Clear
            </button>
          ) : null}
        </div>

        {isListening && interimText && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <p className="text-[10px] text-muted-foreground/70 mb-0.5">Hearing:</p>
            <p className="text-xs text-muted-foreground italic leading-relaxed">
              {interimText}
            </p>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Suggested auto-fills
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((f, i) => {
                const alreadyUsed = autoFilledRef.current.has(f.fieldId);
                const label = (
                  FIELD_PATTERNS.find((p) => p.fieldId === f.fieldId)?.label ?? f.fieldId
                );
                return (
                  <span
                    key={`${f.fieldId}-${i}`}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] leading-none',
                      alreadyUsed
                        ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                        : 'bg-accent/15 text-accent dark:text-accent'
                    )}
                  >
                    {label}: {f.value.length > 20 ? f.value.slice(0, 20) + '...' : f.value}
                    {alreadyUsed && (
                      <span className="text-[8px] opacity-70">&#10003;</span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {!isListening && transcript && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground text-[10px]">
                Full transcript ({transcript.length} chars)
              </summary>
              <p className="mt-1.5 p-2 rounded bg-background/50 text-[11px] leading-relaxed whitespace-pre-wrap max-h-[120px] overflow-y-auto custom-scrollbar">
                {transcript}
              </p>
            </details>
          </div>
        )}

        {!isSupported && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Speech API not supported. Use Chrome or Edge.
          </p>
        )}
      </div>
    </div>
  );
}