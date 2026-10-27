interface SheetUser {
  username: string;
}

interface SheetRow {
  id: string;
  title: string;
  owner: string;
  created_at: number;
  updated_at: number;
  member_count: number;
}

const MAX_BODY_BYTES = 8 * 1024;
const SHEET_ID_RE = /^[0-9a-f-]{36}$/i;

function sheetsJson(data: unknown, status = 200): Response {
  const response = Response.json(data, { status });
  response.headers.set('access-control-allow-origin', '*');
  response.headers.set('access-control-allow-headers', 'content-type, authorization');
  response.headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  return response;
}

async function ensureSheetsSchema(env: Env): Promise<void> {
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
    CREATE INDEX IF NOT EXISTS collaborative_sheet_members_user_idx
    ON collaborative_sheet_members (username, joined_at DESC)
  `).run();
}

async function parseJson(request: Request): Promise<Record<string, unknown> | null> {
  const declaredSize = Number(request.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_BODY_BYTES) return null;
  try {
    const value: unknown = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function resolveUsers(env: Env, usernames: string[], owner: string): Promise<string[] | null> {
  const requested = [...new Set([owner, ...usernames]
    .map((username) => username.trim().toLowerCase())
    .filter(Boolean))];
  if (requested.length > 50) return null;
  const placeholders = requested.map(() => '?').join(', ');
  const result = await env.DB.prepare(
    `SELECT username FROM auth_users WHERE lower(username) IN (${placeholders})`,
  ).bind(...requested).all<SheetUser>();
  const found = result.results ?? [];
  if (found.length !== requested.length) return null;
  return found.map((user) => user.username);
}

async function getSheetOwner(env: Env, sheetId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    'SELECT owner FROM collaborative_sheets WHERE id = ?',
  ).bind(sheetId).first<{ owner: string }>();
  return row?.owner ?? null;
}

async function isSheetMember(env: Env, sheetId: string, username: string): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT 1 AS found FROM collaborative_sheet_members WHERE sheet_id = ? AND username = ? COLLATE NOCASE LIMIT 1',
  ).bind(sheetId, username).first<{ found: number }>();
  return !!row;
}

async function listSheets(env: Env, username: string): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT s.id, s.title, s.owner, s.created_at, s.updated_at,
           COUNT(m_all.username) AS member_count
    FROM collaborative_sheets s
    JOIN collaborative_sheet_members mine
      ON mine.sheet_id = s.id AND mine.username = ? COLLATE NOCASE
    JOIN collaborative_sheet_members m_all ON m_all.sheet_id = s.id
    GROUP BY s.id
    ORDER BY s.updated_at DESC, s.title COLLATE NOCASE
  `).bind(username).all<SheetRow>();
  return sheetsJson({
    sheets: (result.results ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      owner: row.owner,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      memberCount: Number(row.member_count),
    })),
  });
}

async function createSheet(request: Request, env: Env, username: string): Promise<Response> {
  const payload = await parseJson(request);
  if (!payload) return sheetsJson({ error: 'Invalid or oversized request.' }, 400);
  const title = typeof payload.title === 'string'
    ? payload.title.trim().replace(/\s+/g, ' ').slice(0, 60)
    : '';
  if (!title) return sheetsJson({ error: 'Add a name for the sheet.' }, 400);
  if (
    !Array.isArray(payload.usernames) ||
    payload.usernames.length > 49 ||
    payload.usernames.some((value) => typeof value !== 'string')
  ) return sheetsJson({ error: 'Choose up to 49 registered collaborators.' }, 400);
  const usernames = await resolveUsers(env, payload.usernames as string[], username);
  if (!usernames) return sheetsJson({ error: 'One or more selected accounts could not be found.' }, 404);

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO collaborative_sheets (id, title, owner, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(id, title, username, now, now),
    ...usernames.map((member) => env.DB.prepare(
      'INSERT INTO collaborative_sheet_members (sheet_id, username, joined_at) VALUES (?, ?, ?)',
    ).bind(id, member, now)),
  ]);
  await env.SHEETS_ROOM.getByName(id).initialize(10, 10);
  return sheetsJson({
    sheet: { id, title, owner: username, createdAt: now, updatedAt: now, memberCount: usernames.length },
  }, 201);
}

async function listMembers(env: Env, username: string, sheetId: string): Promise<Response> {
  if (!SHEET_ID_RE.test(sheetId) || !await isSheetMember(env, sheetId, username)) {
    return sheetsJson({ error: 'Sheet not found.' }, 404);
  }
  const result = await env.DB.prepare(
    `SELECT m.username, s.owner
     FROM collaborative_sheet_members m
     JOIN collaborative_sheets s ON s.id = m.sheet_id
     WHERE m.sheet_id = ?
     ORDER BY CASE WHEN m.username = s.owner COLLATE NOCASE THEN 0 ELSE 1 END, m.username COLLATE NOCASE`,
  ).bind(sheetId).all<{ username: string; owner: string }>();
  return sheetsJson({
    members: (result.results ?? []).map((member) => ({
      username: member.username,
      owner: member.username.toLowerCase() === member.owner.toLowerCase(),
    })),
  });
}

async function addMembers(request: Request, env: Env, username: string, sheetId: string): Promise<Response> {
  if (!SHEET_ID_RE.test(sheetId) || (await getSheetOwner(env, sheetId))?.toLowerCase() !== username.toLowerCase()) {
    return sheetsJson({ error: 'Only the sheet owner can invite collaborators.' }, 403);
  }
  const payload = await parseJson(request);
  if (
    !payload ||
    !Array.isArray(payload.usernames) ||
    payload.usernames.length > 49 ||
    payload.usernames.some((value) => typeof value !== 'string')
  ) return sheetsJson({ error: 'Choose up to 49 registered collaborators.' }, 400);
  const usernames = await resolveUsers(env, payload.usernames as string[], username);
  if (!usernames) return sheetsJson({ error: 'One or more selected accounts could not be found.' }, 404);
  const joinedAt = Date.now();
  await env.DB.batch(usernames.map((member) => env.DB.prepare(
    'INSERT OR IGNORE INTO collaborative_sheet_members (sheet_id, username, joined_at) VALUES (?, ?, ?)',
  ).bind(sheetId, member, joinedAt)));
  return listMembers(env, username, sheetId);
}

async function renameSheet(request: Request, env: Env, username: string): Promise<Response> {
  const payload = await parseJson(request);
  if (!payload || typeof payload.id !== 'string' || typeof payload.title !== 'string') {
    return sheetsJson({ error: 'A sheet and title are required.' }, 400);
  }
  const id = payload.id;
  if (!SHEET_ID_RE.test(id) || (await getSheetOwner(env, id))?.toLowerCase() !== username.toLowerCase()) {
    return sheetsJson({ error: 'Only the sheet owner can rename this sheet.' }, 403);
  }
  const title = payload.title.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!title) return sheetsJson({ error: 'A title cannot be empty.' }, 400);
  const now = Date.now();
  await env.DB.prepare('UPDATE collaborative_sheets SET title = ?, updated_at = ? WHERE id = ?')
    .bind(title, now, id)
    .run();
  await env.SHEETS_ROOM.getByName(id).broadcastTitle(title);
  return sheetsJson({ id, title, updatedAt: now });
}

async function issueSocketTicket(request: Request, env: Env, username: string): Promise<Response> {
  const payload = await parseJson(request);
  const sheetId = typeof payload?.sheetId === 'string' ? payload.sheetId : '';
  if (!SHEET_ID_RE.test(sheetId) || !await isSheetMember(env, sheetId, username)) {
    return sheetsJson({ error: 'You do not have access to this sheet.' }, 403);
  }
  const ticket = await env.SHEETS_ROOM.getByName(sheetId).createTicket(username);
  return sheetsJson({ sheetId, ticket });
}

export async function handleSheetsApi(
  request: Request,
  env: Env,
  username: string,
): Promise<Response> {
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
  await ensureSheetsSchema(env);
  if (url.pathname === '/api/sheets' && request.method === 'GET') return listSheets(env, username);
  if (url.pathname === '/api/sheets' && request.method === 'POST') return createSheet(request, env, username);
  if (url.pathname === '/api/sheets/socket-ticket' && request.method === 'POST') {
    return issueSocketTicket(request, env, username);
  }
  if (url.pathname === '/api/sheets/rename' && request.method === 'POST') {
    return renameSheet(request, env, username);
  }
  const membersMatch = /^\/api\/sheets\/([^/]+)\/members$/.exec(url.pathname);
  if (membersMatch && request.method === 'GET') return listMembers(env, username, membersMatch[1]);
  if (membersMatch && request.method === 'POST') {
    return addMembers(request, env, username, membersMatch[1]);
  }
  return sheetsJson({ error: 'Not found.' }, 404);
}
