/**
 * Worker entry for the Cloudflare Workers deploy (see wrangler.jsonc).
 *
 * Static assets are served for the SPA; this handler only receives requests
 * routed via `run_worker_first` (tool APIs), and
 * reads and writes tool data through the D1 `eco-data` database via the
 * bound `DB` binding — no API token is needed client-side.
 */

/// <reference path="./worker-configuration.d.ts" />

import { TCG_SETS } from './tcg-manifest.gen';
import GB_POOLIUS from './npc/GB_Poolius.json';

/** An NPC challenge persona (see worker/npc/*.json). */
interface NpcPersona {
  system_prompt: string[];
  initial_output: { gb_message: string; agent_choices: string[]; status: string };
}

/** Persona registry — id → persona. Also seeded into the eco-data D1
 *  `npc_personas` table on first use (see ensureNpcSchema). */
const NPC_PERSONAS: Record<string, NpcPersona> = {
  'gb_poolius': GB_POOLIUS as unknown as NpcPersona,
};

const CHALLENGE_SUCCESS_SPICE = 5;

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
  category: 'food' | 'wheel' | 'other';
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
const AUTH_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
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
  // New accounts start with SHIFTS/roster only — DASH and TRAK are unlocked
  // per-user by an admin. Admin usernames keep everything from day one.
  const dashVisible = isAdmin;
  const trakVisible = isAdmin;
  const insert = await env.DB.prepare(
    `INSERT INTO auth_users (username, hash, is_admin, dash_visible, roster_visible, trak_visible, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
  )
    .bind(username, hash, isAdmin, dashVisible, trakVisible, now, now)
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
      // Wheel of Fortune — one pre-paid spin per wheel-product purchase. The
      // token is minted at purchase time and consumed exactly once at spin
      // time, so each purchase can yield at most one server-decided reward.
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS wheel_spins (
           token TEXT PRIMARY KEY,
           username TEXT NOT NULL,
           product_id TEXT NOT NULL,
           pocket INTEGER,
           reward INTEGER NOT NULL DEFAULT 0,
           consumed INTEGER NOT NULL DEFAULT 0,
           created_at INTEGER NOT NULL,
           consumed_at INTEGER
         )`
      ).run();
      // TCG card draws — one row per (user, card) with a duplicate counter.
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS card_collection (
           username TEXT NOT NULL,
           card_id TEXT NOT NULL,
           qty INTEGER NOT NULL DEFAULT 1,
           first_acquired INTEGER NOT NULL,
           last_acquired INTEGER NOT NULL,
           PRIMARY KEY (username, card_id)
         )`
      ).run();
      // COMMUNE town square — live agent presence (pruned continuously) and
      // the per-agent display loadout (3 cards + a pet + a phrase).
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS commune_presence (
           username TEXT PRIMARY KEY,
           is_admin INTEGER NOT NULL DEFAULT 0,
           x REAL NOT NULL,
           y REAL NOT NULL,
           status TEXT NOT NULL DEFAULT '',
           seen_at INTEGER NOT NULL
         )`
      ).run();
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS commune_loadout (
           username TEXT PRIMARY KEY,
           cards TEXT NOT NULL DEFAULT '[]',
           pet TEXT NOT NULL DEFAULT '',
           phrase TEXT NOT NULL DEFAULT '',
           updated_at INTEGER NOT NULL
         )`
      ).run();
      // COMMUNE spice drops — spice piles scattered around the town square;
      // the first agent to walk over one claims it (+1 spice).
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS commune_spice_drops (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           x REAL NOT NULL,
           y REAL NOT NULL,
           picked_by TEXT,
           picked_at INTEGER,
           created_at INTEGER NOT NULL
         )`
      ).run();
      // NPC challenge personas — seeded from worker/npc/*.json on first use.
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS npc_personas (
           id TEXT PRIMARY KEY,
           name TEXT NOT NULL,
           data TEXT NOT NULL,
           created_at INTEGER NOT NULL
         )`
      ).run();
      // Seed the SDS card-draw store item (id-stable; price/edits via admin).
      const nowSeed = Date.now();
      await env.DB.prepare(
        `INSERT OR IGNORE INTO store_products
           (id, name, emoji, description, price, active, category, created_at, updated_at)
         VALUES ('tcg-sds-card', 'The Seven Deadly Sins — Draw a Card', '🃏',
           'Open a pack from the Seven Deadly Sins TCG set — 249 cards, rarity set by market price. Results land in My Collection.',
           9, 1, 'cards', ?1, ?1)`
      ).bind(nowSeed).run();
      // Seed the Pokémon Rare Bundles draw (premium tier, 99 spice).
      await env.DB.prepare(
        `INSERT OR IGNORE INTO store_products
           (id, name, emoji, description, price, active, category, created_at, updated_at)
         VALUES ('tcg-pokemon-rare', 'Pokémon Rare Bundles — Draw a Card', '🃏',
           'Premium Pokémon draw — a curated pool of 150 rare & illustration cards across every era, chase cards included. Results land in My Collection.',
           99, 1, 'cards', ?1, ?1)`
      ).bind(nowSeed).run();
      // Seed the AoT foil draw (mid tier, 29 spice).
      await env.DB.prepare(
        `INSERT OR IGNORE INTO store_products
           (id, name, emoji, description, price, active, category, created_at, updated_at)
         VALUES ('tcg-aot-card', 'Attack on Titan — Draw a Card', '🃏',
           'Draw from the Attack on Titan foil pool — Final Season + Vol. 1 & 2 sets merged, rarity set by market price. Results land in My Collection.',
           29, 1, 'cards', ?1, ?1)`
      ).bind(nowSeed).run();
      // Seed the Resident Evil character draw (19 spice).
      await env.DB.prepare(
        `INSERT OR IGNORE INTO store_products
           (id, name, emoji, description, price, active, category, created_at, updated_at)
         VALUES ('tcg-re-card', 'Resident Evil — Draw a Card', '🧟',
           'Draw a Character card from the Resident Evil Deck-Building Game — all 10 Premier survivors & villains, Wesker included. Results land in My Collection.',
           19, 1, 'cards', ?1, ?1)`
      ).bind(nowSeed).run();
      // Heal any card-draw rows whose category was reset by an older admin
      // save — the draw only fires when the category is 'cards'.
      await env.DB.prepare(
        `UPDATE store_products SET category = 'cards' WHERE id IN ('tcg-sds-card', 'tcg-aot-card', 'tcg-re-card', 'tcg-pokemon-rare')`
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

/** Spice for a completed self-test suite run: 10 base, +10 over 70, +20
 *  over 80, +30 over 90, and +30 more for a perfect 100 (stacking). */
function testSpiceAward(scorePct: number): number {
  let award = 10;
  if (scorePct > 70) award += 10;
  if (scorePct > 80) award += 20;
  if (scorePct > 90) award += 30;
  if (scorePct === 100) award += 30;
  return award;
}

/** POST /api/spice/test { suiteId, scorePct } — award spice for a completed
 *  self-test run. Server-side: the client reports the suite + final score;
 *  a 3-minute cooldown (mirrors QA awards) throttles repeat-attempt farming. */
async function handleSpiceTest(request: Request, env: Env, user: AuthUserRow): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4_096) return authJson({ error: 'Request is too large' }, 413);
  let payload: { suiteId?: unknown; scorePct?: unknown };
  try {
    payload = (await request.json()) as { suiteId?: unknown; scorePct?: unknown };
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  const suiteId = typeof payload.suiteId === 'string' ? payload.suiteId.trim() : '';
  const scorePct = Math.round(Number(payload.scorePct));
  if (!suiteId || suiteId.length > 120) return authJson({ error: 'Invalid suite id' }, 400);
  if (!Number.isFinite(scorePct) || scorePct < 0 || scorePct > 100)
    return authJson({ error: 'Invalid score' }, 400);

  await ensureSpiceSchema(env);

  // One test award per 3 minutes across all suites — repeat attempts are
  // allowed for practice, but only pace-limited for spice.
  const last = await env.DB.prepare(
    "SELECT created_at FROM spice_ledger WHERE username = ?1 AND reason = 'test' ORDER BY created_at DESC LIMIT 1"
  )
    .bind(user.username)
    .first<{ created_at: number }>();
  if (last && Date.now() - Number(last.created_at) < 180_000)
    return authJson({ error: 'Test award cooldown — try again in a few minutes' }, 429);

  const award = testSpiceAward(scorePct);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE auth_users SET spice = spice + ?2, updated_at = ?3 WHERE username = ?1')
      .bind(user.username, award, now),
    env.DB.prepare("INSERT INTO spice_ledger (username, delta, reason, detail, created_at) VALUES (?1, ?2, 'test', ?3, ?4)")
      .bind(user.username, award, `test:${suiteId}:${scorePct}`, now),
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
    category: row.category === 'food' ? 'food' : row.category === 'wheel' ? 'wheel' : 'other',
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

  // Wheel of Fortune products: mint a one-time spin token so the client can
  // run the roulette animation and claim exactly one server-decided reward.
  const isWheel = product.category === 'wheel' || /wheel/i.test(product.name);
  if (isWheel) {
    const token = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO wheel_spins (token, username, product_id, created_at) VALUES (?1, ?2, ?3, ?4)'
    ).bind(token, user.username, product.id, now).run();
    return authJson({ ok: true, spice: Number(user.spice ?? 0) - price, product: storeProductPublic(product), spinToken: token });
  }

  // TCG card products: decide the card server-side (rarity-weighted), record
  // it in the collection, and return it immediately — the client animation is
  // a pure reveal of this outcome.
  if (product.category === 'cards') {
    const setId = TCG_PRODUCT_SETS[product.id] ?? 'sds';
    const card = pickTcgCard(setId);
    await env.DB.prepare(
      `INSERT INTO card_collection (username, card_id, qty, first_acquired, last_acquired)
       VALUES (?1, ?2, 1, ?3, ?3)
       ON CONFLICT (username, card_id) DO UPDATE SET qty = qty + 1, last_acquired = ?3`
    ).bind(user.username, card.id, now).run();
    return authJson({ ok: true, spice: Number(user.spice ?? 0) - price, product: storeProductPublic(product), card: { ...card, collection: setId } });
  }
  return authJson({ ok: true, spice: Number(user.spice ?? 0) - price, product: storeProductPublic(product) });
}

/** Store product id → TCG collection. Register new collections here (matches
 *  the seeded product ids in ensureSpiceSchema). */
const TCG_PRODUCT_SETS: Readonly<Record<string, string>> = {
  'tcg-sds-card': 'sds',
  'tcg-aot-card': 'aot',
  'tcg-re-card': 're',
  'tcg-pokemon-rare': 'pokemon',
};

/** Rarity-weighted card pick from a baked collection pool (crypto random). */
function pickTcgCard(setId: string): (typeof TCG_SETS)[string]['cards'][number] {
  const set = TCG_SETS[setId] ?? TCG_SETS.sds;
  const tierIds = new Map<string, (typeof set.cards)[number][]>();
  for (const card of set.cards) {
    const list = tierIds.get(card.rarity) ?? [];
    list.push(card);
    tierIds.set(card.rarity, list);
  }
  const weights: Record<string, number> = {};
  for (const tier of set.tiers) weights[tier.rarity] = tier.weight;
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 * total;
  for (const [tier, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll > 0) continue;
    const list = tierIds.get(tier);
    if (!list?.length) continue;
    return list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length];
  }
  const commons = tierIds.get('Common') ?? [...set.cards];
  return commons[crypto.getRandomValues(new Uint32Array(1))[0] % commons.length];
}

/** GET /api/cards/collection — the signed-in user's pulled cards. */
async function handleCardsCollection(env: Env, user: AuthUserRow): Promise<Response> {
  await ensureSpiceSchema(env);
  const result = await env.DB.prepare(
    'SELECT card_id AS cardId, qty, first_acquired AS firstAcquired, last_acquired AS lastAcquired FROM card_collection WHERE username = ?1 ORDER BY last_acquired DESC'
  ).bind(user.username).all<{ cardId: string; qty: number; firstAcquired: number; lastAcquired: number }>();
  return authJson({ collection: result.results ?? [] });
}

/** One round-trip COMMUNE presence tick: upsert the caller's position +
 *  status (and loadout when included), prune stale walkers, and return every
 *  other live agent with their display loadout attached. */
async function handleCommuneSync(request: Request, env: Env, user: AuthUserRow): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 8_192) return authJson({ error: 'Request is too large' }, 413);
  let payload: { x?: unknown; y?: unknown; status?: unknown; loadout?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  const x = Math.max(-100, Math.min(5000, Number(payload.x) || 0));
  const y = Math.max(-100, Math.min(5000, Number(payload.y) || 0));
  const status = String(payload.status ?? '').slice(0, 40);
  const now = Date.now();

  // Optional loadout push — up to 3 card ids, one pet snapshot, one phrase.
  let cardsJson: string | null = null;
  let petJson: string | null = null;
  let phrase: string | null = null;
  if (payload.loadout && typeof payload.loadout === 'object') {
    const lo = payload.loadout as { cards?: unknown; pet?: unknown; phrase?: unknown };
    const cards = Array.isArray(lo.cards)
      ? lo.cards.filter((c): c is string => typeof c === 'string' && c.length <= 64).slice(0, 3)
      : [];
    cardsJson = JSON.stringify(cards);
    let pet = '';
    if (lo.pet && typeof lo.pet === 'object') {
      const p = lo.pet as Record<string, unknown>;
      pet = JSON.stringify({
        id: String(p.id ?? '').slice(0, 32),
        name: String(p.name ?? '').slice(0, 24),
        stage: String(p.stage ?? '').slice(0, 16),
        mood: Math.max(0, Math.min(100, Number(p.mood) || 0)),
        xp: Math.max(0, Math.min(100000, Number(p.xp) || 0)),
      });
    }
    petJson = pet;
    phrase = String(lo.phrase ?? '').slice(0, 80);
  }

  await ensureSpiceSchema(env);
  await ensureCommuneDrops(env, now);
  const stmts = [
    env.DB.prepare(
      `INSERT INTO commune_presence (username, is_admin, x, y, status, seen_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(username) DO UPDATE SET is_admin = ?2, x = ?3, y = ?4, status = ?5, seen_at = ?6`
    ).bind(user.username, user.isAdmin ? 1 : 0, x, y, status, now),
  ];
  if (cardsJson !== null) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO commune_loadout (username, cards, pet, phrase, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(username) DO UPDATE SET cards = ?2, pet = ?3, phrase = ?4, updated_at = ?5`
      ).bind(user.username, cardsJson, petJson ?? '', phrase ?? '', now)
    );
  }
  stmts.push(env.DB.prepare('DELETE FROM commune_presence WHERE seen_at < ?1').bind(now - 30_000));
  await env.DB.batch(stmts);

  const rows = await env.DB.prepare(
    `SELECT p.username AS username, p.is_admin AS isAdmin, p.x AS x, p.y AS y,
            p.status AS status, p.seen_at AS seenAt, l.cards AS cards, l.pet AS pet, l.phrase AS phrase
     FROM commune_presence p LEFT JOIN commune_loadout l ON l.username = p.username
     WHERE p.seen_at >= ?1 AND p.username != ?2`
  ).bind(now - 30_000, user.username).all<{ username: string; isAdmin: number; x: number; y: number; status: string; seenAt: number; cards: string | null; pet: string | null; phrase: string | null }>();

  const own = await env.DB.prepare('SELECT cards, pet, phrase FROM commune_loadout WHERE username = ?1')
    .bind(user.username).first<{ cards: string; pet: string; phrase: string }>();

  // Unclaimed spice piles on the square (client renders + picks them up).
  const dropRows = await env.DB.prepare(
    'SELECT id, x, y FROM commune_spice_drops WHERE picked_by IS NULL'
  ).all<{ id: number; x: number; y: number }>();

  const parseLoadout = (cards: string | null, pet: string | null, ph: string | null) => {
    if (!cards && !ph) return null;
    let cardIds: string[] = [];
    try {
      cardIds = cards ? (JSON.parse(cards) as string[]) : [];
    } catch {
      cardIds = [];
    }
    let petOut: unknown = null;
    try {
      petOut = pet ? JSON.parse(pet) : null;
    } catch {
      petOut = null;
    }
    return { cards: cardIds, pet: petOut, phrase: ph ?? '' };
  };

  const others = (rows.results ?? []).map((r) => ({
    username: r.username,
    isAdmin: r.isAdmin === 1,
    x: r.x,
    y: r.y,
    status: r.status,
    seenAgo: now - r.seenAt,
    loadout: parseLoadout(r.cards, r.pet, r.phrase),
  }));
  return authJson({
    others,
    me: parseLoadout(own?.cards ?? null, own?.pet ?? null, own?.phrase ?? null),
    drops: (dropRows.results ?? []).map((d) => ({ id: d.id, x: d.x, y: d.y })),
  });
}

/* ── COMMUNE spice drops ────────────────────────────────────────────────────── */

/** Walkable spawn rectangles on the town square (world is 1600×1200). Kept
 *  clear of building footprints, the fountain, the pond, and the fences. */
const DROP_SPAWN_RECTS: { x: number; y: number; w: number; h: number }[] = [
  { x: 660, y: 250, w: 280, h: 40 }, // town-hall front strip
  { x: 380, y: 420, w: 280, h: 200 }, // west of plaza
  { x: 940, y: 420, w: 280, h: 200 }, // east of plaza
  { x: 700, y: 730, w: 200, h: 220 }, // south of plaza
  { x: 340, y: 760, w: 320, h: 180 }, // near showcase stall
  { x: 960, y: 760, w: 300, h: 180 }, // near challenge tent
  { x: 300, y: 560, w: 120, h: 220 }, // west path
  { x: 1180, y: 560, w: 120, h: 220 }, // east path
];

/** Keep 1–6 spice piles on the square at all times: top up whenever every
 *  drop has been claimed (and sweep stale claimed rows). */
async function ensureCommuneDrops(env: Env, now: number): Promise<void> {
  const open = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM commune_spice_drops WHERE picked_by IS NULL'
  ).first<{ n: number }>();
  if (Number(open?.n ?? 0) > 0) return;
  const count = 1 + Math.floor(Math.random() * 6); // 1–6
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare('DELETE FROM commune_spice_drops WHERE picked_at < ?1').bind(now - 3_600_000),
  ];
  for (let i = 0; i < count; i++) {
    const r = DROP_SPAWN_RECTS[Math.floor(Math.random() * DROP_SPAWN_RECTS.length)];
    stmts.push(
      env.DB.prepare(
        'INSERT INTO commune_spice_drops (x, y, created_at) VALUES (?1, ?2, ?3)'
      ).bind(
        Math.round(r.x + Math.random() * r.w),
        Math.round(r.y + Math.random() * r.h),
        now
      )
    );
  }
  await env.DB.batch(stmts);
}

/** POST /api/commune/spice/pick { id } — first-come-first-serve claim of a
 *  spice pile: the conditional UPDATE guarantees a single winner. */
async function handleCommuneSpicePick(request: Request, env: Env, user: AuthUserRow): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 1_024) return authJson({ error: 'Request is too large' }, 413);
  let payload: { id?: unknown };
  try {
    payload = (await request.json()) as { id?: unknown };
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  const id = Math.round(Number(payload.id));
  if (!Number.isFinite(id) || id <= 0) return authJson({ error: 'Invalid drop id' }, 400);

  await ensureSpiceSchema(env);
  const now = Date.now();
  const claim = await env.DB.prepare(
    'UPDATE commune_spice_drops SET picked_by = ?1, picked_at = ?2 WHERE id = ?3 AND picked_by IS NULL'
  ).bind(user.username, now, id).run();
  if (!claim.meta.changes) return authJson({ error: 'Already picked' }, 409);

  await env.DB.batch([
    env.DB.prepare('UPDATE auth_users SET spice = spice + 1, updated_at = ?2 WHERE username = ?1')
      .bind(user.username, now),
    env.DB.prepare("INSERT INTO spice_ledger (username, delta, reason, detail, created_at) VALUES (?1, 1, 'pickup', ?2, ?3)")
      .bind(user.username, `drop:${id}`, now),
  ]);
  return authJson({ picked: true, spice: Number(user.spice ?? 0) + 1 });
}

/* ── NPC challenge (remote DeepSeek roleplay) ──────────────────────────────── */

/** One-time schema + persona seeding — the persona JSON is uploaded into the
 *  eco-data D1 `npc_personas` table on first use. The roleplay itself runs
 *  client-side through the shared remote DeepSeek pipeline (kittyChat); only
 *  the success spice award is server-side. */
let npcSchemaPromise: Promise<void> | null = null;
async function ensureNpcSchema(env: Env): Promise<void> {
  if (!npcSchemaPromise) {
    npcSchemaPromise = (async () => {
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS npc_personas (
           id TEXT PRIMARY KEY,
           name TEXT NOT NULL,
           data TEXT NOT NULL,
           created_at INTEGER NOT NULL
         )`
      ).run();
      const now = Date.now();
      for (const [id, persona] of Object.entries(NPC_PERSONAS)) {
        await env.DB.prepare(
          'INSERT OR IGNORE INTO npc_personas (id, name, data, created_at) VALUES (?1, ?2, ?3, ?4)'
        ).bind(id, 'gb_poolius' === id ? 'GB Poolius' : id, JSON.stringify(persona), now).run();
      }
    })();
  }
  await npcSchemaPromise;
}

/** POST /api/commune/challenge/award { personaId } — called once when the
 *  remote-LLM roleplay reaches a 'success' ending. A per-persona cooldown
 *  (a real challenge takes minutes) throttles repeat-claim farming. */
async function handleChallengeAward(request: Request, env: Env, user: AuthUserRow): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 1_024) return authJson({ error: 'Request is too large' }, 413);
  let payload: { personaId?: unknown };
  try {
    payload = (await request.json()) as { personaId?: unknown };
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  const personaId = String(payload.personaId ?? '');
  if (!NPC_PERSONAS[personaId]) return authJson({ error: 'Unknown persona' }, 404);

  await ensureSpiceSchema(env);
  await ensureNpcSchema(env);
  const last = await env.DB.prepare(
    "SELECT created_at FROM spice_ledger WHERE username = ?1 AND reason = 'challenge' AND detail = ?2 ORDER BY created_at DESC LIMIT 1"
  ).bind(user.username, personaId).first<{ created_at: number }>();
  if (last && Date.now() - Number(last.created_at) < 180_000)
    return authJson({ error: 'Challenge award cooldown — finish another run first' }, 429);

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE auth_users SET spice = spice + ?2, updated_at = ?3 WHERE username = ?1')
      .bind(user.username, CHALLENGE_SUCCESS_SPICE, now),
    env.DB.prepare(
      "INSERT INTO spice_ledger (username, delta, reason, detail, created_at) VALUES (?1, ?2, 'challenge', ?3, ?4)"
    ).bind(user.username, CHALLENGE_SUCCESS_SPICE, personaId, now),
  ]);
  return authJson({ awarded: CHALLENGE_SUCCESS_SPICE, spice: Number(user.spice ?? 0) + CHALLENGE_SUCCESS_SPICE });
}

/** Roulette betting spots and their STANDARD casino payout odds ("to one"):
 *  straight number 35, dozen/column 2, even-money chances 1. Winning bets pay
 *  profit = stake × odds × 1.5 (the house's house-edge giveaway), rounded to
 *  whole spice per bet; losing stakes are kept by the bank. Zero kills every
 *  outside bet, exactly like a European table. */
const WHEEL_BET_ODDS: Readonly<Record<string, number>> = (() => {
  const odds: Record<string, number> = {};
  for (let n = 0; n <= 36; n++) odds[`n:${n}`] = 35;
  for (let d = 1; d <= 3; d++) {
    odds[`dozen:${d}`] = 2;
    odds[`col:${d}`] = 2;
  }
  for (const k of ['red', 'black', 'even', 'odd', 'low', 'high']) odds[k] = 1;
  return odds;
})();

const WHEEL_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

/** Whether a bet spot wins on the landed pocket. */
function wheelBetWins(key: string, pocket: number): boolean {
  if (key.startsWith('n:')) return Number(key.slice(2)) === pocket;
  switch (key) {
    case 'red': return pocket !== 0 && WHEEL_RED.has(pocket);
    case 'black': return pocket !== 0 && !WHEEL_RED.has(pocket);
    case 'even': return pocket !== 0 && pocket % 2 === 0;
    case 'odd': return pocket % 2 === 1;
    case 'low': return pocket >= 1 && pocket <= 18;
    case 'high': return pocket >= 19 && pocket <= 36;
    case 'dozen:1': return pocket >= 1 && pocket <= 12;
    case 'dozen:2': return pocket >= 13 && pocket <= 24;
    case 'dozen:3': return pocket >= 25 && pocket <= 36;
    case 'col:1': return pocket !== 0 && pocket % 3 === 1;
    case 'col:2': return pocket !== 0 && pocket % 3 === 2;
    case 'col:3': return pocket !== 0 && pocket % 3 === 0;
    default: return false;
  }
}

/** POST /api/store/wheel/spin { token, bets } — consume a pre-paid spin token,
 *  take the staked spice, draw the pocket with crypto randomness and settle
 *  every bet with standard roulette odds × 1.5. Server-authoritative: the
 *  client animation merely replays the outcome. Tokens are single-use. */
async function handleWheelSpin(request: Request, env: Env, user: AuthUserRow): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 8_192) return authJson({ error: 'Request is too large' }, 413);
  let payload: { token?: unknown; bets?: unknown };
  try {
    payload = (await request.json()) as { token?: unknown; bets?: unknown };
  } catch {
    return authJson({ error: 'Invalid JSON body' }, 400);
  }
  const token = String(payload.token ?? '');
  if (!token) return authJson({ error: 'Missing spin token' }, 400);

  // Parse the betting board: { "n:17": 2, "red": 1, ... } — each unit is one
  // spice. Reject unknown spots and absurd stakes.
  const bets = new Map<string, number>();
  if (payload.bets !== undefined && payload.bets !== null && typeof payload.bets === 'object') {
    for (const [key, value] of Object.entries(payload.bets as Record<string, unknown>)) {
      if (!(key in WHEEL_BET_ODDS)) return authJson({ error: `Unknown bet spot: ${key}` }, 400);
      const units = Math.round(Number(value));
      if (!Number.isFinite(units) || units < 1 || units > 200)
        return authJson({ error: `Invalid stake on ${key}` }, 400);
      bets.set(key, units);
    }
  }
  if (bets.size === 0) return authJson({ error: 'Place at least one bet before spinning' }, 400);
  if (bets.size > 24) return authJson({ error: 'Too many bet spots' }, 400);
  const staked = [...bets.values()].reduce((a, b) => a + b, 0);
  if (staked > 1_000) return authJson({ error: 'Total stake is capped at 1000 🌶️' }, 400);
  if (Number(user.spice ?? 0) < staked)
    return authJson({ error: 'Not enough spice for that stake' }, 400);

  await ensureSpiceSchema(env);
  const spin = await env.DB.prepare(
    'SELECT token, username, consumed FROM wheel_spins WHERE token = ?1'
  ).bind(token).first<{ token: string; username: string; consumed: number }>();
  if (!spin || spin.username !== user.username)
    return authJson({ error: 'Spin token not found' }, 404);
  if (Number(spin.consumed) !== 0)
    return authJson({ error: 'This spin has already been played' }, 409);

  // Uniform pocket draw — 37 European pockets.
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const pocket = buf[0] % 37;

  // Settle: winners return stake + profit (odds × 1.5, rounded per bet).
  const wins: { key: string; stake: number; profit: number }[] = [];
  let returned = 0;
  for (const [key, stake] of bets) {
    if (!wheelBetWins(key, pocket)) continue;
    const profit = Math.round(stake * (WHEEL_BET_ODDS[key] ?? 0) * 1.5);
    wins.push({ key, stake, profit });
    returned += stake + profit;
  }
  const net = returned - staked;
  const now = Date.now();

  // Consume the token and settle atomically-ish; the conditional UPDATE is
  // the guard against double-spin races.
  const consume = await env.DB.prepare(
    'UPDATE wheel_spins SET consumed = 1, pocket = ?2, reward = ?3, consumed_at = ?4 WHERE token = ?1 AND consumed = 0'
  ).bind(token, pocket, net, now).run();
  if (!consume.meta.changes)
    return authJson({ error: 'This spin has already been played' }, 409);

  await env.DB.batch([
    env.DB.prepare('UPDATE auth_users SET spice = spice - ?2 + ?3, updated_at = ?4 WHERE username = ?1')
      .bind(user.username, staked, returned, now),
    env.DB.prepare("INSERT INTO spice_ledger (username, delta, reason, detail, created_at) VALUES (?1, ?2, 'wheel', ?3, ?4)")
      .bind(user.username, net, `Roulette pocket ${pocket} · staked ${staked} · returned ${returned}`, now),
  ]);
  return authJson({ pocket, staked, returned, net, wins, spice: Number(user.spice ?? 0) - staked + returned });
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
    // The three card-draw bundles are infrastructure, not merchandise — they
    // must stay (a purchase against a missing product used to eat spice with
    // no card returned). Their category is locked the same way.
    if (TCG_PRODUCT_SETS[id]) return authJson({ error: 'Card-draw products are permanent and cannot be deleted' }, 400);
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
  let category = p.category === 'food' ? 'food' : p.category === 'wheel' ? 'wheel' : p.category === 'cards' ? 'cards' : 'other';
  // Card-draw products always stay 'cards' — an admin save via the generic
  // form used to silently reset the category to 'other', which made purchases
  // deduct spice without ever triggering the draw.
  const id = typeof p.id === 'string' && p.id ? p.id : crypto.randomUUID();
  if (TCG_PRODUCT_SETS[id]) category = 'cards';
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

  // Self-test suite award — any logged-in user, one award per few minutes.
  if (path === '/api/spice/test' && request.method === 'POST') {
    const user = await authBearerUser(request, env);
    if (!user) return authJson({ error: 'Not authenticated' }, 401);
    return handleSpiceTest(request, env, user);
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
  if (path === '/api/store/wheel/spin' && request.method === 'POST') {
    const user = await authBearerUser(request, env);
    if (!user) return authJson({ error: 'Not authenticated' }, 401);
    return handleWheelSpin(request, env, user);
  }

  // TCG card collection — any logged-in user can view their own pulls.
  if (path === '/api/cards/collection' && request.method === 'GET') {
    const user = await authBearerUser(request, env);
    if (!user) return authJson({ error: 'Not authenticated' }, 401);
    return handleCardsCollection(env, user);
  }
  // COMMUNE live presence + loadouts (any logged-in user).
  if (path === '/api/commune/sync' && request.method === 'POST') {
    const user = await authBearerUser(request, env);
    if (!user) return authJson({ error: 'Not authenticated' }, 401);
    return handleCommuneSync(request, env, user);
  }
  if (path === '/api/commune/spice/pick' && request.method === 'POST') {
    const user = await authBearerUser(request, env);
    if (!user) return authJson({ error: 'Not authenticated' }, 401);
    return handleCommuneSpicePick(request, env, user);
  }
  // NPC challenge success award (roleplay runs client-side via DeepSeek).
  if (path === '/api/commune/challenge/award' && request.method === 'POST') {
    const user = await authBearerUser(request, env);
    if (!user) return authJson({ error: 'Not authenticated' }, 401);
    return handleChallengeAward(request, env, user);
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
      url.pathname.startsWith('/api/pet') ||
      url.pathname.startsWith('/api/store') ||
      url.pathname.startsWith('/api/cards') ||
      url.pathname.startsWith('/api/commune') ||
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
