import { useCallback, useEffect, useRef, useState } from 'react';
import {
  dashboardSnapshotError,
  fetchCommonIssuesReport,
  fetchDashboardData,
  fetchSfReportIndex,
  pickCommonIssuesExport,
  requiresDashboardSnapshot,
  type CommonIssuesReport,
} from '@/lib/sf-reports';

export type CommonIssuesReportState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; report: CommonIssuesReport; refreshError?: string };

export interface CommonIssuesReportController {
  state: CommonIssuesReportState;
  refreshing: boolean;
  reload: () => void;
}

/**
 * Loads the common-issues-by-model report (open AMR-Repair cases aggregated as
 * model → issue-type counts). Prefers the pre-parsed dashboard-data.json;
 * falls back to runtime parsing of the newest common-issues .xlsx in
 * sf_reports/ when the JSON is absent or lacks a commonIssues section.
 */
export function useCommonIssuesReport(): CommonIssuesReportController {
  const [state, setState] = useState<CommonIssuesReportState>({ status: 'loading' });
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
        // Fast path: pre-computed JSON.
        const pre = await fetchDashboardData(controller.signal, nonce > 0);
        if ((nonce === 0 || requiresDashboardSnapshot()) && pre?.commonIssues) {
          if (cancelled) return;
          setState({ status: 'ready', report: pre.commonIssues });
          hasLoadedOnce.current = true;
          return;
        }
        if (requiresDashboardSnapshot()) throw new Error(dashboardSnapshotError());
        // Fallback: parse the newest export at runtime.
        const files = await fetchSfReportIndex(controller.signal);
        const file = pickCommonIssuesExport(files);
        if (!file) throw new Error('No common-issues .xlsx export found in sf_reports/');
        const report = await fetchCommonIssuesReport(file, controller.signal);
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
