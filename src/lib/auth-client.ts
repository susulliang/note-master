/**
 * Auth API client — talks to the note-master Worker's D1-backed auth API
 * (see worker/index.ts). Sessions are opaque bearer tokens kept in
 * localStorage; the Worker validates them against the auth_sessions table.
 */

export interface AuthUser {
  username: string;
  isAdmin: boolean;
  spice: number;
  privileges: { dash: boolean; roster: boolean; trak: boolean };
}

export interface StoreProduct {
  id: string;
  name: string;
  emoji: string;
  description: string;
  price: number;
  active: boolean;
  /** Client-produced 256×256 data URL (PNG keeps alpha, JPEG for photos). */
  image: string | null;
  /** 'food' feeds the cat companion; 'cards' is a TCG card draw; 'other' is decorative. */
  category: 'food' | 'wheel' | 'cards' | 'other';
}

/** A card pulled from a TCG set (server-decided; image served from /assets/tcg). */
export interface TcgCard {
  id: string;
  code: string;
  name: string;
  price: number;
  rarity: string;
  image: string;
  /** Which collection the card belongs to (sds, pokemon, …). */
  collection?: string;
}

const TOKEN_KEY = 'ecovacs_auth_token';

/** Workers deployment serves the API; other origins (Vercel / Tauri / local
 *  dev) call it cross-origin — the Worker sends permissive CORS headers. */
const WORKERS_ORIGIN = 'https://note-master.susulliang.workers.dev';
const API_BASE: string = (() => {
  if (import.meta.env.VITE_AUTH_API_BASE) return String(import.meta.env.VITE_AUTH_API_BASE).replace(/\/+$/, '');
  if (typeof window === 'undefined') return WORKERS_ORIGIN;
  const host = window.location.hostname;
  // Same-origin on the Workers deployment; everywhere else (Vercel / Tauri /
  // localhost dev) call the Workers deployment cross-origin (CORS is open).
  if (host.endsWith('.workers.dev')) return '';
  return WORKERS_ORIGIN;
})();

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Resolved API origin — shared by other API clients (e.g. roster-sync). */
export function getApiBase(): string {
  return API_BASE;
}

function setStoredToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — session stays in memory only */
  }
}

async function call<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (rest.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...rest, headers });
  } catch {
    throw new Error('Network error — is the auth server reachable?');
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

export async function fetchServerNames(): Promise<{ names: string[]; admin: string[] }> {
  return call<{ names: string[]; admin: string[] }>('/api/auth/names');
}

export async function register(username: string, password: string, confirm: string): Promise<{ token: string; user: AuthUser }> {
  const out = await call<{ token: string; user: AuthUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, confirm }),
  });
  setStoredToken(out.token);
  return out;
}

export async function login(username: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const out = await call<{ token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setStoredToken(out.token);
  return out;
}

export async function logout(): Promise<void> {
  const token = getStoredToken();
  if (token) {
    await call('/api/auth/logout', { method: 'POST', token }).catch(() => undefined);
  }
  setStoredToken(null);
}

export async function me(): Promise<AuthUser> {
  const token = getStoredToken();
  if (!token) throw new Error('No session');
  const out = await call<{ user: AuthUser }>('/api/auth/me', { token });
  return out.user;
}

// ── Admin ────────────────────────────────────────────────────────────────────

export interface AdminUserRow extends AuthUser {
  spice: number;
  createdAt: number;
}

export async function adminListUsers(): Promise<AdminUserRow[]> {
  const token = getStoredToken();
  const out = await call<{ users: AdminUserRow[] }>('/api/admin/users', { token });
  return out.users;
}

export async function adminSetPrivileges(
  username: string,
  patch: { dash?: boolean; roster?: boolean; trak?: boolean }
): Promise<AuthUser> {
  const token = getStoredToken();
  const out = await call<{ user: AuthUser }>('/api/admin/privileges', {
    method: 'POST',
    body: JSON.stringify({ username, ...patch }),
    token,
  });
  return out.user;
}

export async function adminDeleteUser(username: string): Promise<void> {
  const token = getStoredToken();
  await call('/api/admin/delete', { method: 'POST', body: JSON.stringify({ username }), token });
}

// ── Spice & store ────────────────────────────────────────────────────────────

/** Submit the FINAL QA score of a call (0–100+ pct). Awards +3 / +5 / +10
 *  spice at 70 / 80 / 90; only call this once per call (at hang-up). */
export async function submitQaAward(scorePct: number): Promise<{ awarded: number; spice: number }> {
  const token = getStoredToken();
  const out = await call<{ awarded: number; spice: number }>('/api/spice/qa', {
    method: 'POST',
    body: JSON.stringify({ scorePct }),
    token,
  });
  return out;
}

/** Report a completed self-test run (suite id + final score 0–100). Awards
 *  10 base spice with stacked score bonuses; throttled server-side. */
export async function submitTestAward(suiteId: string, scorePct: number): Promise<{ awarded: number; spice: number }> {
  const token = getStoredToken();
  const out = await call<{ awarded: number; spice: number }>('/api/spice/test', {
    method: 'POST',
    body: JSON.stringify({ suiteId, scorePct }),
    token,
  });
  return out;
}

/** Active store products available for purchase. */
export async function listStore(): Promise<StoreProduct[]> {
  const token = getStoredToken();
  const out = await call<{ products: StoreProduct[] }>('/api/store', { token });
  return out.products;
}

/** Buy a product — returns the new spice balance. Wheel of Fortune products
 *  additionally return a one-time spinToken for the roulette reward claim;
 *  TCG card products return the server-decided card. */
export async function purchaseItem(
  productId: string,
): Promise<{ spice: number; spinToken?: string; card?: TcgCard }> {
  const token = getStoredToken();
  const out = await call<{ spice: number; spinToken?: string; card?: TcgCard }>('/api/store/purchase', {
    method: 'POST',
    body: JSON.stringify({ productId }),
    token,
  });
  return out;
}

/** The signed-in user's TCG card pulls (cardId + qty rows). */
export async function fetchCardCollection(): Promise<
  { cardId: string; qty: number; firstAcquired: number; lastAcquired: number }[]
> {
  const token = getStoredToken();
  const out = await call<{
    collection: { cardId: string; qty: number; firstAcquired: number; lastAcquired: number }[];
  }>('/api/cards/collection', { token });
  return out.collection;
}

/* ── COMMUNE town square — live presence + display loadout ────────────────── */

/** Pet snapshot embedded in a loadout (stats frozen at save time). */
export interface CommunePet {
  id: string;
  name: string;
  stage: string;
  mood: number;
  xp: number;
}

/** Personalized pixel look — shown on the agent's sprite in the COMMUNE. */
export interface CommuneAvatar {
  hair: string;
  shirt: string;
  bottom: 'pants' | 'skirt';
  bottomColor: string;
  shoes: string;
}

export const DEFAULT_AVATAR: CommuneAvatar = {
  hair: '#4a3728',
  shirt: '#58a6ff',
  bottom: 'pants',
  bottomColor: '#3f4a63',
  shoes: '#2a2d38',
};

export interface CommuneLoadout {
  /** Up to 3 TCG card ids from the agent's collection. */
  cards: string[];
  pet: CommunePet | null;
  phrase: string;
  /** Pixel-look personalization (optional — defaults apply when absent). */
  avatar: CommuneAvatar | null;
}

/** Another agent currently walking the square. */
export interface CommuneAgent {
  username: string;
  isAdmin: boolean;
  x: number;
  y: number;
  status: string;
  seenAgo: number;
  loadout: CommuneLoadout | null;
}

/** Agent→agent interaction signal delivered via the presence sync. */
export interface CommuneSignal {
  from: string;
  kind: 'bump' | 'chat' | 'hands' | 'hands_release';
  message: string;
}

/** Presence tick: report my position/status (and loadout when included),
 *  receive everyone else plus unclaimed spice drops. Called every ~8s while
 *  the Commune is open. */
export async function syncCommune(
  x: number,
  y: number,
  status: string,
  loadout?: CommuneLoadout
): Promise<{ others: CommuneAgent[]; me: CommuneLoadout | null; drops: CommuneDrop[]; signals: CommuneSignal[] }> {
  const token = getStoredToken();
  const out = await call<{ others: CommuneAgent[]; me: CommuneLoadout | null; drops: CommuneDrop[]; signals?: CommuneSignal[] }>('/api/commune/sync', {
    method: 'POST',
    body: JSON.stringify(loadout ? { x, y, status, loadout } : { x, y, status }),
    token,
  });
  return { drops: out.drops ?? [], others: out.others, me: out.me, signals: out.signals ?? [] };
}

/** Send an interaction signal to another agent (bump shake, direct chat
 *  banner, hand-holding start/stop). Delivered on their next presence sync. */
export async function communeInteract(target: string, kind: CommuneSignal['kind'], message = ''): Promise<void> {
  const token = getStoredToken();
  await call('/api/commune/interact', {
    method: 'POST',
    body: JSON.stringify({ target, kind, message }),
    token,
  });
}

/** A spice pile scattered on the town square — first agent to walk over it
 *  claims +1 spice. */
export interface CommuneDrop {
  id: number;
  x: number;
  y: number;
}

/** Try to claim a spice drop (first-come-first-serve, server-decided). */
export async function pickSpiceDrop(id: number): Promise<{ picked: boolean; spice: number }> {
  const token = getStoredToken();
  return call<{ picked: boolean; spice: number }>('/api/commune/spice/pick', {
    method: 'POST',
    body: JSON.stringify({ id }),
    token,
  });
}

/* ── NPC challenge (remote DeepSeek roleplay) ──────────────────────────────── */

export interface ChallengeTurn {
  /** The NPC's line (field name varies per persona — see npc-personas.ts). */
  message: string;
  agent_choices: string[];
  status: 'ongoing' | 'success' | 'fail';
  /** End-of-call satisfaction rating the NPC hands out (0–5 stars). */
  stars?: number;
}

export interface ChallengeMessage {
  role: 'agent' | 'npc';
  content: string;
}

/** Report a successful challenge ending — the server awards the spice
 *  (throttled per persona so completed runs can't be farmed). */
export async function awardChallenge(personaId: string): Promise<{ awarded: number; spice: number }> {
  const token = getStoredToken();
  return call<{ awarded: number; spice: number }>('/api/commune/challenge/award', {
    method: 'POST',
    body: JSON.stringify({ personaId }),
    token,
  });
}

/** Play a Wheel of Fortune round — consumes the purchase token, stakes the
 *  placed bets, and returns the landed pocket plus the settlement (standard
 *  roulette odds × 1.5): what was staked, what came back, and the net delta. */
export interface WheelSpinResult {
  pocket: number;
  staked: number;
  returned: number;
  net: number;
  wins: { key: string; stake: number; profit: number }[];
  spice: number;
}

export async function spinWheel(token: string, bets: Record<string, number>): Promise<WheelSpinResult> {
  const authToken = getStoredToken();
  const out = await call<WheelSpinResult>('/api/store/wheel/spin', {
    method: 'POST',
    body: JSON.stringify({ token, bets }),
    token: authToken,
  });
  return out;
}

// ── Cat companion pet state ──────────────────────────────────────────────────

/** Fetch the caller's saved pet-state blob (null if never saved). */
export async function getPetState(): Promise<string | null> {
  const token = getStoredToken();
  if (!token) return null;
  const out = await call<{ state: string | null }>('/api/pet', { token });
  return out.state;
}

/** Save the caller's pet-state blob (last write wins, server-side). */
export async function savePetState(state: string): Promise<void> {
  const token = getStoredToken();
  if (!token) return;
  await call('/api/pet', { method: 'POST', body: JSON.stringify({ state }), token });
}

// ── Admin store management ───────────────────────────────────────────────────

/** All store products (admin) — includes inactive ones. */
export async function adminListStore(): Promise<StoreProduct[]> {
  const token = getStoredToken();
  const out = await call<{ products: StoreProduct[] }>('/api/admin/store', { token });
  return out.products;
}

export async function adminSaveStoreProduct(
  product: Partial<StoreProduct> & {
    name: string;
    emoji: string;
    description: string;
    price: number;
    active: boolean;
    image?: string | null;
  }
): Promise<StoreProduct> {
  const token = getStoredToken();
  const out = await call<{ product: StoreProduct }>('/api/admin/store', {
    method: 'POST',
    body: JSON.stringify({ action: 'upsert', product }),
    token,
  });
  return out.product;
}

export async function adminDeleteStoreProduct(id: string): Promise<void> {
  const token = getStoredToken();
  await call('/api/admin/store', {
    method: 'POST',
    body: JSON.stringify({ action: 'delete', product: { id } }),
    token,
  });
}
