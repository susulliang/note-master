import { getChatRoomMembers, isChatRoomMember } from './chat-access';

export type CollabDocumentType = 'sheet' | 'mindmap';
export type CollabPermission = 'view' | 'edit';

export interface CollabDocumentRecord {
  id: string;
  type: CollabDocumentType;
  title: string;
  owner: string;
  createdAt: number;
  updatedAt: number;
}

export async function ensureCollabSchema(env: Env): Promise<void> {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS collaborative_sheets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      owner TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS collaborative_sheet_members (
      sheet_id TEXT NOT NULL,
      username TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (sheet_id, username)
    )
  `).run();
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
    CREATE TABLE IF NOT EXISTS chat_group_members (
      room_id TEXT NOT NULL,
      username TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (room_id, username)
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS collab_document_permissions (
      document_type TEXT NOT NULL,
      document_id TEXT NOT NULL,
      username TEXT NOT NULL,
      permission TEXT NOT NULL CHECK (permission IN ('view', 'edit')),
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (document_type, document_id, username)
    )
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS collab_document_permissions_user_idx
    ON collab_document_permissions (username, updated_at DESC)
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS collab_mindmaps (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      owner TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS collab_smartdocs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      owner TEXT NOT NULL,
      banner_asset_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS collab_smartdoc_media (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      object_key TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS collab_smartdoc_media_document_idx
    ON collab_smartdoc_media (document_id, created_at DESC)
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS collab_smartdoc_drive_assets (
      document_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      added_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (document_id, file_id)
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS chat_pinned_documents (
      room_id TEXT PRIMARY KEY,
      document_type TEXT NOT NULL CHECK (document_type IN ('sheet', 'mindmap')),
      document_id TEXT NOT NULL,
      pinned_by TEXT NOT NULL,
      pinned_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS collab_drive_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('team', 'personal')),
      owner TEXT NOT NULL,
      parent_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS collab_drive_files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('team', 'personal')),
      owner TEXT NOT NULL,
      folder_id TEXT,
      object_key TEXT NOT NULL,
      text_index TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS collab_drive_upload_reservations (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS collab_drive_files_owner_idx
    ON collab_drive_files (scope, owner COLLATE NOCASE)
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS collab_drive_upload_reservations_user_idx
    ON collab_drive_upload_reservations (username, created_at)
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS collab_drive_file_shares (
      file_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      shared_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (file_id, room_id)
    )
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS collab_drive_file_shares_room_idx
    ON collab_drive_file_shares (room_id, file_id)
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS collab_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL CHECK (scope IN ('personal', 'team')),
      owner TEXT NOT NULL,
      assignee TEXT NOT NULL,
      due_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS collab_task_mentions (
      task_id TEXT NOT NULL,
      username TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (task_id, username)
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS collab_notifications (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      target_url TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER
    )
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS collab_notifications_user_idx
    ON collab_notifications (username, read_at, created_at DESC)
  `).run();
}

export async function getCollabDocument(
  env: Env,
  type: CollabDocumentType,
  id: string,
): Promise<CollabDocumentRecord | null> {
  if (type === 'sheet') {
    const row = await env.DB.prepare(
      'SELECT id, title, owner, created_at, updated_at FROM collaborative_sheets WHERE id = ?',
    ).bind(id).first<{ id: string; title: string; owner: string; created_at: number; updated_at: number }>();
    return row ? {
      id: row.id,
      type,
      title: row.title,
      owner: row.owner,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } : null;
  }
  const row = await env.DB.prepare(
    'SELECT id, title, owner, created_at, updated_at FROM collab_mindmaps WHERE id = ?',
  ).bind(id).first<{ id: string; title: string; owner: string; created_at: number; updated_at: number }>();
  return row ? {
    id: row.id,
    type,
    title: row.title,
    owner: row.owner,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } : null;
}

export async function getCollabPermission(
  env: Env,
  username: string,
  type: CollabDocumentType,
  id: string,
): Promise<CollabPermission | null> {
  const document = await getCollabDocument(env, type, id);
  if (!document) return null;
  if (document.owner.toLowerCase() === username.toLowerCase()) return 'edit';
  const explicit = await env.DB.prepare(
    `SELECT permission FROM collab_document_permissions
     WHERE document_type = ? AND document_id = ? AND username = ? COLLATE NOCASE`,
  ).bind(type, id, username).first<{ permission: CollabPermission }>();
  if (explicit?.permission === 'view' || explicit?.permission === 'edit') return explicit.permission;

  if (type === 'sheet') {
    const legacyMember = await env.DB.prepare(
      `SELECT 1 AS found FROM collaborative_sheet_members
       WHERE sheet_id = ? AND username = ? COLLATE NOCASE LIMIT 1`,
    ).bind(id, username).first<{ found: number }>();
    if (legacyMember) return 'edit';
  }

  const pins = await env.DB.prepare(
    `SELECT room_id FROM chat_pinned_documents
     WHERE document_type = ? AND document_id = ?`,
  ).bind(type, id).all<{ room_id: string }>();
  for (const pin of pins.results ?? []) {
    if (await isChatRoomMember(env, username, pin.room_id)) return 'view';
  }
  return null;
}

export async function grantCollabPermission(
  env: Env,
  type: CollabDocumentType,
  id: string,
  username: string,
  permission: CollabPermission,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO collab_document_permissions
     (document_type, document_id, username, permission, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(document_type, document_id, username)
     DO UPDATE SET permission = excluded.permission, updated_at = excluded.updated_at`,
  ).bind(type, id, username, permission, Date.now()).run();
}

export async function getSmartDocPermission(
  env: Env,
  username: string,
  id: string,
): Promise<CollabPermission | null> {
  const document = await env.DB.prepare(
    'SELECT owner FROM collab_smartdocs WHERE id = ?',
  ).bind(id).first<{ owner: string }>();
  if (!document) return null;
  if (document.owner.toLowerCase() === username.toLowerCase()) return 'edit';
  const explicit = await env.DB.prepare(
    `SELECT permission FROM collab_document_permissions
     WHERE document_type = 'smartdoc' AND document_id = ? AND username = ? COLLATE NOCASE`,
  ).bind(id, username).first<{ permission: CollabPermission }>();
  return explicit?.permission === 'view' || explicit?.permission === 'edit'
    ? explicit.permission
    : null;
}

export async function grantSmartDocPermission(
  env: Env,
  id: string,
  username: string,
  permission: CollabPermission,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO collab_document_permissions
     (document_type, document_id, username, permission, updated_at)
     VALUES ('smartdoc', ?, ?, ?, ?)
     ON CONFLICT(document_type, document_id, username)
     DO UPDATE SET permission = excluded.permission, updated_at = excluded.updated_at`,
  ).bind(id, username, permission, Date.now()).run();
}

export async function listPinnedDocumentPermissions(
  env: Env,
  roomId: string,
  document: CollabDocumentRecord,
  currentUsername: string,
): Promise<Array<{ username: string; permission: CollabPermission; owner: boolean }>> {
  const roomMembers = await getChatRoomMembers(env, roomId);
  const explicit = await env.DB.prepare(
    `SELECT username, permission FROM collab_document_permissions
     WHERE document_type = ? AND document_id = ?`,
  ).bind(document.type, document.id).all<{ username: string; permission: CollabPermission }>();
  const byUsername = new Map<string, CollabPermission>();
  const displayNames = new Map<string, string>();
  displayNames.set(document.owner.toLowerCase(), document.owner);
  displayNames.set(currentUsername.toLowerCase(), currentUsername);
  for (const row of explicit.results ?? []) {
    byUsername.set(row.username.toLowerCase(), row.permission);
    displayNames.set(row.username.toLowerCase(), row.username);
  }
  if (document.type === 'sheet') {
    const legacyMembers = await env.DB.prepare(
      'SELECT username FROM collaborative_sheet_members WHERE sheet_id = ?',
    ).bind(document.id).all<{ username: string }>();
    for (const member of legacyMembers.results ?? []) {
      if (!byUsername.has(member.username.toLowerCase())) {
        byUsername.set(member.username.toLowerCase(), 'edit');
      }
      displayNames.set(member.username.toLowerCase(), member.username);
    }
  }
  byUsername.set(document.owner.toLowerCase(), 'edit');
  if (document.owner.toLowerCase() === currentUsername.toLowerCase()) {
    byUsername.set(currentUsername.toLowerCase(), 'edit');
  }
  const usernames = roomId === 'global'
    ? [...byUsername.keys()].map((key) => displayNames.get(key) ?? key)
    : [...new Set([...roomMembers, document.owner])];
  return usernames.map((username) => {
    const key = username.toLowerCase();
    const isOwner = document.owner.toLowerCase() === key;
    return {
      username,
      permission: isOwner ? 'edit' : byUsername.get(key) ?? 'view',
      owner: isOwner,
    };
  }).sort((a, b) => (
    Number(b.owner) - Number(a.owner) || a.username.localeCompare(b.username)
  ));
}
