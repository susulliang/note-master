import { useState, useRef, useEffect, useCallback } from 'react';

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

/** Human-readable messages for the error codes the speech service emits */
const SPEECH_ERROR_MESSAGES: Record<string, string> = {
  'not-allowed':
    'Microphone permission denied — click the lock icon in the address bar, set Microphone to Allow, then reload.',
  'service-not-allowed':
    'Microphone blocked by browser policy — allow mic access for this site and reload.',
  'audio-capture':
    'No microphone audio — check the default input device (headset?) and that no other app is holding the mic.',
  network:
    'Speech service unreachable (network error) — check your connection, it will keep retrying.',
  'language-not-supported': 'This browser cannot transcribe en-US speech.',
};

/** Errors that make retrying pointless — stop listening when they occur */
const FATAL_ERRORS = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
  'language-not-supported',
]);

/**
 * Continuous voice transcription built on the Web Speech API.
 *
 * IMPORTANT LIMITATION: the Web Speech API only captures the microphone —
 * there is no way to feed it tab/system audio, so audio playing in another
 * tab (e.g. an Amazon Connect CCP call) is never transcribed. Only voices
 * the mic physically hears (the agent speaking, or speaker echo) arrive here.
 *
 * The SpeechRecognition instance is created exactly once and never
 * recreated — the auto-fill callback is stored in a ref so form-data
 * updates never tear down an active recognition session.
 *
 * A parallel getUserMedia stream feeds a mic level meter, which proves
 * whether audio is actually reaching the browser (permission/device
 * problems show as a flat meter; a moving meter with no transcript points
 * at the speech service instead).
 */
export function useVoiceTranscription(
  onAutoFill: (fieldId: string, value: string) => void
) {
  const [isListening, setIsListening] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [suggestions, setSuggestions] = useState<ExtractedField[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Mic input level 0..1 (RMS, refreshed ~10×/s while listening) */
  const [level, setLevel] = useState(0);

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

  // Mic meter state
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    onAutoFillRef.current = onAutoFill;
  }, [onAutoFill]);

  // -----------------------------------------------------------------
  //  Mic level meter (proves audio is reaching the browser)
  // -----------------------------------------------------------------
  const startMeter = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;

      const buf = new Uint8Array(analyser.fftSize);
      let lastUpdate = 0;
      const loop = () => {
        rafRef.current = requestAnimationFrame(loop);
        const node = analyserRef.current;
        if (!node) return;
        node.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const now = performance.now();
        // Throttle state updates to ~10/s
        if (now - lastUpdate > 100) {
          lastUpdate = now;
          setLevel(Math.min(1, rms * 4));
        }
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      const name = (err as DOMException)?.name ?? '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError(
          'Microphone permission denied — click the lock icon in the address bar, set Microphone to Allow, then reload.'
        );
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setError('No microphone found — check the default input device.');
      } else {
        setError(`Could not open the microphone (${name || 'unknown error'}).`);
      }
      shouldListenRef.current = false;
      setIsListening(false);
    }
  }, []);

  const stopMeter = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  // -----------------------------------------------------------------
  //  SpeechRecognition — one stable instance for the session
  // -----------------------------------------------------------------
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
        // Any transcript clears prior service errors
        setError(null);
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
      // 'no-speech' / 'aborted' are normal in continuous sessions — onend
      // restarts us. Everything else is surfaced so the agent can see WHY
      // nothing is being transcribed.
      if (event.error === 'no-speech' || event.error === 'aborted') return;

      const message = SPEECH_ERROR_MESSAGES[event.error] ?? `Speech error: ${event.error}`;
      setError(message);
      if (FATAL_ERRORS.has(event.error)) {
        shouldListenRef.current = false;
        setIsListening(false);
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

  // Cleanup meter on unmount
  useEffect(() => stopMeter, [stopMeter]);

  const start = useCallback(() => {
    if (!isSupported || !recognitionRef.current) return;
    setError(null);
    shouldListenRef.current = true;
    setIsListening(true);
    // Open the mic meter first — the getUserMedia prompt doubles as the
    // mic-permission prompt for the recognition service
    void startMeter().then(() => {
      if (!shouldListenRef.current || !recognitionRef.current) return;
      try {
        recognitionRef.current.start();
      } catch {
        /* already running — ignore */
      }
    });
  }, [isSupported, startMeter]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    setIsListening(false);
    setInterimText('');
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    stopMeter();
    try {
      recognitionRef.current?.stop();
    } catch {
      /* not running — ignore */
    }
  }, [stopMeter]);

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
    error,
    level,
  };
}
