import { DurableObject } from 'cloudflare:workers';
import {
  COMMUNE_HANGOUTS,
  COMMUNE_HANGOUT_ENTER_RANGE,
  COMMUNE_HANGOUT_EXIT_OFFSET,
  type CommuneHangoutId,
} from '../shared/commune-hangouts';
import {
  COMMUNE_BUILD_CATALOG,
  COMMUNE_BUILD_INTERACT_RANGE,
  COMMUNE_BUILD_MAX_PER_AGENT,
  COMMUNE_BUILD_MAX_TOTAL,
  COMMUNE_BUILD_PLACE_RANGE,
  communeBuildCarId,
  type CommuneBuildable,
  type CommuneBuildKind,
} from '../shared/commune-buildables';

type SqlRow<T extends object> = T & Record<string, SqlStorageValue>;

export interface CommuneRoomLoadout {
  cards: string[];
  pet: { id: string; name: string; stage: string; mood: number; xp: number } | null;
  phrase: string;
  avatar: {
    hair: string;
    hairStyle: 'short' | 'long';
    shirt: string;
    bottom: 'pants' | 'skirt';
    bottomColor: string;
    shoes: string;
  } | null;
}

export interface CommuneRoomAgent {
  username: string;
  isAdmin: boolean;
  isManagement: boolean;
  isSuperAdmin: boolean;
  x: number;
  y: number;
  status: string;
  seenAgo: number;
  isAfk?: boolean;
  loadout: CommuneRoomLoadout | null;
  carId?: string | null;
  carSeat?: number | null;
  hangoutId?: CommuneHangoutId | null;
  hangoutSeat?: number | null;
}

export interface CommuneRoomDrop {
  id: number;
  x: number;
  y: number;
}

export interface CommuneRoomSoccerBall {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  kickedAt: number;
  by: string | null;
}

export type CommuneRoomBannerKind = 'pin' | 'priority' | 'sketch';
export type CommuneRoomBannerPriority = 'normal' | 'high' | 'urgent';

export interface CommuneRoomBannerStroke {
  color: string;
  points: Array<{ x: number; y: number }>;
}

export interface CommuneRoomBanner {
  id: string;
  text: string;
  author: string;
  at: number;
  kind: CommuneRoomBannerKind;
  priority: CommuneRoomBannerPriority;
  strokes: CommuneRoomBannerStroke[];
}

interface Presence extends CommuneRoomAgent {
  seenAt: number;
  lastMoveAt: number;
  lastChatAt: number;
  viewRadius?: number;
  visibleUsers?: string[];
  mowerClientId?: string;
}

interface CommuneMowerTrack {
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  at: number;
}

interface CommuneMowerRow {
  state_json: string | null;
  authority_client_id: string | null;
  updated_at: number;
}

interface TicketRow {
  ticket: string;
  profile: string;
  expires_at: number;
}

interface PublicChatRow {
  id: string;
  username: string;
  message: string;
  sent_at: number;
}

interface CommuneCarPosition {
  id: string;
  x: number;
  y: number;
  heading: number;
  lastMoveAt: number;
}

interface CommuneSoccerKickResult {
  accepted: boolean;
  replay?: boolean;
  ball?: CommuneRoomSoccerBall;
  error?: 'soccer_out_of_bounds' | 'soccer_ball_too_far' | 'soccer_kick_cooldown' | 'invalid_soccer_kick';
}

interface CommuneLaserShot {
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

interface CommuneLaserShotResult {
  accepted: boolean;
  replay?: boolean;
  shot?: CommuneLaserShot;
  error?: 'invalid_laser_shot' | 'laser_shooter_unavailable' | 'laser_cooldown';
}

type RoomEvent = Record<string, unknown>;

const ROOM_TICKET_TTL_MS = 60_000;
const PRESENCE_TTL_MS = 90_000;
const MOVE_THROTTLE_MS = 80;
const MAX_AGENT_SPEED = 240;
const MAX_MOVE_ELAPSED_MS = 1_000;
const MOVE_DISTANCE_TOLERANCE = 18;
const MOWER_UPDATE_THROTTLE_MS = 100;
const CHAT_THROTTLE_MS = 500;
const MAX_MESSAGE_LENGTH = 90;
const MAX_SOCKET_MESSAGE_LENGTH = 16_384;
const COMMUNE_WORLD_W = 3_200;
const COMMUNE_WORLD_H = 2_400;
const DEFAULT_VIEW_RADIUS = 1_500;
const MIN_VIEW_RADIUS = 600;
const MAX_VIEW_RADIUS = 4_000;
const SOCCER_FIELD = { left: 850, right: 1280, top: 1820, bottom: 2120 };
const SOCCER_BALL_START = { x: 1065, y: 1970 };
const SOCCER_KICK_RANGE = 104;
const SOCCER_KICK_COOLDOWN_MS = 1_400;
const LASER_SHOT_COOLDOWN_MS = 500;
const LASER_MAX_RANGE = 3_400;
const PARKED_CAR_INTERACT_RANGE = 118;
const PARKED_CAR_EXIT_DISTANCE = 100;
const PARKED_CAR_SPEED = 220;
const BUILD_CAR_SPEED = 440;
const CAR_HALF_WIDTH = 39;
const CAR_HALF_LENGTH = 59;
const PARKED_CARS: Record<string, Omit<CommuneCarPosition, 'id'>> = {
  'meadow-cruiser': { x: 1740, y: 820, heading: 0, lastMoveAt: 0 },
  'orchard-wagon': { x: 2300, y: 1880, heading: 0, lastMoveAt: 0 },
};
const CAR_STATIC_BLOCKERS: { x: number; y: number; w: number; h: number }[] = [
  { x: 650, y: 96, w: 300, h: 134 },
  { x: 161, y: 206, w: 170, h: 184 },
  { x: 1245, y: 206, w: 170, h: 184 },
  { x: 155, y: 864, w: 150, h: 176 },
  { x: 1295, y: 864, w: 150, h: 176 },
  { x: 2318, y: 674, w: 64, h: 38 },
  { x: 1840, y: 1314, w: 62, h: 36 },
  { x: 2672, y: 1746, w: 56, h: 46 },
  { x: 736, y: 312, w: 128, h: 36 },
  { x: 330, y: 742, w: 140, h: 36 },
  { x: 90, y: 1062, w: 246, h: 18 },
  { x: 1310, y: 1062, w: 216, h: 18 },
  { x: 1454, y: 1386, w: 52, h: 54 },
  ...COMMUNE_HANGOUTS.map((hangout) => ({
    x: hangout.x - hangout.width / 2,
    y: hangout.y - hangout.depth / 2,
    w: hangout.width,
    h: hangout.depth,
  })),
];
const CAR_BLOCKING_TREES: [number, number][] = [
  [1740, 250], [1830, 310], [1940, 235], [2070, 285], [2180, 220],
  [2350, 310], [2480, 250], [2800, 240], [2940, 310],
  [1670, 1120], [1780, 1080], [1900, 1120], [2050, 1150],
  [1630, 2050], [1760, 2110], [1900, 2040], [2050, 2120],
  [2290, 2220], [2460, 2130], [2660, 2200], [2840, 2110], [3000, 2210],
];

function rayBoxDistance(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  minimum: readonly [number, number, number],
  maximum: readonly [number, number, number],
  maxDistance: number
): number | null {
  let entry = 0;
  let exit = maxDistance;
  for (let axis = 0; axis < 3; axis++) {
    const originAxis = origin[axis];
    const directionAxis = direction[axis];
    if (Math.abs(directionAxis) < 1e-6) {
      if (originAxis < minimum[axis] || originAxis > maximum[axis]) return null;
      continue;
    }
    const first = (minimum[axis] - originAxis) / directionAxis;
    const second = (maximum[axis] - originAxis) / directionAxis;
    entry = Math.max(entry, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (entry > exit) return null;
  }
  return exit < 0 ? null : Math.max(0, entry);
}

function raySphereDistance(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  center: readonly [number, number, number],
  radius: number
): number | null {
  const offset = [
    origin[0] - center[0],
    origin[1] - center[1],
    origin[2] - center[2],
  ];
  const projection = offset[0] * direction[0] + offset[1] * direction[1] + offset[2] * direction[2];
  const discriminant = projection * projection
    - (offset[0] * offset[0] + offset[1] * offset[1] + offset[2] * offset[2] - radius * radius);
  if (discriminant < 0) return null;
  const near = -projection - Math.sqrt(discriminant);
  const far = -projection + Math.sqrt(discriminant);
  return near >= 0 ? near : far >= 0 ? far : null;
}

function carHalfDimensions(carId: string, heading: number) {
  const width = carId.startsWith('buildcar-') ? 48 : CAR_HALF_WIDTH;
  const length = carId.startsWith('buildcar-') ? 71 : CAR_HALF_LENGTH;
  return {
    x: Math.abs(Math.cos(heading)) * width + Math.abs(Math.sin(heading)) * length,
    y: Math.abs(Math.sin(heading)) * width + Math.abs(Math.cos(heading)) * length,
  };
}

function canCarOccupy(
  x: number,
  y: number,
  carId: string,
  cars: CommuneCarPosition[],
  buildables: CommuneBuildable[] = [],
): boolean {
  const car = cars.find((item) => item.id === carId);
  const heading = car?.heading ?? 0;
  const half = carHalfDimensions(carId, heading);
  const halfX = half.x;
  const halfY = half.y;
  if (x < halfX || x > COMMUNE_WORLD_W - halfX || y < 144 + halfY || y > COMMUNE_WORLD_H - halfY) return false;
  if (((x - 800) / (96 + halfX)) ** 2 + ((y - 600) / (96 + halfY)) ** 2 < 1) return false;
  const ponds = [
    { x: 170, y: 640, rx: 115, ry: 75 },
    { x: 2580, y: 790, rx: 150, ry: 102 },
  ];
  if (ponds.some((pond) => ((x - pond.x) / (pond.rx + halfX)) ** 2 + ((y - pond.y) / (pond.ry + halfY)) ** 2 < 1)) return false;
  if (CAR_STATIC_BLOCKERS.some((blocker) =>
    x > blocker.x - halfX && x < blocker.x + blocker.w + halfX
    && y > blocker.y - halfY && y < blocker.y + blocker.h + halfY
  )) return false;
  if (CAR_BLOCKING_TREES.some(([treeX, treeY]) =>
    x > treeX - 30 - halfX && x < treeX + 30 + halfX
    && y > treeY - 42 - halfY && y < treeY + 4 + halfY
  )) return false;
  if (cars.some((car) => {
    const otherHalf = carHalfDimensions(car.id, car.heading);
    return car.id !== carId
      && Math.abs(x - car.x) < halfX + otherHalf.x
      && Math.abs(y - car.y) < halfY + otherHalf.y;
  })) return false;
  return !buildables.some((item) => {
    if (item.kind === 'sports-car' && communeBuildCarId(item.id) === carId) return false;
    const definition = COMMUNE_BUILD_CATALOG.find((entry) => entry.kind === item.kind);
    if (!definition) return false;
    const otherHalfX = Math.abs(Math.cos(item.rotation)) * definition.width / 2
      + Math.abs(Math.sin(item.rotation)) * definition.depth / 2;
    const otherHalfY = Math.abs(Math.sin(item.rotation)) * definition.width / 2
      + Math.abs(Math.cos(item.rotation)) * definition.depth / 2;
    return Math.abs(x - item.x) < halfX + otherHalfX
      && Math.abs(y - item.y) < halfY + otherHalfY;
  });
}

function normalizeLoadout(input: unknown): CommuneRoomLoadout {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const cards = Array.isArray(value.cards)
    ? value.cards.filter((card): card is string => typeof card === 'string' && card.length <= 64).slice(0, 3)
    : [];
  let pet: CommuneRoomLoadout['pet'] = null;
  if (value.pet && typeof value.pet === 'object') {
    const item = value.pet as Record<string, unknown>;
    pet = {
      id: String(item.id ?? '').slice(0, 32),
      name: String(item.name ?? '').slice(0, 24),
      stage: String(item.stage ?? '').slice(0, 16),
      mood: Math.max(0, Math.min(100, Number(item.mood) || 0)),
      xp: Math.max(0, Math.min(100_000, Number(item.xp) || 0)),
    };
  }
  const color = (item: unknown, fallback: string) =>
    /^#[0-9a-fA-F]{6}$/.test(String(item ?? '')) ? String(item) : fallback;
  let avatar: CommuneRoomLoadout['avatar'] = null;
  if (value.avatar && typeof value.avatar === 'object') {
    const item = value.avatar as Record<string, unknown>;
    avatar = {
      hair: color(item.hair, '#4a3728'),
      hairStyle: item.hairStyle === 'long' ? 'long' : 'short',
      shirt: color(item.shirt, '#58a6ff'),
      bottom: item.bottom === 'skirt' ? 'skirt' : 'pants',
      bottomColor: color(item.bottomColor, '#3f4a63'),
      shoes: color(item.shoes, '#2a2d38'),
    };
  }
  return { cards, pet, phrase: String(value.phrase ?? '').slice(0, 80), avatar };
}

function normalizeMowerState(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const modes = ['mowing', 'zoomies', 'confused', 'napping', 'reverse'];
  const numericKeys = [
    'x', 'y', 'heading', 'modeStartedAt', 'modeUntil', 'nextMoodAt',
    'panicCooldownUntil', 'lawnIndex', 'rowIndex', 'rowPass', 'rowDirection',
    'pathIndex', 'goalX', 'goalY', 'lastTrackX', 'lastTrackY', 'trackDistance',
  ];
  if (
    !modes.includes(String(value.mode))
    || numericKeys.some((key) => typeof value[key] !== 'number' || !Number.isFinite(value[key]))
    || !Array.isArray(value.path)
    || value.path.length > 256
  ) return null;

  const path: { x: number; y: number }[] = [];
  for (const point of value.path) {
    if (!point || typeof point !== 'object' || Array.isArray(point)) return null;
    const item = point as Record<string, unknown>;
    if (typeof item.x !== 'number' || typeof item.y !== 'number' || !Number.isFinite(item.x) || !Number.isFinite(item.y)) {
      return null;
    }
    path.push({
      x: Math.max(0, Math.min(COMMUNE_WORLD_W, item.x)),
      y: Math.max(0, Math.min(COMMUNE_WORLD_H, item.y)),
    });
  }

  let says: { text: string; until: number } | null = null;
  if (value.says !== null && value.says !== undefined) {
    if (typeof value.says !== 'object' || Array.isArray(value.says)) return null;
    const speech = value.says as Record<string, unknown>;
    if (typeof speech.text !== 'string' || typeof speech.until !== 'number' || !Number.isFinite(speech.until)) return null;
    says = { text: speech.text.slice(0, 120), until: speech.until };
  }

  const clampWorld = (item: unknown, maximum: number) => Math.max(0, Math.min(maximum, Number(item)));
  const heading = ((Number(value.heading) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return {
    x: clampWorld(value.x, COMMUNE_WORLD_W),
    y: clampWorld(value.y, COMMUNE_WORLD_H),
    heading,
    mode: value.mode,
    modeStartedAt: value.modeStartedAt,
    modeUntil: value.modeUntil,
    nextMoodAt: value.nextMoodAt,
    panicCooldownUntil: value.panicCooldownUntil,
    lawnIndex: Math.max(0, Math.min(2, Math.trunc(Number(value.lawnIndex)))),
    rowIndex: Math.max(0, Math.min(1000, Math.trunc(Number(value.rowIndex)))),
    rowPass: Number(value.rowPass) === 1 ? 1 : 0,
    rowDirection: Number(value.rowDirection) < 0 ? -1 : 1,
    path,
    pathIndex: Math.max(0, Math.min(path.length, Math.trunc(Number(value.pathIndex)))),
    goalX: clampWorld(value.goalX, COMMUNE_WORLD_W),
    goalY: clampWorld(value.goalY, COMMUNE_WORLD_H),
    lastTrackX: clampWorld(value.lastTrackX, COMMUNE_WORLD_W),
    lastTrackY: clampWorld(value.lastTrackY, COMMUNE_WORLD_H),
    trackDistance: Math.max(0, Math.min(1000, Number(value.trackDistance))),
    says,
  };
}

function normalizeMowerTracks(input: unknown): CommuneMowerTrack[] {
  if (!Array.isArray(input)) return [];
  return input.slice(-16).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const track = item as Record<string, unknown>;
    if (![track.fromX, track.fromY, track.x, track.y, track.at].every((part) => typeof part === 'number' && Number.isFinite(part))) {
      return [];
    }
    return [{
      fromX: Math.max(0, Math.min(COMMUNE_WORLD_W, Number(track.fromX))),
      fromY: Math.max(0, Math.min(COMMUNE_WORLD_H, Number(track.fromY))),
      x: Math.max(0, Math.min(COMMUNE_WORLD_W, Number(track.x))),
      y: Math.max(0, Math.min(COMMUNE_WORLD_H, Number(track.y))),
      at: Number(track.at),
    }];
  });
}

function send(ws: WebSocket, event: RoomEvent): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(event));
  } catch {
    try {
      ws.close(1011, 'Unable to send room update');
    } catch {
      /* The socket has already closed. */
    }
  }
}

function attachment(ws: WebSocket): Presence | null {
  try {
    return (ws.deserializeAttachment() as Presence | null) ?? null;
  } catch {
    return null;
  }
}

export class CommuneRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS commune_ws_tickets (
          ticket TEXT PRIMARY KEY,
          profile TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS commune_public_chat_messages (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          message TEXT NOT NULL,
          sent_at INTEGER NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS commune_parked_cars (
          id TEXT PRIMARY KEY,
          x REAL NOT NULL,
          y REAL NOT NULL,
          heading REAL NOT NULL DEFAULT 0,
          last_move_at INTEGER NOT NULL DEFAULT 0
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS commune_buildables (
          id TEXT PRIMARY KEY,
          owner TEXT NOT NULL,
          kind TEXT NOT NULL,
          x REAL NOT NULL,
          y REAL NOT NULL,
          rotation REAL NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS commune_soccer_ball (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          x REAL NOT NULL,
          y REAL NOT NULL,
          from_x REAL NOT NULL,
          from_y REAL NOT NULL,
          kicked_at INTEGER NOT NULL DEFAULT 0,
          by_username TEXT
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS commune_mower_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          state_json TEXT,
          authority_client_id TEXT,
          updated_at INTEGER NOT NULL DEFAULT 0
        )
      `);
      this.ctx.storage.sql.exec(
        'INSERT OR IGNORE INTO commune_mower_state (singleton, state_json, authority_client_id, updated_at) VALUES (1, NULL, NULL, 0)',
      );
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO commune_soccer_ball
         (singleton, x, y, from_x, from_y, kicked_at, by_username)
         VALUES (1, ?, ?, ?, ?, 0, NULL)`,
        SOCCER_BALL_START.x,
        SOCCER_BALL_START.y,
        SOCCER_BALL_START.x,
        SOCCER_BALL_START.y,
      );
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS commune_soccer_kick_limits (
          username TEXT PRIMARY KEY,
          kicked_at INTEGER NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS commune_soccer_kick_actions (
          action_id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS commune_laser_shot_limits (
          username TEXT PRIMARY KEY,
          shot_at INTEGER NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS commune_laser_shot_actions (
          action_id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
      for (const [id, car] of Object.entries(PARKED_CARS)) {
        this.ctx.storage.sql.exec(
          'INSERT OR IGNORE INTO commune_parked_cars (id, x, y, heading) VALUES (?, ?, ?, ?)',
          id,
          car.x,
          car.y,
          car.heading,
        );
      }
    });
  }

  async createTicket(profile: Omit<Presence, 'seenAt' | 'lastMoveAt' | 'lastChatAt'>): Promise<string> {
    const now = Date.now();
    const ticket = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const storedProfile: Presence = {
      ...profile,
      seenAt: now,
      lastMoveAt: 0,
      lastChatAt: 0,
      isAfk: false,
      viewRadius: Math.max(
        MIN_VIEW_RADIUS,
        Math.min(MAX_VIEW_RADIUS, Number(profile.viewRadius) || DEFAULT_VIEW_RADIUS),
      ),
      visibleUsers: [],
    };
    this.ctx.storage.sql.exec('DELETE FROM commune_ws_tickets WHERE expires_at < ?', now);
    this.ctx.storage.sql.exec(
      'INSERT INTO commune_ws_tickets (ticket, profile, expires_at) VALUES (?, ?, ?)',
      ticket,
      JSON.stringify(storedProfile),
      now + ROOM_TICKET_TTL_MS,
    );
    return ticket;
  }

  updateLoadout(username: string, loadout: CommuneRoomLoadout): void {
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets(username)) {
      const current = attachment(ws);
      if (!current) continue;
      const updated = { ...current, loadout, seenAt: now };
      ws.serializeAttachment(updated);
      this.publishAgentUpdate(updated);
    }
  }

  updateAgentRoles(
    username: string,
    roles: { isAdmin: boolean; isManagement: boolean; isSuperAdmin: boolean },
  ): void {
    for (const ws of this.ctx.getWebSockets(username)) {
      const current = attachment(ws);
      if (!current) continue;
      const updated: Presence = { ...current, ...roles, seenAt: Date.now() };
      ws.serializeAttachment(updated);
      this.publishAgentUpdate(updated);
    }
  }

  publishDrops(drops: CommuneRoomDrop[]): void {
    this.broadcast({ type: 'drops', drops });
  }

  publishBanners(banners: CommuneRoomBanner[]): void {
    this.broadcast({ type: 'banners', banners });
  }

  validateBuildPlacement(
    username: string,
    kind: CommuneBuildKind,
    x: number,
    y: number,
    rotation: number,
  ): { ok: boolean; error?: string } {
    const catalog = COMMUNE_BUILD_CATALOG.find((entry) => entry.kind === kind);
    const current = this.ctx.getWebSockets(username)
      .map((socket) => attachment(socket))
      .find((presence): presence is Presence => (
        !!presence && !presence.carId && !presence.hangoutId
        && Date.now() - presence.seenAt <= PRESENCE_TTL_MS
      ));
    if (!catalog || !current) return { ok: false, error: 'Reconnect to Commune before building.' };
    if (Math.hypot(current.x - x, current.y - y) > COMMUNE_BUILD_PLACE_RANGE) {
      return { ok: false, error: 'Build within 300 steps of your agent.' };
    }
    if (!this.isBuildSpaceClear(kind, x, y, rotation)) {
      return { ok: false, error: 'That spot is occupied or outside the buildable map area.' };
    }
    const count = this.ctx.storage.sql.exec<{ count: number }>(
      'SELECT COUNT(*) AS count FROM commune_buildables WHERE owner = ?',
      username,
    ).toArray()[0]?.count ?? 0;
    if (count >= COMMUNE_BUILD_MAX_PER_AGENT) return { ok: false, error: 'You have reached the 24-item building limit.' };
    const total = this.ctx.storage.sql.exec<{ count: number }>(
      'SELECT COUNT(*) AS count FROM commune_buildables',
    ).toArray()[0]?.count ?? 0;
    if (total >= COMMUNE_BUILD_MAX_TOTAL) return { ok: false, error: 'The village has reached its building limit.' };
    return { ok: true };
  }

  validateBuildDemolition(
    username: string,
    buildingId: string,
  ): { ok: boolean; error?: string; building?: CommuneBuildable } {
    const row = this.ctx.storage.sql.exec<{
      id: string;
      owner: string;
      kind: string;
      x: number;
      y: number;
      rotation: number;
      created_at: number;
    }>(
      `SELECT id, owner, kind, x, y, rotation, created_at
       FROM commune_buildables WHERE id = ?`,
      buildingId,
    ).toArray()[0];
    if (!row) return { ok: false, error: 'That structure is no longer in the village.' };
    if (row.owner !== username) return { ok: false, error: 'You can only take apart your own builds.' };
    const current = this.ctx.getWebSockets(username)
      .map((socket) => attachment(socket))
      .find((presence): presence is Presence => (
        !!presence && !presence.carId && !presence.hangoutId
        && Date.now() - presence.seenAt <= PRESENCE_TTL_MS
      ));
    if (!current) return { ok: false, error: 'Reconnect to Commune before taking this apart.' };
    const kind = row.kind as CommuneBuildKind;
    const carId = kind === 'sports-car' ? communeBuildCarId(row.id) : null;
    const carPosition = carId ? this.getCarPosition(carId) : null;
    const removeX = carPosition?.x ?? row.x;
    const removeY = carPosition?.y ?? row.y;
    if (Math.hypot(current.x - removeX, current.y - removeY) > COMMUNE_BUILD_INTERACT_RANGE) {
      return { ok: false, error: 'Walk closer to your structure first.' };
    }
    if (kind === 'sports-car') {
      if (this.ctx.getWebSockets().some((socket) => attachment(socket)?.carId === carId)) {
        return { ok: false, error: 'Everyone must leave the car before it can be taken apart.' };
      }
    }
    return {
      ok: true,
      building: {
        id: row.id,
        owner: row.owner,
        kind,
        x: row.x,
        y: row.y,
        rotation: row.rotation,
        createdAt: row.created_at,
      },
    };
  }

  syncBuildables(buildables: CommuneBuildable[]): CommuneBuildable[] {
    return this.syncBuildablesInStorage(buildables);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/internal/minigame/verify') {
      return this.verifyMinigamePresence(request);
    }
    if (request.method === 'POST' && url.pathname === '/internal/minigame/soccer-kick') {
      return this.handleSoccerKick(request);
    }
    if (request.method === 'POST' && url.pathname === '/internal/minigame/laser-shot') {
      return this.handleLaserShot(request);
    }
    if (request.method === 'POST' && url.pathname === '/internal/minigame/laser-reward') {
      return this.handleLaserReward(request);
    }
    if (request.method !== 'GET' || request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket upgrade required', { status: 426 });
    }

    const ticket = url.searchParams.get('ticket');
    if (!ticket || ticket.length > 100) return new Response('Invalid connection ticket', { status: 401 });
    const row = this.ctx.storage.sql
      .exec<SqlRow<TicketRow>>(
        'SELECT ticket, profile, expires_at FROM commune_ws_tickets WHERE ticket = ? AND expires_at >= ?',
        ticket,
        Date.now(),
      )
      .toArray()[0];
    if (!row) return new Response('Expired or invalid connection ticket', { status: 401 });

    // Consume the single-use ticket before upgrading the connection.
    this.ctx.storage.sql.exec('DELETE FROM commune_ws_tickets WHERE ticket = ?', ticket);
    const profile = JSON.parse(row.profile) as Presence;
    this.pruneStaleConnections();

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const mowerClientId = crypto.randomUUID();
    const connectedProfile: Presence = {
      ...profile,
      carId: null,
      carSeat: null,
      hangoutId: null,
      hangoutSeat: null,
      seenAt: Date.now(),
      lastMoveAt: Date.now(),
      isAfk: false,
      viewRadius: Math.max(
        MIN_VIEW_RADIUS,
        Math.min(MAX_VIEW_RADIUS, Number(profile.viewRadius) || DEFAULT_VIEW_RADIUS),
      ),
      mowerClientId,
    };
    const initialAgents = this.listAgents(
      profile.username,
      connectedProfile.x,
      connectedProfile.y,
      connectedProfile.viewRadius,
    );
    connectedProfile.visibleUsers = initialAgents.map((agent) => agent.username);
    this.ctx.acceptWebSocket(server, [profile.username]);
    server.serializeAttachment(connectedProfile);
    const authority = this.electMowerAuthority(mowerClientId);

    send(server, {
      type: 'welcome',
      self: profile.username,
      others: initialAgents,
      cars: this.listCarPositions(),
      buildables: this.listBuildables(),
      soccerBall: this.getSoccerBall(),
      mowerClientId,
      mowerAuthorityClientId: authority.clientId,
      mowerState: authority.state,
    });
    if (authority.changed) {
      this.broadcastMowerAuthority(authority.clientId, authority.state);
    }
    const recentMessages = this.ctx.storage.sql.exec<SqlRow<PublicChatRow>>(
      `SELECT id, username, message, sent_at
       FROM commune_public_chat_messages
       WHERE sent_at >= ?
       ORDER BY sent_at DESC
       LIMIT 20`,
      Date.now() - 24 * 60 * 60 * 1000,
    ).toArray().reverse();
    send(server, {
      type: 'public_chat_history',
      messages: recentMessages.map((row) => ({
        id: row.id,
        from: row.username,
        message: row.message,
        sentAt: row.sent_at,
      })),
    });
    this.publishAgentUpdate(connectedProfile);

    return new Response(null, { status: 101, webSocket: client });
  }

  private async verifyMinigamePresence(request: Request): Promise<Response> {
    const payload = await request.json().catch(() => null) as { username?: unknown; game?: unknown } | null;
    const username = typeof payload?.username === 'string' ? payload.username.trim() : '';
    const game = payload?.game;
    const current = this.ctx.getWebSockets(username)
      .map((socket) => attachment(socket))
      .find((presence): presence is Presence => !!presence && !presence.carId && !presence.hangoutId);
    if (!username || !current) {
      return Response.json({ ok: false, error: 'Join the town square to play.' }, { status: 403 });
    }
    const zones = {
      golf: { x: 2_860, y: 1_280, range: 230 },
      bowling: { x: 2_250, y: 1_290, range: 220 },
    } as const;
    if (game !== 'golf' && game !== 'bowling') {
      return Response.json({ ok: false, error: 'Unknown mini-game.' }, { status: 400 });
    }
    const zone = zones[game];
    const nearby = Math.hypot(current.x - zone.x, current.y - zone.y) <= zone.range;
    return Response.json({ ok: nearby, error: nearby ? undefined : 'Walk up to the game area first.' });
  }

  private async handleSoccerKick(request: Request): Promise<Response> {
    const payload = await request.json().catch(() => null) as {
      username?: unknown;
      actionId?: unknown;
      dx?: unknown;
      dy?: unknown;
    } | null;
    const username = typeof payload?.username === 'string' ? payload.username.trim() : '';
    const actionId = typeof payload?.actionId === 'string' ? payload.actionId : '';
    const dx = Number(payload?.dx);
    const dy = Number(payload?.dy);
    const directionLength = Math.hypot(dx, dy);
    if (
      !username
      || !/^[\da-f-]{36}$/i.test(actionId)
      || !Number.isFinite(directionLength)
      || directionLength < 0.1
    ) {
      return Response.json({ accepted: false, error: 'invalid_soccer_kick' } satisfies CommuneSoccerKickResult, { status: 400 });
    }

    const existing = this.ctx.storage.sql.exec<{ result_json: string }>(
      'SELECT result_json FROM commune_soccer_kick_actions WHERE action_id = ?',
      actionId,
    ).toArray()[0];
    if (existing) {
      return Response.json({
        ...(JSON.parse(existing.result_json) as CommuneSoccerKickResult),
        replay: true,
      });
    }

    const current = this.ctx.getWebSockets(username)
      .map((socket) => attachment(socket))
      .find((presence): presence is Presence => !!presence && !presence.carId && !presence.hangoutId);
    if (!current) {
      return Response.json({ accepted: false, error: 'soccer_out_of_bounds' } satisfies CommuneSoccerKickResult, { status: 403 });
    }
    const inField = current.x >= SOCCER_FIELD.left && current.x <= SOCCER_FIELD.right
      && current.y >= SOCCER_FIELD.top && current.y <= SOCCER_FIELD.bottom;
    if (!inField) {
      return Response.json({ accepted: false, error: 'soccer_out_of_bounds' } satisfies CommuneSoccerKickResult, { status: 403 });
    }

    const ball = this.getSoccerBall();
    if (Math.hypot(current.x - ball.x, current.y - ball.y) > SOCCER_KICK_RANGE) {
      return Response.json({ accepted: false, error: 'soccer_ball_too_far' } satisfies CommuneSoccerKickResult, { status: 409 });
    }
    const lastKick = this.ctx.storage.sql.exec<{ kicked_at: number }>(
      'SELECT kicked_at FROM commune_soccer_kick_limits WHERE username = ?',
      username,
    ).toArray()[0];
    const now = Date.now();
    if (lastKick && now - lastKick.kicked_at < SOCCER_KICK_COOLDOWN_MS) {
      return Response.json({ accepted: false, error: 'soccer_kick_cooldown' } satisfies CommuneSoccerKickResult, { status: 429 });
    }

    const unitX = dx / directionLength;
    const unitY = dy / directionLength;
    const x = Math.max(SOCCER_FIELD.left + 18, Math.min(SOCCER_FIELD.right - 18, ball.x + unitX * 170));
    const y = Math.max(SOCCER_FIELD.top + 18, Math.min(SOCCER_FIELD.bottom - 18, ball.y + unitY * 170));
    const nextBall: CommuneRoomSoccerBall = {
      x,
      y,
      fromX: ball.x,
      fromY: ball.y,
      kickedAt: now,
      by: username,
    };
    const result: CommuneSoccerKickResult = { accepted: true, ball: nextBall };
    this.ctx.storage.sql.exec(
      `UPDATE commune_soccer_ball
       SET x = ?, y = ?, from_x = ?, from_y = ?, kicked_at = ?, by_username = ?
       WHERE singleton = 1`,
      nextBall.x,
      nextBall.y,
      nextBall.fromX,
      nextBall.fromY,
      nextBall.kickedAt,
      nextBall.by,
    );
    this.ctx.storage.sql.exec(
      `INSERT INTO commune_soccer_kick_limits (username, kicked_at) VALUES (?, ?)
       ON CONFLICT(username) DO UPDATE SET kicked_at = excluded.kicked_at`,
      username,
      now,
    );
    this.ctx.storage.sql.exec(
      'INSERT INTO commune_soccer_kick_actions (action_id, username, result_json, created_at) VALUES (?, ?, ?, ?)',
      actionId,
      username,
      JSON.stringify(result),
      now,
    );
    this.ctx.storage.sql.exec('DELETE FROM commune_soccer_kick_actions WHERE created_at < ?', now - 120_000);
    this.broadcast({ type: 'soccer_ball', ball: nextBall });
    return Response.json(result);
  }

  private async handleLaserShot(request: Request): Promise<Response> {
    const payload = await request.json().catch(() => null) as {
      username?: unknown;
      actionId?: unknown;
      yaw?: unknown;
      pitch?: unknown;
    } | null;
    const username = typeof payload?.username === 'string' ? payload.username.trim() : '';
    const actionId = typeof payload?.actionId === 'string' ? payload.actionId : '';
    const yawInput = Number(payload?.yaw);
    const pitch = Number(payload?.pitch);
    if (
      !username
      || !/^[\da-f-]{36}$/i.test(actionId)
      || !Number.isFinite(yawInput)
      || Math.abs(yawInput) > 10_000
      || !Number.isFinite(pitch)
      || pitch < -1.25
      || pitch > 1.25
    ) {
      return Response.json({ accepted: false, error: 'invalid_laser_shot' } satisfies CommuneLaserShotResult, { status: 400 });
    }

    const replay = this.ctx.storage.sql.exec<{ username: string; result_json: string }>(
      'SELECT username, result_json FROM commune_laser_shot_actions WHERE action_id = ?',
      actionId,
    ).toArray()[0];
    if (replay) {
      if (replay.username !== username) {
        return Response.json({ accepted: false, error: 'invalid_laser_shot' } satisfies CommuneLaserShotResult, { status: 403 });
      }
      return Response.json({
        ...(JSON.parse(replay.result_json) as CommuneLaserShotResult),
        replay: true,
      });
    }

    const now = Date.now();
    const current = this.ctx.getWebSockets(username)
      .map((socket) => attachment(socket))
      .find((presence): presence is Presence => (
        !!presence && !presence.carId && !presence.hangoutId && now - presence.seenAt <= PRESENCE_TTL_MS
      ));
    if (!current) {
      return Response.json({ accepted: false, error: 'laser_shooter_unavailable' } satisfies CommuneLaserShotResult, { status: 403 });
    }
    const lastShot = this.ctx.storage.sql.exec<{ shot_at: number }>(
      'SELECT shot_at FROM commune_laser_shot_limits WHERE username = ?',
      username,
    ).toArray()[0];
    if (lastShot && now - lastShot.shot_at < LASER_SHOT_COOLDOWN_MS) {
      return Response.json({ accepted: false, error: 'laser_cooldown' } satisfies CommuneLaserShotResult, { status: 429 });
    }

    const yaw = Math.atan2(Math.sin(yawInput), Math.cos(yawInput));
    const direction: [number, number, number] = [
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    ];
    const origin: [number, number, number] = [current.x, 55, current.y];
    let maxDistance = LASER_MAX_RANGE;
    if (direction[0] > 1e-6) maxDistance = Math.min(maxDistance, (COMMUNE_WORLD_W - current.x) / direction[0]);
    if (direction[0] < -1e-6) maxDistance = Math.min(maxDistance, (0 - current.x) / direction[0]);
    if (direction[2] > 1e-6) maxDistance = Math.min(maxDistance, (COMMUNE_WORLD_H - current.y) / direction[2]);
    if (direction[2] < -1e-6) maxDistance = Math.min(maxDistance, (0 - current.y) / direction[2]);
    maxDistance = Math.max(0, maxDistance);

    let blockerDistance = maxDistance;
    const groundDistance = direction[1] < -1e-6 ? (-5 - origin[1]) / direction[1] : Infinity;
    if (groundDistance >= 0 && groundDistance < blockerDistance) blockerDistance = groundDistance;
    for (const blocker of CAR_STATIC_BLOCKERS) {
      const distance = rayBoxDistance(
        origin,
        direction,
        [blocker.x, 0, blocker.y],
        [blocker.x + blocker.w, 145, blocker.y + blocker.h],
        blockerDistance,
      );
      if (distance !== null) blockerDistance = Math.min(blockerDistance, distance);
    }
    for (const [treeX, treeY] of CAR_BLOCKING_TREES) {
      const distance = rayBoxDistance(
        origin,
        direction,
        [treeX - 30, 0, treeY - 42],
        [treeX + 30, 132, treeY + 4],
        blockerDistance,
      );
      if (distance !== null) blockerDistance = Math.min(blockerDistance, distance);
    }
    const cars = this.ctx.storage.sql.exec<{ id: string; x: number; y: number; heading: number }>(
      'SELECT id, x, y, heading FROM commune_parked_cars',
    ).toArray();
    for (const car of cars) {
      const half = carHalfDimensions(car.id, car.heading);
      const distance = rayBoxDistance(
        origin,
        direction,
        [car.x - half.x, 0, car.y - half.y],
        [car.x + half.x, 58, car.y + half.y],
        blockerDistance,
      );
      if (distance !== null) blockerDistance = Math.min(blockerDistance, distance);
    }

    const candidates = new Map<string, Presence>();
    for (const socket of this.ctx.getWebSockets()) {
      const presence = attachment(socket);
      if (
        !presence
        || presence.username === username
        || presence.carId
        || presence.hangoutId
        || now - presence.seenAt > PRESENCE_TTL_MS
      ) continue;
      const existing = candidates.get(presence.username);
      if (!existing || presence.seenAt > existing.seenAt) candidates.set(presence.username, presence);
    }
    let targetUsername: string | null = null;
    let impactDistance = blockerDistance;
    for (const [target, presence] of candidates) {
      const bodyHit = raySphereDistance(origin, direction, [presence.x, 25, presence.y], 16);
      const headHit = raySphereDistance(origin, direction, [presence.x, 44, presence.y], 13);
      for (const distance of [bodyHit, headHit]) {
        if (distance !== null && distance < impactDistance) {
          impactDistance = distance;
          targetUsername = target;
        }
      }
    }

    const fromOffset = 8;
    const muzzleSideOffset = 6;
    const shot: CommuneLaserShot = {
      id: actionId,
      shooter: username,
      fromX: origin[0] + direction[0] * fromOffset + Math.cos(yaw) * muzzleSideOffset,
      fromY: origin[2] + direction[2] * fromOffset - Math.sin(yaw) * muzzleSideOffset,
      fromHeight: origin[1] + direction[1] * fromOffset - 5,
      toX: origin[0] + direction[0] * impactDistance,
      toY: origin[2] + direction[2] * impactDistance,
      toHeight: origin[1] + direction[1] * impactDistance,
      durationMs: Math.max(90, Math.min(650, Math.round(Math.max(0, impactDistance - fromOffset) / 6.5))),
      targetUsername,
    };
    const result: CommuneLaserShotResult = { accepted: true, shot };
    this.ctx.storage.sql.exec(
      `INSERT INTO commune_laser_shot_limits (username, shot_at) VALUES (?, ?)
       ON CONFLICT(username) DO UPDATE SET shot_at = excluded.shot_at`,
      username,
      now,
    );
    this.ctx.storage.sql.exec(
      `INSERT INTO commune_laser_shot_actions (action_id, username, result_json, created_at)
       VALUES (?, ?, ?, ?)`,
      actionId,
      username,
      JSON.stringify(result),
      now,
    );
    this.ctx.storage.sql.exec('DELETE FROM commune_laser_shot_actions WHERE created_at < ?', now - 120_000);
    this.broadcast({ type: 'laser_shot', shot });
    return Response.json(result);
  }

  private async handleLaserReward(request: Request): Promise<Response> {
    const payload = await request.json().catch(() => null) as {
      username?: unknown;
      actionId?: unknown;
      spice?: unknown;
    } | null;
    const username = typeof payload?.username === 'string' ? payload.username.trim() : '';
    const actionId = typeof payload?.actionId === 'string' ? payload.actionId : '';
    const spice = Number(payload?.spice);
    if (!username || !/^[\da-f-]{36}$/i.test(actionId) || !Number.isFinite(spice) || spice < 0) {
      return Response.json({ ok: false }, { status: 400 });
    }
    for (const socket of this.ctx.getWebSockets(username)) {
      send(socket, { type: 'laser_reward', username, actionId, spice });
    }
    return Response.json({ ok: true });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
    if (raw.length > MAX_SOCKET_MESSAGE_LENGTH) {
      ws.close(1009, 'Message too large');
      return;
    }

    let event: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid event');
      event = parsed as Record<string, unknown>;
    } catch {
      send(ws, { type: 'error', code: 'invalid_message', message: 'Invalid room event.' });
      return;
    }

    const current = attachment(ws);
    if (!current) {
      ws.close(1008, 'Missing session');
      return;
    }

    const now = Date.now();
    if (event.type === 'mower_state') {
      const roomMower = this.getMowerRow();
      if (!current.mowerClientId || current.mowerClientId !== roomMower.authority_client_id) return;
      const mower = normalizeMowerState(event.mower);
      if (!mower) {
        send(ws, { type: 'error', code: 'invalid_mower_state', message: 'Invalid mower state.' });
        return;
      }
      if (now - roomMower.updated_at < MOWER_UPDATE_THROTTLE_MS) return;
      const tracks = normalizeMowerTracks(event.tracks);
      this.ctx.storage.sql.exec(
        'UPDATE commune_mower_state SET state_json = ?, updated_at = ? WHERE singleton = 1',
        JSON.stringify(mower),
        now,
      );
      ws.serializeAttachment({ ...current, seenAt: now, isAfk: false });
      this.broadcastExceptSocket({
        type: 'mower_state',
        clientId: current.mowerClientId,
        mowerState: mower,
        tracks,
      }, ws);
      return;
    }

    if (event.type === 'hangout_enter') {
      const hangoutId = typeof event.hangoutId === 'string' ? event.hangoutId : '';
      const hangout = COMMUNE_HANGOUTS.find((item) => item.id === hangoutId);
      if (
        !hangout ||
        current.carId ||
        current.hangoutId ||
        Math.hypot(current.x - hangout.doorX, current.y - hangout.doorY) > COMMUNE_HANGOUT_ENTER_RANGE
      ) {
        send(ws, { type: 'error', code: 'hangout_unavailable', message: 'Walk up to the building entrance before entering.' });
        return;
      }
      const occupiedSeats = new Set<number>();
      const occupantNames = new Set<string>();
      for (const otherSocket of this.ctx.getWebSockets()) {
        const other = attachment(otherSocket);
        if (otherSocket.readyState !== WebSocket.OPEN || other?.hangoutId !== hangout.id) continue;
        if (other.username === current.username) {
          send(ws, { type: 'error', code: 'hangout_already_inside', message: 'You are already inside this building.' });
          return;
        }
        if (occupantNames.has(other.username)) continue;
        occupantNames.add(other.username);
        if (Number.isInteger(other.hangoutSeat)) occupiedSeats.add(other.hangoutSeat as number);
      }
      const seat = Array.from({ length: hangout.capacity }, (_, index) => index)
        .find((index) => !occupiedSeats.has(index));
      if (seat === undefined) {
        send(ws, { type: 'error', code: 'hangout_full', message: `${hangout.label} is full.` });
        return;
      }
      const updated: Presence = {
        ...current,
        carId: null,
        carSeat: null,
        hangoutId: hangout.id,
        hangoutSeat: seat,
        x: hangout.x,
        y: hangout.y,
        status: `chilling at ${hangout.label}`,
        seenAt: now,
        lastMoveAt: now,
        isAfk: false,
      };
      ws.serializeAttachment(updated);
      this.publishAgentUpdate(updated);
      this.refreshVisibleAgents(ws, updated);
      send(ws, { type: 'hangout_state', hangoutId: hangout.id, seat, x: hangout.x, y: hangout.y });
      return;
    }

    if (event.type === 'hangout_exit') {
      if (!current.hangoutId || current.hangoutSeat === null || current.hangoutSeat === undefined) return;
      const hangout = COMMUNE_HANGOUTS.find((item) => item.id === current.hangoutId);
      if (!hangout) return;
      const updated: Presence = {
        ...current,
        hangoutId: null,
        hangoutSeat: null,
        x: hangout.doorX,
        y: hangout.doorY - COMMUNE_HANGOUT_EXIT_OFFSET,
        status: `leaving ${hangout.label}`,
        seenAt: now,
        lastMoveAt: now,
        isAfk: false,
      };
      ws.serializeAttachment(updated);
      this.publishAgentUpdate(updated);
      this.refreshVisibleAgents(ws, updated);
      send(ws, { type: 'hangout_state', hangoutId: null, seat: null, x: updated.x, y: updated.y });
      return;
    }

    if (event.type === 'car_enter') {
      const carId = typeof event.carId === 'string' ? event.carId : '';
      const car = this.getCarPosition(carId);
      if (!car || current.carId || current.hangoutId || Math.hypot(current.x - car.x, current.y - car.y) > PARKED_CAR_INTERACT_RANGE) {
        send(ws, { type: 'error', code: 'car_unavailable', message: 'You cannot enter that car right now.' });
        return;
      }
      const occupiedSeats = new Set<number>();
      for (const otherSocket of this.ctx.getWebSockets()) {
        const other = attachment(otherSocket);
        if (otherSocket.readyState !== WebSocket.OPEN || !other) continue;
        if (other.username === current.username && other.carId === carId) {
          send(ws, { type: 'error', code: 'car_already_entered', message: 'You are already in this car.' });
          return;
        }
        if (other?.carId === carId && other.carSeat !== null && other.carSeat !== undefined) {
          occupiedSeats.add(other.carSeat);
        }
      }
      const seat = occupiedSeats.has(0) ? 1 : 0;
      if (occupiedSeats.has(seat)) {
        send(ws, { type: 'error', code: 'car_full', message: 'Both seats are occupied.' });
        return;
      }
      const updated: Presence = {
        ...current,
        carId,
        carSeat: seat,
        hangoutId: null,
        hangoutSeat: null,
        x: car.x,
        y: car.y,
        status: 'having a private car conversation',
        seenAt: now,
        lastMoveAt: now,
        isAfk: false,
      };
      this.ctx.storage.sql.exec('UPDATE commune_parked_cars SET last_move_at = ? WHERE id = ?', now, carId);
      ws.serializeAttachment(updated);
      this.publishAgentUpdate(updated);
      this.refreshVisibleAgents(ws, updated);
      send(ws, { type: 'car_state', carId, seat, x: car.x, y: car.y, heading: car.heading });
      return;
    }

    if (event.type === 'car_exit') {
      if (!current.carId || current.carSeat === null || current.carSeat === undefined) return;
      const car = this.getCarPosition(current.carId);
      if (!car) return;
      const side = current.carSeat === 0 ? -PARKED_CAR_EXIT_DISTANCE : PARKED_CAR_EXIT_DISTANCE;
      const x = car.x + Math.cos(car.heading) * side;
      const y = car.y + Math.sin(car.heading) * side;
      const updated: Presence = {
        ...current,
        carId: null,
        carSeat: null,
        x,
        y,
        status: 'stepping out of a parked car',
        seenAt: now,
        lastMoveAt: now,
        isAfk: false,
      };
      ws.serializeAttachment(updated);
      this.publishAgentUpdate(updated);
      this.refreshVisibleAgents(ws, updated);
      send(ws, { type: 'car_state', carId: null, seat: null, x, y });
      return;
    }

    if (event.type === 'car_move') {
      if (!current.carId) return;
      const dx = Number(event.dx);
      const dy = Number(event.dy);
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
      const directionLength = Math.hypot(dx, dy);
      const car = this.getCarPosition(current.carId);
      if (!car || !Number.isFinite(directionLength) || now - car.lastMoveAt < MOVE_THROTTLE_MS || directionLength < 0.12) return;
      const elapsedMs = Math.min(150, Math.max(0, now - car.lastMoveAt));
      const speed = current.carId.startsWith('buildcar-') ? BUILD_CAR_SPEED : PARKED_CAR_SPEED;
      const travel = speed * Math.min(1, directionLength) * elapsedMs / 1000;
      const x = car.x + (dx / directionLength) * travel;
      const y = car.y + (dy / directionLength) * travel;
      const cars = this.listCarPositions();
      const heading = Math.atan2(dy, dx) + Math.PI / 2;
      if (!canCarOccupy(x, y, current.carId, cars.map((item) =>
        item.id === current.carId ? { ...item, heading } : item
      ), this.listBuildables())) {
        this.ctx.storage.sql.exec(
          'UPDATE commune_parked_cars SET last_move_at = ? WHERE id = ?',
          now,
          current.carId,
        );
        const updated = { ...current, seenAt: now, lastMoveAt: now, isAfk: false };
        ws.serializeAttachment(updated);
        return;
      }

      this.ctx.storage.sql.exec(
        'UPDATE commune_parked_cars SET x = ?, y = ?, heading = ?, last_move_at = ? WHERE id = ?',
        x,
        y,
        heading,
        now,
        current.carId,
      );
      for (const occupantSocket of this.ctx.getWebSockets()) {
        const occupant = attachment(occupantSocket);
        if (!occupant || occupant.carId !== current.carId) continue;
        const updated: Presence = {
          ...occupant,
          x,
          y,
          seenAt: now,
          lastMoveAt: now,
          isAfk: false,
        };
        occupantSocket.serializeAttachment(updated);
        this.publishAgentUpdate(updated, true);
        this.refreshVisibleAgents(occupantSocket, updated);
      }
      this.broadcast({ type: 'car_update', carId: current.carId, x, y, heading, at: now });
      return;
    }

    if (event.type === 'public_chat_delete') {
      const id = typeof event.id === 'string' ? event.id.slice(0, 64) : '';
      if (!id) return;
      const row = this.ctx.storage.sql.exec<{ username: string }>(
        'SELECT username FROM commune_public_chat_messages WHERE id = ?',
        id,
      ).toArray()[0];
      if (!row) return;
      if (row.username !== current.username && !current.isAdmin) {
        send(ws, { type: 'error', code: 'chat_delete_forbidden', message: 'You can only delete your own messages.' });
        return;
      }
      this.ctx.storage.sql.exec('DELETE FROM commune_public_chat_messages WHERE id = ?', id);
      this.broadcast({ type: 'public_chat_delete', id });
      return;
    }

    if (event.type === 'loadout') {
      const updated: Presence = {
        ...current,
        loadout: normalizeLoadout(event.loadout),
        seenAt: now,
        isAfk: false,
      };
      ws.serializeAttachment(updated);
      this.publishAgentUpdate(updated);
      return;
    }

    if (event.type === 'leave') {
      ws.close(1000, 'Leaving Commune');
      return;
    }

    if (event.type === 'heartbeat') {
      const isAfk = typeof event.isAfk === 'boolean' ? event.isAfk : current.isAfk === true;
      const viewRadius = Number.isFinite(Number(event.viewRadius))
        ? Math.max(MIN_VIEW_RADIUS, Math.min(MAX_VIEW_RADIUS, Number(event.viewRadius)))
        : current.viewRadius ?? DEFAULT_VIEW_RADIUS;
      const updated = { ...current, seenAt: now, isAfk, viewRadius };
      ws.serializeAttachment(updated);
      this.pruneStaleConnections();
      if (isAfk !== (current.isAfk === true)) {
        this.publishAgentUpdate(updated);
      }
      if (
        !Array.isArray(current.visibleUsers) ||
        viewRadius !== (current.viewRadius ?? DEFAULT_VIEW_RADIUS)
      ) this.refreshVisibleAgents(ws, updated);
      send(ws, { type: 'heartbeat_ack', at: now });
      return;
    }

    if (event.type === 'move') {
      if (current.carId || current.hangoutId) return;
      if (now - current.lastMoveAt < MOVE_THROTTLE_MS) return;
      const x = Number(event.x);
      const y = Number(event.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        send(ws, { type: 'error', code: 'invalid_position', message: 'Invalid position.' });
        return;
      }
      const targetX = Math.max(24, Math.min(COMMUNE_WORLD_W - 24, x));
      const targetY = Math.max(144, Math.min(COMMUNE_WORLD_H - 24, y));
      const elapsedMs = Math.min(MAX_MOVE_ELAPSED_MS, Math.max(0, now - current.lastMoveAt));
      const maxDistance = MAX_AGENT_SPEED * elapsedMs / 1_000 + MOVE_DISTANCE_TOLERANCE;
      const distance = Math.hypot(targetX - current.x, targetY - current.y);
      if (distance > maxDistance) {
        ws.serializeAttachment({ ...current, seenAt: now, isAfk: false });
        send(ws, {
          type: 'position_correction',
          x: current.x,
          y: current.y,
        });
        return;
      }
      const updated: Presence = {
        ...current,
        x: targetX,
        y: targetY,
        status: typeof event.status === 'string' ? event.status.slice(0, 40) : current.status,
        seenAt: now,
        lastMoveAt: now,
        isAfk: false,
        viewRadius: Number.isFinite(Number(event.viewRadius))
          ? Math.max(MIN_VIEW_RADIUS, Math.min(MAX_VIEW_RADIUS, Number(event.viewRadius)))
          : current.viewRadius ?? DEFAULT_VIEW_RADIUS,
      };
      ws.serializeAttachment(updated);
      this.publishAgentUpdate(updated, true);
      this.refreshVisibleAgents(ws, updated);
      return;
    }

    if (event.type === 'car_chat') {
      if (!current.carId || current.hangoutId) {
        send(ws, { type: 'error', code: 'not_in_car', message: 'Get into a parked car to use its private chat.' });
        return;
      }
      if (now - current.lastChatAt < CHAT_THROTTLE_MS) {
        send(ws, { type: 'error', code: 'chat_rate_limited', message: 'Please wait a moment before sending again.' });
        return;
      }
      const messageText = typeof event.message === 'string'
        ? event.message.trim().slice(0, MAX_MESSAGE_LENGTH)
        : '';
      if (!messageText) {
        send(ws, { type: 'error', code: 'empty_message', message: 'Type a message first.' });
        return;
      }
      const updated = { ...current, seenAt: now, lastChatAt: now, isAfk: false };
      ws.serializeAttachment(updated);
      if (current.isAfk) {
        this.publishAgentUpdate(updated);
      }
      const chatEvent = {
        type: 'car_chat',
        carId: current.carId,
        from: current.username,
        message: messageText,
        sentAt: now,
      };
      for (const recipient of this.ctx.getWebSockets()) {
        if (attachment(recipient)?.carId === current.carId) send(recipient, chatEvent);
      }
      return;
    }

    if (event.type === 'hangout_chat') {
      if (!current.hangoutId) {
        send(ws, { type: 'error', code: 'not_in_hangout', message: 'Enter a villa or tent to use its private chat.' });
        return;
      }
      if (now - current.lastChatAt < CHAT_THROTTLE_MS) {
        send(ws, { type: 'error', code: 'chat_rate_limited', message: 'Please wait a moment before sending again.' });
        return;
      }
      const messageText = typeof event.message === 'string'
        ? event.message.trim().slice(0, MAX_MESSAGE_LENGTH)
        : '';
      if (!messageText) {
        send(ws, { type: 'error', code: 'empty_message', message: 'Type a message first.' });
        return;
      }
      const updated = { ...current, seenAt: now, lastChatAt: now, isAfk: false };
      ws.serializeAttachment(updated);
      if (current.isAfk) this.publishAgentUpdate(updated);
      const chatEvent = {
        type: 'hangout_chat',
        hangoutId: current.hangoutId,
        from: current.username,
        message: messageText,
        sentAt: now,
      };
      for (const recipient of this.ctx.getWebSockets()) {
        if (attachment(recipient)?.hangoutId === current.hangoutId) send(recipient, chatEvent);
      }
      return;
    }

    if (event.type === 'public_chat' || event.type === 'private_chat') {
      if (current.hangoutId) {
        send(ws, { type: 'error', code: 'hangout_chat_required', message: 'Use the private building conversation while inside.' });
        return;
      }
      if (event.type === 'public_chat' && current.carId) {
        send(ws, { type: 'error', code: 'car_chat_required', message: 'Use the private car conversation while inside a car.' });
        return;
      }
      if (now - current.lastChatAt < CHAT_THROTTLE_MS) {
        send(ws, { type: 'error', code: 'chat_rate_limited', message: 'Please wait a moment before sending again.' });
        return;
      }
      const messageText = typeof event.message === 'string' ? event.message.trim().slice(0, MAX_MESSAGE_LENGTH) : '';
      if (!messageText) {
        send(ws, { type: 'error', code: 'empty_message', message: 'Type a message first.' });
        return;
      }
      const updated = { ...current, seenAt: now, lastChatAt: now, isAfk: false };
      ws.serializeAttachment(updated);
      if (current.isAfk) {
        this.publishAgentUpdate(updated);
      }
      if (event.type === 'public_chat') {
        const id = crypto.randomUUID();
        this.ctx.storage.sql.exec(
          'INSERT INTO commune_public_chat_messages (id, username, message, sent_at) VALUES (?, ?, ?, ?)',
          id,
          current.username,
          messageText,
          now,
        );
        this.ctx.storage.sql.exec(
          `DELETE FROM commune_public_chat_messages
           WHERE id IN (
             SELECT id FROM commune_public_chat_messages
             ORDER BY sent_at DESC
             LIMIT -1 OFFSET 20
           )`,
        );
        this.ctx.storage.sql.exec(
          'DELETE FROM commune_public_chat_messages WHERE sent_at < ?',
          now - 24 * 60 * 60 * 1000,
        );
        this.broadcast({
          type: 'public_chat',
          id,
          from: current.username,
          message: messageText,
          sentAt: now,
        });
        return;
      }

      const target = typeof event.target === 'string' ? event.target.trim() : '';
      const recipients = this.ctx.getWebSockets(target).filter((recipient) => recipient.readyState === WebSocket.OPEN);
      if (!target || target === current.username || recipients.length === 0) {
        send(ws, { type: 'error', code: 'recipient_offline', message: 'That agent is no longer in the square.' });
        return;
      }
      ws.serializeAttachment({ ...current, seenAt: now, isAfk: false });
      for (const recipient of recipients) {
        send(recipient, { type: 'private_chat', from: current.username, message: messageText, sentAt: now });
      }
      send(ws, { type: 'private_chat_sent', to: target });
      return;
    }

    if (event.type === 'interaction') {
      if (current.hangoutId) return;
      const target = typeof event.target === 'string' ? event.target.trim() : '';
      const kind = event.kind;
      if (!['bump', 'hands', 'hands_release'].includes(String(kind))) {
        send(ws, { type: 'error', code: 'invalid_interaction', message: 'Unsupported interaction.' });
        return;
      }
      const recipients = this.ctx.getWebSockets(target).filter((recipient) => recipient.readyState === WebSocket.OPEN);
      if (!target || target === current.username || recipients.length === 0) {
        send(ws, { type: 'error', code: 'recipient_offline', message: 'That agent is no longer in the square.' });
        return;
      }
      for (const recipient of recipients) {
        send(recipient, { type: 'interaction', from: current.username, kind });
      }
    }
  }

  webSocketClose(ws: WebSocket): void {
    const current = attachment(ws);
    if (!current) return;
    const authority = this.electMowerAuthority();
    if (authority.changed) this.broadcastMowerAuthority(authority.clientId, authority.state);
    if (this.ctx.getWebSockets(current.username).some((socket) => socket.readyState === WebSocket.OPEN)) return;
    this.publishAgentLeave(current.username);
  }

  webSocketError(ws: WebSocket): void {
    this.webSocketClose(ws);
  }

  private toAgent(presence: Presence): CommuneRoomAgent {
    const {
      seenAt,
      lastMoveAt: _lastMoveAt,
      lastChatAt: _lastChatAt,
      viewRadius: _viewRadius,
      visibleUsers: _visibleUsers,
      mowerClientId: _mowerClientId,
      ...agent
    } = presence;
    return { ...agent, seenAgo: Math.max(0, Date.now() - seenAt) };
  }

  private getCarPosition(carId: string): CommuneCarPosition | null {
    return this.ctx.storage.sql.exec<SqlRow<CommuneCarPosition>>(
      'SELECT id, x, y, heading, last_move_at AS lastMoveAt FROM commune_parked_cars WHERE id = ?',
      carId,
    ).toArray()[0] ?? null;
  }

  private getMowerRow(): CommuneMowerRow {
    return this.ctx.storage.sql.exec<SqlRow<CommuneMowerRow>>(
      'SELECT state_json, authority_client_id, updated_at FROM commune_mower_state WHERE singleton = 1',
    ).toArray()[0] ?? { state_json: null, authority_client_id: null, updated_at: 0 };
  }

  private getMowerState(row = this.getMowerRow()): Record<string, unknown> | null {
    if (!row.state_json) return null;
    try {
      return normalizeMowerState(JSON.parse(row.state_json));
    } catch {
      return null;
    }
  }

  private listBuildables(): CommuneBuildable[] {
    return this.ctx.storage.sql.exec<SqlRow<{
      id: string;
      owner: string;
      kind: CommuneBuildKind;
      x: number;
      y: number;
      rotation: number;
      created_at: number;
    }>>(
      `SELECT id, owner, kind, x, y, rotation, created_at
       FROM commune_buildables ORDER BY created_at, id`,
    ).toArray().map((row) => ({
      id: row.id,
      owner: row.owner,
      kind: row.kind,
      x: row.x,
      y: row.y,
      rotation: row.rotation,
      createdAt: row.created_at,
    }));
  }

  private isBuildSpaceClear(kind: CommuneBuildKind, x: number, y: number, rotation: number): boolean {
    const item = COMMUNE_BUILD_CATALOG.find((entry) => entry.kind === kind);
    if (!item) return false;
    const bounds = (width: number, depth: number, angle: number) => ({
      x: Math.abs(Math.cos(angle)) * width / 2 + Math.abs(Math.sin(angle)) * depth / 2,
      y: Math.abs(Math.sin(angle)) * width / 2 + Math.abs(Math.cos(angle)) * depth / 2,
    });
    const half = bounds(item.width, item.depth, rotation);
    if (x < 24 + half.x || x > COMMUNE_WORLD_W - 24 - half.x
      || y < 144 + half.y || y > COMMUNE_WORLD_H - 24 - half.y) return false;
    if (((x - 800) / (96 + half.x)) ** 2 + ((y - 600) / (96 + half.y)) ** 2 < 1) return false;
    const ponds = [
      { x: 170, y: 640, rx: 115, ry: 75 },
      { x: 2580, y: 790, rx: 150, ry: 102 },
    ];
    if (ponds.some((pond) => (
      ((x - pond.x) / (pond.rx + half.x)) ** 2 + ((y - pond.y) / (pond.ry + half.y)) ** 2 < 1
    ))) return false;
    if (CAR_STATIC_BLOCKERS.some((blocker) => (
      x + half.x > blocker.x - 8 && x - half.x < blocker.x + blocker.w + 8
      && y + half.y > blocker.y - 8 && y - half.y < blocker.y + blocker.h + 8
    ))) return false;
    if (CAR_BLOCKING_TREES.some(([treeX, treeY]) => (
      x + half.x > treeX - 36 && x - half.x < treeX + 36
      && y + half.y > treeY - 48 && y - half.y < treeY + 10
    ))) return false;
    const cars = this.listCarPositions();
    if (cars.some((car) => {
      const carHalf = carHalfDimensions(car.id, car.heading);
      return x + half.x > car.x - carHalf.x - 10
        && x - half.x < car.x + carHalf.x + 10
        && y + half.y > car.y - carHalf.y - 10
        && y - half.y < car.y + carHalf.y + 10;
    })) return false;
    return !this.listBuildables().some((other) => {
      const otherKind = COMMUNE_BUILD_CATALOG.find((entry) => entry.kind === other.kind);
      if (!otherKind) return false;
      const otherHalf = bounds(otherKind.width, otherKind.depth, other.rotation);
      return x + half.x > other.x - otherHalf.x - 10
        && x - half.x < other.x + otherHalf.x + 10
        && y + half.y > other.y - otherHalf.y - 10
        && y - half.y < other.y + otherHalf.y + 10;
    });
  }

  private listBuildableCarIds(buildables: readonly CommuneBuildable[]): Set<string> {
    return new Set(
      buildables.filter((item) => item.kind === 'sports-car').map((item) => communeBuildCarId(item.id)),
    );
  }

  private syncBuildablesInStorage(buildables: CommuneBuildable[]): CommuneBuildable[] {
    const valid = buildables.filter((item) => (
      item
      && /^[\da-f-]{36}$/i.test(item.id)
      && typeof item.owner === 'string'
      && COMMUNE_BUILD_CATALOG.some((entry) => entry.kind === item.kind)
      && Number.isFinite(item.x)
      && Number.isFinite(item.y)
      && Number.isFinite(item.rotation)
    ));
    const wantedIds = new Set(valid.map((item) => item.id));
    const wantedCars = this.listBuildableCarIds(valid);
    const existing = this.listBuildables();
    const before = JSON.stringify(existing);
    for (const item of existing) {
      if (wantedIds.has(item.id)) continue;
      this.ctx.storage.sql.exec('DELETE FROM commune_buildables WHERE id = ?', item.id);
    }
    const storedCars = this.ctx.storage.sql.exec<{ id: string }>(
      "SELECT id FROM commune_parked_cars WHERE id LIKE 'buildcar-%'",
    ).toArray();
    for (const car of storedCars) {
      if (!wantedCars.has(car.id)) {
        this.ctx.storage.sql.exec('DELETE FROM commune_parked_cars WHERE id = ?', car.id);
      }
    }
    for (const item of valid) {
      this.ctx.storage.sql.exec(
        `INSERT INTO commune_buildables (id, owner, kind, x, y, rotation, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, kind = excluded.kind`,
        item.id,
        item.owner,
        item.kind,
        item.x,
        item.y,
        item.rotation,
        item.createdAt,
      );
      if (item.kind === 'sports-car') {
        this.ctx.storage.sql.exec(
          'INSERT OR IGNORE INTO commune_parked_cars (id, x, y, heading) VALUES (?, ?, ?, ?)',
          communeBuildCarId(item.id),
          item.x,
          item.y,
          item.rotation,
        );
      }
    }
    const snapshot = this.listBuildables();
    if (JSON.stringify(snapshot) !== before) {
      this.broadcast({ type: 'buildables', buildables: snapshot, cars: this.listCarPositions() });
    }
    return snapshot;
  }

  private electMowerAuthority(preferredClientId?: string): {
    clientId: string | null;
    state: Record<string, unknown> | null;
    changed: boolean;
  } {
    const row = this.getMowerRow();
    const sockets = this.ctx.getWebSockets().filter((socket) => socket.readyState === WebSocket.OPEN);
    const activeClientIds = sockets
      .map((socket) => attachment(socket)?.mowerClientId)
      .filter((clientId): clientId is string => typeof clientId === 'string');
    const nextClientId = row.authority_client_id && activeClientIds.includes(row.authority_client_id)
      ? row.authority_client_id
      : preferredClientId && activeClientIds.includes(preferredClientId)
        ? preferredClientId
        : activeClientIds[0] ?? null;
    const changed = nextClientId !== row.authority_client_id;
    if (changed) {
      this.ctx.storage.sql.exec(
        'UPDATE commune_mower_state SET authority_client_id = ? WHERE singleton = 1',
        nextClientId,
      );
    }
    return { clientId: nextClientId, state: this.getMowerState(row), changed };
  }

  private broadcastMowerAuthority(clientId: string | null, state: Record<string, unknown> | null): void {
    this.broadcast({ type: 'mower_authority', clientId, mowerState: state });
  }

  private getSoccerBall(): CommuneRoomSoccerBall {
    const row = this.ctx.storage.sql.exec<{
      x: number;
      y: number;
      from_x: number;
      from_y: number;
      kicked_at: number;
      by_username: string | null;
    }>(
      `SELECT x, y, from_x, from_y, kicked_at, by_username
       FROM commune_soccer_ball WHERE singleton = 1`,
    ).toArray()[0];
    return row
      ? {
          x: row.x,
          y: row.y,
          fromX: row.from_x,
          fromY: row.from_y,
          kickedAt: row.kicked_at,
          by: row.by_username,
        }
      : {
          x: SOCCER_BALL_START.x,
          y: SOCCER_BALL_START.y,
          fromX: SOCCER_BALL_START.x,
          fromY: SOCCER_BALL_START.y,
          kickedAt: 0,
          by: null,
        };
  }

  private listCarPositions(): CommuneCarPosition[] {
    return this.ctx.storage.sql.exec<SqlRow<CommuneCarPosition>>(
      'SELECT id, x, y, heading, last_move_at AS lastMoveAt FROM commune_parked_cars ORDER BY id',
    ).toArray();
  }

  private listPresences(exceptUsername?: string): Presence[] {
    const latest = new Map<string, Presence>();
    for (const ws of this.ctx.getWebSockets()) {
      const presence = attachment(ws);
      if (!presence || presence.username === exceptUsername || ws.readyState !== WebSocket.OPEN) continue;
      const previous = latest.get(presence.username);
      if (!previous || previous.seenAt < presence.seenAt) latest.set(presence.username, presence);
    }
    return [...latest.values()];
  }

  private listAgents(
    exceptUsername?: string,
    centerX?: number,
    centerY?: number,
    viewRadius = DEFAULT_VIEW_RADIUS,
  ): CommuneRoomAgent[] {
    const nearby = this.listPresences(exceptUsername).filter((presence) => (
      !Number.isFinite(centerX) ||
      !Number.isFinite(centerY) ||
      Math.hypot(presence.x - Number(centerX), presence.y - Number(centerY)) <= viewRadius
    ));
    return nearby.map((presence) => this.toAgent(presence));
  }

  private publishAgentUpdate(
    presence: Presence,
    positionOnly = false,
  ): void {
    const online = this.listPresences();
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const recipient = attachment(socket);
      if (!recipient || recipient.username === presence.username) continue;
      const tracked = Array.isArray(recipient.visibleUsers);
      const radius = recipient.viewRadius ?? DEFAULT_VIEW_RADIUS;
      const visible = tracked
        ? new Set(recipient.visibleUsers)
        : new Set(online
            .filter((agent) => agent.username !== recipient.username)
            .filter((agent) => Math.hypot(agent.x - recipient.x, agent.y - recipient.y) <= radius)
            .map((agent) => agent.username));
      const wasVisible = tracked ? visible.has(presence.username) : true;
      const isVisible = Math.hypot(presence.x - recipient.x, presence.y - recipient.y) <= radius;
      let changed = false;
      if (!isVisible && wasVisible) {
        visible.delete(presence.username);
        send(socket, { type: 'agent_leave', username: presence.username });
        changed = true;
      } else if (isVisible && !wasVisible) {
        visible.add(presence.username);
        send(socket, { type: 'agent_join', agent: this.toAgent(presence) });
        changed = true;
      } else if (isVisible) {
        send(socket, {
          type: 'agent_update',
          positionOnly,
          agent: this.toAgent(presence),
        });
      }
      if (!tracked || changed) {
        socket.serializeAttachment({ ...recipient, visibleUsers: [...visible] });
      }
    }
  }

  private refreshVisibleAgents(socket: WebSocket, presence: Presence): void {
    const radius = presence.viewRadius ?? DEFAULT_VIEW_RADIUS;
    const nextAgents = this.listPresences(presence.username)
      .filter((agent) => Math.hypot(agent.x - presence.x, agent.y - presence.y) <= radius);
    const next = new Set(nextAgents.map((agent) => agent.username));
    const current = attachment(socket) ?? presence;
    const previous = new Set(
      current.visibleUsers ?? this.listPresences(presence.username).map((agent) => agent.username),
    );
    for (const username of previous) {
      if (!next.has(username)) send(socket, { type: 'agent_leave', username });
    }
    for (const agent of nextAgents) {
      if (!previous.has(agent.username)) {
        send(socket, { type: 'agent_join', agent: this.toAgent(agent) });
      }
    }
    socket.serializeAttachment({ ...current, ...presence, visibleUsers: [...next] });
  }

  private publishAgentLeave(username: string): void {
    const online = this.listPresences();
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const recipient = attachment(socket);
      if (!recipient || recipient.username === username) continue;
      const tracked = Array.isArray(recipient.visibleUsers);
      const visible = new Set(
        recipient.visibleUsers ?? online
          .filter((agent) => agent.username !== recipient.username)
          .map((agent) => agent.username),
      );
      if (!tracked || visible.has(username)) {
        visible.delete(username);
        socket.serializeAttachment({ ...recipient, visibleUsers: [...visible] });
        send(socket, { type: 'agent_leave', username });
      }
    }
  }

  private broadcast(event: RoomEvent, exceptUsername?: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (exceptUsername && attachment(ws)?.username === exceptUsername) continue;
      send(ws, event);
    }
  }

  private broadcastExceptSocket(event: RoomEvent, excludedSocket: WebSocket): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== excludedSocket) send(ws, event);
    }
  }

  private pruneStaleConnections(): void {
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    const staleUsers = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const presence = attachment(ws);
      if (!presence || presence.seenAt >= cutoff) continue;
      staleUsers.add(presence.username);
      try {
        ws.close(1001, 'Presence expired');
      } catch {
        /* The socket is already closed. */
      }
    }
    for (const username of staleUsers) {
      if (!this.ctx.getWebSockets(username).some((ws) => ws.readyState === WebSocket.OPEN)) {
        this.publishAgentLeave(username);
      }
    }
  }
}
