export const ASK_MODELS = [
  { id: '@cf/qwen/qwen3-30b-a3b-fp8', label: 'Qwen3 30B A3B FP8' },
  { id: '@cf/qwen/qwen3.8-27b', label: 'Qwen3.8 27B' },
  { id: '@cf/zai-org/glm-5.3-flash', label: 'GLM 5.3 Flash' },
  { id: '@cf/google/gemma-4-26b-a4b-it', label: 'Gemma 4 26B A4B IT' },
  { id: '@cf/openai/gpt-oss-20b', label: 'GPT OSS 20B' },
  { id: '@cf/deepseek-ai/deepseek-v4.1-flash-1017', label: 'DeepSeek V4.1 Flash' },
  { id: '@cf/nvidia/nemotron-3-120b-a12b', label: 'Nemotron 3 120B A12B' },
] as const;

export type AskModel = (typeof ASK_MODELS)[number]['id'];

export const DEFAULT_ASK_MODEL: AskModel = '@cf/qwen/qwen3-30b-a3b-fp8';

export function isAskModel(value: unknown): value is AskModel {
  return ASK_MODELS.some((model) => model.id === value);
}
