/**
 * Client sync for the D1-backed knowledge base (worker /api/kb endpoints).
 *
 * The bundled prepackaged blobs remain the fallback: every loader in the
 * utils layer starts from bundled data and merges the D1 documents over it
 * (D1 body wins by document id; tombstoned ids hide the bundled copy).
 */

import { getApiBase, getStoredToken } from '@/lib/auth-client';

export type KbKind = 'faq' | 'product' | 'gbu' | 'app_update' | 'firmware_update';
export const KB_KINDS: KbKind[] = ['faq', 'product', 'gbu', 'app_update', 'firmware_update'];

export interface KbDoc {
  id: string;
  title: string;
  body: string;
  updatedBy: string;
  updatedAt: string;
}

export interface KbListResult {
  kind: KbKind;
  docs: KbDoc[];
  /** Tombstoned ids — the bundled fallback copy must be hidden. */
  deleted: string[];
}

export interface KbFaqIndexEntry {
  id: string;
  category: string;
  model: string;
  modelSlug: string;
  lang: string;
  source: string;
  sourceSheet: string;
  question: string;
  searchText: string;
  version: number;
}

function kbHeaders(token: string | null): HeadersInit {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

/** Fetch one kind's documents. Returns null when D1 is unavailable / logged out. */
export async function fetchKbDocs(kind: KbKind): Promise<KbListResult | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const res = await fetch(`${getApiBase()}/api/kb/${kind}`, {
      headers: kbHeaders(token),
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as Partial<KbListResult>;
    if (!Array.isArray(payload.docs)) return null;
    return {
      kind,
      docs: payload.docs as KbDoc[],
      deleted: Array.isArray(payload.deleted) ? payload.deleted : [],
    };
  } catch {
    return null;
  }
}

/** Full markdown body of one FAQ document (lazy answer loading). */
export async function fetchKbFaqDoc(id: string): Promise<string | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const res = await fetch(`${getApiBase()}/api/kb/faq/${encodeURIComponent(id)}`, {
      headers: kbHeaders(token),
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { body?: string };
    return typeof payload.body === 'string' ? payload.body : null;
  } catch {
    return null;
  }
}

/** Fetch the parsed FAQ index served from D1 (same shape as the bundled
 *  faq-content/index.json entries). Null when unavailable. */
export async function fetchKbFaqIndex(): Promise<KbFaqIndexEntry[] | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const res = await fetch(`${getApiBase()}/api/kb/faq`, { headers: kbHeaders(token) });
    if (!res.ok) return null;
    const payload = (await res.json()) as { entries?: KbFaqIndexEntry[] };
    return Array.isArray(payload.entries) ? payload.entries : null;
  } catch {
    return null;
  }
}

/** Create a new document (admin). Returns the assigned id or null. */
export async function createKbDoc(
  kind: KbKind,
  doc: { id?: string; title?: string; body: string }
): Promise<string | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const res = await fetch(`${getApiBase()}/api/kb/${kind}`, {
      method: 'POST',
      headers: kbHeaders(token),
      body: JSON.stringify(doc),
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { id?: string };
    return payload.id ?? null;
  } catch {
    return null;
  }
}

/** Save (upsert) a document (admin). */
export async function saveKbDoc(kind: KbKind, id: string, doc: { title?: string; body: string }): Promise<boolean> {
  const token = getStoredToken();
  if (!token) return false;
  try {
    const res = await fetch(`${getApiBase()}/api/kb/${kind}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: kbHeaders(token),
      body: JSON.stringify(doc),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Delete a document (admin, tombstoned). */
export async function deleteKbDoc(kind: KbKind, id: string): Promise<boolean> {
  const token = getStoredToken();
  if (!token) return false;
  try {
    const res = await fetch(`${getApiBase()}/api/kb/${kind}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: kbHeaders(token),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Bulk-copy every D1 knowledge document into the eco-kb R2 bucket (admin).
 *  The worker endpoint is cursor-paginated to stay under the subrequest
 *  limit; this loops until the manifest lands. Returns the total exported
 *  or null on failure. */
export async function exportKbToR2(): Promise<number | null> {
  const token = getStoredToken();
  if (!token) return null;
  let exported = 0;
  let cursor = '';
  for (let page = 0; page < 500; page++) {
    try {
      const res = await fetch(`${getApiBase()}/api/kb/export-r2`, {
        method: 'POST',
        headers: kbHeaders(token),
        body: JSON.stringify(cursor ? { cursor } : {}),
      });
      if (!res.ok) return null;
      const payload = (await res.json()) as { exported?: number; done?: boolean; nextCursor?: string | null };
      exported += payload.exported ?? 0;
      if (payload.done) return exported;
      if (!payload.nextCursor) return exported;
      cursor = payload.nextCursor;
    } catch {
      return null;
    }
  }
  return exported;
}
