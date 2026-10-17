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
  x: number;
  y: number;
  status: string;
  seenAgo: number;
  loadout: CommuneRoomLoadout | null;
}

export interface CommuneRoomDrop {
  id: number;
  x: number;
  y: number;
}

export interface CommuneRoomBanner {
  id: string;
  text: string;
  author: string;
  at: number;
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

type RoomEvent = Record<string, unknown>;

const ROOM_TICKET_TTL_MS = 60_000;
const PRESENCE_TTL_MS = 60_000;
const MOVE_THROTTLE_MS = 80;
const CHAT_THROTTLE_MS = 500;
const MAX_MESSAGE_LENGTH = 90;
const MAX_SOCKET_MESSAGE_LENGTH = 2_048;

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

  publishDrops(drops: CommuneRoomDrop[]): void {
    this.broadcast({ type: 'drops', drops });
  }

  publishBanners(banners: CommuneRoomBanner[]): void {
    this.broadcast({ type: 'banners', banners });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
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
    });
    this.broadcast({ type: 'agent_join', agent: this.toAgent(profile) }, profile.username);

    return new Response(null, { status: 101, webSocket: client });
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
      if (now - current.lastMoveAt < MOVE_THROTTLE_MS) return;
      const x = Number(event.x);
      const y = Number(event.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        send(ws, { type: 'error', code: 'invalid_position', message: 'Invalid position.' });
        return;
      }
      const updated: Presence = {
        ...current,
        x: Math.max(24, Math.min(1_576, x)),
        y: Math.max(144, Math.min(1_176, y)),
        status: typeof event.status === 'string' ? event.status.slice(0, 40) : current.status,
        seenAt: now,
        lastMoveAt: now,
      };
      ws.serializeAttachment(updated);
      this.broadcast({ type: 'agent_update', agent: this.toAgent(updated) }, updated.username);
      return;
    }

    if (event.type === 'public_chat' || event.type === 'private_chat') {
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
        this.broadcast({ type: 'public_chat', from: current.username, message: messageText, sentAt: now });
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
