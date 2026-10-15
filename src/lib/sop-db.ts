/**
 * SOP handbook from the eco-data D1 database (imported from the Feishu
 * wiki via scripts/import-sop-wiki.mjs — one row per heading section,
 * same deterministic `h{level}-{counter}` ids as sopIndexer).
 *
 * The panel and Kitty Help both want the handbook as ONE raw markdown
 * string they can feed to indexSopMarkdown, so `loadSopRaw()` reassembles
 * it from D1 and falls back to the baked /SOP/*.md bundle when the D1
 * pool is unavailable (signed out, empty, or fetch failure).
 */

import { getApiBase, getStoredToken } from '@/lib/auth-client';

export interface SopEntry {
  id: string;
  level: number;
  title: string;
  body: string;
  parentId: string | null;
  sortOrder: number;
  updatedAt: number;
}

/* ----------------------------- D1 fetch ------------------------------ */

let entryCache: SopEntry[] | null = null;
let entryPending: Promise<SopEntry[]> | null = null;

export function fetchSopEntries(): Promise<SopEntry[]> {
  if (entryCache) return Promise.resolve(entryCache);
  if (entryPending) return entryPending;
  entryPending = fetch(`${getApiBase()}/api/sop`, {
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${getStoredToken() ?? ''}`,
    },
  })
    .then(async (res) => {
      const rows = res.ok ? ((await res.json()) as { entries?: SopEntry[] }).entries ?? [] : [];
      // Only cache real content — an empty result (signed out / session
      // not resolved yet) must stay retryable once a login appears.
      if (rows.length > 0) entryCache = rows;
      return rows;
    })
    .catch(() => [] as SopEntry[])
    .finally(() => {
      entryPending = null;
    });
  return entryPending;
}

/** Patch the module cache after an admin edit so the UI stays live. */
export function patchSopEntry(updated: SopEntry): void {
  if (!entryCache) return;
  entryCache = entryCache.map((e) => (e.id === updated.id ? updated : e));
}

/** Reassemble the raw markdown string indexSopMarkdown expects — sections
 *  back in document order, heading line + own body. */
export function assembleSopMarkdown(rows: SopEntry[]): string {
  return rows
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((row) => `${'#'.repeat(row.level)} ${row.title}\n${row.body}`)
    .join('\n\n');
}

/** Admin upsert of one SOP section (worker validates + stamps updated_at).
 *  Returns the admin's fresh spice balance (+5 per edit). */
export async function saveSopEntry(entry: {
  id: string;
  title: string;
  body: string;
}): Promise<number | undefined> {
  const token = getStoredToken();
  if (!token) throw new Error('Only logged-in admins can edit SOP sections.');
  const res = await fetch(`${getApiBase()}/api/admin/sop-entry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(entry),
  });
  const data = await res.json() as { error?: string; spice?: number };
  if (!res.ok) throw new Error(data.error || 'Could not save the SOP section.');
  return data.spice;
}

/* --------------------- raw-markdown loader (D1 first) ----------------- */

/* Baked fallback: the numbered section files under /SOP. Kept as the
 * offline fallback for signed-out users and D1 outages. */
const bakedLoaders = import.meta.glob('/SOP/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

async function loadBakedSop(): Promise<string> {
  const entries = await Promise.all(
    Object.entries(bakedLoaders).map(async ([key, load]) => [key, await load()] as const)
  );
  return entries
    .filter(([key]) => !/000_INDEX\.md$/.test(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, content]) => content)
    .join('\n\n');
}

let rawPromise: Promise<string> | null = null;

/** D1-first raw handbook loader (cached). Falls back to the baked /SOP
 *  markdown when the D1 pool is empty or unreachable. */
export function loadSopRaw(): Promise<string> {
  if (!rawPromise) {
    rawPromise = fetchSopEntries()
      .then((rows) => (rows.length > 0 ? assembleSopMarkdown(rows) : loadBakedSop()))
      .catch(() => loadBakedSop());
  }
  return rawPromise;
}

/** Drop the cached loader — called after an admin edit so the next
 *  loadSopRaw() call reassembles from the patched cache. */
export function resetSopRawCache(): void {
  rawPromise = null;
}
