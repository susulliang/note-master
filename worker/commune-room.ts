import { DurableObject } from 'cloudflare:workers';

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
  loadout: CommuneRoomLoadout | null;
  carId?: string | null;
  carSeat?: number | null;
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

type RoomEvent = Record<string, unknown>;

const ROOM_TICKET_TTL_MS = 60_000;
const PRESENCE_TTL_MS = 60_000;
const MOVE_THROTTLE_MS = 80;
const CHAT_THROTTLE_MS = 500;
const MAX_MESSAGE_LENGTH = 90;
const MAX_SOCKET_MESSAGE_LENGTH = 2_048;
const COMMUNE_WORLD_W = 3_200;
const COMMUNE_WORLD_H = 2_400;
const SOCCER_FIELD = { left: 850, right: 1280, top: 1820, bottom: 2120 };
const SOCCER_BALL_START = { x: 1065, y: 1970 };
const SOCCER_KICK_RANGE = 104;
const SOCCER_KICK_COOLDOWN_MS = 1_400;
const PARKED_CAR_INTERACT_RANGE = 118;
const PARKED_CAR_EXIT_DISTANCE = 100;
const PARKED_CAR_SPEED = 220;
const CAR_HALF_WIDTH = 39;
const CAR_HALF_LENGTH = 59;
const PARKED_CARS: Record<string, Omit<CommuneCarPosition, 'id'>> = {
  'meadow-cruiser': { x: 1740, y: 820, heading: 0 },
  'orchard-wagon': { x: 2300, y: 1880, heading: 0 },
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
];
const CAR_BLOCKING_TREES: [number, number][] = [
  [1740, 250], [1830, 310], [1940, 235], [2070, 285], [2180, 220],
  [2350, 310], [2480, 250], [2800, 240], [2940, 310],
  [1670, 1120], [1780, 1080], [1900, 1120], [2050, 1150],
  [1630, 2050], [1760, 2110], [1900, 2040], [2050, 2120],
  [2290, 2220], [2460, 2130], [2660, 2200], [2840, 2110], [3000, 2210],
];

function canCarOccupy(x: number, y: number, carId: string, cars: CommuneCarPosition[]): boolean {
  const car = cars.find((item) => item.id === carId);
  const heading = car?.heading ?? 0;
  const halfX = Math.abs(Math.cos(heading)) * CAR_HALF_WIDTH + Math.abs(Math.sin(heading)) * CAR_HALF_LENGTH;
  const halfY = Math.abs(Math.sin(heading)) * CAR_HALF_WIDTH + Math.abs(Math.cos(heading)) * CAR_HALF_LENGTH;
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
  return !cars.some((car) =>
    car.id !== carId
    && Math.abs(x - car.x) < halfX + Math.abs(Math.cos(car.heading)) * CAR_HALF_WIDTH + Math.abs(Math.sin(car.heading)) * CAR_HALF_LENGTH
    && Math.abs(y - car.y) < halfY + Math.abs(Math.sin(car.heading)) * CAR_HALF_WIDTH + Math.abs(Math.cos(car.heading)) * CAR_HALF_LENGTH
  );
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
      this.broadcast({ type: 'agent_update', agent: this.toAgent(updated) });
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
      this.broadcast({ type: 'agent_update', agent: this.toAgent(updated) });
    }
  }

  publishDrops(drops: CommuneRoomDrop[]): void {
    this.broadcast({ type: 'drops', drops });
  }

  publishBanners(banners: CommuneRoomBanner[]): void {
    this.broadcast({ type: 'banners', banners });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/internal/minigame/verify') {
      return this.verifyMinigamePresence(request);
    }
    if (request.method === 'POST' && url.pathname === '/internal/minigame/soccer-kick') {
      return this.handleSoccerKick(request);
    }
    if (request.method !== 'GET' || request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket upgrade required', { status: 426 });
    }

    const ticket = url.searchParams.get('ticket');
    if (!ticket || ticket.length > 100) return new Response('Invalid connection ticket', { status: 401 });
    const row = this.ctx.storage.sql
      .exec<TicketRow>(
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
    this.ctx.acceptWebSocket(server, [profile.username]);
    server.serializeAttachment({ ...profile, seenAt: Date.now() });

    send(server, {
      type: 'welcome',
      self: profile.username,
      others: this.listAgents(profile.username),
      cars: this.listCarPositions(),
      soccerBall: this.getSoccerBall(),
    });
    const recentMessages = this.ctx.storage.sql.exec<PublicChatRow>(
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
    this.broadcast({ type: 'agent_join', agent: this.toAgent(profile) }, profile.username);

    return new Response(null, { status: 101, webSocket: client });
  }

  private async verifyMinigamePresence(request: Request): Promise<Response> {
    const payload = await request.json().catch(() => null) as { username?: unknown; game?: unknown } | null;
    const username = typeof payload?.username === 'string' ? payload.username.trim() : '';
    const game = payload?.game;
    const current = this.ctx.getWebSockets(username)
      .map((socket) => attachment(socket))
      .find((presence): presence is Presence => !!presence && !presence.carId);
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
      .find((presence): presence is Presence => !!presence && !presence.carId);
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
    if (event.type === 'car_enter') {
      const carId = typeof event.carId === 'string' ? event.carId : '';
      const car = Object.prototype.hasOwnProperty.call(PARKED_CARS, carId)
        ? this.getCarPosition(carId)
        : null;
      if (!car || current.carId || Math.hypot(current.x - car.x, current.y - car.y) > PARKED_CAR_INTERACT_RANGE) {
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
        x: car.x,
        y: car.y,
        status: 'having a private car conversation',
        seenAt: now,
        lastMoveAt: now,
      };
      this.ctx.storage.sql.exec('UPDATE commune_parked_cars SET last_move_at = ? WHERE id = ?', now, carId);
      ws.serializeAttachment(updated);
      this.broadcast({ type: 'agent_update', agent: this.toAgent(updated) }, updated.username);
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
      };
      ws.serializeAttachment(updated);
      this.broadcast({ type: 'agent_update', agent: this.toAgent(updated) }, updated.username);
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
      const travel = PARKED_CAR_SPEED * Math.min(1, directionLength) * elapsedMs / 1000;
      const x = car.x + (dx / directionLength) * travel;
      const y = car.y + (dy / directionLength) * travel;
      const cars = this.listCarPositions();
      const heading = Math.atan2(dy, dx) + Math.PI / 2;
      if (!canCarOccupy(x, y, current.carId, cars.map((item) =>
        item.id === current.carId ? { ...item, heading } : item
      ))) {
        this.ctx.storage.sql.exec(
          'UPDATE commune_parked_cars SET last_move_at = ? WHERE id = ?',
          now,
          current.carId,
        );
        const updated = { ...current, seenAt: now, lastMoveAt: now };
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
        };
        occupantSocket.serializeAttachment(updated);
        this.broadcast({ type: 'agent_update', agent: this.toAgent(updated) }, updated.username);
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
      };
      ws.serializeAttachment(updated);
      this.broadcast({ type: 'agent_update', agent: this.toAgent(updated) }, updated.username);
      return;
    }

    if (event.type === 'heartbeat') {
      const updated = { ...current, seenAt: now };
      ws.serializeAttachment(updated);
      this.pruneStaleConnections();
      send(ws, { type: 'heartbeat_ack', at: now });
      return;
    }

    if (event.type === 'move') {
      if (current.carId) return;
      if (now - current.lastMoveAt < MOVE_THROTTLE_MS) return;
      const x = Number(event.x);
      const y = Number(event.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        send(ws, { type: 'error', code: 'invalid_position', message: 'Invalid position.' });
        return;
      }
      const updated: Presence = {
        ...current,
        x: Math.max(24, Math.min(COMMUNE_WORLD_W - 24, x)),
        y: Math.max(144, Math.min(COMMUNE_WORLD_H - 24, y)),
        status: typeof event.status === 'string' ? event.status.slice(0, 40) : current.status,
        seenAt: now,
        lastMoveAt: now,
      };
      ws.serializeAttachment(updated);
      this.broadcast({ type: 'agent_update', agent: this.toAgent(updated) }, updated.username);
      return;
    }

    if (event.type === 'car_chat') {
      if (!current.carId) {
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
      const updated = { ...current, seenAt: now, lastChatAt: now };
      ws.serializeAttachment(updated);
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

    if (event.type === 'public_chat' || event.type === 'private_chat') {
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
      ws.serializeAttachment({ ...current, seenAt: now, lastChatAt: now });
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
      for (const recipient of recipients) {
        send(recipient, { type: 'private_chat', from: current.username, message: messageText, sentAt: now });
      }
      send(ws, { type: 'private_chat_sent', to: target });
      return;
    }

    if (event.type === 'interaction') {
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
    if (this.ctx.getWebSockets(current.username).some((socket) => socket.readyState === WebSocket.OPEN)) return;
    this.broadcast({ type: 'agent_leave', username: current.username });
  }

  webSocketError(ws: WebSocket): void {
    this.webSocketClose(ws);
  }

  private toAgent(presence: Presence): CommuneRoomAgent {
    const { seenAt, lastMoveAt: _lastMoveAt, lastChatAt: _lastChatAt, ...agent } = presence;
    return { ...agent, seenAgo: Math.max(0, Date.now() - seenAt) };
  }

  private getCarPosition(carId: string): CommuneCarPosition | null {
    return this.ctx.storage.sql.exec<CommuneCarPosition>(
      'SELECT id, x, y, heading, last_move_at AS lastMoveAt FROM commune_parked_cars WHERE id = ?',
      carId,
    ).toArray()[0] ?? null;
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
    return this.ctx.storage.sql.exec<CommuneCarPosition>(
      'SELECT id, x, y, heading, last_move_at AS lastMoveAt FROM commune_parked_cars ORDER BY id',
    ).toArray();
  }

  private listAgents(exceptUsername?: string): CommuneRoomAgent[] {
    const latest = new Map<string, Presence>();
    for (const ws of this.ctx.getWebSockets()) {
      const presence = attachment(ws);
      if (!presence || presence.username === exceptUsername || ws.readyState !== WebSocket.OPEN) continue;
      const previous = latest.get(presence.username);
      if (!previous || previous.seenAt < presence.seenAt) latest.set(presence.username, presence);
    }
    return [...latest.values()].map((presence) => this.toAgent(presence));
  }

  private broadcast(event: RoomEvent, exceptUsername?: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (exceptUsername && attachment(ws)?.username === exceptUsername) continue;
      send(ws, event);
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
        this.broadcast({ type: 'agent_leave', username });
      }
    }
  }
}
