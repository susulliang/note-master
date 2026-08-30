import { useCallback, useRef, useState } from 'react';
import type { ExtractedField, TranscriptEntry } from '@/lib/field-extraction';
import {
  parseWithDeepseek,
  readDeepseekApiKey,
  writeDeepseekApiKey,
  type CloudParseResult,
} from '@/lib/cloud-parser';
import type { PriorLlmValues } from '@/lib/llm-parser';

/**
 * DeepSeek v4 Flash cloud parser — the on-demand alternative to the local
 * LLM. No model download, no worker, no warmup: one fetch per click. The
 * hook only owns state (key, in-flight, last result/error); field
 * APPLICATION lives in use-call-capture so cloud values flow through the
 * same authoritative path as local-LLM ones (overwriting regex fills).
 */
export function useCloudParser() {
  const [apiKey, setApiKeyState] = useState(readDeepseekApiKey);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CloudParseResult | null>(null);

  const apiKeyRef = useRef(apiKey);
  const runningRef = useRef(false);

  const setApiKey = useCallback((key: string) => {
    const trimmed = key.trim();
    apiKeyRef.current = trimmed;
    setApiKeyState(trimmed);
    writeDeepseekApiKey(trimmed);
    if (trimmed) setError(null);
  }, []);

  /**
   * One cloud extraction. Never rejects: failures land in `error` state
   * and resolve to [] so the caller's apply path is a no-op.
   */
  const parse = useCallback(
    async (entries: TranscriptEntry[], prior?: PriorLlmValues): Promise<ExtractedField[]> => {
      if (runningRef.current) return [];
      runningRef.current = true;
      setIsParsing(true);
      setError(null);
      try {
        const { result, error } = await parseWithDeepseek(apiKeyRef.current, entries, prior);
        if (error) {
          setError(error);
          return [];
        }
        if (result) setLastResult(result);
        return result?.fields ?? [];
      } finally {
        runningRef.current = false;
        setIsParsing(false);
      }
    },
    []
  );

  return {
    /** Stored API key ('' when none) */
    apiKey,
    hasKey: apiKey.length > 0,
    setApiKey,
    isParsing,
    error,
    /** Last successful round-trip (raw reply + timing, for the debug view) */
    lastResult,
    parse,
  };
}
