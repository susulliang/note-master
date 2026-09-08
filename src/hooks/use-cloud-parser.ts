import { useCallback, useRef, useState } from 'react';
import type { ExtractedField, TranscriptEntry } from '@/lib/field-extraction';
import {
  parseWithDeepseek,
  getEffectiveApiKey,
  isDeepSeekDefault,
  readDeepseekApiKey,
  writeDeepseekApiKey,
  type CloudParseResult,
} from '@/lib/cloud-parser';
import type { PriorLlmValues } from '@/lib/llm-parser';

/**
 * DeepSeek v4 Flash cloud parser — the on-demand alternative to the local
 * LLM. No model download, no worker, no warmup: one fetch per click. The
 * hook only owns state (key, in-flight, progress, last result/error);
 * field APPLICATION lives in use-call-capture so cloud values flow through
 * the same authoritative path as local-LLM ones (overwriting regex fills).
 *
 * When VITE_DEEPSEEK_API_KEY is set in the build environment (Vercel /
 * Cloudflare secrets) `isDefault` returns true — DeepSeek becomes the
 * default AI parse backend, the key is sourced from the env var (the
 * local key storage remains only as a fallback for the no-env case).
 */
export function useCloudParser() {
  // localStorage copy — the effective key also considers the env var.
  const [localKey, setLocalKeyState] = useState(readDeepseekApiKey);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CloudParseResult | null>(null);
  /** Live streamed progress of the in-flight cloud parse: 0..1 */
  const [progress, setProgress] = useState(0);

  // Guard import.meta.env access for edge non-module contexts
  let effectiveKey = localKey;
  try {
    effectiveKey = getEffectiveApiKey();
  } catch {
    /* fall through to localStorage copy */
  }
  let defaultFlag = false;
  try {
    defaultFlag = isDeepSeekDefault();
  } catch {
    /* noop */
  }

  const runningRef = useRef(false);

  const setApiKey = useCallback((key: string) => {
    const trimmed = key.trim();
    setLocalKeyState(trimmed);
    writeDeepseekApiKey(trimmed);
    if (trimmed) setError(null);
  }, []);

  // If the runtime exposes an env key we don't want the UI to wait for a
  // local-storage load — compute hasKey from the effective source so the
  // settings/caption panel both show "has key = true" immediately.
  const hasKey = effectiveKey.length > 0;

  /**
   * One cloud extraction. Never rejects: failures land in `error` state
   * and resolve to [] so the caller's apply path is a no-op.
   */
  const parse = useCallback(
    async (
      entries: TranscriptEntry[],
      prior?: PriorLlmValues,
      /** 'full' = every clause (default); 'concise' = 2–4 primary issues + 2–4 main fix steps */
      mode: 'full' | 'concise' = 'full'
    ): Promise<ExtractedField[]> => {
      if (runningRef.current) return [];
      runningRef.current = true;
      setIsParsing(true);
      setError(null);
      setProgress(0);
      try {
        const { result, error } = await parseWithDeepseek(
          // Pass the LOCAL key (storage key); parseWithDeepseek falls back
          // to getEffectiveApiKey() itself when this is '', which covers
          // the env-default case. We intentionally thread the local copy
          // through so the storage key wins when a user has typed one.
          localKey,
          entries,
          prior,
          (pct) => setProgress(pct),
          mode
        );
        if (error) {
          setError(error);
          return [];
        }
        if (result) setLastResult(result);
        return result?.fields ?? [];
      } finally {
        runningRef.current = false;
        setIsParsing(false);
        // Keep progress at 1 briefly so the progress bar fills visibly;
        // clear it back to 0 after a beat so a later parse starts fresh.
        window.setTimeout(() => setProgress(0), 800);
      }
    },
    [localKey]
  );

  return {
    /** Stored LOCAL (localStorage) API key — '' when agent has not typed one */
    apiKey: localKey,
    /** Effective key: env var if set, else localStorage */
    effectiveApiKey: effectiveKey,
    /** True when either env var OR localStorage holds a usable key */
    hasKey,
    /** True when DeepSeek is the DEFAULT backend (env var key present) */
    isDefault: defaultFlag,
    setApiKey,
    isParsing,
    /** Live streamed parse progress, 0..1 (0 = idle or <1%) */
    progress,
    error,
    /** Last successful round-trip (raw reply + timing, for the debug view) */
    lastResult,
    parse,
  };
}
