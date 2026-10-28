import { getChatRoomMembers, isChatRoomMember } from './chat-access';
import {
  ensureCollabSchema,
  getCollabDocument,
  getCollabPermission,
  grantCollabPermission,
  listPinnedDocumentPermissions,
  type CollabDocumentType,
  type CollabPermission,
} from './collab-access';

interface ChatUser {
  username: string;
  canManageChatTitles?: boolean;
}

interface NewsRow {
  id: string;
  date: string;
  title: string;
  author: string;
  body: string;
  updatedAt: number;
}

interface ChatConversationRow {
  room_id: string;
  peer_username: string;
  last_message: string;
  updated_at: number;
  avatar_seed: number | null;
  avatar_rotation: number | null;
}

interface ChatMediaRow {
  id: string;
  room_id: string;
  object_key: string;
}

interface ChatProfileRow {
  username: string;
  avatar_seed: number;
  avatar_rotation: number;
}

interface GroupRow {
  room_id: string;
  name: string;
  last_message: string;
  updated_at: number;
  member_count: number;
}

const MAX_IMAGE_BYTES = 512 * 1024;
const MAX_STICKER_BYTES = 512 * 1024;
const MAX_JSON_BODY_BYTES = 8 * 1024;
const MEDIA_ID_RE = /^[0-9a-f-]{36}$/i;
const STICKER_ID_RE = /^[0-9a-f-]{36}$/i;

function chatJson(data: unknown, status = 200): Response {
  const response = Response.json(data, { status });
  response.headers.set('access-control-allow-origin', '*');
  response.headers.set(
    'access-control-allow-headers',
    'content-type, authorization, x-chat-media-kind, x-sticker-name, x-sticker-scope',
  );
  response.headers.set('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
  return response;
}

async function ensureChatSchema(env: Env): Promise<void> {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      username TEXT NOT NULL,
      room_id TEXT NOT NULL,
      peer_username TEXT NOT NULL,
      last_message TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (username, room_id)
    )
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS chat_conversations_updated_idx
    ON chat_conversations (username, updated_at DESC)
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS chat_media (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      owner TEXT NOT NULL,
      object_key TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'photo',
      created_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS chat_profiles (
      username TEXT PRIMARY KEY,
      avatar_seed INTEGER NOT NULL,
      avatar_rotation INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS chat_groups (
      room_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner TEXT NOT NULL,
      last_message TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS chat_group_members (
      room_id TEXT NOT NULL,
      username TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (room_id, username)
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS chat_sticker_shares (
      sticker_id TEXT NOT NULL,
      owner TEXT NOT NULL,
      room_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (sticker_id, owner, room_id, message_id)
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS chat_news_sync (
      room_id TEXT PRIMARY KEY,
      revision TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS chat_global_settings (
      room_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO chat_global_settings (room_id, title, updated_at)
     VALUES ('global', 'Ecovacs crew', ?)`,
  ).bind(Date.now()).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS chat_group_members_user_idx
    ON chat_group_members (username, joined_at DESC)
  `).run();
}

async function directRoomId(first: string, second: string): Promise<string> {
  const pair = [first.toLowerCase(), second.toLowerCase()].sort().join('\u0000');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pair));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `dm-${hex}`;
}

async function registerConversation(
  env: Env,
  roomId: string,
  first: string,
  second: string,
): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO chat_conversations (username, room_id, peer_username, last_message, updated_at)
       VALUES (?, ?, ?, '', ?)
       ON CONFLICT(username, room_id) DO UPDATE SET peer_username = excluded.peer_username`,
    ).bind(first, roomId, second, now),
    env.DB.prepare(
      `INSERT INTO chat_conversations (username, room_id, peer_username, last_message, updated_at)
       VALUES (?, ?, ?, '', ?)
       ON CONFLICT(username, room_id) DO UPDATE SET peer_username = excluded.peer_username`,
    ).bind(second, roomId, first, now),
  ]);
}

async function getOrCreateProfile(env: Env, username: string): Promise<{ seed: number; rotation: number }> {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO chat_profiles (username, avatar_seed, avatar_rotation, updated_at)
     VALUES (?, ?, 0, ?)`,
  ).bind(username, seed, Date.now()).run();
  const profile = await env.DB.prepare(
    'SELECT username, avatar_seed, avatar_rotation FROM chat_profiles WHERE username = ?',
  ).bind(username).first<ChatProfileRow>();
  return { seed: Number(profile?.avatar_seed ?? seed), rotation: Number(profile?.avatar_rotation ?? 0) };
}

async function handleProfileGet(env: Env, user: ChatUser): Promise<Response> {
  const profile = await getOrCreateProfile(env, user.username);
  return chatJson(profile);
}

async function handleProfileUpdate(request: Request, env: Env, user: ChatUser): Promise<Response> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_JSON_BODY_BYTES) {
    return chatJson({ error: 'Request is too large.' }, 413);
  }
  let payload: { rotation?: unknown };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return chatJson({ error: 'Invalid JSON body' }, 400);
  }
  if (!Number.isInteger(payload.rotation) || typeof payload.rotation !== 'number') {
    return chatJson({ error: 'Avatar rotation must be a number.' }, 400);
  }
  const rotation = ((Math.trunc(payload.rotation) % 360) + 360) % 360;
  const profile = await getOrCreateProfile(env, user.username);
  await env.DB.prepare(
    'UPDATE chat_profiles SET avatar_rotation = ?, updated_at = ? WHERE username = ?',
  ).bind(rotation, Date.now(), user.username).run();
  return chatJson({ ...profile, rotation });
}

async function handleUsers(request: Request, env: Env, user: ChatUser): Promise<Response> {
  const query = new URL(request.url).searchParams.get('q')?.trim().slice(0, 32) ?? '';
  const rows = await env.DB.prepare(
    `SELECT username FROM auth_users
     WHERE username != ?1 COLLATE NOCASE
       AND (?2 = '' OR username LIKE '%' || ?2 || '%' COLLATE NOCASE)
     ORDER BY username COLLATE NOCASE LIMIT 40`,
  ).bind(user.username, query).all<{ username: string }>();
  const users = await Promise.all((rows.results ?? []).map(async (person) => ({
    username: person.username,
    avatar: await getOrCreateProfile(env, person.username),
  })));
  return chatJson({ users });
}

async function handleConversations(env: Env, user: ChatUser): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT c.room_id, c.peer_username, c.last_message, c.updated_at,
            p.avatar_seed, p.avatar_rotation
     FROM chat_conversations c
     LEFT JOIN chat_profiles p ON p.username = c.peer_username
     WHERE c.username = ?
     ORDER BY c.updated_at DESC, c.peer_username COLLATE NOCASE`,
  ).bind(user.username).all<ChatConversationRow>();
  const groups = await env.DB.prepare(
    `SELECT g.room_id, g.name, g.last_message, g.updated_at,
            COUNT(all_members.username) AS member_count
     FROM chat_groups g
     JOIN chat_group_members mine ON mine.room_id = g.room_id AND mine.username = ?
     JOIN chat_group_members all_members ON all_members.room_id = g.room_id
     GROUP BY g.room_id
     ORDER BY g.updated_at DESC, g.name COLLATE NOCASE`,
  ).bind(user.username).all<GroupRow>();
  const directConversations = await Promise.all((result.results ?? []).map(async (row) => ({
    roomId: row.room_id,
    peerUsername: row.peer_username,
    title: row.peer_username,
    lastMessage: row.last_message,
    updatedAt: row.updated_at,
    kind: 'direct' as const,
    memberCount: 2,
    peerAvatar: row.avatar_seed === null
      ? await getOrCreateProfile(env, row.peer_username)
      : { seed: Number(row.avatar_seed), rotation: Number(row.avatar_rotation ?? 0) },
  })));
  const groupConversations = (groups.results ?? []).map((row) => ({
    roomId: row.room_id,
    title: row.name,
    lastMessage: row.last_message,
    updatedAt: row.updated_at,
    kind: 'group' as const,
    memberCount: Number(row.member_count),
  }));
  return chatJson({
    conversations: [...directConversations, ...groupConversations]
      .sort((a, b) => b.updatedAt - a.updatedAt),
  });
}

async function handleGlobalTitle(env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    'SELECT title FROM chat_global_settings WHERE room_id = ?',
  ).bind('global').first<{ title: string }>();
  return chatJson({ title: row?.title ?? 'Ecovacs crew' });
}

async function handleRoomTitleUpdate(
  request: Request,
  env: Env,
  user: ChatUser,
): Promise<Response> {
  if (!user.canManageChatTitles) return chatJson({ error: 'Admin access is required.' }, 403);
  if (Number(request.headers.get('content-length') ?? 0) > 2_048) {
    return chatJson({ error: 'Request is too large.' }, 413);
  }
  let payload: { roomId?: unknown; title?: unknown };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return chatJson({ error: 'Invalid JSON body.' }, 400);
  }
  if (typeof payload.roomId !== 'string' || typeof payload.title !== 'string') {
    return chatJson({ error: 'A chat room and title are required.' }, 400);
  }
  const title = payload.title.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!title) return chatJson({ error: 'A title cannot be empty.' }, 400);
  const roomId = payload.roomId;
  if (roomId === 'global') {
    await env.DB.prepare(
      `UPDATE chat_global_settings SET title = ?, updated_at = ? WHERE room_id = 'global'`,
    ).bind(title, Date.now()).run();
  } else if (/^group-[0-9a-f-]{36}$/.test(roomId)) {
    const result = await env.DB.prepare(
      'UPDATE chat_groups SET name = ?, updated_at = ? WHERE room_id = ?',
    ).bind(title, Date.now(), roomId).run();
    if (!result.meta.changes) return chatJson({ error: 'Group chat not found.' }, 404);
  } else {
    return chatJson({ error: 'Only group and global chat titles can be changed.' }, 400);
  }
  await env.CHAT_ROOM.getByName(roomId).broadcastRoomTitle(title);
  return chatJson({ roomId, title });
}

function isChatRoomId(roomId: string): boolean {
  return roomId === 'global'
    || /^dm-[0-9a-f]{64}$/.test(roomId)
    || /^group-[0-9a-f-]{36}$/.test(roomId);
}

async function revalidateCollabDocument(
  env: Env,
  type: CollabDocumentType,
  documentId: string,
): Promise<void> {
  try {
    if (type === 'sheet') {
      await env.SHEETS_ROOM.getByName(documentId).revalidatePermissions();
    } else {
      await env.MINDMAP_ROOM.getByName(documentId).revalidatePermissions();
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: 'collab_permission_revalidation_failed',
      type,
      documentId,
      error: String(error),
    }));
  }
}

async function readSmallJson(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_JSON_BODY_BYTES) return null;
  try {
    const payload: unknown = await request.json();
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function pinnedDocumentResponse(
  env: Env,
  user: ChatUser,
  roomId: string,
): Promise<Response> {
  if (!isChatRoomId(roomId) || !await isChatRoomMember(env, user.username, roomId)) {
    return chatJson({ error: 'You do not have access to this conversation.' }, 403);
  }
  const row = await env.DB.prepare(
    `SELECT document_type, document_id, pinned_by, pinned_at
     FROM chat_pinned_documents WHERE room_id = ?`,
  ).bind(roomId).first<{
    document_type: CollabDocumentType;
    document_id: string;
    pinned_by: string;
    pinned_at: number;
  }>();
  if (!row) return chatJson({ pin: null });
  const document = await getCollabDocument(env, row.document_type, row.document_id);
  if (!document) return chatJson({ pin: null });
  const permission = await getCollabPermission(env, user.username, document.type, document.id);
  if (!permission) return chatJson({ error: 'You do not have access to the pinned document.' }, 403);
  const members = await listPinnedDocumentPermissions(env, roomId, document, user.username);
  return chatJson({
    pin: {
      ...document,
      permission,
      pinnedBy: row.pinned_by,
      pinnedAt: row.pinned_at,
      members,
    },
  });
}

async function handlePinDocument(
  request: Request,
  env: Env,
  user: ChatUser,
): Promise<Response> {
  const payload = request.method === 'GET' ? null : await readSmallJson(request);
  const roomId = request.method === 'GET'
    ? new URL(request.url).searchParams.get('roomId') ?? ''
    : typeof payload?.roomId === 'string' ? payload.roomId : '';
  if (!roomId) {
    return chatJson({ error: 'A chat room is required.' }, 400);
  }
  if (!isChatRoomId(roomId) || !await isChatRoomMember(env, user.username, roomId)) {
    return chatJson({ error: 'You do not have access to this conversation.' }, 403);
  }

  if (request.method === 'GET') return pinnedDocumentResponse(env, user, roomId);

  if (request.method === 'DELETE') {
    const current = await env.DB.prepare(
      `SELECT document_type, document_id, pinned_by FROM chat_pinned_documents WHERE room_id = ?`,
    ).bind(roomId).first<{
      document_type: CollabDocumentType;
      document_id: string;
      pinned_by: string;
    }>();
    if (!current) return chatJson({ pin: null });
    const document = await getCollabDocument(env, current.document_type, current.document_id);
    if (
      current.pinned_by.toLowerCase() !== user.username.toLowerCase() &&
      document?.owner.toLowerCase() !== user.username.toLowerCase() &&
      !user.canManageChatTitles
    ) return chatJson({ error: 'Only the person who pinned this document or its owner can unpin it.' }, 403);
    await env.DB.prepare('DELETE FROM chat_pinned_documents WHERE room_id = ?').bind(roomId).run();
    await revalidateCollabDocument(env, current.document_type, current.document_id);
    await env.CHAT_ROOM.getByName(roomId).broadcastPinnedDocument();
    return chatJson({ pin: null });
  }

  if (request.method !== 'POST') return chatJson({ error: 'Method not allowed.' }, 405);
  const type = payload.documentType;
  const id = typeof payload.documentId === 'string' ? payload.documentId : '';
  if ((type !== 'sheet' && type !== 'mindmap') || !/^[0-9a-f-]{36}$/i.test(id)) {
    return chatJson({ error: 'Choose a valid Collab Space document.' }, 400);
  }
  const document = await getCollabDocument(env, type, id);
  if (!document) return chatJson({ error: 'That document no longer exists.' }, 404);
  const permission = await getCollabPermission(env, user.username, type, id);
  if (!permission) return chatJson({ error: 'You do not have access to that document.' }, 403);
  if (permission !== 'edit') {
    return chatJson({ error: 'You need edit access to pin or share this document.' }, 403);
  }
  const current = await env.DB.prepare(
    'SELECT document_type, document_id, pinned_by FROM chat_pinned_documents WHERE room_id = ?',
  ).bind(roomId).first<{
    document_type: CollabDocumentType;
    document_id: string;
    pinned_by: string;
  }>();
  if (current?.document_type === type && current.document_id === id) {
    return pinnedDocumentResponse(env, user, roomId);
  }
  if (current) {
    const currentDocument = await getCollabDocument(env, current.document_type, current.document_id);
    if (
      current.pinned_by.toLowerCase() !== user.username.toLowerCase() &&
      currentDocument?.owner.toLowerCase() !== user.username.toLowerCase() &&
      !user.canManageChatTitles
    ) return chatJson({ error: 'Only the person who pinned this document or its owner can replace it.' }, 403);
  }
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO chat_pinned_documents (room_id, document_type, document_id, pinned_by, pinned_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(room_id) DO UPDATE SET document_type = excluded.document_type,
       document_id = excluded.document_id, pinned_by = excluded.pinned_by, pinned_at = excluded.pinned_at`,
  ).bind(roomId, type, id, user.username, now).run();
  if (current) await revalidateCollabDocument(env, current.document_type, current.document_id);
  await revalidateCollabDocument(env, type, id);
  await env.CHAT_ROOM.getByName(roomId).broadcastPinnedDocument();
  return pinnedDocumentResponse(env, user, roomId);
}

async function updatePinnedDocumentPermission(
  request: Request,
  env: Env,
  user: ChatUser,
): Promise<Response> {
  const payload = await readSmallJson(request);
  if (
    !payload ||
    typeof payload.roomId !== 'string' ||
    typeof payload.username !== 'string' ||
    (payload.permission !== 'view' && payload.permission !== 'edit')
  ) return chatJson({ error: 'Choose a chat member and a view or edit permission.' }, 400);
  const { roomId } = payload;
  const targetUsername = payload.username.trim();
  if (!isChatRoomId(roomId) || !await isChatRoomMember(env, user.username, roomId)) {
    return chatJson({ error: 'You do not have access to this conversation.' }, 403);
  }
  if (roomId !== 'global') {
    const roomMembers = await getChatRoomMembers(env, roomId);
    if (!roomMembers.some((member) => member.toLowerCase() === targetUsername.toLowerCase())) {
      return chatJson({ error: 'Choose someone who belongs to this chat.' }, 404);
    }
  } else {
    const target = await env.DB.prepare(
      'SELECT username FROM auth_users WHERE username = ? COLLATE NOCASE',
    ).bind(targetUsername).first<{ username: string }>();
    if (!target) return chatJson({ error: 'That registered user could not be found.' }, 404);
  }
  const pin = await env.DB.prepare(
    `SELECT document_type, document_id FROM chat_pinned_documents WHERE room_id = ?`,
  ).bind(roomId).first<{ document_type: CollabDocumentType; document_id: string }>();
  if (!pin) return chatJson({ error: 'This chat has no pinned document.' }, 404);
  const document = await getCollabDocument(env, pin.document_type, pin.document_id);
  if (!document) return chatJson({ error: 'The pinned document no longer exists.' }, 404);
  if (document.owner.toLowerCase() !== user.username.toLowerCase()) {
    return chatJson({ error: 'Only the document owner can change access privileges.' }, 403);
  }
  if (document.owner.toLowerCase() === targetUsername.toLowerCase()) {
    return chatJson({ error: 'The document owner always keeps edit access.' }, 400);
  }
  const target = await env.DB.prepare(
    'SELECT username FROM auth_users WHERE username = ? COLLATE NOCASE',
  ).bind(targetUsername).first<{ username: string }>();
  if (!target) return chatJson({ error: 'That registered user could not be found.' }, 404);
  await grantCollabPermission(
    env,
    document.type,
    document.id,
    target.username,
    payload.permission as CollabPermission,
  );
  await revalidateCollabDocument(env, document.type, document.id);
  await env.CHAT_ROOM.getByName(roomId).broadcastPinnedDocument();
  return pinnedDocumentResponse(env, user, roomId);
}

async function handleCreateGroup(request: Request, env: Env, user: ChatUser): Promise<Response> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_JSON_BODY_BYTES) {
    return chatJson({ error: 'Request is too large.' }, 413);
  }
  let payload: { name?: unknown; usernames?: unknown };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return chatJson({ error: 'Invalid JSON body' }, 400);
  }
  const name = typeof payload.name === 'string' ? payload.name.trim().slice(0, 60) : '';
  if (!name) return chatJson({ error: 'Add a name for the group.' }, 400);
  if (
    !Array.isArray(payload.usernames) ||
    payload.usernames.length > 49 ||
    payload.usernames.some((value) => typeof value !== 'string')
  ) {
    return chatJson({ error: 'Choose up to 49 registered people.' }, 400);
  }
  const requested = [...new Set(
    [user.username, ...payload.usernames as string[]]
      .map((username) => username.trim().toLowerCase())
      .filter(Boolean),
  )];
  if (requested.length < 2) return chatJson({ error: 'A group needs at least one other person.' }, 400);
  const placeholders = requested.map(() => '?').join(', ');
  const result = await env.DB.prepare(
    `SELECT username FROM auth_users WHERE lower(username) IN (${placeholders})`,
  ).bind(...requested).all<{ username: string }>();
  const canonicalUsers = result.results ?? [];
  if (canonicalUsers.length !== requested.length) {
    return chatJson({ error: 'One or more selected accounts no longer exist.' }, 404);
  }

  const roomId = `group-${crypto.randomUUID()}`;
  const now = Date.now();
  const statements = [
    env.DB.prepare(
      `INSERT INTO chat_groups (room_id, name, owner, last_message, created_at, updated_at)
       VALUES (?, ?, ?, '', ?, ?)`,
    ).bind(roomId, name, user.username, now, now),
    ...canonicalUsers.map((person) => env.DB.prepare(
      'INSERT INTO chat_group_members (room_id, username, joined_at) VALUES (?, ?, ?)',
    ).bind(roomId, person.username, now)),
  ];
  await env.DB.batch(statements);
  await Promise.all(canonicalUsers.map((person) => getOrCreateProfile(env, person.username)))
    .catch((error: unknown) => {
      console.error(JSON.stringify({ event: 'chat_group_profile_seed_failed', roomId, error: String(error) }));
    });
  return chatJson({ roomId, title: name, memberCount: canonicalUsers.length }, 201);
}

async function handleSocketTicket(request: Request, env: Env, user: ChatUser): Promise<Response> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_JSON_BODY_BYTES) {
    return chatJson({ error: 'Request is too large.' }, 413);
  }
  let payload: { roomId?: unknown; peerUsername?: unknown };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return chatJson({ error: 'Invalid JSON body' }, 400);
  }

  let roomId = '';
  if (payload.roomId === 'global') {
    roomId = 'global';
  } else if (typeof payload.peerUsername === 'string') {
    const requestedPeer = payload.peerUsername.trim();
    const peer = await env.DB.prepare(
      'SELECT username FROM auth_users WHERE username = ? COLLATE NOCASE',
    ).bind(requestedPeer).first<{ username: string }>();
    if (!peer) return chatJson({ error: 'That registered user could not be found.' }, 404);
    if (peer.username.toLowerCase() === user.username.toLowerCase()) {
      return chatJson({ error: 'Choose another user to start a direct chat.' }, 400);
    }
    roomId = await directRoomId(user.username, peer.username);
    await registerConversation(env, roomId, user.username, peer.username);
  } else if (
    typeof payload.roomId === 'string' &&
    (/^dm-[0-9a-f]{64}$/.test(payload.roomId) || /^group-[0-9a-f-]{36}$/.test(payload.roomId))
  ) {
    roomId = payload.roomId;
    if (!await isChatRoomMember(env, user.username, roomId)) {
      return chatJson({ error: 'You do not have access to this conversation.' }, 403);
    }
  } else {
    return chatJson({ error: 'Choose a valid chat room.' }, 400);
  }

  const room = env.CHAT_ROOM.getByName(roomId);
  let freshMessages: Array<unknown> = [];
  if (roomId === 'global') {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS news_entries (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        title TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL DEFAULT 0
      )
    `).run();
    const stats = await env.DB.prepare(
      'SELECT COUNT(*) AS count, COALESCE(MAX(updated_at), 0) AS latest FROM news_entries',
    ).first<{ count: number; latest: number }>();
    const revision = `${stats?.count ?? 0}:${stats?.latest ?? 0}`;
    const synced = await env.DB.prepare(
      'SELECT revision FROM chat_news_sync WHERE room_id = ?',
    ).bind('global').first<{ revision: string }>();
    if (synced?.revision !== revision) {
      const news = await env.DB.prepare(
        `SELECT id, date, title, author, body, updated_at AS updatedAt
         FROM news_entries ORDER BY date DESC, id DESC`,
      ).all<NewsRow>();
      freshMessages = await room.seedNews(news.results ?? []);
      await env.DB.prepare(
        `INSERT INTO chat_news_sync (room_id, revision, updated_at) VALUES ('global', ?, ?)
         ON CONFLICT(room_id) DO UPDATE SET revision = excluded.revision, updated_at = excluded.updated_at`,
      ).bind(revision, Date.now()).run();
    }
  }
  const profile = await getOrCreateProfile(env, user.username);
  const ticket = await room.createTicket(user.username, profile);
  return chatJson({ roomId, ticket, freshMessages });
}

async function readLimitedBody(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function handleMediaUpload(
  request: Request,
  env: Env,
  user: ChatUser,
): Promise<Response> {
  const roomId = new URL(request.url).searchParams.get('roomId') ?? '';
  const requestedKind = request.headers.get('x-chat-media-kind') ?? 'photo';
  const mediaKind = requestedKind === 'sticker' ? 'sticker' : 'photo';
  if (!roomId || !await isChatRoomMember(env, user.username, roomId)) {
    return chatJson({ error: 'You do not have access to this chat.' }, 403);
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'image/webp') {
    return chatJson({ error: 'Chat photos must be compressed as WebP.' }, 415);
  }
  const declaredSize = Number(request.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_IMAGE_BYTES) return chatJson({ error: 'Each photo must be 512 KB or smaller.' }, 413);
  const image = await readLimitedBody(request, MAX_IMAGE_BYTES);
  if (!image || image.byteLength < 16) return chatJson({ error: 'The uploaded photo is empty or exceeds 512 KB.' }, 413);
  const signature = new TextDecoder().decode(image.subarray(0, 4));
  const format = new TextDecoder().decode(image.subarray(8, 12));
  if (signature !== 'RIFF' || format !== 'WEBP') {
    return chatJson({ error: 'The uploaded file is not a valid WebP image.' }, 415);
  }

  const id = crypto.randomUUID();
  const objectKey = `chat-media/${id}.webp`;
  try {
    await env.CHAT_MEDIA_BUCKET.put(objectKey, image, {
      httpMetadata: { contentType: 'image/webp', cacheControl: 'private, max-age=300' },
      customMetadata: { roomId, owner: user.username },
    });
    await env.DB.prepare(
      'INSERT INTO chat_media (id, room_id, owner, object_key, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(id, roomId, user.username, objectKey, mediaKind, Date.now()).run();
  } catch (error) {
    await env.CHAT_MEDIA_BUCKET.delete(objectKey).catch(() => undefined);
    console.error(JSON.stringify({ event: 'chat_media_upload_failed', error: String(error) }));
    return chatJson({ error: 'Could not save the photo.' }, 500);
  }
  return chatJson({ id, url: `/api/chat/media/${id}` }, 201);
}

async function handleMediaGet(
  request: Request,
  env: Env,
  user: ChatUser,
  id: string,
): Promise<Response> {
  if (!MEDIA_ID_RE.test(id)) return chatJson({ error: 'Photo not found.' }, 404);
  const media = await env.DB.prepare(
    'SELECT id, room_id, object_key FROM chat_media WHERE id = ?',
  ).bind(id).first<ChatMediaRow>();
  if (!media || !await isChatRoomMember(env, user.username, media.room_id)) {
    return chatJson({ error: 'Photo not found.' }, 404);
  }
  const object = await env.CHAT_MEDIA_BUCKET.get(media.object_key);
  if (!object) return chatJson({ error: 'Photo not found.' }, 404);
  const headers = new Headers({
    'content-type': 'image/webp',
    'cache-control': 'private, max-age=300',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': '*',
  });
  if (object.size) headers.set('content-length', String(object.size));
  return new Response(object.body, { headers });
}

function stickerPackName(user: ChatUser, scope: 'public' | 'private'): string {
  return scope === 'public' ? 'public' : `private-${encodeURIComponent(user.username.toLowerCase())}`;
}

async function handleStickerList(env: Env, user: ChatUser): Promise<Response> {
  const [publicStickers, privateStickers] = await Promise.all([
    env.CHAT_STICKER_PACK.getByName('public').listStickers(),
    env.CHAT_STICKER_PACK.getByName(stickerPackName(user, 'private')).listStickers(),
  ]);
  return chatJson({
    stickers: [
      ...publicStickers.map((sticker) => ({ ...sticker, scope: 'public' as const })),
      ...privateStickers.map((sticker) => ({ ...sticker, scope: 'private' as const })),
    ],
  });
}

async function handleStickerUpload(
  request: Request,
  env: Env,
  user: ChatUser,
): Promise<Response> {
  const scopeValue = request.headers.get('x-sticker-scope');
  if (scopeValue !== 'public' && scopeValue !== 'private') {
    return chatJson({ error: 'Choose the public pack or your private pack.' }, 400);
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'image/png') {
    return chatJson({ error: 'Stickers must be PNG images.' }, 415);
  }
  const declaredSize = Number(request.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_STICKER_BYTES) return chatJson({ error: 'Stickers must be 512 KB or smaller.' }, 413);
  const image = await readLimitedBody(request, MAX_STICKER_BYTES);
  if (!image || image.byteLength < 24) return chatJson({ error: 'Sticker image is empty or exceeds 512 KB.' }, 413);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((byte, index) => image[index] !== byte)) {
    return chatJson({ error: 'The uploaded sticker is not a PNG image.' }, 415);
  }
  const dimensions = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const width = dimensions.getUint32(16, false);
  const height = dimensions.getUint32(20, false);
  if (width < 1 || height < 1 || width > 256 || height > 256) {
    return chatJson({ error: 'Stickers must fit within 256 × 256 pixels.' }, 413);
  }
  const rawName = request.headers.get('x-sticker-name')?.trim() ?? '';
  const name = rawName.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 40) || 'Sticker';
  const id = crypto.randomUUID();
  const png = image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength) as ArrayBuffer;
  const sticker = await env.CHAT_STICKER_PACK
    .getByName(stickerPackName(user, scopeValue))
    .addSticker(id, user.username, name, png);
  return chatJson({ ...sticker, scope: scopeValue }, 201);
}

async function handleStickerGet(
  env: Env,
  user: ChatUser,
  scope: string,
  id: string,
): Promise<Response> {
  if ((scope !== 'public' && scope !== 'private') || !STICKER_ID_RE.test(id)) {
    return chatJson({ error: 'Sticker not found.' }, 404);
  }
  const sticker = await env.CHAT_STICKER_PACK
    .getByName(stickerPackName(user, scope))
    .getSticker(id);
  let image = sticker;
  if (!image && scope === 'private') {
    const shares = await env.DB.prepare(
      `SELECT s.owner
       FROM chat_sticker_shares s
       LEFT JOIN chat_conversations d ON d.room_id = s.room_id AND d.username = ?
       LEFT JOIN chat_group_members g ON g.room_id = s.room_id AND g.username = ?
       WHERE s.sticker_id = ?
         AND (s.room_id = 'global' OR d.username IS NOT NULL OR g.username IS NOT NULL)
       LIMIT 1`,
    ).bind(user.username, user.username, id).first<{ owner: string }>();
    if (shares) {
      image = await env.CHAT_STICKER_PACK
        .getByName(stickerPackName({ username: shares.owner }, 'private'))
        .getSticker(id);
    }
  }
  if (!image) return chatJson({ error: 'Sticker not found.' }, 404);
  return new Response(image.png, {
    headers: {
      'content-type': 'image/png',
      'cache-control': scope === 'public' ? 'private, max-age=300' : 'private, max-age=60',
      'x-content-type-options': 'nosniff',
      'access-control-allow-origin': '*',
    },
  });
}

export async function handleChatApi(
  request: Request,
  env: Env,
  user: ChatUser,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, authorization, x-chat-media-kind, x-sticker-name, x-sticker-scope',
        'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
      },
    });
  }
  await ensureChatSchema(env);

  if (
    url.pathname === '/api/chat/pinned-document' ||
    url.pathname === '/api/chat/pinned-document/permissions'
  ) {
    await ensureCollabSchema(env);
    if (url.pathname.endsWith('/permissions') && request.method === 'POST') {
      return updatePinnedDocumentPermission(request, env, user);
    }
    return handlePinDocument(request, env, user);
  }
  if (url.pathname === '/api/chat/users' && request.method === 'GET') {
    return handleUsers(request, env, user);
  }
  if (url.pathname === '/api/chat/conversations' && request.method === 'GET') {
    return handleConversations(env, user);
  }
  if (url.pathname === '/api/chat/global-title' && request.method === 'GET') {
    return handleGlobalTitle(env);
  }
  if (url.pathname === '/api/chat/admin/room-title' && request.method === 'POST') {
    return handleRoomTitleUpdate(request, env, user);
  }
  if (url.pathname === '/api/chat/profile' && request.method === 'GET') {
    return handleProfileGet(env, user);
  }
  if (url.pathname === '/api/chat/profile' && request.method === 'POST') {
    return handleProfileUpdate(request, env, user);
  }
  if (url.pathname === '/api/chat/groups' && request.method === 'POST') {
    return handleCreateGroup(request, env, user);
  }
  if (url.pathname === '/api/chat/socket-ticket' && request.method === 'POST') {
    return handleSocketTicket(request, env, user);
  }
  if (url.pathname === '/api/chat/media' && request.method === 'POST') {
    return handleMediaUpload(request, env, user);
  }
  if (url.pathname === '/api/chat/stickers' && request.method === 'GET') {
    return handleStickerList(env, user);
  }
  if (url.pathname === '/api/chat/stickers' && request.method === 'POST') {
    return handleStickerUpload(request, env, user);
  }
  const mediaMatch = /^\/api\/chat\/media\/([^/]+)$/.exec(url.pathname);
  if (mediaMatch && request.method === 'GET') {
    return handleMediaGet(request, env, user, mediaMatch[1]);
  }
  const stickerMatch = /^\/api\/chat\/stickers\/(public|private)\/([^/]+)$/.exec(url.pathname);
  if (stickerMatch && request.method === 'GET') {
    return handleStickerGet(env, user, stickerMatch[1], stickerMatch[2]);
  }
  return chatJson({ error: 'Not found' }, 404);
}
