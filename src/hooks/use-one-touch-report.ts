import { useCallback, useEffect, useRef, useState } from 'react';
import {
  dashboardSnapshotError,
  fetchDashboardData,
  fetchOneTouchReport,
  fetchSfReportIndex,
  pickOneTouchExport,
  requiresDashboardSnapshot,
  type OneTouchReport,
} from '@/lib/sf-reports';

export type OneTouchReportState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; report: OneTouchReport; refreshError?: string };

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
        const pre = await fetchDashboardData(controller.signal, nonce > 0);
        if ((nonce === 0 || requiresDashboardSnapshot()) && pre?.oneTouch) {
          if (cancelled) return;
          setState({ status: 'ready', report: pre.oneTouch });
          hasLoadedOnce.current = true;
          return;
        }
        if (requiresDashboardSnapshot()) throw new Error(dashboardSnapshotError());
        const files = await fetchSfReportIndex(controller.signal);
        const file = pickOneTouchExport(files);
        if (!file) throw new Error('No One-touch .xlsx export found in sf_reports/');
        const report = await fetchOneTouchReport(file, controller.signal);
        if (cancelled) return;
        setState({ status: 'ready', report });
        hasLoadedOnce.current = true;
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) return;
        const message = e instanceof Error ? e.message : String(e);
        setState((current) => current.status === 'ready'
          ? { ...current, refreshError: message }
          : { status: 'error', message });
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
