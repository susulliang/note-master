import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchChatResponseReport,
  fetchDashboardData,
  fetchEmailAvgResponseReport,
  fetchEmailFirstResponseReport,
  fetchSfReportIndex,
  pickChatResponseExport,
  pickEmailAvgResponseExport,
  pickEmailFirstResponseExport,
  type ResponseTimeReport,
} from '@/lib/sf-reports';

export interface ResponseTimeData {
  chat: ResponseTimeReport;
  emailFirst: ResponseTimeReport;
  emailAvg: ResponseTimeReport;
}

export type ResponseTimeState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ResponseTimeData };

export interface ResponseTimeController {
  state: ResponseTimeState;
  refreshing: boolean;
  reload: () => void;
}

/**
 * Loads all three average-response-time reports (Chat, Email first, Email
 * avg). Prefers the pre-parsed dashboard-data.json; falls back to runtime
 * parsing of the newest matching exports.
 */
export function useResponseTimeReport(): ResponseTimeController {
  const [state, setState] = useState<ResponseTimeState>({ status: 'loading' });
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
        if (pre?.chatResponse && pre?.emailFirstResponse && pre?.emailAvgResponse) {
          if (cancelled) return;
          setState({
            status: 'ready',
            data: {
              chat: pre.chatResponse,
              emailFirst: pre.emailFirstResponse,
              emailAvg: pre.emailAvgResponse,
            },
          });
          hasLoadedOnce.current = true;
          return;
        }
        const files = await fetchSfReportIndex(controller.signal);
        const chatFile = pickChatResponseExport(files);
        const emailFirstFile = pickEmailFirstResponseExport(files);
        const emailAvgFile = pickEmailAvgResponseExport(files);
        if (!chatFile) throw new Error('No Chat average response-time .xlsx found in sf_reports/');
        if (!emailFirstFile) throw new Error('No Email first response-time .xlsx found in sf_reports/');
        if (!emailAvgFile) throw new Error('No Email average response-time .xlsx found in sf_reports/');

        const [chat, emailFirst, emailAvg] = await Promise.all([
          fetchChatResponseReport(chatFile, controller.signal),
          fetchEmailFirstResponseReport(emailFirstFile, controller.signal),
          fetchEmailAvgResponseReport(emailAvgFile, controller.signal),
        ]);
        if (cancelled) return;

        setState({ status: 'ready', data: { chat, emailFirst, emailAvg } });
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
