import {
  DEFAULT_ASK_MODEL,
  isAskModel,
  type AskModel,
} from '@shared/ask-models';

export const ASK_MODEL_STORAGE_KEY = '__app_shiftc_ask_model';

export function readStoredAskModel(): AskModel {
  try {
    const stored = window.localStorage.getItem(ASK_MODEL_STORAGE_KEY);
    return isAskModel(stored) ? stored : DEFAULT_ASK_MODEL;
  } catch {
    return DEFAULT_ASK_MODEL;
  }
}

export function storeAskModel(model: AskModel): void {
  try {
    window.localStorage.setItem(ASK_MODEL_STORAGE_KEY, model);
  } catch {
    // Keep the current model in memory when browser storage is unavailable.
  }
}
