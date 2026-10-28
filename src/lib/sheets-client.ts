import { getApiBase, getStoredToken } from '@/lib/auth-client';
import type { SheetCell } from '@/lib/sheets-types';

export interface CollaborativeSheet {
  id: string;
  title: string;
  owner: string;
  createdAt: number;
  updatedAt: number;
  memberCount: number;
  permission?: 'view' | 'edit';
}

export interface SheetMember {
  username: string;
  owner: boolean;
}

export interface SheetsSocketTicket {
  sheetId: string;
  ticket: string;
  permission: 'view' | 'edit';
}

function endpoint(path: string): string {
  return `${getApiBase()}${path}`;
}

function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const token = getStoredToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  return headers;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint(path), {
    ...init,
    headers: authHeaders(init?.headers),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || `Sheets request failed (${response.status})`);
  return result;
}

export async function listCollaborativeSheets(): Promise<CollaborativeSheet[]> {
  const result = await requestJson<{ sheets?: CollaborativeSheet[] }>('/api/sheets');
  return result.sheets ?? [];
}

export async function createCollaborativeSheet(
  title: string,
  usernames: string[],
): Promise<CollaborativeSheet> {
  const result = await requestJson<{ sheet: CollaborativeSheet }>('/api/sheets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, usernames }),
  });
  return result.sheet;
}

export async function listSheetMembers(sheetId: string): Promise<SheetMember[]> {
  const result = await requestJson<{ members?: SheetMember[] }>(
    `/api/sheets/${encodeURIComponent(sheetId)}/members`,
  );
  return result.members ?? [];
}

export async function addSheetMembers(sheetId: string, usernames: string[]): Promise<SheetMember[]> {
  const result = await requestJson<{ members?: SheetMember[] }>(
    `/api/sheets/${encodeURIComponent(sheetId)}/members`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ usernames }),
    },
  );
  return result.members ?? [];
}

export async function renameCollaborativeSheet(id: string, title: string): Promise<string> {
  const result = await requestJson<{ title: string }>('/api/sheets/rename', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, title }),
  });
  return result.title;
}

export async function requestSheetsSocketTicket(
  sheetId: string,
  signal?: AbortSignal,
): Promise<SheetsSocketTicket> {
  return requestJson<SheetsSocketTicket>('/api/sheets/socket-ticket', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sheetId }),
    signal,
  });
}

export function sheetsSocketUrl(ticket: SheetsSocketTicket): string {
  const url = new URL(endpoint('/api/sheets/socket'), window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('sheetId', ticket.sheetId);
  url.searchParams.set('ticket', ticket.ticket);
  return url.toString();
}

export function isSheetCell(value: unknown): value is SheetCell {
  if (!value || typeof value !== 'object') return false;
  const cell = value as Partial<SheetCell>;
  return Number.isInteger(cell.row) && Number.isInteger(cell.col) &&
    typeof cell.raw === 'string' && !!cell.style && typeof cell.style === 'object';
}
