import { isChatRoomMember } from './chat-access';
import {
  ensureCollabSchema,
  getCollabDocument,
  getCollabPermission,
  grantCollabPermission,
} from './collab-access';

interface CollabDocumentRow {
  id: string;
  title: string;
  owner: string;
  created_at: number;
  updated_at: number;
  visibility?: 'private' | 'registered';
}

const MAX_BODY_BYTES = 8 * 1024;
const MAX_DRIVE_FILE_BYTES = 50 * 1024 * 1024;
const MAX_PERSONAL_DRIVE_BYTES = 100 * 1024 * 1024;
const DRIVE_RESERVATION_MAX_AGE = 24 * 60 * 60 * 1000;
const DOCUMENT_ID_RE = /^[0-9a-f-]{36}$/i;

function collabJson(data: unknown, status = 200): Response {
  const response = Response.json(data, { status });
  response.headers.set('access-control-allow-origin', '*');
  response.headers.set('access-control-allow-headers', 'content-type, authorization');
  response.headers.set('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  return response;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function spreadsheetColumnLabel(value: number): string {
  let column = value;
  let label = '';
  while (column > 0) {
    const remainder = (column - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    column = Math.floor((column - 1) / 26);
  }
  return label;
}

function taskMentionNames(text: string): string[] {
  return [...new Set(
    Array.from(text.matchAll(/(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_.-]{1,32})/g), (match) => match[1].toLowerCase()),
  )].slice(0, 40);
}

function isValidChatRoomId(roomId: string): boolean {
  return roomId === 'global'
    || /^dm-[0-9a-f]{64}$/i.test(roomId)
    || /^group-[0-9a-f-]{36}$/i.test(roomId);
}

async function resolveMentionedUsers(env: Env, text: string): Promise<string[]> {
  const names = taskMentionNames(text);
  if (!names.length) return [];
  const placeholders = names.map(() => '?').join(', ');
  const rows = await env.DB.prepare(
    `SELECT username FROM auth_users WHERE lower(username) IN (${placeholders})`,
  ).bind(...names).all<{ username: string }>();
  return (rows.results ?? []).map((row) => row.username);
}

async function listDrive(env: Env, username: string, url: URL): Promise<Response> {
  const scope = url.searchParams.get('scope') === 'personal' ? 'personal' : 'team';
  const folderId = url.searchParams.get('folderId') || null;
  const allFiles = url.searchParams.get('all') === '1';
  const isChatPicker = url.searchParams.get('chat') === '1';
  const chatRoomId = isChatPicker
    ? url.searchParams.get('roomId') ?? ''
    : '';
  if (isChatPicker && (
    !isValidChatRoomId(chatRoomId) ||
    !await isChatRoomMember(env, username, chatRoomId)
  )) {
    return collabJson({ error: 'You do not have access to this conversation.' }, 403);
  }
  if (folderId && !DOCUMENT_ID_RE.test(folderId)) {
    return collabJson({ error: 'That folder is invalid.' }, 400);
  }
  const ownerFilter = scope === 'personal' ? 'AND owner = ? COLLATE NOCASE' : '';
  const bind = scope === 'personal'
    ? [scope, folderId, username]
    : [scope, folderId];
  const fileQuery = allFiles
    ? `SELECT id, name, mime_type, size_bytes, scope, owner, folder_id, created_at, updated_at
       FROM collab_drive_files WHERE scope = ? ${scope === 'personal' ? 'AND owner = ? COLLATE NOCASE' : ''}
       ORDER BY name COLLATE NOCASE LIMIT 1000`
    : `SELECT id, name, mime_type, size_bytes, scope, owner, folder_id, created_at, updated_at
       FROM collab_drive_files WHERE scope = ? AND folder_id IS ? ${ownerFilter}
       ORDER BY name COLLATE NOCASE LIMIT 500`;
  const fileBind = allFiles
    ? scope === 'personal' ? [scope, username] : [scope]
    : bind;
  if (scope === 'personal') {
    await env.DB.prepare(
      'DELETE FROM collab_drive_upload_reservations WHERE username = ? COLLATE NOCASE AND created_at < ?',
    ).bind(username, Date.now() - DRIVE_RESERVATION_MAX_AGE).run();
  }
  const [folders, files, usage] = await Promise.all([
    env.DB.prepare(
      `SELECT id, name, scope, owner, parent_id, created_at, updated_at
       FROM collab_drive_folders WHERE scope = ? AND parent_id IS ? ${ownerFilter}
       ORDER BY name COLLATE NOCASE LIMIT 300`,
    ).bind(...bind).all(),
    env.DB.prepare(fileQuery).bind(...fileBind).all(),
    scope === 'personal'
      ? env.DB.prepare(`
          SELECT
            COALESCE((SELECT SUM(size_bytes) FROM collab_drive_files
              WHERE scope = 'personal' AND owner = ? COLLATE NOCASE), 0)
            + COALESCE((SELECT SUM(size_bytes) FROM collab_drive_upload_reservations
              WHERE username = ? COLLATE NOCASE), 0) AS used_bytes
        `).bind(username, username).first<{ used_bytes: number }>()
      : Promise.resolve(null),
  ]);
  return collabJson({
    scope,
    folderId,
    folders: folders.results ?? [],
    files: files.results ?? [],
    usage: scope === 'personal'
      ? { usedBytes: usage?.used_bytes ?? 0, limitBytes: MAX_PERSONAL_DRIVE_BYTES }
      : null,
  });
}

async function createDriveFolder(request: Request, env: Env, username: string): Promise<Response> {
  const payload = await readPayload(request);
  const name = typeof payload?.name === 'string'
    ? payload.name.trim().replace(/\s+/g, ' ').replace(/[\\/]/g, '-').slice(0, 100)
    : '';
  const scope = payload?.scope === 'personal' ? 'personal' : 'team';
  const parentId = typeof payload?.parentId === 'string' ? payload.parentId : null;
  if (!name) return collabJson({ error: 'Enter a folder name.' }, 400);
  if (parentId) {
    const parent = await env.DB.prepare(
      `SELECT id, owner FROM collab_drive_folders WHERE id = ? AND scope = ?`,
    ).bind(parentId, scope).first<{ id: string; owner: string }>();
    if (!parent || (scope === 'personal' && parent.owner.toLowerCase() !== username.toLowerCase())) {
      return collabJson({ error: 'The parent folder is unavailable.' }, 404);
    }
  }
  const now = Date.now();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO collab_drive_folders (id, name, scope, owner, parent_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, name, scope, username, parentId, now, now).run();
  return collabJson({ folder: { id, name, scope, owner: username, parentId, createdAt: now, updatedAt: now } }, 201);
}

async function updateDriveFile(request: Request, env: Env, username: string, id: string): Promise<Response> {
  if (!DOCUMENT_ID_RE.test(id)) return collabJson({ error: 'File not found.' }, 404);
  const payload = await readPayload(request);
  if (!payload) return collabJson({ error: 'Invalid file update.' }, 400);
  const file = await env.DB.prepare(
    'SELECT name, scope, owner, folder_id FROM collab_drive_files WHERE id = ?',
  ).bind(id).first<{ name: string; scope: string; owner: string; folder_id: string | null }>();
  if (!file) return collabJson({ error: 'File not found.' }, 404);
  if (file.owner.toLowerCase() !== username.toLowerCase()) {
    return collabJson({ error: 'Only the uploader can manage this file.' }, 403);
  }
  const name = typeof payload.name === 'string'
    ? payload.name.trim().replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180)
    : file.name;
  if (!name) return collabJson({ error: 'A file name cannot be empty.' }, 400);
  const folderId = Object.hasOwn(payload, 'folderId')
    ? typeof payload.folderId === 'string' && payload.folderId ? payload.folderId : null
    : file.folder_id;
  if (folderId) {
    if (!DOCUMENT_ID_RE.test(folderId)) return collabJson({ error: 'The destination folder is invalid.' }, 400);
    const folder = await env.DB.prepare(
      'SELECT owner FROM collab_drive_folders WHERE id = ? AND scope = ?',
    ).bind(folderId, file.scope).first<{ owner: string }>();
    if (!folder || (file.scope === 'personal' && folder.owner.toLowerCase() !== username.toLowerCase())) {
      return collabJson({ error: 'The destination folder is unavailable.' }, 404);
    }
  }
  await env.DB.prepare(
    'UPDATE collab_drive_files SET name = ?, folder_id = ?, updated_at = ? WHERE id = ?',
  ).bind(name, folderId, Date.now(), id).run();
  return collabJson({ ok: true });
}

async function updateDriveFolder(request: Request, env: Env, username: string, id: string): Promise<Response> {
  if (!DOCUMENT_ID_RE.test(id)) return collabJson({ error: 'Folder not found.' }, 404);
  const payload = await readPayload(request);
  const name = typeof payload?.name === 'string'
    ? payload.name.trim().replace(/\s+/g, ' ').replace(/[\\/]/g, '-').slice(0, 100)
    : '';
  if (!name) return collabJson({ error: 'Enter a folder name.' }, 400);
  const result = await env.DB.prepare(
    'UPDATE collab_drive_folders SET name = ?, updated_at = ? WHERE id = ? AND owner = ? COLLATE NOCASE',
  ).bind(name, Date.now(), id, username).run();
  return result.meta.changes
    ? collabJson({ ok: true })
    : collabJson({ error: 'Folder not found or you cannot rename it.' }, 404);
}

async function deleteDriveFolder(env: Env, username: string, id: string): Promise<Response> {
  if (!DOCUMENT_ID_RE.test(id)) return collabJson({ error: 'Folder not found.' }, 404);
  const folder = await env.DB.prepare(
    'SELECT id FROM collab_drive_folders WHERE id = ? AND owner = ? COLLATE NOCASE',
  ).bind(id, username).first<{ id: string }>();
  if (!folder) return collabJson({ error: 'Folder not found or you cannot delete it.' }, 404);
  const contents = await env.DB.prepare(`
    SELECT
      EXISTS(SELECT 1 FROM collab_drive_files WHERE folder_id = ?) OR
      EXISTS(SELECT 1 FROM collab_drive_folders WHERE parent_id = ?) AS has_contents
  `).bind(id, id).first<{ has_contents: number }>();
  if (contents?.has_contents) {
    return collabJson({ error: 'Move or delete this folder’s contents first.' }, 409);
  }
  await env.DB.prepare('DELETE FROM collab_drive_folders WHERE id = ?').bind(id).run();
  return collabJson({ ok: true });
}

async function shareDriveFileWithChat(
  request: Request,
  env: Env,
  username: string,
  id: string,
): Promise<Response> {
  if (!DOCUMENT_ID_RE.test(id)) return collabJson({ error: 'File not found.' }, 404);
  const payload = await readPayload(request);
  const roomId = typeof payload?.roomId === 'string' ? payload.roomId : '';
  if (!isValidChatRoomId(roomId) || !await isChatRoomMember(env, username, roomId)) {
    return collabJson({ error: 'You do not have access to this conversation.' }, 403);
  }
  const file = await env.DB.prepare(
    'SELECT id, name, mime_type, scope, owner FROM collab_drive_files WHERE id = ?',
  ).bind(id).first<{ id: string; name: string; mime_type: string; scope: string; owner: string }>();
  if (!file || (file.scope === 'personal' && file.owner.toLowerCase() !== username.toLowerCase())) {
    return collabJson({ error: 'File not found.' }, 404);
  }
  if (file.scope === 'personal') {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO collab_drive_file_shares (file_id, room_id, shared_by, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(id, roomId, username, Date.now()).run();
  }
  const params = new URLSearchParams({
    roomId,
    mime: file.mime_type,
    name: file.name,
  });
  return collabJson({ file, downloadUrl: `/api/collab/drive/files/${id}/download?${params}` });
}

async function uploadDriveFile(request: Request, env: Env, username: string): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_DRIVE_FILE_BYTES + 16_384) {
    return collabJson({ error: 'Files are limited to 50 MB.' }, 413);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return collabJson({ error: 'Choose a file to upload.' }, 400);
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size < 1) return collabJson({ error: 'Choose a non-empty file.' }, 400);
  if (file.size > MAX_DRIVE_FILE_BYTES) return collabJson({ error: 'Files are limited to 50 MB.' }, 413);
  const scope = form.get('scope') === 'personal' ? 'personal' : 'team';
  const rawFolderId = form.get('folderId');
  const folderId = typeof rawFolderId === 'string' && rawFolderId ? rawFolderId : null;
  if (folderId) {
    const folder = await env.DB.prepare(
      'SELECT id, owner FROM collab_drive_folders WHERE id = ? AND scope = ?',
    ).bind(folderId, scope).first<{ id: string; owner: string }>();
    if (!folder || (scope === 'personal' && folder.owner.toLowerCase() !== username.toLowerCase())) {
      return collabJson({ error: 'The destination folder is unavailable.' }, 404);
    }
  }
  const name = file.name.replace(/[\u0000-\u001f\u007f/\\]/g, '_').trim().slice(0, 180) || 'Upload';
  const mimeType = file.type.slice(0, 160) || 'application/octet-stream';
  const id = crypto.randomUUID();
  const objectKey = `team-drive/${scope}/${scope === 'personal' ? `${encodeURIComponent(username)}/` : ''}${id}`;
  const now = Date.now();
  let reserved = false;
  let reservationId: string | null = null;
  if (scope === 'personal') {
    await env.DB.prepare(
      'DELETE FROM collab_drive_upload_reservations WHERE username = ? COLLATE NOCASE AND created_at < ?',
    ).bind(username, now - DRIVE_RESERVATION_MAX_AGE).run();
    reservationId = crypto.randomUUID();
    const reservation = await env.DB.prepare(`
      INSERT INTO collab_drive_upload_reservations (id, username, size_bytes, created_at)
      SELECT ?, ?, ?, ?
      WHERE COALESCE((SELECT SUM(size_bytes) FROM collab_drive_files
        WHERE scope = 'personal' AND owner = ? COLLATE NOCASE), 0)
        + COALESCE((SELECT SUM(size_bytes) FROM collab_drive_upload_reservations
          WHERE username = ? COLLATE NOCASE), 0) + ? <= ?
    `).bind(
      reservationId,
      username,
      file.size,
      now,
      username,
      username,
      file.size,
      MAX_PERSONAL_DRIVE_BYTES,
    ).run();
    if (!reservation.meta.changes) {
      return collabJson({ error: 'Your Personal Drive is full. The total storage limit is 100 MB.' }, 413);
    }
    reserved = true;
  }
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  const indexable = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'xml', 'html']);
  let textIndex = '';
  try {
    if (indexable.has(extension) && file.size <= 1_000_000) {
      textIndex = (await file.text()).slice(0, 200_000);
    }
    await env.CHAT_MEDIA_BUCKET.put(objectKey, file.stream(), {
      httpMetadata: { contentType: mimeType, cacheControl: 'private, max-age=300' },
      customMetadata: { owner: username, scope, originalName: name },
    });
    const saveFile = env.DB.prepare(
      `INSERT INTO collab_drive_files
       (id, name, mime_type, size_bytes, scope, owner, folder_id, object_key, text_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, name, mimeType, file.size, scope, username, folderId, objectKey, textIndex, now, now);
    if (reserved) {
      await env.DB.batch([
        saveFile,
        env.DB.prepare('DELETE FROM collab_drive_upload_reservations WHERE id = ?')
          .bind(reservationId),
      ]);
    } else {
      await saveFile.run();
    }
  } catch (error) {
    if (reserved) {
      await env.DB.prepare(
        'DELETE FROM collab_drive_upload_reservations WHERE id = ?',
      ).bind(reservationId).run().catch(() => undefined);
    }
    await env.CHAT_MEDIA_BUCKET.delete(objectKey).catch(() => undefined);
    console.error(JSON.stringify({ event: 'collab_drive_upload_failed', error: String(error) }));
    return collabJson({ error: 'Could not save this file.' }, 500);
  }
  return collabJson({
    file: { id, name, mimeType, sizeBytes: file.size, scope, owner: username, folderId, createdAt: now, updatedAt: now },
  }, 201);
}

async function saveDriveFileToPersonal(
  request: Request,
  env: Env,
  username: string,
  id: string,
): Promise<Response> {
  if (!DOCUMENT_ID_RE.test(id)) return collabJson({ error: 'File not found.' }, 404);
  const payload = await readPayload(request);
  const roomId = typeof payload?.roomId === 'string' ? payload.roomId : '';
  if (roomId && (
    !isValidChatRoomId(roomId) ||
    !await isChatRoomMember(env, username, roomId)
  )) {
    return collabJson({ error: 'You do not have access to this conversation.' }, 403);
  }
  const file = await env.DB.prepare(
    `SELECT id, name, mime_type, size_bytes, scope, owner, object_key, text_index
     FROM collab_drive_files WHERE id = ?`,
  ).bind(id).first<{
    id: string;
    name: string;
    mime_type: string;
    size_bytes: number;
    scope: string;
    owner: string;
    object_key: string;
    text_index: string;
  }>();
  if (!file) return collabJson({ error: 'File not found.' }, 404);
  if (file.scope === 'personal' && file.owner.toLowerCase() === username.toLowerCase()) {
    return collabJson({ ok: true, alreadyInPersonalDrive: true });
  }
  if (file.scope === 'personal') {
    if (!roomId) return collabJson({ error: 'File not found.' }, 404);
    const share = await env.DB.prepare(
      'SELECT 1 AS found FROM collab_drive_file_shares WHERE file_id = ? AND room_id = ?',
    ).bind(id, roomId).first<{ found: number }>();
    if (!share) return collabJson({ error: 'File not found.' }, 404);
  }
  const source = await env.CHAT_MEDIA_BUCKET.get(file.object_key);
  if (!source) return collabJson({ error: 'File content is unavailable.' }, 404);

  const now = Date.now();
  await env.DB.prepare(
    'DELETE FROM collab_drive_upload_reservations WHERE username = ? COLLATE NOCASE AND created_at < ?',
  ).bind(username, now - DRIVE_RESERVATION_MAX_AGE).run();
  const reservationId = crypto.randomUUID();
  const reservation = await env.DB.prepare(`
    INSERT INTO collab_drive_upload_reservations (id, username, size_bytes, created_at)
    SELECT ?, ?, ?, ?
    WHERE COALESCE((SELECT SUM(size_bytes) FROM collab_drive_files
      WHERE scope = 'personal' AND owner = ? COLLATE NOCASE), 0)
      + COALESCE((SELECT SUM(size_bytes) FROM collab_drive_upload_reservations
        WHERE username = ? COLLATE NOCASE), 0) + ? <= ?
  `).bind(
    reservationId,
    username,
    file.size_bytes,
    now,
    username,
    username,
    file.size_bytes,
    MAX_PERSONAL_DRIVE_BYTES,
  ).run();
  if (!reservation.meta.changes) {
    return collabJson({ error: 'Your Personal Drive is full. The total storage limit is 100 MB.' }, 413);
  }

  const copyId = crypto.randomUUID();
  const objectKey = `team-drive/personal/${encodeURIComponent(username)}/${copyId}`;
  try {
    await env.CHAT_MEDIA_BUCKET.put(objectKey, source.body, {
      httpMetadata: {
        contentType: file.mime_type || 'application/octet-stream',
        cacheControl: 'private, max-age=300',
      },
      customMetadata: {
        owner: username,
        scope: 'personal',
        originalName: file.name,
        copiedFrom: file.id,
      },
    });
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO collab_drive_files
        (id, name, mime_type, size_bytes, scope, owner, folder_id, object_key, text_index, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'personal', ?, NULL, ?, ?, ?, ?)
      `).bind(
        copyId,
        file.name,
        file.mime_type,
        file.size_bytes,
        username,
        objectKey,
        file.text_index,
        now,
        now,
      ),
      env.DB.prepare('DELETE FROM collab_drive_upload_reservations WHERE id = ?').bind(reservationId),
    ]);
  } catch (error) {
    await env.CHAT_MEDIA_BUCKET.delete(objectKey).catch(() => undefined);
    await env.DB.prepare('DELETE FROM collab_drive_upload_reservations WHERE id = ?')
      .bind(reservationId)
      .run()
      .catch(() => undefined);
    console.error(JSON.stringify({ event: 'collab_drive_copy_failed', error: String(error) }));
    return collabJson({ error: 'Could not save this file to Personal Drive.' }, 500);
  }
  return collabJson({
    ok: true,
    alreadyInPersonalDrive: false,
    file: {
      id: copyId,
      name: file.name,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      scope: 'personal',
      owner: username,
      folder_id: null,
      created_at: now,
      updated_at: now,
    },
  }, 201);
}

async function driveFileRoute(
  request: Request,
  env: Env,
  username: string,
  id: string,
  action: 'download' | 'delete',
): Promise<Response> {
  if (!DOCUMENT_ID_RE.test(id)) return collabJson({ error: 'File not found.' }, 404);
  const file = await env.DB.prepare(
    'SELECT id, name, mime_type, scope, owner, object_key, size_bytes FROM collab_drive_files WHERE id = ?',
  ).bind(id).first<{ id: string; name: string; mime_type: string; scope: string; owner: string; object_key: string; size_bytes: number }>();
  if (!file) return collabJson({ error: 'File not found.' }, 404);
  if (action === 'delete') {
    if (file.owner.toLowerCase() !== username.toLowerCase()) {
      return collabJson({ error: 'Only the uploader can delete this file.' }, 403);
    }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM collab_drive_file_shares WHERE file_id = ?').bind(id),
      env.DB.prepare('DELETE FROM collab_drive_files WHERE id = ?').bind(id),
    ]);
    await env.CHAT_MEDIA_BUCKET.delete(file.object_key).catch(() => undefined);
    return collabJson({ ok: true });
  }
  if (file.scope === 'personal' && file.owner.toLowerCase() !== username.toLowerCase()) {
    const roomId = new URL(request.url).searchParams.get('roomId') ?? '';
    if (!isValidChatRoomId(roomId) || !await isChatRoomMember(env, username, roomId)) {
      return collabJson({ error: 'File not found.' }, 404);
    }
    const share = await env.DB.prepare(
      'SELECT 1 AS found FROM collab_drive_file_shares WHERE file_id = ? AND room_id = ?',
    ).bind(id, roomId).first<{ found: number }>();
    if (!share) return collabJson({ error: 'File not found.' }, 404);
  }
  const object = await env.CHAT_MEDIA_BUCKET.get(file.object_key);
  if (!object) return collabJson({ error: 'File content is unavailable.' }, 404);
  const headers = new Headers({
    'content-type': file.mime_type || 'application/octet-stream',
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'cache-control': 'private, max-age=60',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': '*',
  });
  if (object.size) headers.set('content-length', String(object.size));
  return new Response(object.body, { headers });
}

async function listTasks(env: Env, username: string, url: URL): Promise<Response> {
  const scope = url.searchParams.get('scope');
  const result = await env.DB.prepare(`
    SELECT t.id, t.title, t.description, t.scope, t.owner, t.assignee,
           t.due_at, t.kind, t.completed_at, t.created_at, t.updated_at
    FROM collab_tasks t
    WHERE (t.scope = 'team' AND (?1 IS NULL OR ?1 = 'team'))
       OR (t.scope = 'personal'
           AND (?1 IS NULL OR ?1 = 'personal')
           AND (
             t.owner = ?2 COLLATE NOCASE
             OR t.assignee = ?2 COLLATE NOCASE
             OR EXISTS (
               SELECT 1 FROM collab_task_mentions mention
               WHERE mention.task_id = t.id AND mention.username = ?2 COLLATE NOCASE
             )
           ))
    ORDER BY CASE WHEN t.completed_at IS NULL THEN 0 ELSE 1 END,
             CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at, t.updated_at DESC
    LIMIT 300
  `).bind(scope === 'personal' || scope === 'team' ? scope : null, username).all<{
    id: string; title: string; description: string; scope: string; owner: string; assignee: string;
    due_at: number | null; kind: 'task' | 'reminder'; completed_at: number | null; created_at: number; updated_at: number;
  }>();
  const tasks = await Promise.all((result.results ?? []).map(async (task) => {
    const mentions = await env.DB.prepare(
      'SELECT username FROM collab_task_mentions WHERE task_id = ? ORDER BY username COLLATE NOCASE',
    ).bind(task.id).all<{ username: string }>();
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      scope: task.scope,
      owner: task.owner,
      assignee: task.assignee,
      dueAt: task.due_at,
      kind: task.kind,
      completedAt: task.completed_at,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      mentions: (mentions.results ?? []).map((mention) => mention.username),
    };
  }));
  return collabJson({ tasks });
}

async function createTask(request: Request, env: Env, username: string): Promise<Response> {
  const payload = await readPayload(request);
  const title = typeof payload?.title === 'string' ? payload.title.trim().slice(0, 200) : '';
  const description = typeof payload?.description === 'string' ? payload.description.trim().slice(0, 8_000) : '';
  const scope = payload?.scope === 'personal' ? 'personal' : 'team';
  const kind = payload?.kind === 'reminder' ? 'reminder' : 'task';
  if (!title) return collabJson({ error: 'Add a task title.' }, 400);
  let assignee = username;
  if (typeof payload?.assignee === 'string' && payload.assignee.trim()) {
    const person = await env.DB.prepare(
      'SELECT username FROM auth_users WHERE username = ? COLLATE NOCASE',
    ).bind(payload.assignee.trim()).first<{ username: string }>();
    if (!person) return collabJson({ error: 'That assignee is not a registered user.' }, 404);
    assignee = person.username;
  }
  const dueAt = typeof payload?.dueAt === 'number' && Number.isSafeInteger(payload.dueAt) ? payload.dueAt : null;
  const id = crypto.randomUUID();
  const now = Date.now();
  const mentions = await resolveMentionedUsers(env, `${title}\n${description}`);
  await env.DB.prepare(
    `INSERT INTO collab_tasks
     (id, title, description, scope, owner, assignee, due_at, kind, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).bind(id, title, description, scope, username, assignee, dueAt, kind, now, now).run();
  if (mentions.length) {
    await env.DB.batch(mentions.map((mentioned) => env.DB.prepare(
      'INSERT OR IGNORE INTO collab_task_mentions (task_id, username, created_at) VALUES (?, ?, ?)',
    ).bind(id, mentioned, now)));
    await env.DB.batch(mentions
      .filter((mentioned) => mentioned.toLowerCase() !== username.toLowerCase())
      .map((mentioned) => env.DB.prepare(
        `INSERT INTO collab_notifications (id, username, type, title, body, target_url, created_at)
         VALUES (?, ?, 'task_mention', ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), mentioned, `${username} mentioned you in a task`, title, `/collab?type=tasks&task=${id}`, now)));
  }
  return collabJson({
    task: {
      id, title, description, scope, owner: username, assignee, dueAt, kind, completedAt: null,
      createdAt: now, updatedAt: now, mentions,
    },
  }, 201);
}

async function updateTask(request: Request, env: Env, username: string, id: string): Promise<Response> {
  if (!DOCUMENT_ID_RE.test(id)) return collabJson({ error: 'Task not found.' }, 404);
  const payload = await readPayload(request);
  if (!payload) return collabJson({ error: 'Invalid task update.' }, 400);
  const task = await env.DB.prepare(
    'SELECT id, owner, assignee, scope, completed_at FROM collab_tasks WHERE id = ?',
  ).bind(id).first<{ id: string; owner: string; assignee: string; scope: string; completed_at: number | null }>();
  if (!task) return collabJson({ error: 'Task not found.' }, 404);
  if (
    task.owner.toLowerCase() !== username.toLowerCase() &&
    task.assignee.toLowerCase() !== username.toLowerCase() &&
    task.scope !== 'team'
  ) return collabJson({ error: 'You cannot update this task.' }, 403);
  if (typeof payload.completed === 'boolean') {
    const completedAt = payload.completed ? Date.now() : null;
    await env.DB.prepare('UPDATE collab_tasks SET completed_at = ?, updated_at = ? WHERE id = ?')
      .bind(completedAt, Date.now(), id).run();
  }
  return collabJson({ ok: true });
}

async function deleteTask(request: Request, env: Env, username: string, id: string): Promise<Response> {
  const task = await env.DB.prepare('SELECT owner FROM collab_tasks WHERE id = ?')
    .bind(id).first<{ owner: string }>();
  if (!task) return collabJson({ error: 'Task not found.' }, 404);
  if (task.owner.toLowerCase() !== username.toLowerCase()) {
    return collabJson({ error: 'Only the task creator can delete it.' }, 403);
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM collab_task_mentions WHERE task_id = ?').bind(id),
    env.DB.prepare('DELETE FROM collab_tasks WHERE id = ?').bind(id),
  ]);
  return collabJson({ ok: true });
}

async function listCollabNotifications(env: Env, username: string): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT id, type, title, body, target_url, created_at
     FROM collab_notifications WHERE username = ? COLLATE NOCASE
     ORDER BY created_at DESC LIMIT 40`,
  ).bind(username).all();
  return collabJson({ notifications: rows.results ?? [] });
}

async function markCollabNotificationRead(request: Request, env: Env, username: string): Promise<Response> {
  const payload = await readPayload(request);
  const id = typeof payload?.id === 'string' ? payload.id : '';
  if (!DOCUMENT_ID_RE.test(id)) return collabJson({ error: 'Notification not found.' }, 404);
  await env.DB.prepare(
    'UPDATE collab_notifications SET read_at = ? WHERE id = ? AND username = ? COLLATE NOCASE',
  ).bind(Date.now(), id, username).run();
  return collabJson({ ok: true });
}

async function searchCollab(env: Env, username: string, query: string): Promise<Response> {
  const term = query.trim().slice(0, 120);
  if (term.length < 2) return collabJson({ results: [] });
  const like = `%${escapeLike(term)}%`;
  const results: Array<Record<string, unknown>> = [];
  const roomRows = await env.DB.prepare(`
    SELECT room_id FROM chat_conversations WHERE username = ? COLLATE NOCASE
    UNION SELECT room_id FROM chat_group_members WHERE username = ? COLLATE NOCASE
    UNION SELECT 'global'
  `).bind(username, username).all<{ room_id: string }>();
  const roomMatches = await Promise.all((roomRows.results ?? []).slice(0, 80).map(async ({ room_id }) => {
    const messages = await env.CHAT_ROOM.getByName(room_id).searchMessages(term, 4);
    return messages.map((message) => ({
      id: message.id,
      type: 'message',
      title: `${message.username} · ${room_id === 'global' ? 'Ecovacs crew' : 'Chat'}`,
      excerpt: message.markdown.slice(0, 280),
      updatedAt: message.createdAt,
      roomId: room_id,
      target: `/chat?room=${encodeURIComponent(room_id)}&message=${encodeURIComponent(message.id)}`,
    }));
  }));
  results.push(...roomMatches.flat());

  const [sheets, maps, driveFiles, tasks] = await Promise.all([
    env.DB.prepare(
      'SELECT id, title, owner, updated_at FROM collaborative_sheets ORDER BY updated_at DESC LIMIT 40',
    ).all<{ id: string; title: string; owner: string; updated_at: number }>(),
    env.DB.prepare(
      'SELECT id, title, owner, updated_at FROM collab_mindmaps ORDER BY updated_at DESC LIMIT 40',
    ).all<{ id: string; title: string; owner: string; updated_at: number }>(),
    env.DB.prepare(`
      SELECT id, name, owner, scope, updated_at, text_index FROM collab_drive_files
      WHERE (scope = 'team' OR owner = ? COLLATE NOCASE)
        AND (name LIKE ? ESCAPE '\\' COLLATE NOCASE OR text_index LIKE ? ESCAPE '\\' COLLATE NOCASE)
      ORDER BY updated_at DESC LIMIT 20
    `).bind(username, like, like).all<{ id: string; name: string; owner: string; scope: string; updated_at: number; text_index: string }>(),
    env.DB.prepare(`
      SELECT t.id, t.title, t.description, t.owner, t.scope, t.updated_at
      FROM collab_tasks t
      WHERE (t.scope = 'team' OR t.owner = ? COLLATE NOCASE OR t.assignee = ? COLLATE NOCASE)
        AND (t.title LIKE ? ESCAPE '\\' COLLATE NOCASE OR t.description LIKE ? ESCAPE '\\' COLLATE NOCASE)
        OR EXISTS (
          SELECT 1 FROM collab_task_mentions mention
          WHERE mention.task_id = t.id AND mention.username = ? COLLATE NOCASE
            AND (t.title LIKE ? ESCAPE '\\' COLLATE NOCASE OR t.description LIKE ? ESCAPE '\\' COLLATE NOCASE)
        )
      ORDER BY t.updated_at DESC LIMIT 20
    `).bind(username, username, like, like, username, like, like).all<{ id: string; title: string; description: string; owner: string; scope: string; updated_at: number }>(),
  ]);
  for (const sheet of sheets.results ?? []) {
    if (!await getCollabPermission(env, username, 'sheet', sheet.id)) continue;
    if (sheet.title.toLocaleLowerCase().includes(term.toLocaleLowerCase())) {
      results.push({
        id: sheet.id,
        type: 'sheet',
        title: sheet.title,
        excerpt: 'Shared spreadsheet',
        updatedAt: sheet.updated_at,
        target: `/collab?type=sheet&document=${encodeURIComponent(sheet.id)}`,
      });
    }
    const hits = await env.SHEETS_ROOM.getByName(sheet.id).searchCells(term, 4);
    if (hits.length) {
      hits.forEach((hit: { row: number; col: number; raw: string }) => results.push({
        id: `${sheet.id}:${hit.row}:${hit.col}`,
        type: 'sheet-cell',
        title: `${sheet.title} · ${spreadsheetColumnLabel(hit.col)}${hit.row}`,
        excerpt: hit.raw.slice(0, 240),
        updatedAt: sheet.updated_at,
        target: `/collab?type=sheet&document=${encodeURIComponent(sheet.id)}`,
      }));
    }
  }
  for (const map of maps.results ?? []) {
    if (await getCollabPermission(env, username, 'mindmap', map.id)) {
      if (map.title.toLocaleLowerCase().includes(term.toLocaleLowerCase())) {
      results.push({
        id: map.id,
        type: 'mindmap',
        title: map.title,
        excerpt: 'Shared mind map',
        updatedAt: map.updated_at,
        target: `/collab?type=mindmap&document=${encodeURIComponent(map.id)}`,
      });
      }
      const hits = await env.MINDMAP_ROOM.getByName(map.id).searchNodes(term, 4);
      hits.forEach((hit: { id: string; text: string }) => results.push({
        id: `${map.id}:${hit.id}`,
        type: 'mindmap-node',
        title: `${map.title} · idea`,
        excerpt: hit.text.slice(0, 240),
        updatedAt: map.updated_at,
        target: `/collab?type=mindmap&document=${encodeURIComponent(map.id)}`,
      }));
    }
  }
  for (const file of driveFiles.results ?? []) {
    if (file.scope === 'personal' && file.owner.toLowerCase() !== username.toLowerCase()) continue;
    results.push({
      id: file.id,
      type: 'file',
      title: file.name,
      excerpt: file.text_index ? file.text_index.slice(0, 240) : `${file.scope === 'team' ? 'Team' : 'Personal'} Drive`,
      updatedAt: file.updated_at,
      target: `/collab?type=drive&scope=${file.scope}&file=${encodeURIComponent(file.id)}`,
    });
  }
  for (const task of tasks.results ?? []) {
    results.push({
      id: task.id,
      type: 'task',
      title: task.title,
      excerpt: task.description.slice(0, 240),
      updatedAt: task.updated_at,
      target: `/collab?type=tasks&task=${encodeURIComponent(task.id)}`,
    });
  }
  return collabJson({
    results: results.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt)).slice(0, 60),
  });
}

async function readPayload(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return null;
  try {
    const value: unknown = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function listDocuments(env: Env, username: string): Promise<Response> {
  const [sheets, mindmaps, smartDocs] = await Promise.all([
    env.DB.prepare(
      'SELECT id, title, owner, created_at, updated_at FROM collaborative_sheets ORDER BY updated_at DESC',
    ).all<CollabDocumentRow>(),
    env.DB.prepare(
      'SELECT id, title, owner, created_at, updated_at FROM collab_mindmaps ORDER BY updated_at DESC',
    ).all<CollabDocumentRow>(),
    env.DB.prepare(
      'SELECT id, title, owner, created_at, updated_at, visibility FROM collab_smartdocs ORDER BY updated_at DESC',
    ).all<CollabDocumentRow>(),
  ]);
  const rows = [
    ...(sheets.results ?? []).map((row) => ({ ...row, type: 'sheet' as const })),
    ...(mindmaps.results ?? []).map((row) => ({ ...row, type: 'mindmap' as const })),
    ...(smartDocs.results ?? []).map((row) => ({ ...row, type: 'smartdoc' as const })),
  ];
  const accessible = await Promise.all(rows.map(async (row) => {
    const permission = await getCollabPermission(env, username, row.type, row.id);
    if (!permission) return null;
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      owner: row.owner,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      permission,
      ...(row.type === 'smartdoc' ? { visibility: row.visibility ?? 'private' } : {}),
    };
  }));
  return collabJson({
    documents: accessible.filter((document): document is NonNullable<typeof document> => document !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title)),
  });
}

async function createMindmap(request: Request, env: Env, username: string): Promise<Response> {
  const payload = await readPayload(request);
  const title = typeof payload?.title === 'string'
    ? payload.title.trim().replace(/\s+/g, ' ').slice(0, 60)
    : '';
  if (!title) return collabJson({ error: 'Add a name for the mind map.' }, 400);
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO collab_mindmaps (id, title, owner, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(id, title, username, now, now).run();
  await grantCollabPermission(env, 'mindmap', id, username, 'edit');
  await env.MINDMAP_ROOM.getByName(id).initialize();
  return collabJson({
    document: { id, type: 'mindmap', title, owner: username, createdAt: now, updatedAt: now, permission: 'edit' },
  }, 201);
}

async function issueMindmapTicket(request: Request, env: Env, username: string): Promise<Response> {
  const payload = await readPayload(request);
  const id = typeof payload?.documentId === 'string' ? payload.documentId : '';
  if (!DOCUMENT_ID_RE.test(id)) return collabJson({ error: 'Choose a valid mind map.' }, 400);
  const permission = await getCollabPermission(env, username, 'mindmap', id);
  if (!permission) return collabJson({ error: 'You do not have access to this mind map.' }, 403);
  const ticket = await env.MINDMAP_ROOM.getByName(id).createTicket(username, permission);
  return collabJson({ documentId: id, ticket, permission });
}

async function renameMindmap(request: Request, env: Env, username: string): Promise<Response> {
  const payload = await readPayload(request);
  const id = typeof payload?.documentId === 'string' ? payload.documentId : '';
  const title = typeof payload?.title === 'string'
    ? payload.title.trim().replace(/\s+/g, ' ').slice(0, 60)
    : '';
  if (!DOCUMENT_ID_RE.test(id) || !title) {
    return collabJson({ error: 'A mind map and non-empty title are required.' }, 400);
  }
  const document = await getCollabDocument(env, 'mindmap', id);
  if (!document) return collabJson({ error: 'Mind map not found.' }, 404);
  if (document.owner.toLowerCase() !== username.toLowerCase()) {
    return collabJson({ error: 'Only the mind map owner can rename it.' }, 403);
  }
  const updatedAt = Date.now();
  await env.DB.prepare('UPDATE collab_mindmaps SET title = ?, updated_at = ? WHERE id = ?')
    .bind(title, updatedAt, id)
    .run();
  await env.MINDMAP_ROOM.getByName(id).broadcastTitle(title);
  return collabJson({ id, title, updatedAt });
}

export async function handleCollabApi(request: Request, env: Env, username: string): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      },
    });
  }
  await ensureCollabSchema(env);
  if (url.pathname === '/api/collab/documents' && request.method === 'GET') {
    return listDocuments(env, username);
  }
  if (url.pathname === '/api/collab/mindmaps' && request.method === 'POST') {
    return createMindmap(request, env, username);
  }
  if (url.pathname === '/api/collab/mindmaps/socket-ticket' && request.method === 'POST') {
    return issueMindmapTicket(request, env, username);
  }
  if (url.pathname === '/api/collab/mindmaps/rename' && request.method === 'POST') {
    return renameMindmap(request, env, username);
  }
  if (url.pathname === '/api/collab/search' && request.method === 'GET') {
    return searchCollab(env, username, url.searchParams.get('q') ?? '');
  }
  if (url.pathname === '/api/collab/drive/files' && request.method === 'GET') {
    return listDrive(env, username, url);
  }
  if (url.pathname === '/api/collab/drive/files' && request.method === 'POST') {
    return uploadDriveFile(request, env, username);
  }
  if (url.pathname === '/api/collab/drive/folders' && request.method === 'POST') {
    return createDriveFolder(request, env, username);
  }
  const driveFileMatch = /^\/api\/collab\/drive\/files\/([^/]+)(?:\/(download|share|save-personal))?$/.exec(url.pathname);
  if (driveFileMatch && driveFileMatch[2] === 'share' && request.method === 'POST') {
    return shareDriveFileWithChat(request, env, username, driveFileMatch[1]);
  }
  if (driveFileMatch && driveFileMatch[2] === 'save-personal' && request.method === 'POST') {
    return saveDriveFileToPersonal(request, env, username, driveFileMatch[1]);
  }
  if (driveFileMatch && !driveFileMatch[2] && request.method === 'PATCH') {
    return updateDriveFile(request, env, username, driveFileMatch[1]);
  }
  if (driveFileMatch && (!driveFileMatch[2] || driveFileMatch[2] === 'download') && request.method === 'GET') {
    return driveFileRoute(request, env, username, driveFileMatch[1], 'download');
  }
  if (driveFileMatch && !driveFileMatch[2] && request.method === 'DELETE') {
    return driveFileRoute(request, env, username, driveFileMatch[1], 'delete');
  }
  const driveFolderMatch = /^\/api\/collab\/drive\/folders\/([^/]+)$/.exec(url.pathname);
  if (driveFolderMatch && request.method === 'PATCH') {
    return updateDriveFolder(request, env, username, driveFolderMatch[1]);
  }
  if (driveFolderMatch && request.method === 'DELETE') {
    return deleteDriveFolder(env, username, driveFolderMatch[1]);
  }
  if (url.pathname === '/api/collab/tasks' && request.method === 'GET') {
    return listTasks(env, username, url);
  }
  if (url.pathname === '/api/collab/tasks' && request.method === 'POST') {
    return createTask(request, env, username);
  }
  const taskMatch = /^\/api\/collab\/tasks\/([^/]+)$/.exec(url.pathname);
  if (taskMatch && request.method === 'PATCH') {
    return updateTask(request, env, username, taskMatch[1]);
  }
  if (taskMatch && request.method === 'DELETE') {
    return deleteTask(request, env, username, taskMatch[1]);
  }
  if (url.pathname === '/api/collab/notifications' && request.method === 'GET') {
    return listCollabNotifications(env, username);
  }
  if (url.pathname === '/api/collab/notifications/read' && request.method === 'POST') {
    return markCollabNotificationRead(request, env, username);
  }
  return collabJson({ error: 'Not found.' }, 404);
}
