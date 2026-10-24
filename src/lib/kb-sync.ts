/**
 * Client sync for the D1-backed knowledge base (worker /api/kb endpoints).
 *
 * The bundled prepackaged blobs remain the fallback: every loader in the
 * utils layer starts from bundled data and merges the D1 documents over it
 * (D1 body wins by document id; tombstoned ids hide the bundled copy).
 */

import { getApiBase, getStoredToken } from '@/lib/auth-client';

export type KbKind = 'faq' | 'product' | 'gbu' | 'app_update' | 'firmware_update' | 'app_photo';
export const KB_KINDS: KbKind[] = ['faq', 'product', 'gbu', 'app_update', 'firmware_update', 'app_photo'];

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
  title: string;
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

/** Fetch one non-FAQ document (body included). Returns null when signed
 *  out, missing, or the request fails — callers fall back to bundled data. */
export async function fetchKbDoc(kind: KbKind, id: string): Promise<KbDoc | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const res = await fetch(`${getApiBase()}/api/kb/${kind}/${encodeURIComponent(id)}`, {
      headers: kbHeaders(token),
    });
    if (!res.ok) return null;
    return (await res.json()) as KbDoc;
  } catch {
    return null;
  }
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

/** Progress snapshot for one R2-export phase (reported after every page). */
export interface KbR2Progress {
  label: string;
  /** Objects copied in the current phase so far. */
  exported: number;
  /** Total objects in the current phase (null when the worker didn't report one). */
  total: number | null;
  /** Cumulative objects copied across all phases so far. */
  totalSoFar: number;
}

export interface KbR2ExportResult {
  exported: number;
  pruned: number;
}

const R2_SOURCE_LABELS: Record<string, string> = {
  documents: 'Knowledge documents',
  faq: 'FAQ documents',
  product: 'Product sheets',
  gbu: 'GBU barcode map',
  app_update: 'App update notes',
  firmware_update: 'Firmware OTA history',
  app_photo: 'App photos index',
  photos: 'App photo binaries',
  sop: 'SOP handbook',
  amr: 'AMR email templates',
  news: 'News & Updates articles',
  news_assets: 'News & Updates images',
};

/** Bulk-copy knowledge-base segments into the eco-kb R2 bucket (admin).
 *  Each source is cursor-paginated to stay under the subrequest limit; call
 *  it once per segment (e.g. one KB kind, or 'photos'/'sop'/'amr'/'news')
 *  so the copy happens in short toast-confirmed chunks. Reports progress via
 *  the optional callback after every page. Returns the total or null on failure. */
export async function exportKbToR2(
  sources: string[],
  onProgress?: (p: KbR2Progress) => void,
  options: { pruneFaq?: boolean } = {}
): Promise<KbR2ExportResult | null> {
  const token = getStoredToken();
  if (!token) return null;
  let totalSoFar = 0;
  let totalPruned = 0;
  for (const source of sources) {
    const label = R2_SOURCE_LABELS[source] ?? source;
    let sourceExported = 0;
    let sourceTotal: number | null = null;
    let cursor = '';
    let limit = 40;
    // Adaptive page size: a page whose D1 rows exceed D1's response-size cap
    // (dense clusters of large documents) fails with a 500 — retry the same
    // cursor with a smaller page until it fits.
    for (let page = 0; page < 5000; page++) {
      try {
        const res = await fetch(`${getApiBase()}/api/kb/export-r2`, {
          method: 'POST',
          headers: kbHeaders(token),
          body: JSON.stringify({
            source,
            ...(cursor ? { cursor } : {}),
            limit,
            ...(source === 'faq' && options.pruneFaq ? { pruneFaq: true } : {}),
          }),
        });
        if (!res.ok) {
          if (res.status >= 500 && limit > 1) {
            limit = Math.max(1, Math.floor(limit / 4));
            continue;
          }
          return null;
        }
        const payload = (await res.json()) as {
          exported?: number;
          pruned?: number;
          total?: number;
          done?: boolean;
          nextCursor?: string | null;
        };
        totalSoFar += payload.exported ?? 0;
        sourceExported += payload.exported ?? 0;
        totalPruned += payload.pruned ?? 0;
        if (typeof payload.total === 'number') sourceTotal = payload.total;
        onProgress?.({ label, exported: sourceExported, total: sourceTotal, totalSoFar });
        if (payload.done) break;
        if (!payload.nextCursor) break;
        cursor = payload.nextCursor;
      } catch {
        return null;
      }
    }
  }
  return { exported: totalSoFar, pruned: totalPruned };
}
