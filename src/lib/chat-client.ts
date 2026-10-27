import { getApiBase, getStoredToken } from '@/lib/auth-client';

export interface ChatMessage {
  id: string;
  username: string;
  markdown: string;
  createdAt: number;
  updatedAt: number;
  source: 'chat' | 'news';
  avatar: ChatAvatarProfile;
}

export interface ChatConversation {
  roomId: string;
  peerUsername?: string;
  title: string;
  lastMessage: string;
  updatedAt: number;
  kind: 'direct' | 'group';
  memberCount: number;
  peerAvatar?: ChatAvatarProfile;
}

export interface ChatUser {
  username: string;
  avatar?: ChatAvatarProfile;
}

export interface ChatSocketTicket {
  roomId: string;
  ticket: string;
  freshMessages?: ChatMessage[];
}

export interface ChatAvatarProfile {
  seed: number;
  rotation: number;
}

export interface ChatSticker {
  id: string;
  owner: string;
  name: string;
  createdAt: number;
  scope: 'public' | 'private';
}

export type ChatMediaKind = 'photo' | 'sticker';

function endpoint(path: string): string {
  return `${getApiBase()}${path}`;
}

function headers(extra?: HeadersInit): Headers {
  const result = new Headers(extra);
  const token = getStoredToken();
  if (token) result.set('authorization', `Bearer ${token}`);
  return result;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint(path), {
    ...init,
    headers: headers(init?.headers),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || `Chat request failed (${response.status})`);
  return result;
}

export async function findChatUsers(query: string): Promise<ChatUser[]> {
  const result = await requestJson<{ users?: ChatUser[] }>(
    `/api/chat/users?q=${encodeURIComponent(query)}`,
  );
  return result.users ?? [];
}

export async function fetchChatConversations(): Promise<ChatConversation[]> {
  const result = await requestJson<{ conversations?: ChatConversation[] }>('/api/chat/conversations');
  return result.conversations ?? [];
}

export async function fetchChatGlobalTitle(): Promise<string> {
  const result = await requestJson<{ title?: string }>('/api/chat/global-title');
  return result.title || 'Ecovacs crew';
}

export async function updateChatRoomTitle(roomId: string, title: string): Promise<string> {
  const result = await requestJson<{ title: string }>('/api/chat/admin/room-title', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roomId, title }),
  });
  return result.title;
}

export async function fetchChatProfile(): Promise<ChatAvatarProfile> {
  return requestJson<ChatAvatarProfile>('/api/chat/profile');
}

export async function updateChatAvatarRotation(rotation: number): Promise<ChatAvatarProfile> {
  return requestJson<ChatAvatarProfile>('/api/chat/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rotation }),
  });
}

export async function createChatGroup(
  name: string,
  usernames: string[],
): Promise<{ roomId: string; title: string; memberCount: number }> {
  return requestJson('/api/chat/groups', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, usernames }),
  });
}

export async function requestChatTicket(payload: {
  roomId?: string;
  peerUsername?: string;
}): Promise<ChatSocketTicket> {
  return requestJson<ChatSocketTicket>('/api/chat/socket-ticket', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function chatSocketUrl(ticket: ChatSocketTicket): string {
  const url = new URL(endpoint('/api/chat/socket'), window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('roomId', ticket.roomId);
  url.searchParams.set('ticket', ticket.ticket);
  return url.toString();
}

export async function uploadChatPhoto(
  roomId: string,
  image: Blob,
  kind: ChatMediaKind = 'photo',
): Promise<string> {
  const result = await requestJson<{ url: string }>('/api/chat/media?roomId=' + encodeURIComponent(roomId), {
    method: 'POST',
    headers: headers({ 'content-type': 'image/webp', 'x-chat-media-kind': kind }),
    body: image,
  });
  return result.url;
}

export async function fetchChatStickers(): Promise<ChatSticker[]> {
  const result = await requestJson<{ stickers?: ChatSticker[] }>('/api/chat/stickers');
  return result.stickers ?? [];
}

export async function uploadChatSticker(
  name: string,
  scope: 'public' | 'private',
  png: Blob,
): Promise<ChatSticker> {
  return requestJson<ChatSticker>('/api/chat/stickers', {
    method: 'POST',
    headers: headers({
      'content-type': 'image/png',
      'x-sticker-name': name,
      'x-sticker-scope': scope,
    }),
    body: png,
  });
}

export function authorizedChatMediaUrl(markdownUrl: string): string {
  if (/^https?:\/\//i.test(markdownUrl)) return markdownUrl;
  return endpoint(markdownUrl);
}

export function chatAuthHeaders(): Headers {
  return headers();
}
