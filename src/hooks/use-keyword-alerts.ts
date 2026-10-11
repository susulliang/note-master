import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_KEYWORD_ALERTS, type KeywordAlert } from '@/lib/keyword-alerts';

export const KEYWORD_ALERTS_UPDATED_EVENT = 'ecovacs-keyword-alerts-updated';

export type KeywordAlertSource = 'loading' | 'database' | 'defaults';

export interface KeywordAlertsState {
  alerts: KeywordAlert[];
  source: KeywordAlertSource;
  refresh: () => void;
}

function parseAlerts(value: unknown): KeywordAlert[] | null {
  if (!Array.isArray(value)) return null;
  const alerts: KeywordAlert[] = [];
  for (const item of value) {
    if (
      !item || typeof item !== 'object' ||
      typeof item.id !== 'string' ||
      typeof item.keyword !== 'string' ||
      typeof item.alert !== 'string' ||
      (item.format !== 'markdown' && item.format !== 'html')
    ) return null;
    alerts.push({
      id: item.id,
      keyword: item.keyword,
      alert: item.alert,
      format: item.format,
    });
  }
  return alerts;
}

export function useKeywordAlerts(): KeywordAlertsState {
  const [alerts, setAlerts] = useState<KeywordAlert[]>(DEFAULT_KEYWORD_ALERTS);
  const [source, setSource] = useState<KeywordAlertSource>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const onUpdated = () => refresh();
    window.addEventListener(KEYWORD_ALERTS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(KEYWORD_ALERTS_UPDATED_EVENT, onUpdated);
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/keyword-alerts', {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Keyword alerts unavailable');
        return (await response.json()) as { alerts?: unknown };
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const result = parseAlerts(payload.alerts);
        if (!result?.length) {
          setAlerts(DEFAULT_KEYWORD_ALERTS);
          setSource('defaults');
          return;
        }
        setAlerts(result);
        setSource('database');
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setAlerts(DEFAULT_KEYWORD_ALERTS);
        setSource('defaults');
      });

    return () => controller.abort();
  }, [reloadKey]);

  return { alerts, source, refresh };
}
