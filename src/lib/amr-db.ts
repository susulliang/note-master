/**
 * AMR email templates from the eco-data D1 database (imported from the
 * Salesforce EmailTemplate export via scripts/import-amr-templates.mjs).
 *
 * The full pool (~320 rows) is fetched once per session and cached
 * module-level; admin edits upsert a single row and patch the cache.
 */

import { getApiBase, getStoredToken } from '@/lib/auth-client';

export interface AmrTemplate {
  id: string;
  folder: string;
  name: string;
  description: string;
  subject: string;
  html: string;
  author: string;
  updatedAt: number;
}

let cache: AmrTemplate[] | null = null;
let pending: Promise<AmrTemplate[]> | null = null;

export function fetchAmrTemplates(): Promise<AmrTemplate[]> {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = fetch(`${getApiBase()}/api/amr-templates`, {
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${getStoredToken() ?? ''}`,
    },
  })
    .then(async (res) => {
      const rows = res.ok ? ((await res.json()) as { templates?: AmrTemplate[] }).templates ?? [] : [];
      // Only cache real content — an empty result (signed out / session not
      // resolved yet) must stay retryable once a login appears.
      if (rows.length > 0) cache = rows;
      return rows;
    })
    .catch(() => [] as AmrTemplate[])
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Patch the module cache after an admin edit so the UI stays live. */
export function patchAmrTemplate(updated: AmrTemplate): void {
  if (!cache) return;
  cache = cache.map((t) => (t.id === updated.id ? updated : t));
}

/** Admin upsert of one template row (worker validates + stamps updated_at). */
export async function saveAmrTemplate(t: {
  id: string;
  name: string;
  folder: string;
  description: string;
  subject: string;
  html: string;
}): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error('Only logged-in admins can edit templates.');
  const res = await fetch(`${getApiBase()}/api/admin/amr-template`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(t),
  });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error || 'Could not save the template.');
}
