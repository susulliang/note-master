import { useCallback, useEffect, useRef, useState } from 'react';
import {
  dashboardSnapshotError,
  fetchCallReport,
  fetchChatReport,
  fetchDashboardData,
  fetchEmailReport,
  fetchHistoricalReport,
  fetchSfReportIndex,
  pickCallDataExport,
  pickChatExport,
  pickEmailExport,
  pickHistoricalMetricsExport,
  requiresDashboardSnapshot,
  type CallMetrics,
  type CountReport,
  type HistoricalMetricsReport,
} from '@/lib/sf-reports';

export interface DailiesData {
  chat: CountReport;
  email: CountReport;
  call: CallMetrics;
  historical: HistoricalMetricsReport;
}

export type DailiesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DailiesData; refreshError?: string };

export interface DailiesController {
  state: DailiesState;
  refreshing: boolean;
  reload: () => void;
}

/** Loads all four dailies exports (Chat + Email xlsx, Call Data + Historical csv). */
export function useDailiesReport(): DailiesController {
  const [state, setState] = useState<DailiesState>({ status: 'loading' });
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
        if ((nonce === 0 || requiresDashboardSnapshot()) && pre?.chat && pre?.email && pre?.call && pre?.historical) {
          if (cancelled) return;
          setState({
            status: 'ready',
            data: { chat: pre.chat, email: pre.email, call: pre.call, historical: pre.historical },
          });
          hasLoadedOnce.current = true;
          return;
        }
        if (requiresDashboardSnapshot()) throw new Error(dashboardSnapshotError());
        const files = await fetchSfReportIndex(controller.signal);
        const chatFile = pickChatExport(files);
        const emailFile = pickEmailExport(files);
        const callFile = pickCallDataExport(files);
        const histFile = pickHistoricalMetricsExport(files);
        if (!chatFile) throw new Error('No Chat Messaging .xlsx export found in sf_reports/');
        if (!emailFile) throw new Error('No AMR Email .xlsx export found in sf_reports/');
        if (!callFile) throw new Error('No MTD Call Data .csv export found in sf_reports/');
        if (!histFile) throw new Error('No Historical Metrics .csv export found in sf_reports/');

        const [chat, email, call, historical] = await Promise.all([
          fetchChatReport(chatFile, controller.signal),
          fetchEmailReport(emailFile, controller.signal),
          fetchCallReport(callFile, controller.signal),
          fetchHistoricalReport(histFile, controller.signal),
        ]);
        if (cancelled) return;

        setState({ status: 'ready', data: { chat, email, call, historical } });
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
