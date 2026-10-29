/**
 * Roster sync — push/pull monthly rosters to the eco-data D1 database via
 * the Worker's /api/roster endpoint. Writes are admin-only; reads require
 * a logged-in session. The app uses this to back up admin edits and to
 * restore a shared roster across sessions/devices.
 *
 * Storage is per-cell: the first submit for a month uploads the entire
 * table; subsequent edits upsert single cells.
 */

import { getStoredToken, getApiBase } from '@/lib/auth-client';

export interface RosterCell {
  en: string;
  iso: string;
  code: string;
  /** Extra off hours recorded on this cell (billable = 8 - off for worked codes). */
  off?: number;
  /** Raw off-time comment text (manager + hours/range), for display. */
  note?: string;
  updatedAt?: string;
}

/** Fetch every cell stored for a month (returns [] when the month is
 *  absent from D1 — the caller treats that as "needs a full upload"). */
export async function fetchRosterMonth(monthKey: string): Promise<RosterCell[]> {
  const token = getStoredToken();
  if (!token) return [];
  try {
    const res = await fetch(`${getApiBase()}/api/roster?month=${encodeURIComponent(monthKey)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { cells?: RosterCell[] };
    return data.cells ?? [];
  } catch {
    return [];
  }
}

/** Upload the entire month (all agents × all days). Admin only. */
export async function pushRosterFull(
  monthKey: string,
  agents: Array<{ en: string; shifts: Record<string, string>; offHours?: Record<string, number> }>
): Promise<boolean> {
  const token = getStoredToken();
  if (!token) return false;
  try {
    const res = await fetch(`${getApiBase()}/api/roster`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ month: monthKey, mode: 'full', agents }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Upsert a single edited cell. Admin only. */
export async function pushRosterCell(
  monthKey: string,
  en: string,
  iso: string,
  code: string,
  off?: number
): Promise<boolean> {
  const token = getStoredToken();
  if (!token) return false;
  try {
    const res = await fetch(`${getApiBase()}/api/roster`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(off === undefined ? { month: monthKey, mode: 'cell', en, iso, code } : { month: monthKey, mode: 'cell', en, iso, code, off }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ------------------------- live edit subscription ------------------------- */

export interface RosterSocketHandlers {
  /** One cell edited live by an admin (from the per-month RosterRoom DO). */
  onCell?: (cell: RosterCell) => void;
  /** A full snapshot / full-month upload. */
  onCells?: (cells: RosterCell[]) => void;
}

function rosterSocketUrl(ticket: string, monthKey: string): string {
  const origin = new URL(getApiBase() || window.location.origin, window.location.origin).origin;
  const url = new URL('/api/roster/socket', origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('ticket', ticket);
  url.searchParams.set('month', monthKey);
  return url.toString();
}

/**
 * Subscribe to live roster edits for a month via the RosterRoom Durable
 * Object. Retries the ticket+connect loop with backoff while active. Returns
 * a cleanup function that closes the socket and stops retrying.
 */
export function subscribeRosterMonth(monthKey: string, handlers: RosterSocketHandlers): () => void {
  let socket: WebSocket | null = null;
  let stopped = false;
  let retryTimer = 0;
  let attempt = 0;

  const handleEvent = (raw: unknown) => {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(String(raw)) as Record<string, unknown>;
    } catch {
      return;
    }
    if (event.type === 'roster_cell') {
      const cell: RosterCell = {
        en: String(event.en ?? ''),
        iso: String(event.iso ?? ''),
        code: String(event.code ?? ''),
        off: typeof event.off === 'number' ? event.off : undefined,
      };
      if (cell.en && cell.iso) handlers.onCell?.(cell);
    } else if (event.type === 'roster_cells' || event.type === 'welcome') {
      if (!Array.isArray(event.cells)) return;
      const cells = (event.cells as Array<Record<string, unknown>>)
        .map((c) => ({
          en: String(c.en ?? ''),
          iso: String(c.iso ?? ''),
          code: String(c.code ?? ''),
          off: typeof c.off === 'number' ? c.off : undefined,
        }))
        .filter((c) => c.en && c.iso);
      if (cells.length) handlers.onCells?.(cells);
    }
  };

  const connect = async () => {
    if (stopped) return;
    const token = getStoredToken();
    if (!token) return;
    try {
      const res = await fetch(`${getApiBase()}/api/roster/socket-ticket`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ month: monthKey }),
      });
      if (!res.ok) throw new Error(`ticket failed (${res.status})`);
      const data = (await res.json()) as { ticket?: string };
      if (!data.ticket) throw new Error('ticket missing');
      if (stopped) return;
      const ws = new WebSocket(rosterSocketUrl(data.ticket, monthKey));
      socket = ws;
      ws.onmessage = (messageEvent) => {
        if (typeof messageEvent.data === 'string') handleEvent(messageEvent.data);
      };
      ws.onclose = () => {
        if (stopped || socket !== ws) return;
        socket = null;
        attempt += 1;
        retryTimer = window.setTimeout(() => {
          retryTimer = 0;
          void connect();
        }, Math.min(15_000, 1_000 * 2 ** Math.min(attempt - 1, 4)));
      };
      ws.onopen = () => {
        attempt = 0;
      };
    } catch {
      if (stopped) return;
      attempt += 1;
      retryTimer = window.setTimeout(() => {
        retryTimer = 0;
        void connect();
      }, Math.min(15_000, 1_000 * 2 ** Math.min(attempt - 1, 4)));
    }
  };

  void connect();

  return () => {
    stopped = true;
    if (retryTimer) window.clearTimeout(retryTimer);
    const ws = socket;
    socket = null;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
  };
}
