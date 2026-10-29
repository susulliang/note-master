import {
  ensureCollabSchema,
  getSmartDocPermission,
  grantSmartDocPermission,
  type CollabPermission,
} from './collab-access';

const SMART_DOC_ID_RE = /^[0-9a-f-]{36}$/i;
const MAX_JSON_BYTES = 16 * 1024;
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const ALLOWED_MEDIA = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

interface SmartDocRow {
  id: string;
  title: string;
  owner: string;
  banner_asset_id: string | null;
  created_at: number;
  updated_at: number;
}

function smartDocsJson(data: unknown, status = 200): Response {
  const response = Response.json(data, { status });
  response.headers.set('access-control-allow-origin', '*');
  response.headers.set('access-control-allow-headers', 'content-type, authorization');
  response.headers.set('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  return response;
}

async function parseJson(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_JSON_BYTES) return null;
  try {
    const value: unknown = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function getSmartDoc(env: Env, id: string): Promise<SmartDocRow | null> {
  return env.DB.prepare(
    `SELECT id, title, owner, banner_asset_id, created_at, updated_at
     FROM collab_smartdocs WHERE id = ?`,
  ).bind(id).first<SmartDocRow>();
}

async function listSmartDocs(env: Env, username: string): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT id, title, owner, banner_asset_id, created_at, updated_at
     FROM collab_smartdocs ORDER BY updated_at DESC, title COLLATE NOCASE`,
  ).all<SmartDocRow>();
  const documents = await Promise.all((result.results ?? []).map(async (row) => {
    const permission = await getSmartDocPermission(env, username, row.id);
    if (!permission) return null;
    return {
      id: row.id,
      title: row.title,
      owner: row.owner,
      bannerAssetId: row.banner_asset_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      permission,
    };
  }));
  return smartDocsJson({
    documents: documents.filter((document): document is NonNullable<typeof document> => document !== null),
  });
}

async function createSmartDoc(request: Request, env: Env, username: string): Promise<Response> {
  const payload = await parseJson(request);
  const title = typeof payload?.title === 'string'
    ? payload.title.trim().replace(/\s+/g, ' ').slice(0, 100)
    : '';
  if (!title) return smartDocsJson({ error: 'Add a title for this Smart Doc.' }, 400);
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO collab_smartdocs (id, title, owner, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(id, title, username, now, now).run();
  await grantSmartDocPermission(env, id, username, 'edit');
  await env.SMARTDOC_ROOM.getByName(id).initialize();
  return smartDocsJson({
    document: {
      id,
      title,
      owner: username,
      bannerAssetId: null,
      createdAt: now,
      updatedAt: now,
      permission: 'edit',
    },
  }, 201);
}

async function issueSmartDocTicket(request: Request, env: Env, username: string): Promise<Response> {
  const payload = await parseJson(request);
  const id = typeof payload?.documentId === 'string' ? payload.documentId : '';
  if (!SMART_DOC_ID_RE.test(id)) return smartDocsJson({ error: 'Choose a valid Smart Doc.' }, 400);
  const permission = await getSmartDocPermission(env, username, id);
  if (!permission) return smartDocsJson({ error: 'You do not have access to this Smart Doc.' }, 403);
  const ticket = await env.SMARTDOC_ROOM.getByName(id).createTicket(username, permission);
  return smartDocsJson({ documentId: id, ticket, permission });
}

async function listAccess(env: Env, username: string, id: string): Promise<Response> {
  const document = await getSmartDoc(env, id);
  if (!document || document.owner.toLowerCase() !== username.toLowerCase()) {
    return smartDocsJson({ error: 'Only the document owner can manage access.' }, 403);
  }
  const members = await env.DB.prepare(
    `SELECT username, permission FROM collab_document_permissions
     WHERE document_type = 'smartdoc' AND document_id = ?
     ORDER BY username COLLATE NOCASE`,
  ).bind(id).all<{ username: string; permission: CollabPermission }>();
  return smartDocsJson({
    members: [
      { username: document.owner, permission: 'edit' as const, owner: true },
      ...(members.results ?? [])
        .filter((member) => member.username.toLowerCase() !== document.owner.toLowerCase())
        .map((member) => ({ ...member, owner: false })),
    ],
  });
}

async function updateAccess(
  request: Request,
  env: Env,
  username: string,
  id: string,
): Promise<Response> {
  const document = await getSmartDoc(env, id);
  if (!document || document.owner.toLowerCase() !== username.toLowerCase()) {
    return smartDocsJson({ error: 'Only the document owner can manage access.' }, 403);
  }
  const payload = await parseJson(request);
  const memberUsername = typeof payload?.username === 'string' ? payload.username.trim() : '';
  const permission = payload?.permission;
  if (
    !memberUsername ||
    memberUsername.length > 80 ||
    memberUsername.toLowerCase() === document.owner.toLowerCase()
  ) {
    return smartDocsJson({ error: 'Choose a registered collaborator.' }, 400);
  }
  const account = await env.DB.prepare(
    'SELECT username FROM auth_users WHERE username = ? COLLATE NOCASE',
  ).bind(memberUsername).first<{ username: string }>();
  if (!account) return smartDocsJson({ error: 'That account was not found.' }, 404);

  if (permission === 'view' || permission === 'edit') {
    await grantSmartDocPermission(env, id, account.username, permission);
  } else if (permission === 'remove') {
    await env.DB.prepare(
      `DELETE FROM collab_document_permissions
       WHERE document_type = 'smartdoc' AND document_id = ? AND username = ? COLLATE NOCASE`,
    ).bind(id, account.username).run();
  } else {
    return smartDocsJson({ error: 'Choose view or edit access.' }, 400);
  }
  await env.SMARTDOC_ROOM.getByName(id).revalidatePermissions();
  return listAccess(env, username, id);
}

async function updateSmartDoc(
  request: Request,
  env: Env,
  username: string,
  id: string,
): Promise<Response> {
  if (!SMART_DOC_ID_RE.test(id)) return smartDocsJson({ error: 'Smart Doc not found.' }, 404);
  const permission = await getSmartDocPermission(env, username, id);
  if (permission !== 'edit') return smartDocsJson({ error: 'You cannot edit this Smart Doc.' }, 403);
  const payload = await parseJson(request);
  if (!payload) return smartDocsJson({ error: 'Invalid document settings.' }, 400);
  const document = await getSmartDoc(env, id);
  if (!document) return smartDocsJson({ error: 'Smart Doc not found.' }, 404);
  const owner = document.owner.toLowerCase() === username.toLowerCase();
  const title = typeof payload.title === 'string'
    ? payload.title.trim().replace(/\s+/g, ' ').slice(0, 100)
    : document.title;
  if (!title) return smartDocsJson({ error: 'A document title cannot be empty.' }, 400);
  if (title !== document.title && !owner) {
    return smartDocsJson({ error: 'Only the owner can rename this document.' }, 403);
  }

  let bannerAssetId = document.banner_asset_id;
  if (Object.hasOwn(payload, 'bannerAssetId')) {
    if (payload.bannerAssetId === null || payload.bannerAssetId === '') {
      bannerAssetId = null;
    } else if (typeof payload.bannerAssetId === 'string' && SMART_DOC_ID_RE.test(payload.bannerAssetId)) {
      const asset = await env.DB.prepare(
        `SELECT id FROM collab_smartdoc_media
         WHERE id = ? AND document_id = ? AND mime_type LIKE 'image/%'`,
      ).bind(payload.bannerAssetId, id).first<{ id: string }>();
      if (!asset) return smartDocsJson({ error: 'Choose an image uploaded to this document.' }, 400);
      bannerAssetId = asset.id;
    } else {
      return smartDocsJson({ error: 'Choose a valid banner image.' }, 400);
    }
  }
  const updatedAt = Date.now();
  await env.DB.prepare(
    `UPDATE collab_smartdocs
     SET title = ?, banner_asset_id = ?, updated_at = ? WHERE id = ?`,
  ).bind(title, bannerAssetId, updatedAt, id).run();
  if (title !== document.title) await env.SMARTDOC_ROOM.getByName(id).broadcastTitle(title);
  return smartDocsJson({ id, title, owner: document.owner, bannerAssetId, updatedAt, permission });
}

async function uploadMedia(
  request: Request,
  env: Env,
  username: string,
  id: string,
): Promise<Response> {
  if (!SMART_DOC_ID_RE.test(id)) return smartDocsJson({ error: 'Smart Doc not found.' }, 404);
  if (await getSmartDocPermission(env, username, id) !== 'edit') {
    return smartDocsJson({ error: 'You cannot add media to this Smart Doc.' }, 403);
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_MEDIA_BYTES + 1024 * 1024) {
    return smartDocsJson({ error: 'Choose media smaller than 50 MB.' }, 413);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return smartDocsJson({ error: 'Choose an image or video to upload.' }, 400);
  }
  const file = form.get('file');
  if (!(file instanceof File)) return smartDocsJson({ error: 'Choose an image or video to upload.' }, 400);
  const mimeType = file.type.toLowerCase().split(';')[0];
  if (!ALLOWED_MEDIA.has(mimeType)) {
    return smartDocsJson({ error: 'Smart Docs supports PNG, JPG, GIF, WebP, AVIF, MP4, MOV, and WebM.' }, 415);
  }
  if (!file.size || file.size > MAX_MEDIA_BYTES) {
    return smartDocsJson({ error: 'Choose media smaller than 50 MB.' }, 413);
  }
  const assetId = crypto.randomUUID();
  const now = Date.now();
  const name = file.name.replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180) || 'Smart Doc media';
  const objectKey = `smartdocs/${id}/${assetId}`;
  try {
    await env.CHAT_MEDIA_BUCKET.put(objectKey, file.stream(), {
      httpMetadata: { contentType: mimeType, cacheControl: 'private, max-age=300' },
      customMetadata: { documentId: id, owner: username, name },
    });
    await env.DB.prepare(
      `INSERT INTO collab_smartdoc_media
       (id, document_id, name, mime_type, size_bytes, object_key, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(assetId, id, name, mimeType, file.size, objectKey, username, now).run();
  } catch (error) {
    await env.CHAT_MEDIA_BUCKET.delete(objectKey).catch(() => undefined);
    console.error(JSON.stringify({ event: 'smartdoc_media_upload_failed', error: String(error) }));
    return smartDocsJson({ error: 'Could not upload this media.' }, 500);
  }
  await env.DB.prepare('UPDATE collab_smartdocs SET updated_at = ? WHERE id = ?').bind(now, id).run();
  return smartDocsJson({
    asset: {
      id: assetId,
      documentId: id,
      name,
      mimeType,
      sizeBytes: file.size,
      url: `/api/collab/smartdocs/${id}/media/${assetId}`,
      createdAt: now,
    },
  }, 201);
}

async function serveMedia(
  env: Env,
  username: string,
  id: string,
  assetId: string,
): Promise<Response> {
  if (!SMART_DOC_ID_RE.test(id) || !SMART_DOC_ID_RE.test(assetId)) {
    return smartDocsJson({ error: 'Media not found.' }, 404);
  }
  if (!await getSmartDocPermission(env, username, id)) {
    return smartDocsJson({ error: 'You do not have access to this Smart Doc.' }, 403);
  }
  const media = await env.DB.prepare(
    `SELECT name, mime_type, object_key FROM collab_smartdoc_media
     WHERE id = ? AND document_id = ?`,
  ).bind(assetId, id).first<{ name: string; mime_type: string; object_key: string }>();
  if (!media) return smartDocsJson({ error: 'Media not found.' }, 404);
  const object = await env.CHAT_MEDIA_BUCKET.get(media.object_key);
  if (!object) return smartDocsJson({ error: 'Media content is unavailable.' }, 404);
  return new Response(object.body, {
    headers: {
      'content-type': media.mime_type,
      'content-disposition': `inline; filename="${media.name.replace(/["\r\n]/g, '_')}"`,
      'cache-control': 'private, no-store',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function serveDriveMedia(
  env: Env,
  username: string,
  id: string,
  fileId: string,
): Promise<Response> {
  if (!SMART_DOC_ID_RE.test(id) || !SMART_DOC_ID_RE.test(fileId)) {
    return smartDocsJson({ error: 'Drive media not found.' }, 404);
  }
  if (!await getSmartDocPermission(env, username, id)) {
    return smartDocsJson({ error: 'You do not have access to this Smart Doc.' }, 403);
  }
  const file = await env.DB.prepare(
    `SELECT f.name, f.mime_type, f.object_key
     FROM collab_smartdoc_drive_assets a
     JOIN collab_drive_files f ON f.id = a.file_id
     WHERE a.document_id = ? AND a.file_id = ?
       AND (f.mime_type LIKE 'image/%' OR f.mime_type LIKE 'video/%')`,
  ).bind(id, fileId).first<{ name: string; mime_type: string; object_key: string }>();
  if (!file) {
    return smartDocsJson({ error: 'Drive media not found.' }, 404);
  }
  const object = await env.CHAT_MEDIA_BUCKET.get(file.object_key);
  if (!object) return smartDocsJson({ error: 'Drive media content is unavailable.' }, 404);
  return new Response(object.body, {
    headers: {
      'content-type': file.mime_type,
      'content-disposition': `inline; filename="${file.name.replace(/["\r\n]/g, '_')}"`,
      'cache-control': 'private, no-store',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function attachDriveMedia(
  env: Env,
  username: string,
  id: string,
  fileId: string,
): Promise<Response> {
  if (!SMART_DOC_ID_RE.test(id) || !SMART_DOC_ID_RE.test(fileId)) {
    return smartDocsJson({ error: 'Choose valid Smart Docs and Drive media.' }, 400);
  }
  if (await getSmartDocPermission(env, username, id) !== 'edit') {
    return smartDocsJson({ error: 'You cannot add media to this Smart Doc.' }, 403);
  }
  const file = await env.DB.prepare(
    `SELECT id, name, mime_type, scope, owner FROM collab_drive_files WHERE id = ?
     AND (mime_type LIKE 'image/%' OR mime_type LIKE 'video/%')`,
  ).bind(fileId).first<{ id: string; name: string; mime_type: string; scope: string; owner: string }>();
  if (!file || (file.scope === 'personal' && file.owner.toLowerCase() !== username.toLowerCase())) {
    return smartDocsJson({ error: 'That Drive media is unavailable.' }, 404);
  }
  await env.DB.prepare(
    `INSERT OR IGNORE INTO collab_smartdoc_drive_assets
     (document_id, file_id, added_by, created_at) VALUES (?, ?, ?, ?)`,
  ).bind(id, fileId, username, Date.now()).run();
  return smartDocsJson({
    asset: {
      id: file.id,
      name: file.name,
      mimeType: file.mime_type,
      kind: file.mime_type.startsWith('video/') ? 'video' : 'image',
      url: `/api/collab/smartdocs/${id}/drive/${file.id}?kind=${file.mime_type.startsWith('video/') ? 'video' : 'image'}`,
    },
  });
}

async function deleteSmartDoc(
  env: Env,
  username: string,
  id: string,
): Promise<Response> {
  const document = await getSmartDoc(env, id);
  if (!document || document.owner.toLowerCase() !== username.toLowerCase()) {
    return smartDocsJson({ error: 'Only the owner can delete this Smart Doc.' }, 403);
  }
  const media = await env.DB.prepare(
    'SELECT object_key FROM collab_smartdoc_media WHERE document_id = ?',
  ).bind(id).all<{ object_key: string }>();
  await Promise.all((media.results ?? []).map(({ object_key }) => env.CHAT_MEDIA_BUCKET.delete(object_key)));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM collab_smartdoc_media WHERE document_id = ?').bind(id),
    env.DB.prepare(
      `DELETE FROM collab_document_permissions WHERE document_type = 'smartdoc' AND document_id = ?`,
    ).bind(id),
    env.DB.prepare('DELETE FROM collab_smartdoc_drive_assets WHERE document_id = ?').bind(id),
    env.DB.prepare('DELETE FROM collab_smartdocs WHERE id = ?').bind(id),
  ]);
  const room = env.SMARTDOC_ROOM.getByName(id);
  await room.revalidatePermissions();
  await room.deleteDocumentData();
  return smartDocsJson({ ok: true });
}

export async function handleSmartDocsApi(request: Request, env: Env, username: string): Promise<Response> {
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
  if (url.pathname === '/api/collab/smartdocs' && request.method === 'GET') {
    return listSmartDocs(env, username);
  }
  if (url.pathname === '/api/collab/smartdocs' && request.method === 'POST') {
    return createSmartDoc(request, env, username);
  }
  if (url.pathname === '/api/collab/smartdocs/socket-ticket' && request.method === 'POST') {
    return issueSmartDocTicket(request, env, username);
  }
  const mediaMatch = /^\/api\/collab\/smartdocs\/([^/]+)\/media(?:\/([^/]+))?$/.exec(url.pathname);
  if (mediaMatch && mediaMatch[2] && request.method === 'GET') {
    return serveMedia(env, username, mediaMatch[1], mediaMatch[2]);
  }
  if (mediaMatch && !mediaMatch[2] && request.method === 'POST') {
    return uploadMedia(request, env, username, mediaMatch[1]);
  }
  const driveMediaMatch = /^\/api\/collab\/smartdocs\/([^/]+)\/drive\/([^/]+)$/.exec(url.pathname);
  if (driveMediaMatch && request.method === 'POST') {
    return attachDriveMedia(env, username, driveMediaMatch[1], driveMediaMatch[2]);
  }
  if (driveMediaMatch && request.method === 'GET') {
    return serveDriveMedia(env, username, driveMediaMatch[1], driveMediaMatch[2]);
  }
  const accessMatch = /^\/api\/collab\/smartdocs\/([^/]+)\/access$/.exec(url.pathname);
  if (accessMatch && request.method === 'GET') return listAccess(env, username, accessMatch[1]);
  if (accessMatch && request.method === 'POST') {
    return updateAccess(request, env, username, accessMatch[1]);
  }
  const documentMatch = /^\/api\/collab\/smartdocs\/([^/]+)$/.exec(url.pathname);
  if (documentMatch && request.method === 'PATCH') {
    return updateSmartDoc(request, env, username, documentMatch[1]);
  }
  if (documentMatch && request.method === 'DELETE') {
    return deleteSmartDoc(env, username, documentMatch[1]);
  }
  return smartDocsJson({ error: 'Not found.' }, 404);
}
