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
  kind?: 'smartdoc' | 'smarttodo';
}

const MAX_BODY_BYTES = 64 * 1024;
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

type TeamBoardCardType = 'ticket' | 'incident' | 'announcement' | 'custom';
type TeamBoardStatus = 'signal' | 'investigating' | 'waiting' | 'captured';
type TeamBoardSeverity = 'low' | 'normal' | 'high' | 'critical';

interface TeamBoardCardRow {
  id: string;
  type: TeamBoardCardType;
  title: string;
  description: string;
  status: TeamBoardStatus;
  severity: TeamBoardSeverity;
  ticket_number: string;
  is_beacon: number;
  owner: string;
  created_by: string;
  source_type: string | null;
  source_id: string | null;
  source_url: string | null;
  source_snapshot: string;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
  comment_count?: number;
}

function teamBoardCardPublic(row: TeamBoardCardRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    severity: row.severity,
    ticketNumber: row.ticket_number,
    isBeacon: row.is_beacon === 1,
    owner: row.owner,
    createdBy: row.created_by,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    sourceSnapshot: row.source_snapshot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    commentCount: Number(row.comment_count ?? 0),
  };
}

async function teamBoardPermission(
  env: Env,
  username: string,
  cardId: string,
): Promise<'owner' | 'edit' | 'view' | null> {
  const row = await env.DB.prepare(`
    SELECT card.owner, card.created_by, member.permission,
      EXISTS (
        SELECT 1 FROM team_board_card_rooms shared
        WHERE shared.card_id = card.id AND (
          shared.room_id = 'global'
          OR EXISTS (SELECT 1 FROM chat_conversations dm
            WHERE dm.room_id = shared.room_id AND dm.username = ? COLLATE NOCASE)
          OR EXISTS (SELECT 1 FROM chat_group_members group_member
            WHERE group_member.room_id = shared.room_id AND group_member.username = ? COLLATE NOCASE)
        )
      ) AS shared_to_chat
    FROM team_board_cards card
    LEFT JOIN team_board_members member
      ON member.card_id = card.id AND member.username = ? COLLATE NOCASE
    WHERE card.id = ? AND (
      card.owner = ? COLLATE NOCASE
      OR card.created_by = ? COLLATE NOCASE
      OR member.username IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM team_board_card_rooms shared
        WHERE shared.card_id = card.id AND (
          shared.room_id = 'global'
          OR EXISTS (SELECT 1 FROM chat_conversations dm
            WHERE dm.room_id = shared.room_id AND dm.username = ? COLLATE NOCASE)
          OR EXISTS (SELECT 1 FROM chat_group_members group_member
            WHERE group_member.room_id = shared.room_id AND group_member.username = ? COLLATE NOCASE)
        )
      )
    )
  `).bind(username, username, username, cardId, username, username, username, username)
    .first<{ owner: string; created_by: string; permission: 'view' | 'edit' | null; shared_to_chat: number }>();
  if (!row) return null;
  if (row.owner.toLowerCase() === username.toLowerCase() || row.created_by.toLowerCase() === username.toLowerCase()) return 'owner';
  if (row.shared_to_chat === 1) return 'edit';
  return row.permission ?? 'edit';
}

async function addTeamBoardActivity(
  env: Env,
  cardId: string,
  actor: string,
  kind: string,
  detail = '',
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO team_board_activity (id, card_id, actor, kind, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), cardId, actor, kind, detail.slice(0, 1000), Date.now()).run();
}

async function notifyTeamBoardUsers(
  env: Env,
  cardId: string,
  actor: string,
  usernames: string[],
  title: string,
  body: string,
): Promise<void> {
  const unique = [...new Map(usernames.map((name) => [name.toLowerCase(), name])).values()]
    .filter((name) => name.toLowerCase() !== actor.toLowerCase());
  if (!unique.length) return;
  const now = Date.now();
  await env.DB.batch(unique.map((username) => env.DB.prepare(
    `INSERT INTO collab_notifications (id, username, type, title, body, target_url, created_at)
     VALUES (?, ?, 'team_board', ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    username,
    title.slice(0, 180),
    body.slice(0, 500),
    `/board?card=${encodeURIComponent(cardId)}`,
    now,
  )));
}

async function resolveTeamBoardMentions(env: Env, text: string): Promise<string[]> {
  const mentions = taskMentionNames(text);
  if (!mentions.length) return [];
  const placeholders = mentions.map(() => '?').join(', ');
  const rows = await env.DB.prepare(
    `SELECT username FROM auth_users WHERE lower(username) IN (${placeholders})`,
  ).bind(...mentions).all<{ username: string }>();
  return (rows.results ?? []).map((row) => row.username);
}

async function shareTeamBoardCardWithUsers(
  env: Env,
  cardId: string,
  actor: string,
  usernames: string[],
  title: string,
): Promise<string[]> {
  const valid = [...new Set(usernames.map((name) => name.trim()).filter(Boolean))].slice(0, 40);
  if (!valid.length) return [];
  const placeholders = valid.map(() => '?').join(', ');
  const users = await env.DB.prepare(
    `SELECT username FROM auth_users WHERE lower(username) IN (${placeholders})`,
  ).bind(...valid.map((name) => name.toLowerCase())).all<{ username: string }>();
  const canonical = (users.results ?? []).map((row) => row.username);
  const existing = await env.DB.prepare(
    `SELECT username, permission FROM team_board_members WHERE card_id = ?`,
  ).bind(cardId).all<{ username: string; permission: 'view' | 'edit' }>();
  const previousPermissions = new Map((existing.results ?? []).map((row) => [row.username.toLowerCase(), row.permission]));
  const newlyGranted = canonical.filter((name) => previousPermissions.get(name.toLowerCase()) !== 'edit');
  const now = Date.now();
  if (canonical.length) {
    await env.DB.batch(canonical.map((username) => env.DB.prepare(
      `INSERT INTO team_board_members (card_id, username, permission, added_by, created_at)
       VALUES (?, ?, 'edit', ?, ?)
       ON CONFLICT(card_id, username) DO UPDATE SET
         permission = 'edit', added_by = excluded.added_by`,
    ).bind(cardId, username, actor, now)));
    if (newlyGranted.length) {
      await notifyTeamBoardUsers(
        env,
        cardId,
        actor,
        newlyGranted,
        `${actor} shared a Team Board card with you`,
        title,
      );
    }
  }
  return canonical;
}

async function listTeamBoardCards(env: Env, username: string, url: URL): Promise<Response> {
  const type = url.searchParams.get('type');
  const status = url.searchParams.get('status');
  const needle = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
  const rows = await env.DB.prepare(`
    SELECT card.id, card.type, card.title,
      substr(card.description, 1, 500) AS description,
      card.status, card.severity, card.ticket_number, card.is_beacon, card.owner, card.created_by,
      card.source_type, card.source_id, card.source_url, '' AS source_snapshot,
      card.created_at, card.updated_at, card.closed_at,
      (SELECT COUNT(*) FROM team_board_comments comment WHERE comment.card_id = card.id) AS comment_count
    FROM team_board_cards card
    WHERE (
      card.owner = ?1 COLLATE NOCASE
      OR card.created_by = ?1 COLLATE NOCASE
      OR EXISTS (SELECT 1 FROM team_board_members member
        WHERE member.card_id = card.id AND member.username = ?1 COLLATE NOCASE)
      OR EXISTS (
        SELECT 1 FROM team_board_card_rooms shared
        WHERE shared.card_id = card.id AND (
          shared.room_id = 'global'
          OR EXISTS (SELECT 1 FROM chat_conversations dm
            WHERE dm.room_id = shared.room_id AND dm.username = ?1 COLLATE NOCASE)
          OR EXISTS (SELECT 1 FROM chat_group_members group_member
            WHERE group_member.room_id = shared.room_id AND group_member.username = ?1 COLLATE NOCASE)
        )
      )
    )
      AND (?2 IS NULL OR card.type = ?2)
      AND (?3 IS NULL OR card.status = ?3)
      AND (?4 = '' OR lower(card.title || ' ' || card.description || ' ' ||
        card.ticket_number || ' ' || card.owner) LIKE ?5)
    ORDER BY CASE WHEN card.status = 'captured' THEN 1 ELSE 0 END,
      CASE card.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
      card.updated_at DESC
    LIMIT 300
  `).bind(
    username,
    ['ticket', 'incident', 'announcement', 'custom'].includes(type ?? '') ? type : null,
    ['signal', 'investigating', 'waiting', 'captured'].includes(status ?? '') ? status : null,
    needle.toLowerCase(),
    `%${escapeLike(needle.toLowerCase())}%`,
  ).all<TeamBoardCardRow>();
  return collabJson({ cards: (rows.results ?? []).map(teamBoardCardPublic) });
}

async function getTeamBoardCard(
  env: Env,
  username: string,
  cardId: string,
): Promise<Response> {
  const permission = await teamBoardPermission(env, username, cardId);
  if (!permission) return collabJson({ error: 'Card not found.' }, 404);
  const row = await env.DB.prepare(`
    SELECT card.*,
      (SELECT COUNT(*) FROM team_board_comments comment WHERE comment.card_id = card.id) AS comment_count
    FROM team_board_cards card WHERE card.id = ?
  `).bind(cardId).first<TeamBoardCardRow>();
  if (!row) return collabJson({ error: 'Card not found.' }, 404);
  const [members, comments, activity, session, sharedRooms] = await Promise.all([
    env.DB.prepare(
      `SELECT username, permission, added_by AS addedBy, created_at AS createdAt
       FROM team_board_members WHERE card_id = ? ORDER BY username COLLATE NOCASE`,
    ).bind(cardId).all(),
    env.DB.prepare(
      `SELECT id, author, markdown, mentions_json AS mentionsJson, created_at AS createdAt
       FROM team_board_comments WHERE card_id = ? ORDER BY created_at, id LIMIT 100`,
    ).bind(cardId).all<{
      id: string; author: string; markdown: string; mentionsJson: string; createdAt: number;
    }>(),
    env.DB.prepare(
      `SELECT id, actor, kind, detail, created_at AS createdAt
       FROM team_board_activity WHERE card_id = ? ORDER BY created_at DESC LIMIT 80`,
    ).bind(cardId).all(),
    env.DB.prepare(
      `SELECT id, created_by AS createdBy, state, focus_target AS focusTarget,
       scratchpad, started_at AS startedAt, ended_at AS endedAt
       FROM team_board_sessions WHERE card_id = ?`,
    ).bind(cardId).first<{
      id: string; createdBy: string; state: 'active' | 'ended'; focusTarget: string;
      scratchpad: string; startedAt: number; endedAt: number | null;
    }>(),
    env.DB.prepare(
      `SELECT room_id AS roomId, shared_by AS sharedBy, created_at AS createdAt
       FROM team_board_card_rooms WHERE card_id = ? ORDER BY created_at`,
    ).bind(cardId).all(),
  ]);
  let sessionWithMembership: Record<string, unknown> | null = null;
  if (session) {
    const participant = await env.DB.prepare(
      'SELECT 1 AS found FROM team_board_session_members WHERE session_id = ? AND username = ? COLLATE NOCASE AND left_at IS NULL',
    ).bind(session.id, username).first<{ found: number }>();
    const sessionMembers = await env.DB.prepare(
      `SELECT username, joined_at AS joinedAt FROM team_board_session_members
       WHERE session_id = ? AND left_at IS NULL ORDER BY joined_at`,
    ).bind(session.id).all();
    sessionWithMembership = {
      ...session,
      scratchpad: participant ? session.scratchpad : '',
      isParticipant: !!participant,
      members: sessionMembers.results ?? [],
    };
  }
  return collabJson({
    card: teamBoardCardPublic(row),
    permission,
    members: members.results ?? [],
    comments: (comments.results ?? []).map((comment) => {
      let mentions: string[] = [];
      try {
        const parsed: unknown = JSON.parse(comment.mentionsJson);
        if (Array.isArray(parsed)) mentions = parsed.filter((name): name is string => typeof name === 'string');
      } catch {
        /* Ignore malformed legacy mention metadata. */
      }
      return { id: comment.id, author: comment.author, markdown: comment.markdown, mentions, createdAt: comment.createdAt };
    }),
    activity: activity.results ?? [],
    session: sessionWithMembership,
    sharedRooms: sharedRooms.results ?? [],
  });
}

async function createTeamBoardCard(
  request: Request,
  env: Env,
  username: string,
): Promise<Response> {
  const payload = await readPayload(request);
  const type = payload?.type;
  const title = typeof payload?.title === 'string' ? payload.title.trim().replace(/\s+/g, ' ').slice(0, 180) : '';
  const description = typeof payload?.description === 'string' ? payload.description.trim().slice(0, 12_000) : '';
  if (!['ticket', 'incident', 'announcement', 'custom'].includes(type as string)) {
    return collabJson({ error: 'Choose a valid card type.' }, 400);
  }
  if (!title) return collabJson({ error: 'Every Team Board card needs a title.' }, 400);
  const id = crypto.randomUUID();
  const now = Date.now();
  const status: TeamBoardStatus = 'signal';
  const severity: TeamBoardSeverity = payload?.severity === 'low' || payload?.severity === 'high' || payload?.severity === 'critical'
    ? payload.severity
    : 'normal';
  const ticketNumber = typeof payload?.ticketNumber === 'string'
    ? payload.ticketNumber.trim().slice(0, 80)
    : '';
  const isBeacon = payload?.isBeacon === true;
  const sourceType = typeof payload?.sourceType === 'string' ? payload.sourceType.slice(0, 40) : null;
  const sourceId = typeof payload?.sourceId === 'string' ? payload.sourceId.slice(0, 120) : null;
  const sourceUrl = typeof payload?.sourceUrl === 'string' && payload.sourceUrl.startsWith('/')
    ? payload.sourceUrl.slice(0, 500)
    : null;
  const sourceSnapshot = typeof payload?.sourceSnapshot === 'string' ? payload.sourceSnapshot.slice(0, 20_000) : '';
  await env.DB.prepare(`
    INSERT INTO team_board_cards
      (id, type, title, description, status, severity, ticket_number, is_beacon, owner, created_by,
       source_type, source_id, source_url, source_snapshot, created_at, updated_at, closed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).bind(
    id, type as TeamBoardCardType, title, description, status, severity, ticketNumber, isBeacon ? 1 : 0,
    username, username, sourceType, sourceId, sourceUrl, sourceSnapshot, now, now,
  ).run();
  const mentions = await resolveTeamBoardMentions(env, `${title}\n${description}`);
  await shareTeamBoardCardWithUsers(env, id, username, mentions, title);
  await addTeamBoardActivity(env, id, username, 'created', `Created a ${type} card`);
  const room = env.TEAM_BOARD_ROOM.getByName('team-board');
  await room.broadcastCardChange(id, 'created');
  return collabJson({
    card: {
      id, type, title, description, status, severity, ticketNumber, owner: username, createdBy: username,
      sourceType, sourceId, sourceUrl, sourceSnapshot, createdAt: now, updatedAt: now, closedAt: null,
      commentCount: 0,
      isBeacon,
    },
  }, 201);
}

async function updateTeamBoardCard(
  request: Request,
  env: Env,
  username: string,
  cardId: string,
): Promise<Response> {
  const permission = await teamBoardPermission(env, username, cardId);
  if (permission !== 'owner' && permission !== 'edit') return collabJson({ error: 'You cannot edit this card.' }, 403);
  const payload = await readPayload(request);
  if (!payload) return collabJson({ error: 'Invalid card update.' }, 400);
  const current = await env.DB.prepare(
    'SELECT title, description, status, severity, ticket_number, owner FROM team_board_cards WHERE id = ?',
  ).bind(cardId).first<{
    title: string; description: string; status: TeamBoardStatus; severity: TeamBoardSeverity;
    ticket_number: string; owner: string;
  }>();
  if (!current) return collabJson({ error: 'Card not found.' }, 404);
  const title = typeof payload.title === 'string'
    ? payload.title.trim().replace(/\s+/g, ' ').slice(0, 180)
    : current.title;
  if (!title) return collabJson({ error: 'Every Team Board card needs a title.' }, 400);
  const description = typeof payload.description === 'string' ? payload.description.trim().slice(0, 12_000) : current.description;
  const status = ['signal', 'investigating', 'waiting', 'captured'].includes(payload.status as string)
    ? payload.status as TeamBoardStatus : current.status;
  const severity = ['low', 'normal', 'high', 'critical'].includes(payload.severity as string)
    ? payload.severity as TeamBoardSeverity : current.severity;
  const ticketNumber = typeof payload.ticketNumber === 'string'
    ? payload.ticketNumber.trim().slice(0, 80) : current.ticket_number;
  let owner = current.owner;
  if (permission === 'owner' && typeof payload.owner === 'string' && payload.owner.trim()) {
    const candidate = await env.DB.prepare(
      'SELECT username FROM auth_users WHERE username = ? COLLATE NOCASE',
    ).bind(payload.owner.trim()).first<{ username: string }>();
    if (!candidate) return collabJson({ error: 'Choose a registered card owner.' }, 404);
    owner = candidate.username;
    await env.DB.prepare(`
      INSERT INTO team_board_members (card_id, username, permission, added_by, created_at)
      VALUES (?, ?, 'edit', ?, ?)
      ON CONFLICT(card_id, username) DO UPDATE SET permission = 'edit', added_by = excluded.added_by
    `).bind(cardId, owner, username, Date.now()).run();
  }
  const now = Date.now();
  await env.DB.prepare(`
    UPDATE team_board_cards SET title = ?, description = ?, status = ?, severity = ?,
      ticket_number = ?, owner = ?, updated_at = ?, closed_at = ?
    WHERE id = ?
  `).bind(title, description, status, severity, ticketNumber, owner, now, status === 'captured' ? now : null, cardId).run();
  const mentions = await resolveTeamBoardMentions(env, `${title}\n${description}`);
  await shareTeamBoardCardWithUsers(env, cardId, username, mentions, title);
  await addTeamBoardActivity(env, cardId, username, 'updated', 'Updated card details');
  await env.TEAM_BOARD_ROOM.getByName('team-board').broadcastCardChange(cardId, 'updated');
  return collabJson({ ok: true });
}

async function shareTeamBoardCard(
  request: Request,
  env: Env,
  username: string,
  cardId: string,
): Promise<Response> {
  const permission = await teamBoardPermission(env, username, cardId);
  if (permission !== 'owner' && permission !== 'edit') return collabJson({ error: 'You cannot share this card.' }, 403);
  const payload = await readPayload(request);
  const roomId = typeof payload?.roomId === 'string' ? payload.roomId : '';
  if (!isValidChatRoomId(roomId) || !await isChatRoomMember(env, username, roomId)) {
    return collabJson({ error: 'Choose a chat you belong to.' }, 403);
  }
  await env.DB.prepare(`
    INSERT OR IGNORE INTO team_board_card_rooms (card_id, room_id, shared_by, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(cardId, roomId, username, Date.now()).run();
  const members = await getChatRoomMembers(env, roomId);
  const card = await env.DB.prepare('SELECT title FROM team_board_cards WHERE id = ?')
    .bind(cardId).first<{ title: string }>();
  await shareTeamBoardCardWithUsers(env, cardId, username, members, card?.title ?? 'Team Board card');
  await addTeamBoardActivity(env, cardId, username, 'shared_in_chat', roomId);
  await env.TEAM_BOARD_ROOM.getByName('team-board').broadcastCardChange(cardId, 'shared');
  return collabJson({ ok: true, url: `/board?card=${encodeURIComponent(cardId)}` });
}

async function createTeamBoardComment(
  request: Request,
  env: Env,
  username: string,
  cardId: string,
): Promise<Response> {
  if (!await teamBoardPermission(env, username, cardId)) return collabJson({ error: 'Card not found.' }, 404);
  const payload = await readPayload(request);
  const markdown = typeof payload?.markdown === 'string' ? payload.markdown.trim().slice(0, 8_000) : '';
  if (!markdown) return collabJson({ error: 'Write a comment first.' }, 400);
  const id = crypto.randomUUID();
  const now = Date.now();
  const mentions = await resolveTeamBoardMentions(env, markdown);
  await env.DB.prepare(`
    INSERT INTO team_board_comments (id, card_id, author, markdown, mentions_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, cardId, username, markdown, JSON.stringify(mentions), now).run();
  const card = await env.DB.prepare('SELECT title FROM team_board_cards WHERE id = ?')
    .bind(cardId).first<{ title: string }>();
  await shareTeamBoardCardWithUsers(env, cardId, username, mentions, card?.title ?? 'Team Board card');
  await addTeamBoardActivity(env, cardId, username, 'commented', markdown.slice(0, 400));
  await env.TEAM_BOARD_ROOM.getByName('team-board').broadcastCardChange(cardId, 'commented');
  return collabJson({
    comment: { id, cardId, author: username, markdown, mentions, createdAt: now },
  }, 201);
}

async function teamBoardSessionAction(
  request: Request,
  env: Env,
  username: string,
  cardId: string,
): Promise<Response> {
  const permission = await teamBoardPermission(env, username, cardId);
  if (!permission) return collabJson({ error: 'Card not found.' }, 404);
  const payload = await readPayload(request);
  const action = payload?.action;
  if ((action === 'start' || action === 'join') && permission === 'view') {
    return collabJson({ error: 'Edit access is required to join a pair session.' }, 403);
  }
  const now = Date.now();
  let assistStreak: number | null = null;
  let session = await env.DB.prepare(
    'SELECT id, state FROM team_board_sessions WHERE card_id = ?',
  ).bind(cardId).first<{ id: string; state: string }>();

  if (action === 'start') {
    if (session?.state === 'active') {
      await env.DB.prepare(`
        INSERT INTO team_board_session_members (session_id, username, joined_at, left_at)
        VALUES (?, ?, ?, NULL)
        ON CONFLICT(session_id, username) DO UPDATE SET joined_at = excluded.joined_at, left_at = NULL
      `).bind(session.id, username, now).run();
    } else {
      const id = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO team_board_sessions
          (id, card_id, created_by, state, focus_target, scratchpad, started_at, ended_at)
        VALUES (?, ?, ?, 'active', '', '', ?, NULL)
        ON CONFLICT(card_id) DO UPDATE SET id = excluded.id, created_by = excluded.created_by,
          state = 'active', focus_target = '', scratchpad = '', started_at = excluded.started_at, ended_at = NULL
      `).bind(id, cardId, username, now).run();
      session = { id, state: 'active' };
      await env.DB.prepare(`
        INSERT INTO team_board_session_members (session_id, username, joined_at, left_at)
        VALUES (?, ?, ?, NULL)
        ON CONFLICT(session_id, username) DO UPDATE SET joined_at = excluded.joined_at, left_at = NULL
      `).bind(id, username, now).run();
      await addTeamBoardActivity(env, cardId, username, 'pair_started', 'Started a pair-debug session');
    }
  } else if (!session || session.state !== 'active') {
    return collabJson({ error: 'There is no active pair session.' }, 409);
  } else if (action === 'join') {
    const alreadyJoined = await env.DB.prepare(
      `SELECT 1 AS found FROM team_board_session_members
       WHERE session_id = ? AND username = ? COLLATE NOCASE AND left_at IS NULL`,
    ).bind(session.id, username).first<{ found: number }>();
    await env.DB.prepare(`
      INSERT INTO team_board_session_members (session_id, username, joined_at, left_at)
      VALUES (?, ?, ?, NULL)
      ON CONFLICT(session_id, username) DO UPDATE SET joined_at = excluded.joined_at, left_at = NULL
    `).bind(session.id, username, now).run();
    await addTeamBoardActivity(env, cardId, username, 'pair_joined', 'Joined the pair-debug session');
    const card = await env.DB.prepare(
      'SELECT is_beacon, created_by FROM team_board_cards WHERE id = ?',
    ).bind(cardId).first<{ is_beacon: number; created_by: string }>();
    if (!alreadyJoined && card?.is_beacon === 1 && card.created_by.toLowerCase() !== username.toLowerCase()) {
      const previous = await env.DB.prepare(
        'SELECT streak_count, last_assist_at FROM team_board_assists WHERE username = ? COLLATE NOCASE',
      ).bind(username).first<{ streak_count: number; last_assist_at: number }>();
      assistStreak = previous && now - previous.last_assist_at <= 36 * 60 * 60 * 1000
        ? Number(previous.streak_count) + 1
        : 1;
      await env.DB.prepare(`
        INSERT INTO team_board_assists (username, streak_count, last_assist_at)
        VALUES (?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET
          streak_count = excluded.streak_count, last_assist_at = excluded.last_assist_at
      `).bind(username, assistStreak, now).run();
    }
  } else {
    const participant = await env.DB.prepare(
      'SELECT 1 AS found FROM team_board_session_members WHERE session_id = ? AND username = ? COLLATE NOCASE AND left_at IS NULL',
    ).bind(session.id, username).first<{ found: number }>();
    if (!participant) return collabJson({ error: 'Join the pair session to edit its scratchpad.' }, 403);
    if (action === 'scratchpad' && typeof payload?.scratchpad === 'string') {
      const scratchpad = payload.scratchpad.slice(0, 8_000);
      await env.DB.prepare('UPDATE team_board_sessions SET scratchpad = ? WHERE id = ?')
        .bind(scratchpad, session.id).run();
    } else if (action === 'focus' && typeof payload?.focusTarget === 'string') {
      const focusTarget = payload.focusTarget.startsWith('/') ? payload.focusTarget.slice(0, 500) : '';
      await env.DB.prepare('UPDATE team_board_sessions SET focus_target = ? WHERE id = ?')
        .bind(focusTarget, session.id).run();
    } else if (action === 'decision' && typeof payload?.decision === 'string' && payload.decision.trim()) {
      const decision = payload.decision.trim().slice(0, 2_000);
      await env.DB.prepare(`
        UPDATE team_board_cards SET
          description = substr(
            CASE WHEN trim(description) = '' THEN '' ELSE description || char(10) || char(10) END
              || 'Captured decision: ' || ?,
            1, 12000
          ),
          updated_at = ?
        WHERE id = ?
      `).bind(decision, now, cardId).run();
      await addTeamBoardActivity(env, cardId, username, 'decision_captured', decision);
    } else if (action === 'leave') {
      await env.DB.prepare(`
        UPDATE team_board_session_members SET left_at = ? WHERE session_id = ? AND username = ? COLLATE NOCASE
      `).bind(now, session.id, username).run();
      const activeMembers = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM team_board_session_members WHERE session_id = ? AND left_at IS NULL',
      ).bind(session.id).first<{ count: number }>();
      if (!activeMembers?.count) {
        await env.DB.prepare('UPDATE team_board_sessions SET state = ?, ended_at = ? WHERE id = ?')
          .bind('ended', now, session.id).run();
        await addTeamBoardActivity(env, cardId, username, 'pair_ended', 'Ended the pair-debug session');
      }
    } else {
      return collabJson({ error: 'Invalid pair-session action.' }, 400);
    }
  }
  await env.TEAM_BOARD_ROOM.getByName('team-board').broadcastCardChange(cardId, `session:${String(action)}`);
  const response = await getTeamBoardCard(env, username, cardId);
  if (assistStreak === null) return response;
  const body = await response.json() as Record<string, unknown>;
  return collabJson({ ...body, assistStreak });
}

async function createTeamBoardSocketTicket(
  request: Request,
  env: Env,
  username: string,
): Promise<Response> {
  let payload: { cardId?: unknown };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return collabJson({ error: 'Invalid JSON body.' }, 400);
  }
  const cardId = typeof payload.cardId === 'string' ? payload.cardId : '';
  if (cardId && (!/^[0-9a-f-]{36}$/i.test(cardId) || !await teamBoardPermission(env, username, cardId))) {
    return collabJson({ error: 'Card not found.' }, 404);
  }
  const ticket = await env.TEAM_BOARD_ROOM.getByName('team-board').createTicket(username);
  return collabJson({ ticket });
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
      'SELECT id, title, owner, created_at, updated_at, visibility, kind FROM collab_smartdocs ORDER BY updated_at DESC',
    ).all<CollabDocumentRow>(),
  ]);
  const rows = [
    ...(sheets.results ?? []).map((row) => ({ ...row, type: 'sheet' as const })),
    ...(mindmaps.results ?? []).map((row) => ({ ...row, type: 'mindmap' as const })),
    ...(smartDocs.results ?? []).map((row) => ({
      ...row,
      type: row.kind === 'smarttodo' ? 'smarttodo' as const : 'smartdoc' as const,
    })),
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
  if (url.pathname === '/api/collab/board/cards' && request.method === 'GET') {
    return listTeamBoardCards(env, username, url);
  }
  if (url.pathname === '/api/collab/board/cards' && request.method === 'POST') {
    return createTeamBoardCard(request, env, username);
  }
  if (url.pathname === '/api/collab/board/socket-ticket' && request.method === 'POST') {
    return createTeamBoardSocketTicket(request, env, username);
  }
  const boardMatch = /^\/api\/collab\/board\/cards\/([0-9a-f-]{36})(?:\/(comments|share|session))?$/i.exec(url.pathname);
  if (boardMatch) {
    const cardId = boardMatch[1];
    if (!boardMatch[2] && request.method === 'GET') return getTeamBoardCard(env, username, cardId);
    if (!boardMatch[2] && request.method === 'PATCH') return updateTeamBoardCard(request, env, username, cardId);
    if (boardMatch[2] === 'comments' && request.method === 'POST') {
      return createTeamBoardComment(request, env, username, cardId);
    }
    if (boardMatch[2] === 'share' && request.method === 'POST') {
      return shareTeamBoardCard(request, env, username, cardId);
    }
    if (boardMatch[2] === 'session' && request.method === 'POST') {
      return teamBoardSessionAction(request, env, username, cardId);
    }
  }
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
