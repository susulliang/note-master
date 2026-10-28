/**
 * Auth API client — talks to the note-master Worker's D1-backed auth API
 * (see worker/index.ts). Sessions are opaque bearer tokens kept in
 * localStorage; the Worker validates them against the auth_sessions table.
 */

export interface AuthUser {
  username: string;
  isAdmin: boolean;
  isManagement: boolean;
  isSuperAdmin: boolean;
  canAccessAdmin: boolean;
  canManageStore: boolean;
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

export interface SavedTicketNote {
  id: string;
  noteText: string;
  issueType: string;
  solved: boolean;
  pushedAt: number;
  updatedAt: number;
  createdBy: string;
}

export interface SavedTicketNoteInput {
  id: string;
  noteText: string;
  issueType: string;
  solved: boolean;
}

export const NPC_PERSONALITIES = [
  'hard to describe real issue',
  'emotional',
  'confrontational',
  'polite',
  'logical',
  'illogical',
] as const;

export interface ChallengeNpc {
  id: string;
  name: string;
  modelNumber: string;
  issueType: string;
  personality: string[];
  complaints: string;
  possibleResolution: string;
  correctResolution: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CommuneChallengeNpc {
  id: string;
  name: string;
  modelNumber: string;
  issueType: string;
}

export interface ChallengeNpcTurn {
  message: string;
  agent_choices: string[];
  status: 'ongoing' | 'success' | 'fail';
  scorePct?: number;
}

export interface ChallengeNpcStreamCallbacks {
  onProgress?: (label: string) => void;
  onDelta?: (text: string) => void;
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
const WORKERS_ORIGIN = 'https://note-master.econote.workers.dev';
const API_BASE: string = (() => {
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('.workers.dev')) return '';
  if (import.meta.env.VITE_AUTH_API_BASE) return String(import.meta.env.VITE_AUTH_API_BASE).replace(/\/+$/, '');
  if (typeof window === 'undefined') return WORKERS_ORIGIN;
  // Vercel, Tauri and localhost use the Workers deployment cross-origin.
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

async function challengeStream<T>(
  path: string,
  payload: unknown,
  callbacks: ChallengeNpcStreamCallbacks = {},
): Promise<T> {
  const headers = new Headers({
    accept: 'text/event-stream',
    'content-type': 'application/json',
  });
  const token = getStoredToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('Network error — is the challenge service reachable?');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `Challenge request failed (${response.status})`);
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    return await response.json() as T;
  }
  if (!response.body) throw new Error('The challenge stream returned no response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: T | null = null;
  let failure: string | null = null;

  const consumeFrame = (frame: string) => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
    } catch {
      return;
    }
    if (event === 'progress' && typeof data.label === 'string') callbacks.onProgress?.(data.label);
    if (event === 'delta' && typeof data.text === 'string') callbacks.onDelta?.(data.text);
    if (event === 'done') result = data as T;
    if (event === 'error') failure = typeof data.error === 'string' ? data.error : 'The challenge could not complete this turn';
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      frames.forEach(consumeFrame);
      if (failure) break;
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeFrame(buffer);
  } finally {
    reader.releaseLock();
  }
  if (failure) throw new Error(failure);
  if (result !== null) return result;
  throw new Error('The challenge stream ended before a result was returned');
}

/** Issue a short-lived, single-use ticket for customer-audio transcription. */
export async function createCallTranscriptionSocketTicket(): Promise<string> {
  const token = getStoredToken();
  const result = await call<{ ticket: string }>('/api/call-transcription/socket-ticket', {
    method: 'POST',
    body: '{}',
    token,
  });
  return result.ticket;
}

/** WebSocket URL for the authenticated Cloudflare Nova-3 audio stream. */
export function callTranscriptionSocketUrl(ticket: string): string {
  const origin = new URL(API_BASE || window.location.origin, window.location.origin).origin;
  const url = new URL('/api/call-transcription/socket', origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('ticket', ticket);
  return url.toString();
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

export async function changeAccountPassword(newPassword: string, confirmPassword: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error('No session');
  await call('/api/auth/password/change', {
    method: 'POST',
    body: JSON.stringify({ newPassword, confirmPassword }),
    token,
  });
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
  patch: { dash?: boolean; roster?: boolean; trak?: boolean; admin?: boolean; management?: boolean }
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

export async function adminResetUserPassword(username: string): Promise<string> {
  const token = getStoredToken();
  const out = await call<{ username: string; defaultPassword: string }>('/api/admin/password-reset', {
    method: 'POST',
    body: JSON.stringify({ username }),
    token,
  });
  return out.defaultPassword;
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
  hairStyle: 'short' | 'long';
  shirt: string;
  bottom: 'pants' | 'skirt';
  bottomColor: string;
  shoes: string;
}

export const DEFAULT_AVATAR: CommuneAvatar = {
  hair: '#4a3728',
  hairStyle: 'short',
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
  /** Effective admin access for shared Commune moderation. */
  isAdmin: boolean;
  isManagement: boolean;
  isSuperAdmin: boolean;
  x: number;
  y: number;
  status: string;
  seenAgo: number;
  loadout: CommuneLoadout | null;
  carId?: string | null;
  carSeat?: number | null;
}

export type CommuneBannerKind = 'pin' | 'priority' | 'sketch';
export type CommuneBannerPriority = 'normal' | 'high' | 'urgent';

export interface CommuneBannerPoint {
  x: number;
  y: number;
}

export interface CommuneBannerStroke {
  color: string;
  points: CommuneBannerPoint[];
}

export interface CommuneBannerContent {
  text: string;
  kind: CommuneBannerKind;
  priority: CommuneBannerPriority;
  strokes: CommuneBannerStroke[];
}

export interface CommuneBanner extends CommuneBannerContent {
  id: string;
  author: string;
  at: number;
}

export interface CommuneConnectionBootstrap {
  ticket: string;
  me: CommuneLoadout | null;
  drops: CommuneDrop[];
  banners?: CommuneBanner[];
}

/** Issue a short-lived one-time ticket for an authenticated room socket. */
export async function createCommuneSocketTicket(
  x: number,
  y: number,
  status: string
): Promise<CommuneConnectionBootstrap> {
  const token = getStoredToken();
  return call<CommuneConnectionBootstrap>('/api/commune/socket-ticket', {
    method: 'POST',
    body: JSON.stringify({ x, y, status }),
    token,
  });
}

/** Save the durable loadout in D1 and broadcast it to the live room. */
export async function saveCommuneLoadout(loadout: CommuneLoadout): Promise<void> {
  const token = getStoredToken();
  await call('/api/commune/loadout', {
    method: 'POST',
    body: JSON.stringify({ loadout }),
    token,
  });
}

/** Pin an admin-authored note, priority alert, or whiteboard sketch. */
export async function createCommuneBanner(content: CommuneBannerContent): Promise<CommuneBanner[]> {
  const token = getStoredToken();
  const out = await call<{ banners: CommuneBanner[] }>('/api/commune/banners', {
    method: 'POST',
    body: JSON.stringify(content),
    token,
  });
  return out.banners;
}

/** Edit an existing shared town board item. */
export async function editCommuneBanner(id: string, content: CommuneBannerContent): Promise<CommuneBanner[]> {
  const token = getStoredToken();
  const out = await call<{ banners: CommuneBanner[] }>('/api/commune/banners', {
    method: 'POST',
    body: JSON.stringify({ action: 'edit', id, ...content }),
    token,
  });
  return out.banners;
}

/** Remove an existing shared town announcement. */
export async function deleteCommuneBanner(id: string): Promise<CommuneBanner[]> {
  const token = getStoredToken();
  const out = await call<{ banners: CommuneBanner[] }>('/api/commune/banners', {
    method: 'POST',
    body: JSON.stringify({ action: 'delete', id }),
    token,
  });
  return out.banners;
}

/** WebSocket URL uses the same Worker origin as the authenticated HTTP API. */
export function communeSocketUrl(ticket: string): string {
  const origin = new URL(API_BASE || window.location.origin, window.location.origin).origin;
  const url = new URL('/api/commune/socket', origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('ticket', ticket);
  return url.toString();
}

/** A spice pile scattered on the town square — first agent to walk over it
 *  claims +1 spice. */
export interface CommuneDrop {
  id: number;
  x: number;
  y: number;
}

export type CommuneMiniGame = 'golf' | 'bowling';
export interface CommuneSoccerBall {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  kickedAt: number;
  by: string | null;
}

export interface CommuneLaserShot {
  id: string;
  shooter: string;
  fromX: number;
  fromY: number;
  fromHeight: number;
  toX: number;
  toY: number;
  toHeight: number;
  durationMs: number;
  targetUsername: string | null;
}

export async function fireCommuneLaser(
  actionId: string,
  yaw: number,
  pitch: number,
): Promise<{ accepted: boolean; awarded: number; targetUsername: string | null; shot: CommuneLaserShot }> {
  const token = getStoredToken();
  return call('/api/commune/laser/fire', {
    method: 'POST',
    body: JSON.stringify({ actionId, yaw, pitch }),
    token,
  });
}

export async function startCommuneMiniGame(game: CommuneMiniGame): Promise<{ roundId: string; expiresAt: number }> {
  const token = getStoredToken();
  return call<{ roundId: string; expiresAt: number }>('/api/commune/minigame/start', {
    method: 'POST',
    body: JSON.stringify({ game }),
    token,
  });
}

export async function finishCommuneMiniGame(
  game: CommuneMiniGame,
  roundId: string,
  result: { shots: Array<{ aim: number; power: number }> } | { aim: number; power: number }
): Promise<{ awarded: number; spice: number; pinsDown?: number }> {
  const token = getStoredToken();
  return call<{ awarded: number; spice: number; pinsDown?: number }>('/api/commune/minigame/finish', {
    method: 'POST',
    body: JSON.stringify({ game, roundId, ...result }),
    token,
  });
}

export async function kickCommuneSoccerBall(
  actionId: string,
  dx: number,
  dy: number
): Promise<{ accepted: boolean; awarded: number; spice: number; ball: CommuneSoccerBall }> {
  const token = getStoredToken();
  return call<{ accepted: boolean; awarded: number; spice: number; ball: CommuneSoccerBall }>(
    '/api/commune/soccer/kick',
    {
      method: 'POST',
      body: JSON.stringify({ actionId, dx, dy }),
      token,
    },
  );
}

export type CommuneTreeholeCategory = 'app-feedback' | 'suggestion' | 'tip' | 'other';
export interface CommuneTreeholeEntry {
  id: number;
  category: CommuneTreeholeCategory;
  message: string;
  createdAt: number;
}

/** Submit feedback without attaching the signed-in username to the record. */
export async function submitCommuneTreeholeFeedback(
  category: CommuneTreeholeCategory,
  message: string
): Promise<void> {
  const token = getStoredToken();
  await call('/api/commune/treehole', {
    method: 'POST',
    body: JSON.stringify({ category, message }),
    token,
  });
}

/** Admin-only anonymous feedback inbox. */
export async function fetchCommuneTreeholeFeedback(): Promise<CommuneTreeholeEntry[]> {
  const token = getStoredToken();
  const out = await call<{ entries: CommuneTreeholeEntry[] }>('/api/commune/treehole', { token });
  return out.entries;
}

/** Refresh the shared, randomized spice drops for the town map. */
export async function refreshCommuneSpiceDrops(): Promise<{ drops: CommuneDrop[] }> {
  const token = getStoredToken();
  return call<{ drops: CommuneDrop[] }>('/api/commune/spice/drops', { token });
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

export async function listCommuneChallengeNpcs(): Promise<CommuneChallengeNpc[]> {
  const token = getStoredToken();
  const out = await call<{ npcs: CommuneChallengeNpc[] }>('/api/commune/challenge/npcs', { token });
  return out.npcs;
}

export async function startChallengeNpc(
  npcId: string,
  callbacks?: ChallengeNpcStreamCallbacks,
): Promise<{
  sessionId: string;
  npcName: string;
  turn: ChallengeNpcTurn;
}> {
  return challengeStream('/api/commune/challenge/start', { npcId }, callbacks);
}

export async function sendChallengeNpcTurn(
  sessionId: string,
  message: string,
  callbacks?: ChallengeNpcStreamCallbacks,
): Promise<{ turn: ChallengeNpcTurn; submitted: boolean }> {
  return challengeStream('/api/commune/challenge/turn', { sessionId, message }, callbacks);
}

export async function adminListChallengeNpcs(): Promise<ChallengeNpc[]> {
  const token = getStoredToken();
  const out = await call<{ npcs: ChallengeNpc[] }>('/api/admin/challenge-npcs', { token });
  return out.npcs;
}

export async function adminSaveChallengeNpc(
  npc: Pick<ChallengeNpc, 'id' | 'name' | 'modelNumber' | 'issueType' | 'personality' | 'complaints' | 'possibleResolution' | 'correctResolution' | 'enabled'>,
): Promise<ChallengeNpc> {
  const token = getStoredToken();
  const out = await call<{ npc: ChallengeNpc }>('/api/admin/challenge-npcs', {
    method: 'POST',
    body: JSON.stringify(npc),
    token,
  });
  return out.npc;
}

export async function adminDeleteChallengeNpc(id: string): Promise<void> {
  const token = getStoredToken();
  await call('/api/admin/challenge-npcs/delete', {
    method: 'POST',
    body: JSON.stringify({ id }),
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

/** Archive a generated ticket note; the stable client id makes retries idempotent. */
export async function saveGeneratedTicketNote(
  note: SavedTicketNoteInput
): Promise<{ id: string; pushedAt: number }> {
  const token = getStoredToken();
  return call<{ id: string; pushedAt: number }>('/api/ticket-notes', {
    method: 'POST',
    body: JSON.stringify(note),
    token,
  });
}

/** Update the current agent's archived note, or a note the Super Admin owns. */
export async function updateGeneratedTicketNote(note: SavedTicketNoteInput): Promise<void> {
  const token = getStoredToken();
  await call('/api/ticket-notes', {
    method: 'PUT',
    body: JSON.stringify(note),
    token,
  });
}

/** Super Admin-only QA archive, ordered newest first. */
export async function adminListSavedTicketNotes(options: {
  offset?: number;
  limit?: number;
  issueType?: string;
} = {}): Promise<{ notes: SavedTicketNote[]; total: number }> {
  const token = getStoredToken();
  const params = new URLSearchParams({
    offset: String(options.offset ?? 0),
    limit: String(options.limit ?? 10),
  });
  if (options.issueType?.trim()) params.set('issue_type', options.issueType.trim());
  return call<{ notes: SavedTicketNote[]; total: number }>(
    `/api/admin/saved-ticket-notes?${params.toString()}`,
    { token }
  );
}

/** Super Admin-only edit for a saved ticket note. */
export async function adminUpdateSavedTicketNote(note: SavedTicketNoteInput): Promise<void> {
  const token = getStoredToken();
  await call('/api/admin/saved-ticket-notes', {
    method: 'PUT',
    body: JSON.stringify(note),
    token,
  });
}
