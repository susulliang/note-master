import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchDashboardData,
  fetchOneTouchReport,
  fetchSfReportIndex,
  pickOneTouchExport,
  type OneTouchReport,
} from '@/lib/sf-reports';

export type OneTouchReportState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; report: OneTouchReport };

export interface OneTouchReportController {
  state: OneTouchReportState;
  refreshing: boolean;
  reload: () => void;
}

/** Loads the newest One-touch export from sf_reports/ (see use-csat-report). */
export function useOneTouchReport(): OneTouchReportController {
  const [state, setState] = useState<OneTouchReportState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);
  const hasLoadedOnce = useRef(false);

  const reload = useCallback(() => {
    if (hasLoadedOnce.current) setRefreshing(true);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const pre = await fetchDashboardData(controller.signal);
        if (pre?.oneTouch) {
          if (cancelled) return;
          setState({ status: 'ready', report: pre.oneTouch });
          hasLoadedOnce.current = true;
          return;
        }
        const files = await fetchSfReportIndex(controller.signal);
        const file = pickOneTouchExport(files);
        if (!file) throw new Error('No One-touch .xlsx export found in sf_reports/');
        const report = await fetchOneTouchReport(file, controller.signal);
        if (cancelled) return;
        setState({ status: 'ready', report });
        hasLoadedOnce.current = true;
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) return;
        setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
        hasLoadedOnce.current = true;
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [nonce]);

  return { state, refreshing, reload };
}
