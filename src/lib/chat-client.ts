import { getApiBase, getStoredToken } from '@/lib/auth-client';

export interface ChatMessage {
  id: string;
  username: string;
  markdown: string;
  createdAt: number;
  updatedAt: number;
  source: 'chat' | 'news';
  avatar: ChatAvatarProfile;
  glowing?: boolean;
  parentId?: string | null;
  threadCount?: number;
  quickReply?: string | null;
  quickReplies?: Array<{
    id: string;
    username: string;
    quickReply: string;
  }>;
  mentions?: string[];
  contentType?: 'markdown' | 'poll' | 'poll_result';
  pollId?: string | null;
  poll?: ChatPoll;
}

export interface ChatPoll {
  id: string;
  question: string;
  options: string[];
  voteCounts: number[];
  myVote: number | null;
  closesAt: number;
  closedAt: number | null;
  closed: boolean;
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

export type CollabDocumentType = 'sheet' | 'mindmap';
export type CollabPermission = 'view' | 'edit';

export interface CollabDocument {
  id: string;
  type: CollabDocumentType;
  title: string;
  owner: string;
  createdAt: number;
  updatedAt: number;
  permission: CollabPermission;
}

export interface PinnedCollabDocument extends CollabDocument {
  pinnedBy: string;
  pinnedAt: number;
  members: Array<{
    username: string;
    permission: CollabPermission;
    owner: boolean;
  }>;
}

export interface MindmapSocketTicket {
  documentId: string;
  ticket: string;
  permission: CollabPermission;
}

export interface CollabDriveFolder {
  id: string;
  name: string;
  scope: 'team' | 'personal';
  owner: string;
  parent_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface CollabDriveFile {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  scope: 'team' | 'personal';
  owner: string;
  folder_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface CollabTask {
  id: string;
  title: string;
  description: string;
  scope: 'team' | 'personal';
  owner: string;
  assignee: string;
  dueAt: number | null;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
  mentions: string[];
}

export interface CollabSearchResult {
  id: string;
  type: 'message' | 'sheet' | 'sheet-cell' | 'mindmap' | 'mindmap-node' | 'file' | 'task';
  title: string;
  excerpt: string;
  updatedAt: number;
  roomId?: string;
  target?: string;
}

export type ChatMediaKind = 'photo' | 'sticker' | 'media';

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

export async function fetchCollabDocuments(): Promise<CollabDocument[]> {
  const result = await requestJson<{ documents?: CollabDocument[] }>('/api/collab/documents');
  return result.documents ?? [];
}

export async function searchCollab(query: string, signal?: AbortSignal): Promise<CollabSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const result = await requestJson<{ results?: CollabSearchResult[] }>(
    `/api/collab/search?${params}`,
    { signal },
  );
  return result.results ?? [];
}

export async function listCollabDrive(
  scope: 'team' | 'personal',
  folderId: string | null,
  options: { allFiles?: boolean; chatRoomId?: string } = {},
): Promise<{
  folders: CollabDriveFolder[];
  files: CollabDriveFile[];
  usage: { usedBytes: number; limitBytes: number } | null;
}> {
  const params = new URLSearchParams({ scope });
  if (folderId) params.set('folderId', folderId);
  if (options.allFiles) params.set('all', '1');
  if (options.chatRoomId) {
    params.set('chat', '1');
    params.set('roomId', options.chatRoomId);
  }
  return requestJson(`/api/collab/drive/files?${params}`);
}

export async function createCollabDriveFolder(
  name: string,
  scope: 'team' | 'personal',
  parentId: string | null,
): Promise<CollabDriveFolder> {
  const result = await requestJson<{ folder: CollabDriveFolder }>('/api/collab/drive/folders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, scope, parentId }),
  });
  return result.folder;
}

export async function uploadCollabDriveFile(
  file: File,
  scope: 'team' | 'personal',
  folderId: string | null,
): Promise<CollabDriveFile> {
  const body = new FormData();
  body.set('file', file);
  body.set('scope', scope);
  if (folderId) body.set('folderId', folderId);
  const response = await fetch(endpoint('/api/collab/drive/files'), {
    method: 'POST',
    headers: headers(),
    body,
  });
  const result = await response.json().catch(() => ({})) as { file?: CollabDriveFile; error?: string };
  if (!response.ok || !result.file) throw new Error(result.error || `Upload failed (${response.status})`);
  return result.file;
}

export async function deleteCollabDriveFile(id: string): Promise<void> {
  await requestJson(`/api/collab/drive/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function updateCollabDriveFile(
  id: string,
  update: { name?: string; folderId?: string | null },
): Promise<void> {
  await requestJson(`/api/collab/drive/files/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(update),
  });
}

export async function updateCollabDriveFolder(id: string, name: string): Promise<void> {
  await requestJson(`/api/collab/drive/folders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function deleteCollabDriveFolder(id: string): Promise<void> {
  await requestJson(`/api/collab/drive/folders/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function shareCollabDriveFileWithChat(
  id: string,
  roomId: string,
): Promise<{ downloadUrl: string }> {
  return requestJson(`/api/collab/drive/files/${encodeURIComponent(id)}/share`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roomId }),
  });
}

export async function saveCollabDriveFileToPersonal(
  id: string,
  roomId: string,
): Promise<{ alreadyInPersonalDrive: boolean }> {
  const result = await requestJson<{ alreadyInPersonalDrive?: boolean }>(
    `/api/collab/drive/files/${encodeURIComponent(id)}/save-personal`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId }),
    },
  );
  return { alreadyInPersonalDrive: result.alreadyInPersonalDrive === true };
}

export async function downloadCollabDriveFile(id: string, fileName: string, roomId?: string): Promise<void> {
  const blob = await getCollabDriveFileBlob(id, roomId);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export async function getCollabDriveFileBlob(id: string, roomId?: string): Promise<Blob> {
  const params = new URLSearchParams();
  if (roomId) params.set('roomId', roomId);
  const suffix = params.size ? `?${params}` : '';
  const response = await fetch(endpoint(`/api/collab/drive/files/${encodeURIComponent(id)}/download${suffix}`), {
    headers: headers(),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error || `Download failed (${response.status})`);
  }
  return response.blob();
}

export async function listCollabTasks(scope?: 'team' | 'personal'): Promise<CollabTask[]> {
  const params = new URLSearchParams();
  if (scope) params.set('scope', scope);
  const result = await requestJson<{ tasks?: CollabTask[] }>(
    `/api/collab/tasks${params.size ? `?${params}` : ''}`,
  );
  return result.tasks ?? [];
}

export async function createCollabTask(payload: {
  title: string;
  description: string;
  scope: 'team' | 'personal';
  assignee: string;
  dueAt: number | null;
}): Promise<CollabTask> {
  const result = await requestJson<{ task: CollabTask }>('/api/collab/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return result.task;
}

export async function setCollabTaskCompleted(id: string, completed: boolean): Promise<void> {
  await requestJson(`/api/collab/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ completed }),
  });
}

export async function deleteCollabTask(id: string): Promise<void> {
  await requestJson(`/api/collab/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export interface CollabNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  target_url: string;
  created_at: number;
  read_at: number | null;
}

export async function fetchCollabNotifications(): Promise<CollabNotification[]> {
  const result = await requestJson<{ notifications?: CollabNotification[] }>('/api/collab/notifications');
  return result.notifications ?? [];
}

export async function markCollabNotificationRead(id: string): Promise<void> {
  await requestJson('/api/collab/notifications/read', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
}

export async function createCollabMindmap(title: string): Promise<CollabDocument> {
  const result = await requestJson<{ document: CollabDocument }>('/api/collab/mindmaps', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return result.document;
}

export async function requestMindmapSocketTicket(
  documentId: string,
  signal?: AbortSignal,
): Promise<MindmapSocketTicket> {
  return requestJson<MindmapSocketTicket>('/api/collab/mindmaps/socket-ticket', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ documentId }),
    signal,
  });
}

export function mindmapSocketUrl(ticket: MindmapSocketTicket): string {
  const url = new URL(endpoint('/api/collab/mindmaps/socket'), window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('mindmapId', ticket.documentId);
  url.searchParams.set('ticket', ticket.ticket);
  return url.toString();
}

export async function renameCollabMindmap(documentId: string, title: string): Promise<string> {
  const result = await requestJson<{ title: string }>('/api/collab/mindmaps/rename', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ documentId, title }),
  });
  return result.title;
}

export async function fetchPinnedChatDocument(roomId: string): Promise<PinnedCollabDocument | null> {
  const result = await requestJson<{ pin: PinnedCollabDocument | null }>(
    `/api/chat/pinned-document?roomId=${encodeURIComponent(roomId)}`,
  );
  return result.pin ?? null;
}

export async function pinChatDocument(
  roomId: string,
  documentType: CollabDocumentType,
  documentId: string,
): Promise<PinnedCollabDocument> {
  const result = await requestJson<{ pin: PinnedCollabDocument }>('/api/chat/pinned-document', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roomId, documentType, documentId }),
  });
  return result.pin;
}

export async function unpinChatDocument(roomId: string): Promise<void> {
  await requestJson<{ pin: null }>('/api/chat/pinned-document', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roomId }),
  });
}

export async function setChatDocumentPermission(
  roomId: string,
  username: string,
  permission: CollabPermission,
): Promise<PinnedCollabDocument> {
  const result = await requestJson<{ pin: PinnedCollabDocument }>(
    '/api/chat/pinned-document/permissions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId, username, permission }),
    },
  );
  return result.pin;
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
}, signal?: AbortSignal): Promise<ChatSocketTicket> {
  return requestJson<ChatSocketTicket>('/api/chat/socket-ticket', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
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
  return uploadChatMedia(roomId, image, 'Photo.webp', kind);
}

export async function uploadChatMedia(
  roomId: string,
  media: Blob,
  fileName: string,
  kind: ChatMediaKind | 'media' = 'media',
): Promise<string> {
  const result = await requestJson<{ url: string }>('/api/chat/media?roomId=' + encodeURIComponent(roomId), {
    method: 'POST',
    headers: headers({
      'content-type': media.type || 'application/octet-stream',
      'x-chat-media-kind': kind,
      'x-chat-media-name': fileName,
    }),
    body: media,
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
