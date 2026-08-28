import { useState, useRef, useEffect, useCallback } from 'react';
import {
  extractFields,
  FIELD_PATTERNS,
  matchCanonicalModel,
  canonicalIssueType,
  classifyIssueType,
  summarizeIssueType,
  type Speaker,
  type TranscriptEntry,
  type ExtractedField,
  type FieldPatternEntry,
} from '@/lib/field-extraction';

// The speaker-aware parsing engine lives in '@/lib/field-extraction' so the
// LLM worker can share it without bundling React. Re-exported here for the
// hooks/components that imported them from this module.
export {
  extractFields,
  FIELD_PATTERNS,
  matchCanonicalModel,
  canonicalIssueType,
  classifyIssueType,
  summarizeIssueType,
};
export type {
  Speaker,
  TranscriptEntry,
  ExtractedField,
  FieldPatternEntry,
};

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
 * the mic physically hears (the agent speaking, or speaker echo) arrive here,
 * so everything this hook transcribes is tagged as AGENT speech — the
 * customer-side fields (name, number, email) only fill from the agent's
 * dictation phrasings ("customer's name is…").
 *
 * The SpeechRecognition instance is created exactly once and never
 * recreated — the auto-fill callback is stored in a ref so form-data
 * updates never tear down an active recognition session.
 */
export function useVoiceTranscription(
  onAutoFill: (fieldId: string, value: string, source: 'regex' | 'llm') => void
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

        // Mic mode hears only the agent — tag everything as agent speech
        const fields = extractFields([{ speaker: 'agent', text: transcriptRef.current }]);
        setSuggestions(fields);

        // Push every newly-extracted field once; the page handler guards
        // against overwriting manually entered values
        for (const field of fields) {
          if (!autoFilledRef.current.has(field.fieldId)) {
            autoFilledRef.current.add(field.fieldId);
            onAutoFillRef.current(field.fieldId, field.value, 'regex');
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
    stop,
    clear,
    finalTranscript,
    interimText,
    suggestions,
    error,
    level,
  };
}
