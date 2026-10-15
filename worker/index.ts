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
  spice?: number;
}

interface AuthUser {
  username: string;
  isAdmin: boolean;
  spice: number;
  privileges: { dash: boolean; roster: boolean; trak: boolean };
}

interface StoreProductRow {
  id: string;
  name: string;
  emoji: string;
  description: string;
  price: number;
  active: number;
  image?: string | null;
  /** 'food' (feeds the cat companion) | 'other' — null for legacy rows. */
  category?: string | null;
  created_at: number;
  updated_at: number;
}

export interface StoreProduct {
  id: string;
  name: string;
  emoji: string;
  description: string;
  price: number;
  active: boolean;
  image: string | null;
  category: 'food' | 'other';
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

const AUTH_ADMIN_USERNAMES = new Set(['dezzy', 'hoi', 'alexia']);
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
    spice: Number(user.spice ?? 0),
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
  // Every login earns +1 spice (ledger row kept for audit).
  await ensureSpiceSchema(env);
  await env.DB.batch([
    env.DB.prepare('UPDATE auth_users SET spice = spice + 1, updated_at = ?2 WHERE username = ?1')
      .bind(user.username, Date.now()),
    env.DB.prepare("INSERT INTO spice_ledger (username, delta, reason, detail, created_at) VALUES (?1, 1, 'login', NULL, ?2)")
      .bind(user.username, Date.now()),
  ]);
  const fresh = await env.DB.prepare('SELECT * FROM auth_users WHERE username = ?')
    .bind(user.username)
    .first<AuthUserRow>();
  return authJson({ token, user: authPublicUser(fresh ?? user) });
}

async function handleAdminUsers(_request: Request, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT username, is_admin, dash_visible, roster_visible, trak_visible, spice, created_at
     FROM auth_users ORDER BY username COLLATE NOCASE`,
  ).all<AuthUserRow>();
  return authJson({
    users: (result.results ?? []).map((user) => ({
      ...authPublicUser(user),
      spice: Number(user.spice ?? 0),
      createdAt: Number(user.created_at),
    })),
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

/* ------------------------------ spice & store ------------------------------ */

/** One-time (per isolate) schema self-heal — mirrors migrations/0005_spice_store.sql
 *  so the endpoints work even before the migration is applied. */
let spiceSchemaPromise: Promise<void> | null = null;
async function ensureSpiceSchema(env: Env): Promise<void> {
  if (!spiceSchemaPromise) {
    spiceSchemaPromise = (async () => {
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS spice_ledger (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           username TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL,
           detail TEXT, created_at INTEGER NOT NULL
         )`
      ).run();
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS store_products (
           id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '🎁',
           description TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL,
           active INTEGER NOT NULL DEFAULT 1,
           created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
         )`
      ).run();
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS store_purchases (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           username TEXT NOT NULL, product_id TEXT NOT NULL, product_name TEXT NOT NULL,
           price INTEGER NOT NULL, created_at INTEGER NOT NULL
         )`
      ).run();
      try {
        await env.DB.prepare('ALTER TABLE auth_users ADD COLUMN spice INTEGER NOT NULL DEFAULT 0').run();
      } catch {
        /* column already exists */
      }
      try {
        await env.DB.prepare('ALTER TABLE store_products ADD COLUMN image TEXT').run();
      } catch {
        /* column already exists */
      }
      try {
        await env.DB.prepare("ALTER TABLE store_products ADD COLUMN category TEXT NOT NULL DEFAULT 'other'").run();
      } catch {
        /* column already exists */
      }
      // Cat companion pet state — one JSON blob per user (see src/lib/cat-pet.ts).
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS pet_state (
           username TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL
         )`
      ).run();
    })().catch((err) => {
      spiceSchemaPromise = null; // retry on the next request
      throw err;
    });
  }
  return spiceSchemaPromise;
}

/** QA spice tiers: 70/100 → +3, 80/100 → +5, 90/100 → +10. */
function qaSpiceAward(scorePct: number): number {
  if (scorePct >= 90) return 10;
  if (scorePct >= 80) return 5;
  if (scorePct >= 70) return 3;
  return 0;
}

/** POST /api/spice/qa { scorePct } — award spice for the FINAL QA score of a
 *  call. The client only submits once per call (at hang-up); the server adds
 *  a cooldown so rapid-fire replays can't farm spice. */
async function handleSpiceQa(request: Request, env: Env, user: AuthUserRow): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4_096) return authJson({ error: 'Request is too large' }, 413);
  let payload: { scorePct?: unknown };
  try {
    payload = (await request.json()) as { scorePct?: unknown };
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  const scorePct = Math.round(Number(payload.scorePct));
  if (!Number.isFinite(scorePct) || scorePct < 0 || scorePct > 200)
    return authJson({ error: 'Invalid score' }, 400);

  await ensureSpiceSchema(env);
  const award = qaSpiceAward(scorePct);
  if (award <= 0) return authJson({ awarded: 0, spice: Number(user.spice ?? 0) });

  // One QA award per 3 minutes — a real call takes at least that long.
  const last = await env.DB.prepare(
    "SELECT created_at FROM spice_ledger WHERE username = ?1 AND reason = 'qa' ORDER BY created_at DESC LIMIT 1"
  )
    .bind(user.username)
    .first<{ created_at: number }>();
  if (last && Date.now() - Number(last.created_at) < 180_000)
    return authJson({ error: 'QA award cooldown — one award per call' }, 429);

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE auth_users SET spice = spice + ?2, updated_at = ?3 WHERE username = ?1')
      .bind(user.username, award, now),
    env.DB.prepare("INSERT INTO spice_ledger (username, delta, reason, detail, created_at) VALUES (?1, ?2, 'qa', ?3, ?4)")
      .bind(user.username, award, `qa:${scorePct}`, now),
  ]);
  return authJson({ awarded: award, spice: Number(user.spice ?? 0) + award });
}

function storeProductPublic(row: StoreProductRow): StoreProduct {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    description: row.description,
    price: Number(row.price),
    active: Number(row.active) === 1,
    image: typeof row.image === 'string' && row.image ? row.image : null,
    category: row.category === 'food' ? 'food' : 'other',
  };
}

/** GET /api/pet — the caller's saved pet-state JSON blob (null if never set). */
async function handlePetGet(env: Env, user: AuthUserRow): Promise<Response> {
  await ensureSpiceSchema(env);
  const row = await env.DB.prepare('SELECT state FROM pet_state WHERE username = ?1')
    .bind(user.username)
    .first<{ state: string }>();
  return authJson({ state: row?.state ?? null });
}

/** POST /api/pet { state } — upsert the caller's pet-state JSON blob.
 *  The blob is opaque to the server (the client model owns the math); the
 *  server only enforces a size ceiling and last-write-wins semantics. */
async function handlePetSave(request: Request, env: Env, user: AuthUserRow): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 8_192) return authJson({ error: 'Pet state too large' }, 413);
  let payload: { state?: unknown };
  try {
    payload = (await request.json()) as { state?: unknown };
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  const state = typeof payload.state === 'string' ? payload.state : '';
  if (!state || state.length > 6_000) return authJson({ error: 'Invalid pet state' }, 400);
  await ensureSpiceSchema(env);
  await env.DB.prepare(
    `INSERT INTO pet_state (username, state, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(username) DO UPDATE SET state = ?2, updated_at = ?3`
  )
    .bind(user.username, state, Date.now())
    .run();
  return authJson({ ok: true });
}

/** GET /api/store — active products for the logged-in user. */
async function handleStoreGet(env: Env, includeInactive = false): Promise<Response> {
  await ensureSpiceSchema(env);
  const result = await env.DB.prepare(
    includeInactive
      ? 'SELECT * FROM store_products ORDER BY active DESC, created_at ASC'
      : 'SELECT * FROM store_products WHERE active = 1 ORDER BY created_at ASC'
  ).all<StoreProductRow>();
  return authJson({ products: (result.results ?? []).map(storeProductPublic) });
}

// ── AMR email templates (Salesforce export, admin-editable) ──────────────────

interface AmrTemplateRow {
  id: string;
  folder: string;
  name: string;
  description: string;
  subject: string;
  html: string;
  author: string;
  updated_at: number;
}

let amrSchemaPromise: Promise<void> | null = null;

/** amr_templates is created by scripts/import-amr-templates.mjs on the
 *  remote DB; self-heal here so a fresh D1 also works. */
async function ensureAmrSchema(env: Env): Promise<void> {
  if (!amrSchemaPromise) {
    amrSchemaPromise = env.DB
      .prepare(
        `CREATE TABLE IF NOT EXISTS amr_templates (
           id TEXT PRIMARY KEY,
           folder TEXT NOT NULL DEFAULT '',
           name TEXT NOT NULL,
           description TEXT NOT NULL DEFAULT '',
           subject TEXT NOT NULL DEFAULT '',
           html TEXT NOT NULL DEFAULT '',
           author TEXT NOT NULL DEFAULT '',
           updated_at INTEGER NOT NULL DEFAULT 0
         )`
      )
      .run()
      .then(() => undefined)
      .catch((err) => {
        amrSchemaPromise = null; // retry on the next request
        throw err;
      });
  }
  return amrSchemaPromise;
}

/** GET /api/amr-templates — the full AMR email-template pool (any logged-in
 *  user). ~320 rows; clients filter/search locally. */
async function handleAmrTemplatesGet(env: Env): Promise<Response> {
  await ensureAmrSchema(env);
  const result = await env.DB.prepare(
    `SELECT id, folder, name, description, subject, html, author,
            updated_at AS updatedAt
     FROM amr_templates ORDER BY name COLLATE NOCASE`
  ).all<AmrTemplateRow>();
  return authJson({ templates: result.results ?? [] });
}

/** POST /api/admin/amr-template — admin edit of one template row. Every
 *  successful edit earns the editing admin +5 spice. */
async function handleAmrTemplatePost(request: Request, env: Env, admin: AuthUserRow): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 512_000) return authJson({ error: 'Request is too large' }, 413);
  let payload: {
    id?: unknown;
    name?: unknown;
    folder?: unknown;
    description?: unknown;
    subject?: unknown;
    html?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  const id = typeof payload.id === 'string' ? payload.id.trim() : '';
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!/^00X[A-Za-z0-9]{12,}$/.test(id)) return authJson({ error: 'Missing template id' }, 400);
  if (!name || name.length > 200) return authJson({ error: 'Name must be 1–200 characters' }, 400);
  const folder = typeof payload.folder === 'string' ? payload.folder.slice(0, 120) : '';
  const description = typeof payload.description === 'string' ? payload.description.slice(0, 500) : '';
  const subject = typeof payload.subject === 'string' ? payload.subject.slice(0, 500) : '';
  const html = typeof payload.html === 'string' ? payload.html : '';
  if (html.length > 300_000) return authJson({ error: 'HTML body too large (max ~300 KB)' }, 400);
  await ensureAmrSchema(env);
  const result = await env.DB.prepare(
    `UPDATE amr_templates SET name = ?2, folder = ?3, description = ?4,
     subject = ?5, html = ?6, updated_at = ?7 WHERE id = ?1`
  )
    .bind(id, name, folder, description, subject, html, Date.now())
    .run();
  if (!result.meta.changes) return authJson({ error: 'Template not found' }, 404);
  // Every successful template edit earns the editing admin +5 spice.
  await ensureSpiceSchema(env);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE auth_users SET spice = spice + 5, updated_at = ?3 WHERE username = ?1')
      .bind(admin.username, 5, now),
    env.DB.prepare("INSERT INTO spice_ledger (username, delta, reason, detail, created_at) VALUES (?1, 5, 'amr', ?2, ?3)")
      .bind(admin.username, `amr:${id}`, now),
  ]);
  return authJson({ ok: true, spice: Number(admin.spice ?? 0) + 5 });
}

// ── SOP handbook (Feishu wiki export, admin-editable) ────────────────────────

interface SopEntryRow {
  id: string;
  level: number;
  title: string;
  body: string;
  parent_id: string | null;
  sort_order: number;
  updated_at: number;
}

let sopSchemaPromise: Promise<void> | null = null;

/** sop_entries is created by scripts/import-sop-wiki.mjs on the remote DB;
 *  self-heal here so a fresh D1 also works. */
async function ensureSopSchema(env: Env): Promise<void> {
  if (!sopSchemaPromise) {
    sopSchemaPromise = env.DB
      .prepare(
        `CREATE TABLE IF NOT EXISTS sop_entries (
           id TEXT PRIMARY KEY,
           level INTEGER NOT NULL,
           title TEXT NOT NULL,
           body TEXT NOT NULL DEFAULT '',
           parent_id TEXT,
           sort_order INTEGER NOT NULL,
           updated_at INTEGER NOT NULL DEFAULT 0
         )`
      )
      .run()
      .then(() => undefined)
      .catch((err) => {
        sopSchemaPromise = null; // retry on the next request
        throw err;
      });
  }
  return sopSchemaPromise;
}

/** GET /api/sop — the full SOP handbook as heading sections, in document
 *  order (any logged-in user). Clients reassemble raw markdown and reuse
 *  the existing indexer. */
async function handleSopGet(env: Env): Promise<Response> {
  await ensureSopSchema(env);
  const result = await env.DB.prepare(
    `SELECT id, level, title, body, parent_id AS parentId,
            sort_order AS sortOrder, updated_at AS updatedAt
     FROM sop_entries ORDER BY sort_order`
  ).all<SopEntryRow>();
  return authJson({ entries: result.results ?? [] });
}

/** POST /api/admin/sop-entry { id, title, body } — admin edit of one SOP
 *  heading section (title + own body). Structure (level/parent/order) is
 *  owned by the wiki re-import, not by edits. Every successful edit earns
 *  the editing admin +5 spice. */
async function handleSopEntryPost(request: Request, env: Env, admin: AuthUserRow): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 256_000) return authJson({ error: 'Request is too large' }, 413);
  let payload: { id?: unknown; title?: unknown; body?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  const id = typeof payload.id === 'string' ? payload.id.trim() : '';
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body : '';
  if (!/^h[1-6]-\d+$/.test(id)) return authJson({ error: 'Missing section id' }, 400);
  if (!title || title.length > 300) return authJson({ error: 'Title must be 1–300 characters' }, 400);
  if (body.length > 200_000) return authJson({ error: 'Body too large (max ~200 KB)' }, 400);
  await ensureSopSchema(env);
  const result = await env.DB.prepare(
    `UPDATE sop_entries SET title = ?2, body = ?3, updated_at = ?4 WHERE id = ?1`
  )
    .bind(id, title, body, Date.now())
    .run();
  if (!result.meta.changes) return authJson({ error: 'SOP section not found' }, 404);
  // Every successful SOP edit earns the editing admin +5 spice.
  await ensureSpiceSchema(env);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE auth_users SET spice = spice + 5, updated_at = ?3 WHERE username = ?1')
      .bind(admin.username, 5, now),
    env.DB.prepare("INSERT INTO spice_ledger (username, delta, reason, detail, created_at) VALUES (?1, 5, 'sop', ?2, ?3)")
      .bind(admin.username, `sop:${id}`, now),
  ]);
  return authJson({ ok: true, spice: Number(admin.spice ?? 0) + 5 });
}

// ── News & Updates knowledge base (admin-editable) ───────────────────────────

interface NewsEntryRow {
  id: string;
  date: string;
  title: string;
  author: string;
  body: string;
  updated_at: number;
}

let newsSchemaPromise: Promise<void> | null = null;

async function ensureNewsSchema(env: Env): Promise<void> {
  if (!newsSchemaPromise) {
    newsSchemaPromise = env.DB
      .prepare(
        `CREATE TABLE IF NOT EXISTS news_entries (
           id TEXT PRIMARY KEY,
           date TEXT NOT NULL,
           title TEXT NOT NULL,
           author TEXT NOT NULL DEFAULT '',
           body TEXT NOT NULL DEFAULT '',
           updated_at INTEGER NOT NULL DEFAULT 0
         )`
      )
      .run()
      .then(() => undefined)
      .catch((err) => {
        newsSchemaPromise = null; // retry on the next request
        throw err;
      });
  }
  return newsSchemaPromise;
}

/** GET /api/news — the full knowledge base, newest first (any logged-in user). */
async function handleNewsGet(env: Env): Promise<Response> {
  await ensureNewsSchema(env);
  const result = await env.DB.prepare(
    `SELECT id, date, title, author, body, updated_at AS updatedAt
     FROM news_entries ORDER BY date DESC, id DESC`
  ).all<NewsEntryRow>();
  return authJson({ entries: result.results ?? [] });
}

/** POST /api/admin/news-entry — admin add/edit of one knowledge update.
 *  Every successful write earns the editing admin +5 spice. */
async function handleNewsEntryPost(request: Request, env: Env, admin: AuthUserRow): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 512_000) return authJson({ error: 'Request is too large' }, 413);
  let payload: { id?: unknown; date?: unknown; title?: unknown; author?: unknown; body?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  const date = typeof payload.date === 'string' ? payload.date.trim() : '';
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const author = typeof payload.author === 'string' ? payload.author.trim().slice(0, 60) : '';
  const body = typeof payload.body === 'string' ? payload.body : '';
  const rawId = typeof payload.id === 'string' ? payload.id.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return authJson({ error: 'Date must be YYYY-MM-DD' }, 400);
  if (!title || title.length > 200) return authJson({ error: 'Title must be 1–200 characters' }, 400);
  if (body.length > 300_000) return authJson({ error: 'Body too large (max ~300 KB)' }, 400);
  // id: keep the existing slug on edit; derive `date-slug` from the title
  // on add (slug = lowercased ASCII words, de-duplicated if it collides).
  let id = rawId;
  if (!id) {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'update';
    id = `${date}-${slug}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(id)) return authJson({ error: 'Invalid entry id' }, 400);
  await ensureNewsSchema(env);
  await env.DB.prepare(
    `INSERT INTO news_entries (id, date, title, author, body, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET
       date = excluded.date, title = excluded.title, author = excluded.author,
       body = excluded.body, updated_at = excluded.updated_at`
  )
    .bind(id, date, title, author, body, Date.now())
    .run();
  // Every successful add/edit earns the editing admin +5 spice.
  await ensureSpiceSchema(env);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE auth_users SET spice = spice + 5, updated_at = ?3 WHERE username = ?1')
      .bind(admin.username, 5, now),
    env.DB.prepare("INSERT INTO spice_ledger (username, delta, reason, detail, created_at) VALUES (?1, 5, 'news', ?2, ?3)")
      .bind(admin.username, `news:${id}`, now),
  ]);
  return authJson({ ok: true, id, spice: Number(admin.spice ?? 0) + 5 });
}

/** POST /api/admin/news-delete { id } — admin removal of one knowledge
 *  update (no spice — deletions don't earn). */
async function handleNewsDelete(request: Request, env: Env): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4_096) return authJson({ error: 'Request is too large' }, 413);
  let payload: { id?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  const id = typeof payload.id === 'string' ? payload.id.trim() : '';
  if (!id || id.length > 120) return authJson({ error: 'Missing entry id' }, 400);
  await ensureNewsSchema(env);
  const result = await env.DB.prepare('DELETE FROM news_entries WHERE id = ?1').bind(id).run();
  if (!result.meta.changes) return authJson({ error: 'Entry not found' }, 404);
  return authJson({ ok: true });
}

/** GET /api/store/purchases — the 100 most recent store transactions,
 *  visible to every logged-in user (powers the DASH "Redeemed" widget). */
async function handleStorePurchases(env: Env): Promise<Response> {
  await ensureSpiceSchema(env);
  const result = await env.DB.prepare(
    `SELECT username, product_name AS productName, price, created_at AS createdAt
     FROM store_purchases ORDER BY created_at DESC LIMIT 100`
  ).all<{ username: string; productName: string; price: number; createdAt: number }>();
  return authJson({
    purchases: (result.results ?? []).map((row) => ({ ...row, price: Number(row.price) })),
  });
}

/** POST /api/store/purchase { productId } — atomic-ish spice deduction. */
async function handleStorePurchase(request: Request, env: Env, user: AuthUserRow): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4_096) return authJson({ error: 'Request is too large' }, 413);
  let payload: { productId?: unknown };
  try {
    payload = (await request.json()) as { productId?: unknown };
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  const productId = String(payload.productId ?? '');
  if (!productId) return authJson({ error: 'Missing productId' }, 400);

  await ensureSpiceSchema(env);
  const product = await env.DB.prepare('SELECT * FROM store_products WHERE id = ?1')
    .bind(productId)
    .first<StoreProductRow>();
  if (!product || Number(product.active) !== 1)
    return authJson({ error: 'Product not available' }, 404);

  const price = Number(product.price);
  const now = Date.now();
  const deduct = await env.DB.prepare(
    'UPDATE auth_users SET spice = spice - ?2, updated_at = ?3 WHERE username = ?1 AND spice >= ?2'
  )
    .bind(user.username, price, now)
    .run();
  if (!deduct.meta.changes)
    return authJson({ error: `Not enough spice — need ${price}, you have ${Number(user.spice ?? 0)}` }, 400);

  await env.DB.batch([
    env.DB.prepare("INSERT INTO spice_ledger (username, delta, reason, detail, created_at) VALUES (?1, ?2, 'store', ?3, ?4)")
      .bind(user.username, -price, product.name, now),
    env.DB.prepare(
      'INSERT INTO store_purchases (username, product_id, product_name, price, created_at) VALUES (?1, ?2, ?3, ?4, ?5)'
    )
      .bind(user.username, product.id, product.name, price, now),
  ]);
  return authJson({ ok: true, spice: Number(user.spice ?? 0) - price, product: storeProductPublic(product) });
}

interface AdminStorePayload {
  action?: unknown;
  product?: {
    id?: unknown;
    name?: unknown;
    emoji?: unknown;
    description?: unknown;
    price?: unknown;
    active?: unknown;
    image?: unknown;
    category?: unknown;
  };
}

/** POST /api/admin/store — { action: 'upsert' | 'delete', product: {...} }. */
async function handleAdminStorePost(request: Request, env: Env): Promise<Response> {
  // Raised for product images: a 256×256 PNG/JPEG data URL stays well under
  // ~150 KB base64, with headroom for the rest of the payload.
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 768_000) return authJson({ error: 'Request is too large' }, 413);
  let payload: AdminStorePayload;
  try {
    payload = (await request.json()) as AdminStorePayload;
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  await ensureSpiceSchema(env);

  if (payload.action === 'delete') {
    const id = String(payload.product?.id ?? '');
    if (!id) return authJson({ error: 'Missing product id' }, 400);
    const del = await env.DB.prepare('DELETE FROM store_products WHERE id = ?1').bind(id).run();
    if (!del.meta.changes) return authJson({ error: 'Product not found' }, 404);
    return authJson({ ok: true });
  }

  if (payload.action !== 'upsert') return authJson({ error: 'Unknown action (upsert | delete)' }, 400);
  const p = payload.product ?? {};
  const name = String(p.name ?? '').trim();
  const emoji = String(p.emoji ?? '🎁').trim() || '🎁';
  const description = String(p.description ?? '').trim();
  const price = Math.round(Number(p.price));
  const active = p.active === undefined ? true : !!p.active;
  // Product image: a client-produced data URL (PNG keeps alpha, JPEG for
  // photos) — never larger than ~350 KB after the 256×256 downscale.
  const image = typeof p.image === 'string' && p.image ? p.image : null;
  const category = p.category === 'food' ? 'food' : 'other';
  if (image && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image))
    return authJson({ error: 'Image must be a base64 PNG or JPEG data URL' }, 400);
  if (image && image.length > 500_000)
    return authJson({ error: 'Image too large (max ~350 KB)' }, 400);
  if (!name || name.length > 60) return authJson({ error: 'Name must be 1–60 characters' }, 400);
  if (emoji.length > 8) return authJson({ error: 'Emoji too long' }, 400);
  if (description.length > 200) return authJson({ error: 'Description too long (max 200)' }, 400);
  if (!Number.isFinite(price) || price < 1 || price > 100_000)
    return authJson({ error: 'Price must be 1–100000 spice' }, 400);

  const now = Date.now();
  const id = typeof p.id === 'string' && p.id ? p.id : crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO store_products (id, name, emoji, description, price, active, image, category, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?9, ?8, ?8)
     ON CONFLICT(id) DO UPDATE SET
       name = ?2, emoji = ?3, description = ?4, price = ?5, active = ?6, image = ?7, category = ?9, updated_at = ?8`
  )
    .bind(id, name, emoji, description, price, active ? 1 : 0, image, now, category)
    .run();
  const row = await env.DB.prepare('SELECT * FROM store_products WHERE id = ?1').bind(id).first<StoreProductRow>();
  return authJson({ ok: true, product: row ? storeProductPublic(row) : null });
}

async function handleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Preflight MUST carry the same CORS headers as authJson — otherwise
  // browsers on cross-origin deployments (Vercel, Tauri) fail the fetch
  // with a network error even though the API itself is reachable.
  if (request.method === 'OPTIONS') {
    const preflight = new Response(null, { status: 204 });
    preflight.headers.set('access-control-allow-origin', '*');
    preflight.headers.set('access-control-allow-headers', 'content-type, authorization');
    preflight.headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
    preflight.headers.set('access-control-max-age', '86400');
    return preflight;
  }
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

  // Roster read — any logged-in user (writes are admin-only, below).
  if (path === '/api/roster' && request.method === 'GET') {
    const user = await authBearerUser(request, env);
    if (!user) return authJson({ error: 'Not authenticated' }, 401);
    return handleRosterGet(request, env);
  }

  // Spice QA award — any logged-in user, one award per call (client submits
  // the FINAL QA score at hang-up; a server-side cooldown blocks farming).
  if (path === '/api/spice/qa' && request.method === 'POST') {
    const user = await authBearerUser(request, env);
    if (!user) return authJson({ error: 'Not authenticated' }, 401);
    return handleSpiceQa(request, env, user);
  }

  // Cat companion pet state — read/save the caller's own blob.
  if (path === '/api/pet' && request.method === 'GET') {
    const user = await authBearerUser(request, env);
    if (!user) return authJson({ error: 'Not authenticated' }, 401);
    return handlePetGet(env, user);
  }
  if (path === '/api/pet' && request.method === 'POST') {
    const user = await authBearerUser(request, env);
    if (!user) return authJson({ error: 'Not authenticated' }, 401);
    return handlePetSave(request, env, user);
  }

  // Store — active products list + purchase + transaction history,
  // any logged-in user.
  if (path === '/api/store' && request.method === 'GET') {
    const user = await authBearerUser(request, env);
    if (!user) return authJson({ error: 'Not authenticated' }, 401);
    return handleStoreGet(env);
  }
  if (path === '/api/store/purchases' && request.method === 'GET') {
    const user = await authBearerUser(request, env);
    if (!user) return authJson({ error: 'Not authenticated' }, 401);
    return handleStorePurchases(env);
  }

  // AMR email templates — read for any logged-in user; edits admin-only.
  if (path === '/api/amr-templates' && request.method === 'GET') {
    const user = await authBearerUser(request, env);
    if (!user) return authJson({ error: 'Not authenticated' }, 401);
    return handleAmrTemplatesGet(env);
  }

  // SOP handbook — read for any logged-in user; edits admin-only.
  if (path === '/api/sop' && request.method === 'GET') {
    const user = await authBearerUser(request, env);
    if (!user) return authJson({ error: 'Not authenticated' }, 401);
    return handleSopGet(env);
  }

  // News & Updates knowledge base — read for any logged-in user; writes
  // admin-only (see the /api/admin routes below).
  if (path === '/api/news' && request.method === 'GET') {
    const user = await authBearerUser(request, env);
    if (!user) return authJson({ error: 'Not authenticated' }, 401);
    return handleNewsGet(env);
  }
  if (path === '/api/store/purchase' && request.method === 'POST') {
    const user = await authBearerUser(request, env);
    if (!user) return authJson({ error: 'Not authenticated' }, 401);
    return handleStorePurchase(request, env, user);
  }

  // Admin routes — bearer must belong to an is_admin account.
  const admin = await authBearerUser(request, env);
  if (!admin || Number(admin.is_admin) !== 1) return authJson({ error: 'Admin only' }, 403);
  if (path === '/api/admin/users' && request.method === 'GET') return handleAdminUsers(request, env);
  if (path === '/api/admin/privileges' && request.method === 'POST') return handleAdminPrivileges(request, env);
  if (path === '/api/admin/delete' && request.method === 'POST') return handleAdminDelete(request, env);
  if (path === '/api/admin/store' && request.method === 'GET') return handleStoreGet(env, true);
  if (path === '/api/admin/store' && request.method === 'POST') return handleAdminStorePost(request, env);
  if (path === '/api/admin/amr-template' && request.method === 'POST') return handleAmrTemplatePost(request, env, admin);
  if (path === '/api/admin/sop-entry' && request.method === 'POST') return handleSopEntryPost(request, env, admin);
  if (path === '/api/admin/news-entry' && request.method === 'POST') return handleNewsEntryPost(request, env, admin);
  if (path === '/api/admin/news-delete' && request.method === 'POST') return handleNewsDelete(request, env);
  if (path === '/api/roster' && request.method === 'POST') return handleRosterPost(request, env);
  return authJson({ error: 'Not found' }, 404);
}

/* ------------------------------ roster sync -------------------------------- */

/**
 * POST /api/roster (admin only) — two modes:
 *   { month: 'YYYY-MM', mode: 'full', agents: [{ en, shifts: { iso: code } }] }
 *     → bulk-uploads every cell of the month (first submit).
 *   { month: 'YYYY-MM', mode: 'cell', en, iso, code }
 *     → upserts a single edited cell.
 */
async function handleRosterPost(request: Request, env: Env): Promise<Response> {
  let payload: {
    month?: string;
    mode?: string;
    agents?: Array<{ en: string; shifts: Record<string, string> }>;
    en?: string;
    iso?: string;
    code?: string;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  const month = String(payload.month ?? '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return authJson({ error: 'Invalid month (YYYY-MM)' }, 400);

  // Self-healing schema (mirrors migrations/0004_roster_cells.sql) so the
  // endpoint works even when the migration has not been applied yet.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS roster_cells (
      month_key TEXT NOT NULL, en TEXT NOT NULL, iso TEXT NOT NULL, code TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (month_key, en, iso)
    )`
  ).run();

  if (payload.mode === 'cell') {
    const en = String(payload.en ?? '').trim();
    const iso = String(payload.iso ?? '').trim();
    const code = String(payload.code ?? '').trim();
    if (!en || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return authJson({ error: 'Invalid cell' }, 400);
    await env.DB.prepare(
      `INSERT INTO roster_cells (month_key, en, iso, code, updated_at) VALUES (?1, ?2, ?3, ?4, datetime('now'))
       ON CONFLICT(month_key, en, iso) DO UPDATE SET code = ?4, updated_at = datetime('now')`
    )
      .bind(month, en, iso, code)
      .run();
    return authJson({ ok: true, mode: 'cell', month, en, iso, code });
  }

  if (payload.mode === 'full') {
    const agents = payload.agents ?? [];
    if (agents.length === 0) return authJson({ error: 'No agents provided' }, 400);
    // D1 caps bound parameters per statement — chunk the multi-row INSERTs
    // (20 rows × 4 params = 80 params per statement) and batch them.
    const rows: Array<[string, string, string]> = [];
    for (const a of agents) {
      for (const [iso, code] of Object.entries(a.shifts ?? {})) {
        rows.push([a.en, iso, String(code)]);
      }
    }
    if (rows.length === 0) return authJson({ error: 'No cells provided' }, 400);
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM roster_cells WHERE month_key = ?1`).bind(month),
      ...chunk(rows, 20).map(
        (part) =>
          env.DB.prepare(
            `INSERT INTO roster_cells (month_key, en, iso, code, updated_at) VALUES ${part
              .map((_, i) => `(?${i * 4 + 1}, ?${i * 4 + 2}, ?${i * 4 + 3}, ?${i * 4 + 4}, datetime('now'))`)
              .join(', ')}`
          ).bind(...part.flatMap((r) => [month, r[0], r[1], r[2]]))
      ),
    ]);
    return authJson({ ok: true, mode: 'full', month, cells: rows.length });
  }

  return authJson({ error: 'Unknown mode (full | cell)' }, 400);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** GET /api/roster?month=YYYY-MM (any logged-in user) — all cells for a month. */
async function handleRosterGet(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const month = url.searchParams.get('month') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return authJson({ error: 'Invalid month (YYYY-MM)' }, 400);
  const result = await env.DB.prepare(
    'SELECT en, iso, code, updated_at AS updatedAt FROM roster_cells WHERE month_key = ?1'
  )
    .bind(month)
    .all<{ en: string; iso: string; code: string; updatedAt: string }>();
  return authJson({ month, cells: result.results ?? [] });
}

async function handleKeywordAlerts(request: Request, env: Env): Promise<Response> {
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
  const alerts = parseKeywordAlerts(payload.alerts);
  if (!alerts) return json({ error: 'Invalid keyword alert list' }, 400);

  // Admin-only writes — the old shared-password gate is gone; a logged-in
  // admin session (bearer token) is the single source of authority.
  const admin = await authBearerUser(request, env);
  if (!admin || Number(admin.is_admin) !== 1) return json({ error: 'Admin only' }, 403);

  try {
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
    // Every successful save earns the editing admin +5 spice.
    await ensureSpiceSchema(env);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('UPDATE auth_users SET spice = spice + 5, updated_at = ?3 WHERE username = ?1')
        .bind(admin.username, 5, now),
      env.DB.prepare("INSERT INTO spice_ledger (username, delta, reason, detail, created_at) VALUES (?1, 5, 'alerts', ?2, ?3)")
        .bind(admin.username, `alerts:${alerts.length}`, now),
    ]);
    return json({ success: true, count: alerts.length, spice: Number(admin.spice ?? 0) + 5 });
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
    if (
      url.pathname.startsWith('/api/auth/') ||
      url.pathname.startsWith('/api/admin/') ||
      url.pathname.startsWith('/api/roster') ||
      url.pathname.startsWith('/api/store') ||
      url.pathname.startsWith('/api/spice') ||
      url.pathname.startsWith('/api/amr-templates') ||
      url.pathname.startsWith('/api/sop') ||
      url.pathname.startsWith('/api/news')
    ) {
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
