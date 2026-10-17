import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExtractedField, TranscriptEntry } from '@/lib/field-extraction';
import { parseWithRemoteLlm, type CloudParseResult } from '@/lib/cloud-parser';
import {
  fetchAvailableRemoteLlmModels,
  readRemoteLlmModel,
  REMOTE_LLM_MODELS,
  type RemoteLlmModel,
  writeRemoteLlmModel,
} from '@/lib/llm-serving-client';
import type { PriorLlmValues } from '@/lib/llm-parser';
import { useAuth } from '@/lib/auth-context';

/** The parser keeps its established field contract while the selected
 * remote provider is resolved by the authenticated Worker service. */
export function useCloudParser() {
  const { user, resolving } = useAuth();
  const [selectedModel, setSelectedModel] = useState<RemoteLlmModel>(readRemoteLlmModel);
  const [availableModels, setAvailableModels] = useState<RemoteLlmModel[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CloudParseResult | null>(null);
  const [progress, setProgress] = useState(0);
  const runningRef = useRef(false);
  const selectedModelRef = useRef(selectedModel);
  selectedModelRef.current = selectedModel;

  useEffect(() => {
    let alive = true;
    if (resolving) return () => { alive = false; };
    if (!user) {
      setAvailableModels([]);
      return () => { alive = false; };
    }
    void fetchAvailableRemoteLlmModels()
      .then((models) => {
        if (!alive) return;
        setAvailableModels(models);
        if (models.length > 0 && !models.includes(selectedModelRef.current)) {
          setSelectedModel(models[0]);
          writeRemoteLlmModel(models[0]);
        }
      })
      .catch((err: unknown) => {
        if (alive) setError((err as Error).message || 'Could not load remote AI models.');
      });
    return () => { alive = false; };
  }, [user, resolving]);

  const selectModel = useCallback((model: RemoteLlmModel) => {
    setSelectedModel(model);
    selectedModelRef.current = model;
    writeRemoteLlmModel(model);
    setError(null);
  }, []);

  const isAvailable = availableModels.includes(selectedModel);
  const modelLabel =
    REMOTE_LLM_MODELS.find((model) => model.id === selectedModel)?.label ?? selectedModel;

  const parse = useCallback(
    async (
      entries: TranscriptEntry[],
      prior?: PriorLlmValues,
      mode: 'full' | 'concise' = 'full'
    ): Promise<{ fields: ExtractedField[]; tldr: { en: string; zh: string } }> => {
      const EMPTY = { fields: [] as ExtractedField[], tldr: { en: '', zh: '' } };
      if (runningRef.current) return EMPTY;
      runningRef.current = true;
      setIsParsing(true);
      setError(null);
      setProgress(0);
      try {
        const { result, error: parseError } = await parseWithRemoteLlm(
          '',
          entries,
          prior,
          (pct) => setProgress(pct),
          mode
        );
        if (parseError) {
          setError(parseError);
          return EMPTY;
        }
        if (result) setLastResult(result);
        return { fields: result?.fields ?? [], tldr: result?.tldr ?? EMPTY.tldr };
      } finally {
        runningRef.current = false;
        setIsParsing(false);
        window.setTimeout(() => setProgress(0), 800);
      }
    },
    []
  );

  return {
    isAvailable,
    availableModels,
    selectedModel,
    modelLabel,
    selectModel,
    isParsing,
    progress,
    error,
    lastResult,
    parse,
  };
}
