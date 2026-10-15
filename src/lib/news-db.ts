/**
 * News & Updates knowledge base from the eco-data D1 database (migrated
 * from news/*.md via scripts/import-news-to-d1.mjs). Admins add, edit and
 * delete entries in-app; every successful write earns +5 spice.
 */

import { getApiBase, getStoredToken } from '@/lib/auth-client';

export interface NewsEntry {
  id: string;
  date: string;
  title: string;
  author: string;
  body: string;
  updatedAt: number;
}

/* ----------------------------- D1 fetch ------------------------------ */

let entryCache: NewsEntry[] | null = null;
let entryPending: Promise<NewsEntry[]> | null = null;

export function fetchNewsEntries(): Promise<NewsEntry[]> {
  if (entryCache) return Promise.resolve(entryCache);
  if (entryPending) return entryPending;
  entryPending = fetch(`${getApiBase()}/api/news`, {
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${getStoredToken() ?? ''}`,
    },
  })
    .then(async (res) => {
      const rows = res.ok ? ((await res.json()) as { entries?: NewsEntry[] }).entries ?? [] : [];
      // Only cache real content — an empty result (signed out / session
      // not resolved yet) must stay retryable once a login appears.
      if (rows.length > 0) entryCache = rows;
      return rows;
    })
    .catch(() => [] as NewsEntry[])
    .finally(() => {
      entryPending = null;
    });
  return entryPending;
}

/** Patch the module cache after a write so the UI stays live. */
export function patchNewsEntry(updated: NewsEntry): void {
  if (!entryCache) return;
  const exists = entryCache.some((e) => e.id === updated.id);
  entryCache = exists
    ? entryCache.map((e) => (e.id === updated.id ? updated : e))
    : [updated, ...entryCache];
}

export function removeNewsEntry(id: string): void {
  if (!entryCache) return;
  entryCache = entryCache.filter((e) => e.id !== id);
}

/** Admin add/edit of one knowledge update (+5 spice on success). */
export async function saveNewsEntry(entry: {
  id?: string;
  date: string;
  title: string;
  author: string;
  body: string;
}): Promise<{ id: string; spice?: number }> {
  const token = getStoredToken();
  if (!token) throw new Error('Only logged-in admins can edit the knowledge base.');
  const res = await fetch(`${getApiBase()}/api/admin/news-entry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(entry),
  });
  const data = await res.json() as { error?: string; id?: string; spice?: number };
  if (!res.ok) throw new Error(data.error || 'Could not save the entry.');
  return { id: data.id ?? entry.id ?? '', spice: data.spice };
}

/** Admin delete of one knowledge update (no spice for deletions). */
export async function deleteNewsEntry(id: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error('Only logged-in admins can edit the knowledge base.');
  const res = await fetch(`${getApiBase()}/api/admin/news-delete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ id }),
  });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error || 'Could not delete the entry.');
}
