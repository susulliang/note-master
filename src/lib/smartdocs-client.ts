import { getApiBase, getStoredToken } from '@/lib/auth-client';

export type SmartDocPermission = 'view' | 'edit';
export type SmartDocVisibility = 'private' | 'registered';

export interface SmartDoc {
  id: string;
  title: string;
  owner: string;
  bannerAssetId: string | null;
  visibility: SmartDocVisibility;
  createdAt: number;
  updatedAt: number;
  permission: SmartDocPermission;
}

export interface SmartDocMember {
  username: string;
  permission: SmartDocPermission;
  owner: boolean;
}

export interface SmartDocAsset {
  id: string;
  documentId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: number;
}

export interface SmartDocSocketTicket {
  documentId: string;
  ticket: string;
  permission: SmartDocPermission;
}

function endpoint(path: string): string {
  return `${getApiBase()}${path}`;
}

function authHeaders(extra?: HeadersInit): Headers {
  const result = new Headers(extra);
  const token = getStoredToken();
  if (token) result.set('authorization', `Bearer ${token}`);
  return result;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint(path), {
    ...init,
    headers: authHeaders(init?.headers),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || `Smart Docs request failed (${response.status})`);
  return result;
}

export async function listSmartDocs(): Promise<SmartDoc[]> {
  const result = await requestJson<{ documents?: SmartDoc[] }>('/api/collab/smartdocs');
  return result.documents ?? [];
}

export async function createSmartDoc(title: string): Promise<SmartDoc> {
  const result = await requestJson<{ document: SmartDoc }>('/api/collab/smartdocs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return result.document;
}

export async function updateSmartDoc(
  id: string,
  settings: { title?: string; bannerAssetId?: string | null; visibility?: SmartDocVisibility },
): Promise<Pick<SmartDoc, 'id' | 'title' | 'owner' | 'bannerAssetId' | 'visibility' | 'updatedAt' | 'permission'>> {
  return requestJson(`/api/collab/smartdocs/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(settings),
  });
}

export async function deleteSmartDoc(id: string): Promise<void> {
  await requestJson(`/api/collab/smartdocs/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function listSmartDocAccess(id: string): Promise<SmartDocMember[]> {
  const result = await requestJson<{ members?: SmartDocMember[] }>(
    `/api/collab/smartdocs/${encodeURIComponent(id)}/access`,
  );
  return result.members ?? [];
}

export async function setSmartDocAccess(
  id: string,
  username: string,
  permission: SmartDocPermission | 'remove',
): Promise<SmartDocMember[]> {
  const result = await requestJson<{ members?: SmartDocMember[] }>(
    `/api/collab/smartdocs/${encodeURIComponent(id)}/access`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, permission }),
    },
  );
  return result.members ?? [];
}

export async function requestSmartDocSocketTicket(documentId: string): Promise<SmartDocSocketTicket> {
  return requestJson('/api/collab/smartdocs/socket-ticket', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ documentId }),
  });
}

export function smartDocSocketUrl(ticket: SmartDocSocketTicket): string {
  const url = new URL(endpoint('/api/collab/smartdocs/socket'), window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('documentId', ticket.documentId);
  url.searchParams.set('ticket', ticket.ticket);
  return url.toString();
}

export async function uploadSmartDocMedia(documentId: string, file: File): Promise<SmartDocAsset> {
  const body = new FormData();
  body.set('file', file);
  const response = await fetch(endpoint(`/api/collab/smartdocs/${encodeURIComponent(documentId)}/media`), {
    method: 'POST',
    headers: authHeaders(),
    body,
  });
  const result = await response.json().catch(() => ({})) as { asset?: SmartDocAsset; error?: string };
  if (!response.ok || !result.asset) {
    throw new Error(result.error || `Media upload failed (${response.status})`);
  }
  return result.asset;
}

export function smartDocMediaUrl(documentId: string, assetId: string, kind?: 'video'): string {
  const path = `/api/collab/smartdocs/${encodeURIComponent(documentId)}/media/${encodeURIComponent(assetId)}`;
  return kind === 'video' ? `${path}?kind=video` : path;
}

export function smartDocDriveMediaUrl(
  documentId: string,
  fileId: string,
  kind: 'image' | 'video',
): string {
  return `/api/collab/smartdocs/${encodeURIComponent(documentId)}/drive/${encodeURIComponent(fileId)}?kind=${kind}`;
}

export async function attachSmartDocDriveMedia(
  documentId: string,
  fileId: string,
): Promise<void> {
  await requestJson(
    `/api/collab/smartdocs/${encodeURIComponent(documentId)}/drive/${encodeURIComponent(fileId)}`,
    { method: 'POST' },
  );
}

export async function fetchSmartDocMedia(url: string): Promise<Blob> {
  if (!url.startsWith('/api/collab/smartdocs/')) throw new Error('Unsupported Smart Docs media URL.');
  const response = await fetch(endpoint(url), { headers: authHeaders() });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error || `Media request failed (${response.status})`);
  }
  return response.blob();
}
