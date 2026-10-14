/**
 * Roster sync — push/pull monthly rosters to the eco-data D1 database via
 * the Worker's /api/roster endpoint. Writes are admin-only; reads require
 * a logged-in session. The app uses this to back up admin edits and to
 * restore a shared roster across sessions/devices.
 *
 * Storage is per-cell: the first submit for a month uploads the entire
 * table; subsequent edits upsert single cells.
 */

import { getStoredToken } from '@/lib/auth-client';

const API_BASE: string = (() => {
  if (import.meta.env.VITE_AUTH_API_BASE)
    return String(import.meta.env.VITE_AUTH_API_BASE).replace(/\/+$/, '');
  return '';
})();

export interface RosterCell {
  en: string;
  iso: string;
  code: string;
  updatedAt?: string;
}

/** Fetch every cell stored for a month (returns [] when the month is
 *  absent from D1 — the caller treats that as "needs a full upload"). */
export async function fetchRosterMonth(monthKey: string): Promise<RosterCell[]> {
  const token = getStoredToken();
  if (!token) return [];
  try {
    const res = await fetch(`${API_BASE}/api/roster?month=${encodeURIComponent(monthKey)}`, {
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
  agents: Array<{ en: string; shifts: Record<string, string> }>
): Promise<boolean> {
  const token = getStoredToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE}/api/roster`, {
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
  code: string
): Promise<boolean> {
  const token = getStoredToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE}/api/roster`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ month: monthKey, mode: 'cell', en, iso, code }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
