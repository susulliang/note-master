const RECENT_CHAT_PREFIX = 'econote:recent-chat-room:';
const RECENT_COLLAB_PREFIX = 'econote:recent-collab-resource:';
const COLLAB_TYPES = new Set([
  'sheet',
  'mindmap',
  'smartdoc',
  'smarttodo',
  'drive',
  'tasks',
]);

function userKey(username: string): string {
  return encodeURIComponent(username.trim().toLowerCase());
}

export function rememberRecentChatRoom(username: string, roomId: string): void {
  if (!username || !/^[A-Za-z0-9_-]{1,180}$/.test(roomId)) return;
  try {
    window.localStorage.setItem(`${RECENT_CHAT_PREFIX}${userKey(username)}`, roomId);
  } catch {
    /* URL state still works when local storage is unavailable. */
  }
}

export function readRecentChatRoom(username: string): string | null {
  if (!username) return null;
  try {
    const roomId = window.localStorage.getItem(`${RECENT_CHAT_PREFIX}${userKey(username)}`);
    return roomId && /^[A-Za-z0-9_-]{1,180}$/.test(roomId) ? roomId : null;
  } catch {
    return null;
  }
}

export function rememberRecentCollabResource(username: string, search: string): void {
  if (!username) return;
  const params = new URLSearchParams(search);
  const type = params.get('type') ?? '';
  const resourceId = params.get('document') ?? params.get('file') ?? params.get('task');
  if (!COLLAB_TYPES.has(type) || !resourceId || resourceId.length > 180) return;
  try {
    window.localStorage.setItem(
      `${RECENT_COLLAB_PREFIX}${userKey(username)}`,
      params.toString(),
    );
  } catch {
    /* URL state still works when local storage is unavailable. */
  }
}

export function readRecentCollabSearch(username: string): string {
  if (!username) return '';
  try {
    const raw = window.localStorage.getItem(`${RECENT_COLLAB_PREFIX}${userKey(username)}`);
    if (!raw) return '';
    const params = new URLSearchParams(raw);
    const type = params.get('type') ?? '';
    const resourceId = params.get('document') ?? params.get('file') ?? params.get('task');
    return COLLAB_TYPES.has(type) && !!resourceId && resourceId.length <= 180
      ? `?${params.toString()}`
      : '';
  } catch {
    return '';
  }
}
