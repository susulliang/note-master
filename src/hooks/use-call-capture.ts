import { useState, useRef, useEffect, useCallback } from 'react';
import { extractFields, type ExtractedField } from './use-voice-transcription';
import type { CallTranscriber } from './use-local-transcriber';

/** Seconds of audio per transcription request — small enough for snappy
 *  near-live captions, large enough to amortize per-segment overhead. */
const SEGMENT_MS = 15_000;

/** Pause between recorder segments (stop → start cycle) */
const RESTART_DELAY_MS = 250;

/** Pick the first MediaRecorder mime type this browser supports */
function pickMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}

/**
 * Decode a recorded segment into the 16 kHz mono Float32 PCM that local
 * Whisper expects. decodeAudioData on a 16 kHz AudioContext resamples the
 * opus/webm blob; multi-channel audio is downmixed by averaging.
 *
 * Runs on the main thread (AudioContext is unavailable in workers) but is
 * cheap compared to the WASM inference that follows in the worker.
 */
async function blobToPcm16k(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16_000 });
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channels = decoded.numberOfChannels;
    if (channels <= 1) {
      // Copy: the decoded buffer is owned by the (soon closed) context.
      return decoded.getChannelData(0).slice();
    }
    const mono = new Float32Array(decoded.length);
    for (let c = 0; c < channels; c += 1) {
      const data = decoded.getChannelData(c);
      for (let i = 0; i < decoded.length; i += 1) {
        mono[i] += data[i] / channels;
      }
    }
    return mono;
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

/** Errors that carry a specific, already-human-readable message */
function readableCaptureError(err: unknown): string {
  const name = (err as DOMException)?.name ?? '';
  if (name === 'NotAllowedError') {
    return 'Screen/tab share was denied or cancelled — click "Capture call" again and pick the CCP tab.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No audio device found for capture — check the default input device.';
  }
  return `Could not start capture (${name || 'unknown error'}).`;
}

/**
 * Call-capture transcription: records the audio of another browser tab
 * (the Amazon Connect CCP softphone) plus the agent's own microphone, and
 * transcribes ~15s segments with a **local Whisper model** (transformers.js
 * WASM, running in a Web Worker) before accumulating the transcript for
 * form auto-fill. Audio never leaves the machine; there is no API key and
 * no per-minute cost.
 *
 * Why not the Web Speech API? It can only hear the microphone — there is
 * no way to feed it tab audio. Capturing via getDisplayMedia({ audio: true })
 * is the browser-sanctioned way to reach audio playing in another tab;
 * the user picks the CCP tab and must tick "Also share tab audio" in the
 * share dialog.
 *
 * The mixed stream (tab + mic) is recorded with MediaRecorder in a
 * stop/start cycle so every posted blob is a complete, decodable file
 * (raw timeslice chunks lack webm headers and often fail to decode).
 * Segments are transcribed sequentially so transcript text arrives in
 * order.
 */
export function useCallCapture(
  onAutoFill: (fieldId: string, value: string) => void,
  transcriber: CallTranscriber
) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [suggestions, setSuggestions] = useState<ExtractedField[]>([]);
  const [segmentsSent, setSegmentsSent] = useState(0);
  /** Segments recorded but not yet transcribed (worker still catching up) */
  const [queued, setQueued] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  /** True when the captured stream includes the agent's mic */
  const [hasMic, setHasMic] = useState(false);

  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const shouldCaptureRef = useRef(false);
  const transcriptRef = useRef('');
  const autoFilledRef = useRef(new Set<string>());
  const onAutoFillRef = useRef(onAutoFill);
  const transcriberRef = useRef(transcriber);
  const segmentTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  /** Sequential transcription chain — keeps transcript ordering stable */
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  /** Latest stop() — lets stream 'ended' listeners stop capture safely */
  const stopRef = useRef<(() => void) | null>(null);

  const isSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    typeof MediaRecorder !== 'undefined';

  useEffect(() => {
    onAutoFillRef.current = onAutoFill;
    transcriberRef.current = transcriber;
  }, [onAutoFill, transcriber]);

  // -----------------------------------------------------------------
  //  Audio level meter (same pattern as the mic hook)
  // -----------------------------------------------------------------
  const startLevelLoop = useCallback((analyser: AnalyserNode) => {
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
      if (now - lastUpdate > 100) {
        lastUpdate = now;
        setLevel(Math.min(1, rms * 4));
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const stopLevelLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyserRef.current = null;
    setLevel(0);
  }, []);

  // -----------------------------------------------------------------
  //  Segment transcription chain (local Whisper in the worker)
  // -----------------------------------------------------------------
  const postSegment = useCallback(async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const pcm = await blobToPcm16k(blob);
      const text = (await transcriberRef.current.transcribe(pcm)).trim();
      if (!text) return;

      setError(null);
      transcriptRef.current = `${transcriptRef.current} ${text}`.trim();
      setTranscript(transcriptRef.current);

      const fields = extractFields(transcriptRef.current);
      setSuggestions(fields);
      for (const field of fields) {
        if (!autoFilledRef.current.has(field.fieldId)) {
          autoFilledRef.current.add(field.fieldId);
          onAutoFillRef.current(field.fieldId, field.value);
        }
      }
    } catch (err) {
      setError(`Local transcription failed: ${(err as Error).message}`);
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const enqueueSegment = useCallback(
    (blob: Blob) => {
      setQueued((n) => n + 1);
      queueRef.current = queueRef.current
        .then(() => postSegment(blob))
        .catch(() => undefined)
        .finally(() => {
          setSegmentsSent((n) => n + 1);
          setQueued((n) => Math.max(0, n - 1));
        });
    },
    [postSegment]
  );

  // -----------------------------------------------------------------
  //  Recorder stop/start cycle — each blob is a complete webm file
  // -----------------------------------------------------------------
  const beginSegment = useCallback(() => {
    const recorder = recorderRef.current;
    if (!shouldCaptureRef.current || !recorder) return;
    try {
      recorder.start();
    } catch {
      return; // already recording
    }
    segmentTimerRef.current = window.setTimeout(() => {
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
    }, SEGMENT_MS);
  }, []);

  // -----------------------------------------------------------------
  //  Lifecycle
  // -----------------------------------------------------------------
  const start = useCallback(async () => {
    if (!isSupported) return;

    setError(null);
    shouldCaptureRef.current = true;

    // 1. Capture the CCP tab — video: true is required for tab audio,
    //    and the user must tick "Also share tab audio" in the share dialog
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
    } catch (err) {
      setError(readableCaptureError(err));
      shouldCaptureRef.current = false;
      return;
    }

    if (display.getAudioTracks().length === 0) {
      display.getTracks().forEach((t) => t.stop());
      setError(
        'No tab audio in that share — click "Capture call" again, choose the CCP tab, and tick "Also share tab audio".'
      );
      shouldCaptureRef.current = false;
      return;
    }
    displayStreamRef.current = display;

    // 2. Also open the mic so the agent's half of the conversation is
    //    transcribed too (the tab stream only carries the customer's side)
    let mic: MediaStream | null = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = mic;
      setHasMic(true);
    } catch {
      // Headset/mic unavailable — continue with tab audio only
      setHasMic(false);
    }

    // 3. Mix tab + mic into one recording stream
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => undefined);
    }
    audioCtxRef.current = ctx;

    const dest = ctx.createMediaStreamDestination();
    const tabSource = ctx.createMediaStreamSource(display);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    tabSource.connect(analyser);
    if (mic) {
      ctx.createMediaStreamSource(mic).connect(analyser);
    }
    analyser.connect(dest);
    analyserRef.current = analyser;

    // 4. User can also stop sharing from the browser's own banner
    display.getAudioTracks()[0].addEventListener('ended', () => {
      // Fire-and-forget: stop() is idempotent
      void stopRef.current?.();
    });

    // 5. Recorder with the stop/start segment cycle
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(
      dest.stream,
      mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined
    );
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        enqueueSegment(event.data);
      }
    };
    recorder.onstop = () => {
      if (shouldCaptureRef.current) {
        restartTimerRef.current = window.setTimeout(beginSegment, RESTART_DELAY_MS);
      }
    };
    recorderRef.current = recorder;

    setIsCapturing(true);
    startLevelLoop(analyser);
    beginSegment();
  }, [isSupported, enqueueSegment, beginSegment, startLevelLoop]);

  const stop = useCallback(() => {
    shouldCaptureRef.current = false;
    setIsCapturing(false);
    setHasMic(false);

    if (segmentTimerRef.current !== null) {
      window.clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    stopLevelLoop();

    // stop() flushes a final partial segment through ondataavailable
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;

    displayStreamRef.current?.getTracks().forEach((t) => t.stop());
    displayStreamRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;

    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
  }, [stopLevelLoop]);

  // Keep the 'ended'-listener ref pointing at the latest stop()
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const toggle = useCallback(() => {
    if (shouldCaptureRef.current) {
      stop();
    } else {
      void start();
    }
  }, [start, stop]);

  const clear = useCallback(() => {
    transcriptRef.current = '';
    autoFilledRef.current = new Set();
    setTranscript('');
    setSuggestions([]);
    setSegmentsSent(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldCaptureRef.current = false;
      if (segmentTimerRef.current !== null) window.clearTimeout(segmentTimerRef.current);
      if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
      stopLevelLoop();
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      displayStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => undefined);
    };
  }, [stopLevelLoop]);

  return {
    isSupported,
    isCapturing,
    toggle,
    stop,
    clear,
    transcript,
    suggestions,
    segmentsSent,
    queued,
    isTranscribing,
    error,
    level,
    hasMic,
  };
}
