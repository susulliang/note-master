/**
 * Worker entry for the Cloudflare Workers deploy (see wrangler.jsonc).
 *
 * Static assets are served for the SPA; this handler only receives requests
 * routed via `run_worker_first` (tool APIs), and
 * reads and writes tool data through the D1 `eco-data` database via the
 * bound `DB` binding — no API token is needed client-side.
 */

/// <reference path="./worker-configuration.d.ts" />

interface TestResultSummary {
  totalSubmissions: number;
  averageScorePct: number | null;
  bestScorePct: number | null;
  uniqueAgents: number;
  totalCorrect: number | null;
  totalQuestionsAnswered: number | null;
}

interface TestScoreBand {
  label: string;
  count: number;
}

interface RecentTestResult {
  id: number;
  agentName: string;
  suiteLabel: string;
  scorePct: number;
  correct: number;
  total: number;
  submittedAt: string;
}

interface TestResultPayload {
  agentName?: unknown;
  suiteId?: unknown;
  suiteLabel?: unknown;
  scorePct?: unknown;
  correct?: unknown;
  total?: unknown;
  report?: unknown;
}

// ── Auth (D1-backed accounts) ────────────────────────────────────────────────

interface AuthUserRow {
  username: string;
  hash: string;
  is_admin: number;
  dash_visible: number;
  roster_visible: number;
  trak_visible: number;
  created_at: number;
}

interface AuthUser {
  username: string;
  isAdmin: boolean;
  privileges: { dash: boolean; roster: boolean; trak: boolean };
}

interface RegisterPayload {
  username?: unknown;
  password?: unknown;
  confirm?: unknown;
}

interface LoginPayload {
  username?: unknown;
  password?: unknown;
}

interface PrivilegesPayload {
  username?: unknown;
  dash?: unknown;
  roster?: unknown;
  trak?: unknown;
}

const AUTH_ADMIN_USERNAMES = new Set(['dezzy']);
const AUTH_EXTRA_NAMES = ['Dezzy', 'Jingyang', 'Troy', 'Yolanda'];
const AUTH_NAME_RE = /^[A-Za-z][A-Za-z .'-]{0,31}$/;
const AUTH_MIN_PASSWORD_LEN = 4;
const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const AUTH_PBKDF2_ITERATIONS = 100_000;

interface KeywordAlertRow {
  id: string;
  keyword: string;
  alert: string;
  format: 'markdown' | 'html';
  sortOrder: number;
}

interface KeywordAlertPayload {
  password?: unknown;
  alerts?: unknown;
}

interface PasswordVerifier {
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function parsePasswordVerifier(value: string | undefined): PasswordVerifier | null {
  if (!value) return null;
  const [scheme, rounds, saltText, hashText] = value.split('$');
  const iterations = Number(rounds);
  const salt = saltText ? decodeBase64(saltText) : null;
  const hash = hashText ? decodeBase64(hashText) : null;
  if (
    scheme !== 'pbkdf2-sha256' ||
    !Number.isInteger(iterations) || iterations !== 100_000 ||
    !salt || salt.length < 16 ||
    !hash || hash.length !== 32
  ) return null;
  return { iterations, salt, hash };
}

async function verifyAdminPassword(password: string, verifier: PasswordVerifier): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: verifier.salt.buffer.slice(
        verifier.salt.byteOffset,
        verifier.salt.byteOffset + verifier.salt.byteLength,
      ) as ArrayBuffer,
      iterations: verifier.iterations,
    },
    key,
    verifier.hash.length * 8,
  );
  const candidate = new Uint8Array(bits);
  let mismatch = 0;
  for (let index = 0; index < verifier.hash.length; index += 1) {
    mismatch |= candidate[index]! ^ verifier.hash[index]!;
  }
  return mismatch === 0;
}

async function hashRemoteAddress(address: string, verifier: PasswordVerifier): Promise<string> {
  const keyBytes = verifier.hash.buffer.slice(
    verifier.hash.byteOffset,
    verifier.hash.byteOffset + verifier.hash.byteLength,
  ) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(address)),
  );
  return btoa(Array.from(signature, (byte) => String.fromCharCode(byte)).join(''));
}

function parseKeywordAlerts(value: unknown): KeywordAlertRow[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const ids = new Set<string>();
  const rows: KeywordAlertRow[] = [];
  for (const [sortOrder, item] of value.entries()) {
    if (!item || typeof item !== 'object') return null;
    const alert = item as Record<string, unknown>;
    if (
      typeof alert.id !== 'string' || !alert.id.trim() || alert.id.length > 100 ||
      ids.has(alert.id) ||
      typeof alert.keyword !== 'string' || !alert.keyword.trim() || alert.keyword.length > 200 ||
      typeof alert.alert !== 'string' || !alert.alert.trim() || alert.alert.length > 10_000 ||
      (alert.format !== 'markdown' && alert.format !== 'html')
    ) return null;
    ids.add(alert.id);
    rows.push({
      id: alert.id.trim(),
      keyword: alert.keyword.trim(),
      alert: alert.alert,
      format: alert.format,
      sortOrder,
    });
  }
  return rows;
}

// ── Auth handlers ────────────────────────────────────────────────────────────

function authJson(data: unknown, status = 200): Response {
  const response = json(data, status);
  // The SPA also runs from Vercel / the Tauri desktop shell and always talks
  // to this Worker cross-origin. Auth requests carry the password or bearer
  // token in the payload/headers, so permissive CORS carries no CSRF risk.
  response.headers.set('access-control-allow-origin', '*');
  response.headers.set('access-control-allow-headers', 'content-type, authorization');
  response.headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  return response;
}

function encodeB64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}

/** Same PBKDF2-SHA256 scheme as the alert admin hash ("pbkdf2-sha256$iter$salt$hash"). */
async function authHashPassword(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer,
      iterations: AUTH_PBKDF2_ITERATIONS,
    },
    key,
    256,
  );
  return `pbkdf2-sha256$${AUTH_PBKDF2_ITERATIONS}$${encodeB64(salt)}$${encodeB64(new Uint8Array(bits))}`;
}

function authNormalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ');
  return AUTH_NAME_RE.test(name) ? name : null;
}

function authPublicUser(user: AuthUserRow): AuthUser {
  return {
    username: user.username,
    isAdmin: Number(user.is_admin) === 1,
    privileges: {
      dash: Number(user.dash_visible) === 1,
      roster: Number(user.roster_visible) === 1,
      trak: Number(user.trak_visible) === 1,
    },
  };
}

async function authIssueSession(env: Env, username: string): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const token = encodeB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO auth_sessions (token, username, expires_at, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(token, username, now + AUTH_SESSION_TTL_MS, now)
    .run();
  return token;
}

async function authBearerUser(request: Request, env: Env): Promise<AuthUserRow | null> {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match) return null;
  return env.DB.prepare(
    `SELECT u.* FROM auth_sessions s JOIN auth_users u ON u.username = s.username
     WHERE s.token = ? AND s.expires_at > ?`,
  )
    .bind(match[1], Date.now())
    .first<AuthUserRow>();
}

async function handleAuthRegister(request: Request, env: Env): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4_096) return authJson({ error: 'Request is too large' }, 413);
  let payload: RegisterPayload;
  try {
    payload = (await request.json()) as RegisterPayload;
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  const username = authNormalizeName(payload.username);
  if (!username) return authJson({ error: 'Invalid username' }, 400);
  if (typeof payload.password !== 'string' || payload.password.length < AUTH_MIN_PASSWORD_LEN)
    return authJson({ error: `Password must be at least ${AUTH_MIN_PASSWORD_LEN} characters` }, 400);
  if (payload.password !== payload.confirm) return authJson({ error: 'Passwords do not match' }, 400);

  const existing = await env.DB.prepare('SELECT username FROM auth_users WHERE username = ?1 COLLATE NOCASE')
    .bind(username)
    .first();
  if (existing) return authJson({ error: 'User already exists — try logging in' }, 409);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await authHashPassword(payload.password, salt);
  const now = Date.now();
  const isAdmin = AUTH_ADMIN_USERNAMES.has(username.toLowerCase()) ? 1 : 0;
  const insert = await env.DB.prepare(
    `INSERT INTO auth_users (username, hash, is_admin, dash_visible, roster_visible, trak_visible, created_at, updated_at)
     VALUES (?, ?, ?, 1, 1, 1, ?, ?)`,
  )
    .bind(username, hash, isAdmin, now, now)
    .run();
  if (!insert.success) return authJson({ error: 'Registration failed' }, 500);

  const user = await env.DB.prepare('SELECT * FROM auth_users WHERE username = ?')
    .bind(username)
    .first<AuthUserRow>();
  if (!user) return authJson({ error: 'Registration failed' }, 500);
  const token = await authIssueSession(env, username);
  return authJson({ token, user: authPublicUser(user) }, 201);
}

async function handleAuthLogin(request: Request, env: Env): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4_096) return authJson({ error: 'Request is too large' }, 413);
  let payload: LoginPayload;
  try {
    payload = (await request.json()) as LoginPayload;
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  const username = authNormalizeName(payload.username);
  if (!username || typeof payload.password !== 'string')
    return authJson({ error: 'Invalid username or password' }, 401);

  // Case-insensitive lookup — "dezzy" and "Dezzy" are the same account.
  const user = await env.DB.prepare('SELECT * FROM auth_users WHERE username = ?1 COLLATE NOCASE')
    .bind(username)
    .first<AuthUserRow>();
  if (user) {
    const verifier = parsePasswordVerifier(user.hash);
    if (!verifier || !(await verifyAdminPassword(payload.password, verifier)))
      return authJson({ error: 'Invalid username or password' }, 401);
  } else {
    // Burn comparable PBKDF2 time so unknown usernames aren't distinguishable.
    await verifyAdminPassword(
      payload.password,
      parsePasswordVerifier(
        `pbkdf2-sha256$${AUTH_PBKDF2_ITERATIONS}$${encodeB64(crypto.getRandomValues(new Uint8Array(16)))}$${encodeB64(
          crypto.getRandomValues(new Uint8Array(32)),
        )}`,
      ) as PasswordVerifier,
    );
    return authJson({ error: 'Invalid username or password' }, 401);
  }
  // Session rows must use the canonical username case (from the DB row) —
  // the sessions↔users JOIN is case-sensitive.
  const token = await authIssueSession(env, user.username);
  return authJson({ token, user: authPublicUser(user) });
}

async function handleAdminUsers(_request: Request, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT username, is_admin, dash_visible, roster_visible, trak_visible, created_at
     FROM auth_users ORDER BY username COLLATE NOCASE`,
  ).all<AuthUserRow>();
  return authJson({
    users: (result.results ?? []).map((user) => ({ ...authPublicUser(user), createdAt: Number(user.created_at) })),
  });
}

async function handleAdminPrivileges(request: Request, env: Env): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4_096) return authJson({ error: 'Request is too large' }, 413);
  let payload: PrivilegesPayload;
  try {
    payload = (await request.json()) as PrivilegesPayload;
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  const username = authNormalizeName(payload.username);
  if (!username) return authJson({ error: 'Invalid username' }, 400);
  const asInt = (v: unknown) => (v === undefined ? null : v ? 1 : 0);
  const update = await env.DB.prepare(
    `UPDATE auth_users SET
       dash_visible = COALESCE(?2, dash_visible),
       roster_visible = COALESCE(?3, roster_visible),
       trak_visible = COALESCE(?4, trak_visible),
       updated_at = ?5
     WHERE username = ?1 COLLATE NOCASE`,
  )
    .bind(username, asInt(payload.dash), asInt(payload.roster), asInt(payload.trak), Date.now())
    .run();
  if (!update.meta.changes) return authJson({ error: 'User not found' }, 404);
  const user = await env.DB.prepare('SELECT * FROM auth_users WHERE username = ?1 COLLATE NOCASE')
    .bind(username)
    .first<AuthUserRow>();
  return authJson({ user: user ? authPublicUser(user) : null });
}

async function handleAdminDelete(request: Request, env: Env): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4_096) return authJson({ error: 'Request is too large' }, 413);
  let payload: LoginPayload;
  try {
    payload = (await request.json()) as LoginPayload;
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  const username = authNormalizeName(payload.username);
  if (!username) return authJson({ error: 'Invalid username' }, 400);
  if (AUTH_ADMIN_USERNAMES.has(username.toLowerCase()))
    return authJson({ error: 'Cannot delete the admin account' }, 400);
  await env.DB.prepare('DELETE FROM auth_sessions WHERE username = ?1 COLLATE NOCASE').bind(username).run();
  const del = await env.DB.prepare('DELETE FROM auth_users WHERE username = ?1 COLLATE NOCASE').bind(username).run();
  if (!del.meta.changes) return authJson({ error: 'User not found' }, 404);
  return authJson({ ok: true });
}

async function handleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (path === '/api/auth/health' && request.method === 'GET') return authJson({ ok: true });
  if (path === '/api/auth/names' && request.method === 'GET')
    return authJson({ names: AUTH_EXTRA_NAMES, admin: [...AUTH_ADMIN_USERNAMES] });
  if (path === '/api/auth/register' && request.method === 'POST') return handleAuthRegister(request, env);
  if (path === '/api/auth/login' && request.method === 'POST') return handleAuthLogin(request, env);

  if (path === '/api/auth/logout' && request.method === 'POST') {
    const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '');
    if (match) await env.DB.prepare('DELETE FROM auth_sessions WHERE token = ?').bind(match[1]).run();
    return authJson({ ok: true });
  }
  if (path === '/api/auth/me' && request.method === 'GET') {
    const user = await authBearerUser(request, env);
    if (!user) return authJson({ error: 'Not authenticated' }, 401);
    return authJson({ user: authPublicUser(user) });
  }

  // Admin routes — bearer must belong to an is_admin account.
  const admin = await authBearerUser(request, env);
  if (!admin || Number(admin.is_admin) !== 1) return authJson({ error: 'Admin only' }, 403);
  if (path === '/api/admin/users' && request.method === 'GET') return handleAdminUsers(request, env);
  if (path === '/api/admin/privileges' && request.method === 'POST') return handleAdminPrivileges(request, env);
  if (path === '/api/admin/delete' && request.method === 'POST') return handleAdminDelete(request, env);
  return authJson({ error: 'Not found' }, 404);
}

async function handleKeywordAlerts(
  request: Request,
  env: Env & { ALERT_ADMIN_PASSWORD_HASH?: string },
): Promise<Response> {
  if (request.method === 'GET') {
    try {
      const result = await env.DB.prepare(
        `SELECT id, keyword, alert, content_format AS format, sort_order AS sortOrder
         FROM keyword_alerts ORDER BY sort_order, id`
      ).all<KeywordAlertRow>();
      return json({ alerts: result.results.map((row) => ({ ...row, sortOrder: Number(row.sortOrder) })) });
    } catch {
      return json({ error: 'Could not load keyword alerts' }, 500);
    }
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 256_000) return json({ error: 'Request is too large' }, 413);

  let payload: KeywordAlertPayload;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 256_000) {
      return json({ error: 'Request is too large' }, 413);
    }
    payload = JSON.parse(body) as KeywordAlertPayload;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (
    typeof payload.password !== 'string' || payload.password.length < 1 || payload.password.length > 256
  ) return json({ error: 'Password required' }, 400);
  const alerts = parseKeywordAlerts(payload.alerts);
  if (!alerts) return json({ error: 'Invalid keyword alert list' }, 400);

  const verifier = parsePasswordVerifier(env.ALERT_ADMIN_PASSWORD_HASH);
  if (!verifier) return json({ error: 'Alert management is not configured' }, 503);
  const remoteAddress = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const remoteHash = await hashRemoteAddress(remoteAddress, verifier);
  const now = Math.floor(Date.now() / 1000);
  const attempt = await env.DB.prepare(
    'SELECT window_started AS windowStarted, failures FROM keyword_alert_login_attempts WHERE ip_hash = ?'
  ).bind(remoteHash).first<{ windowStarted: number; failures: number }>();
  if (
    attempt &&
    now - Number(attempt.windowStarted) < 900 &&
    Number(attempt.failures) >= 10
  ) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);

  if (!(await verifyAdminPassword(payload.password, verifier))) {
    await env.DB.prepare(
      `INSERT INTO keyword_alert_login_attempts (ip_hash, window_started, failures)
       VALUES (?, ?, 1)
       ON CONFLICT(ip_hash) DO UPDATE SET
         window_started = CASE
           WHEN excluded.window_started - keyword_alert_login_attempts.window_started >= 900
           THEN excluded.window_started ELSE keyword_alert_login_attempts.window_started END,
         failures = CASE
           WHEN excluded.window_started - keyword_alert_login_attempts.window_started >= 900
           THEN 1 ELSE keyword_alert_login_attempts.failures + 1 END`
    ).bind(remoteHash, now).run();
    return json({ error: 'Incorrect password' }, 401);
  }

  try {
    await env.DB.prepare(
      'DELETE FROM keyword_alert_login_attempts WHERE ip_hash = ?'
    ).bind(remoteHash).run();
    const statements = [
      env.DB.prepare('DELETE FROM keyword_alerts'),
      ...alerts.map((alert) =>
        env.DB.prepare(
          `INSERT INTO keyword_alerts (id, keyword, alert, content_format, sort_order)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(alert.id, alert.keyword, alert.alert, alert.format, alert.sortOrder)
      ),
    ];
    const results = await env.DB.batch(statements);
    const failedResults = results.filter((result) => !result.success);
    if (failedResults.length > 0) {
      console.error(JSON.stringify({
        event: 'keyword_alert_batch_failed',
        failedCount: failedResults.length,
        metadata: failedResults.map((result) => result.meta),
      }));
      return json({ error: 'Could not save keyword alerts' }, 500);
    }
    return json({ success: true, count: alerts.length });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'keyword_alert_save_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
    return json({ error: 'Could not save keyword alerts' }, 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/keyword-alerts') {
      return handleKeywordAlerts(request, env);
    }
    if (url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/admin/')) {
      return handleAuth(request, env);
    }
    if (url.pathname !== '/api/test-results') {
      return json({ error: 'Not found' }, 404);
    }
    if (request.method === 'GET') {
      try {
        const [summary, bands, recent] = await Promise.all([
          env.DB.prepare(
            `SELECT
              COUNT(*) AS totalSubmissions,
              AVG(score_pct) AS averageScorePct,
              MAX(score_pct) AS bestScorePct,
              COUNT(DISTINCT agent_name) AS uniqueAgents,
              SUM(correct) AS totalCorrect,
              SUM(total) AS totalQuestionsAnswered
            FROM test_results`
          ).first<TestResultSummary>(),
          env.DB.prepare(
            `SELECT
              CASE
                WHEN score_pct < 60 THEN 'Below 60'
                WHEN score_pct < 75 THEN '60-74'
                WHEN score_pct < 90 THEN '75-89'
                ELSE '90-100'
              END AS label,
              COUNT(*) AS count,
              MIN(score_pct) AS floor
            FROM test_results
            GROUP BY label
            ORDER BY floor`
          ).all<TestScoreBand>(),
          env.DB.prepare(
            `SELECT
              id,
              agent_name AS agentName,
              suite_label AS suiteLabel,
              score_pct AS scorePct,
              correct,
              total,
              submitted_at AS submittedAt
            FROM test_results
            ORDER BY datetime(submitted_at) DESC, id DESC
            LIMIT 10`
          ).all<RecentTestResult>(),
        ]);

        return json({
          totalSubmissions: Number(summary?.totalSubmissions ?? 0),
          averageScorePct: summary?.averageScorePct == null ? null : Number(summary.averageScorePct),
          bestScorePct: summary?.bestScorePct == null ? null : Number(summary.bestScorePct),
          uniqueAgents: Number(summary?.uniqueAgents ?? 0),
          totalCorrect: Number(summary?.totalCorrect ?? 0),
          totalQuestionsAnswered: Number(summary?.totalQuestionsAnswered ?? 0),
          overallAccuracyPct: summary?.totalQuestionsAnswered
            ? Number(summary.totalCorrect ?? 0) / Number(summary.totalQuestionsAnswered) * 100
            : null,
          scoreBands: bands.results.map((band) => ({
            label: band.label,
            count: Number(band.count),
          })),
          recent: recent.results.map((result) => ({
            ...result,
            id: Number(result.id),
            scorePct: Number(result.scorePct),
            correct: Number(result.correct),
            total: Number(result.total),
          })),
        });
      } catch {
        return json({ error: 'Could not load test score submissions' }, 500);
      }
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let payload: TestResultPayload;
    try {
      payload = (await request.json()) as TestResultPayload;
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const { agentName, suiteId, suiteLabel, scorePct, correct, total, report } = payload;
    if (
      typeof agentName !== 'string' || !agentName.trim() ||
      typeof suiteId !== 'string' || !suiteId.trim() ||
      typeof suiteLabel !== 'string' || !suiteLabel.trim() ||
      typeof scorePct !== 'number' || !Number.isFinite(scorePct) ||
      typeof correct !== 'number' ||
      typeof total !== 'number' ||
      typeof report !== 'string' || !report.trim()
    ) {
      return json({ error: 'Missing or invalid required fields' }, 400);
    }

    try {
      const result = await env.DB.prepare(
        'INSERT INTO test_results (agent_name, suite_id, suite_label, score_pct, correct, total, report) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(
          agentName.trim(),
          suiteId.trim(),
          suiteLabel.trim(),
          scorePct,
          Math.trunc(correct),
          Math.trunc(total),
          report
        )
        .run();
      if (!result.success) {
        return json({ error: 'D1 insert failed' }, 500);
      }
      return json({ success: true, id: result.meta.last_row_id ?? null });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'D1 insert error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
