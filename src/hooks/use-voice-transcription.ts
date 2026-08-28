import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

export interface ExtractedField {
  fieldId: string;
  value: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface FieldPatternEntry {
  fieldId: string;
  label: string;
  patterns: RegExp[];
}

/**
 * Speech → form-field extraction patterns. Each entry maps natural phrases
 * to a form field ID. The first pattern that matches wins; values are cleaned
 * (whitespace collapsed, trailing punctuation stripped).
 */
export const FIELD_PATTERNS: FieldPatternEntry[] = [
  {
    fieldId: 'customerName',
    label: 'Customer Name',
    patterns: [
      /my name is\s+([A-Za-z][A-Za-z\s'-]*?)(?:\.|,| and | calling| regarding|$)/i,
      /(?:this is|i am|i'm)\s+([A-Z][A-Za-z\s'-]*?)(?:\.|,| and | calling| regarding|$)/,
      /name[' ]?s?\s+(?:is\s+)?([A-Za-z][A-Za-z\s'-]*?)(?:\.|,| and | calling| regarding|$)/i,
    ],
  },
  {
    fieldId: 'contactNumber',
    label: 'Contact Number',
    patterns: [
      /(?:my|the)?\s*(?:phone|contact)?\s*number\s*(?:is|at)?\s*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,
      /(?:call|reach|text)\s*(?:me\s*)?(?:at|on)?\s*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,
      /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/,
    ],
  },
  {
    fieldId: 'emailAddress',
    label: 'Email Address',
    patterns: [
      /(?:my\s+)?email\s*(?:is|at)?\s*([a-zA-Z0-9._%+-]+(?: at |@)[a-zA-Z0-9.-]+(?: dot |\.)(?:com|net|org|edu|co|us|io|me))/i,
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
    ],
  },
  {
    fieldId: 'deebotModel',
    label: 'Product Model',
    patterns: [
      /(?:i have|i've got|it'?s|model is|my (?:deebot|goat|winbot) is)\s+(?:a\s+)?(deebot|goat|winbot|ultramarine)?\s*([a-z]?\d{1,2}\s*(?:omni|pro|max|plus|combo|turbo|care|ai|s|se|x|white|black)?[a-z0-9\s+!]*)/i,
    ],
  },
  {
    fieldId: 'skuNumber',
    label: 'SKU Number',
    patterns: [
      /sku\s*(?:number|is|code)?\s*(?:is)?\s*([a-z0-9-]{4,})/i,
    ],
  },
  {
    fieldId: 'serialNumber',
    label: 'Serial Number',
    patterns: [
      /serial\s*(?:number|no\.?|is)?\s*(?:is)?\s*([a-z0-9-]{4,})/i,
      /\bs\s*\/?\s*n\s*(?:is|number)?\s*([a-z0-9-]{4,})/i,
    ],
  },
];

/** Normalize a spoken value: collapse whitespace, strip trailing punctuation */
function cleanValue(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:]+$/, '')
    .trim();
}

/** Spoken email addresses: "john at gmail dot com" → john@gmail.com */
function normalizeSpokenEmail(value: string): string {
  return value.replace(/\s+at\s+/gi, '@').replace(/\s+dot\s+/gi, '.');
}

/** Run all extraction patterns over the accumulated transcript */
export function extractFields(transcript: string): ExtractedField[] {
  if (!transcript.trim()) return [];
  const results: ExtractedField[] = [];
  const seen = new Set<string>();

  for (const entry of FIELD_PATTERNS) {
    if (seen.has(entry.fieldId)) continue;
    for (const pattern of entry.patterns) {
      const match = transcript.match(pattern);
      if (match) {
        // Model patterns capture (brand, model) in two groups; others use group 1
        const raw =
          entry.fieldId === 'deebotModel' && match[2]
            ? `${match[1] || ''} ${match[2]}`
            : match[1] || match[0];
        let value = cleanValue(raw);
        if (entry.fieldId === 'emailAddress') {
          value = cleanValue(normalizeSpokenEmail(value));
        }
        if (value.length > 2 && !seen.has(entry.fieldId)) {
          seen.add(entry.fieldId);
          const confidence: ExtractedField['confidence'] =
            entry.fieldId === 'emailAddress' || entry.fieldId === 'contactNumber'
              ? 'high'
              : 'medium';
          results.push({ fieldId: entry.fieldId, value, confidence });
          break; // first matching pattern wins for this field
        }
      }
    }
  }
  return results;
}

/** Delay before auto-restarting a ended recognition session (ms). Rapid
 *  stop/start cycles are known to crash Edge's speech service. */
const RESTART_DELAY_MS = 300;

/**
 * Continuous voice transcription built on the Web Speech API.
 *
 * The SpeechRecognition instance is created exactly once and never
 * recreated — the auto-fill callback is stored in a ref so form-data
 * updates never tear down an active recognition session (the previous
 * implementation did, which lost transcript state mid-call and caused
 * rapid create/destroy cycles that crashed Edge).
 */
export function useVoiceTranscription(
  onAutoFill: (fieldId: string, value: string) => void
) {
  const [isListening, setIsListening] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [suggestions, setSuggestions] = useState<ExtractedField[]>([]);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  /** True while the user wants to be listening — drives onend restarts */
  const shouldListenRef = useRef(false);
  /** Accumulated finalized transcript (mirrored to state for rendering) */
  const transcriptRef = useRef('');
  /** Fields already pushed to the form (avoids duplicate fills) */
  const autoFilledRef = useRef(new Set<string>());
  /** Latest auto-fill callback, kept fresh via ref (stable instance) */
  const onAutoFillRef = useRef(onAutoFill);
  const restartTimerRef = useRef<number | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    onAutoFillRef.current = onAutoFill;
  }, [onAutoFill]);

  // Create the recognition instance exactly once on mount
  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let final = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      setInterimText(interim);

      if (final) {
        transcriptRef.current = `${transcriptRef.current} ${final}`.trim();
        setFinalTranscript(transcriptRef.current);

        const fields = extractFields(transcriptRef.current);
        setSuggestions(fields);

        // Push every newly-extracted field once; the page handler guards
        // against overwriting manually entered values
        for (const field of fields) {
          if (!autoFilledRef.current.has(field.fieldId)) {
            autoFilledRef.current.add(field.fieldId);
            onAutoFillRef.current(field.fieldId, field.value);
          }
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' and 'aborted' are normal during continuous sessions —
      // onend will restart us. Only surface actionable permission errors.
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        shouldListenRef.current = false;
        setIsListening(false);
        toast.error('Microphone access denied. Allow mic access in the browser and retry.');
      }
    };

    recognition.onend = () => {
      // Chrome/Edge end the session periodically — restart only while the
      // user still wants to listen, after a short delay (crash guard)
      if (shouldListenRef.current) {
        restartTimerRef.current = window.setTimeout(() => {
          if (shouldListenRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch {
              /* already started — ignore */
            }
          }
        }, RESTART_DELAY_MS);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      shouldListenRef.current = false;
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      // Detach handlers before aborting so onend can't fire a restart
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    };
  }, [isSupported]);

  const start = useCallback(() => {
    if (!isSupported || !recognitionRef.current) return;
    shouldListenRef.current = true;
    setIsListening(true);
    try {
      recognitionRef.current.start();
    } catch {
      /* already running — ignore */
    }
  }, [isSupported]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    setIsListening(false);
    setInterimText('');
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      /* not running — ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    if (shouldListenRef.current) {
      stop();
    } else {
      start();
    }
  }, [start, stop]);

  const clear = useCallback(() => {
    transcriptRef.current = '';
    autoFilledRef.current = new Set();
    setFinalTranscript('');
    setInterimText('');
    setSuggestions([]);
  }, []);

  return {
    isSupported,
    isListening,
    toggle,
    clear,
    finalTranscript,
    interimText,
    suggestions,
  };
}
