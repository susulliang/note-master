import { getApiBase, getStoredToken } from '@/lib/auth-client';

export const REMOTE_LLM_MODELS = [
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    provider: 'DeepSeek',
  },
  {
    id: '@cf/qwen/qwen3.8-27b',
    label: 'Qwen 3.8 27B',
    provider: 'Workers AI',
  },
  {
    id: '@cf/zai-org/glm-5.3-flash',
    label: 'GLM 5.3 Flash',
    provider: 'Workers AI',
  },
  {
    id: '@cf/google/gemma-4-26b-a4b-it',
    label: 'Gemma 4 26B A4B IT',
    provider: 'Workers AI',
  },
] as const;

export type RemoteLlmModel = (typeof REMOTE_LLM_MODELS)[number]['id'];
export type RemoteChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const MODEL_STORAGE_KEY = 'nm-remote-llm-model';

export function readRemoteLlmModel(): RemoteLlmModel {
  try {
    const stored = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (REMOTE_LLM_MODELS.some((model) => model.id === stored)) return stored as RemoteLlmModel;
  } catch {
    /* local storage may be unavailable */
  }
  return 'deepseek-v4-flash';
}

export function writeRemoteLlmModel(model: RemoteLlmModel): void {
  try {
    window.localStorage.setItem(MODEL_STORAGE_KEY, model);
  } catch {
    /* model selection remains active until the page is closed */
  }
}

async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  if (!token) throw new Error('Sign in to use the remote AI service.');

  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${path}`, { ...init, headers });
  } catch (error) {
    throw new Error(`AI serving service is unreachable: ${(error as Error).message}`);
  }
  return response;
}

export async function fetchAvailableRemoteLlmModels(): Promise<RemoteLlmModel[]> {
  const response = await authenticatedFetch('/api/llm/models');
  const body = (await response.json().catch(() => ({}))) as {
    models?: unknown;
    error?: string;
  };
  if (!response.ok) throw new Error(body.error || `AI serving service failed (${response.status}).`);
  if (!Array.isArray(body.models)) return [];
  return body.models.filter(
    (model): model is RemoteLlmModel =>
      typeof model === 'string' && REMOTE_LLM_MODELS.some((candidate) => candidate.id === model)
  );
}

export async function requestRemoteChatCompletion(input: {
  model: RemoteLlmModel;
  messages: RemoteChatMessage[];
  maxTokens: number;
  temperature?: number;
  stream?: boolean;
  signal?: AbortSignal;
}): Promise<Response> {
  const response = await authenticatedFetch('/api/llm/chat', {
    method: 'POST',
    headers: { accept: input.stream ? 'text/event-stream' : 'application/json' },
    signal: input.signal,
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      max_tokens: input.maxTokens,
      temperature: input.temperature ?? 0.2,
      stream: Boolean(input.stream),
    }),
  });
  if (response.ok) return response;

  let detail = `${response.status} ${response.statusText}`;
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) detail = body.error;
  } catch {
    /* keep the status line */
  }
  throw new Error(detail);
}
