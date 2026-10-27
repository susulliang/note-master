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
}

const MAX_BODY_BYTES = 8 * 1024;
const DOCUMENT_ID_RE = /^[0-9a-f-]{36}$/i;

function collabJson(data: unknown, status = 200): Response {
  const response = Response.json(data, { status });
  response.headers.set('access-control-allow-origin', '*');
  response.headers.set('access-control-allow-headers', 'content-type, authorization');
  response.headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  return response;
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
  const [sheets, mindmaps] = await Promise.all([
    env.DB.prepare(
      'SELECT id, title, owner, created_at, updated_at FROM collaborative_sheets ORDER BY updated_at DESC',
    ).all<CollabDocumentRow>(),
    env.DB.prepare(
      'SELECT id, title, owner, created_at, updated_at FROM collab_mindmaps ORDER BY updated_at DESC',
    ).all<CollabDocumentRow>(),
  ]);
  const rows = [
    ...(sheets.results ?? []).map((row) => ({ ...row, type: 'sheet' as const })),
    ...(mindmaps.results ?? []).map((row) => ({ ...row, type: 'mindmap' as const })),
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
        'access-control-allow-methods': 'GET, POST, OPTIONS',
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
  return collabJson({ error: 'Not found.' }, 404);
}
