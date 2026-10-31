import { DurableObject } from 'cloudflare:workers';

interface TeamBoardAttachment {
  username: string;
  lastSeenAt: number;
  focusCardId: string;
}

type BoardEvent = Record<string, unknown>;

const PRESENCE_TTL_MS = 45_000;
const TICKET_TTL_MS = 60_000;

function send(socket: WebSocket, event: BoardEvent): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(event));
  } catch {
    try {
      socket.close(1011, 'Unable to send Team Board update');
    } catch {
      /* The socket may already be closed. */
    }
  }
}

function attachment(socket: WebSocket): TeamBoardAttachment | null {
  try {
    return (socket.deserializeAttachment() as TeamBoardAttachment | null) ?? null;
  } catch {
    return null;
  }
}

export class TeamBoardRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS team_board_socket_tickets (
          ticket TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `);
    });
  }

  async createTicket(username: string): Promise<string> {
    const now = Date.now();
    const ticket = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    this.ctx.storage.sql.exec('DELETE FROM team_board_socket_tickets WHERE expires_at < ?', now);
    this.ctx.storage.sql.exec(
      'INSERT INTO team_board_socket_tickets (ticket, username, expires_at) VALUES (?, ?, ?)',
      ticket,
      username,
      now + TICKET_TTL_MS,
    );
    return ticket;
  }

  async broadcastCardChange(cardId: string, kind: string): Promise<void> {
    const event = { type: 'board:changed', cardId, kind, at: Date.now() };
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const user = attachment(socket);
      if (!user?.username || !await this.canViewCard(user.username, cardId)) continue;
      send(socket, event);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET' || request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket upgrade required', { status: 426 });
    }
    const ticket = url.searchParams.get('ticket') ?? '';
    if (!ticket || ticket.length > 100) return new Response('Invalid connection ticket', { status: 401 });
    const row = this.ctx.storage.sql.exec<{ username: string }>(
      `SELECT username FROM team_board_socket_tickets
       WHERE ticket = ? AND expires_at >= ?`,
      ticket,
      Date.now(),
    ).toArray()[0];
    if (!row) return new Response('Expired or invalid connection ticket', { status: 401 });
    this.ctx.storage.sql.exec('DELETE FROM team_board_socket_tickets WHERE ticket = ?', ticket);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, [row.username]);
    server.serializeAttachment({
      username: row.username,
      lastSeenAt: Date.now(),
      focusCardId: '',
    } satisfies TeamBoardAttachment);
    send(server, { type: 'board:ready' });
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
    if (raw.length > 2_048) {
      socket.close(1009, 'Team Board socket message is too large');
      return;
    }
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const user = attachment(socket);
    if (!user?.username) {
      socket.close(1008, 'Missing Team Board identity');
      return;
    }
    const now = Date.now();
    if (event.type === 'heartbeat') {
      socket.serializeAttachment({ ...user, lastSeenAt: now } satisfies TeamBoardAttachment);
      send(socket, { type: 'heartbeat_ack', at: now });
      this.broadcastPresence();
      return;
    }
    if (event.type === 'board:focus') {
      const cardId = typeof event.cardId === 'string' && /^[0-9a-f-]{36}$/i.test(event.cardId)
        ? event.cardId
        : '';
      if (cardId && !await this.canViewCard(user.username, cardId)) return;
      socket.serializeAttachment({
        ...user,
        lastSeenAt: now,
        focusCardId: cardId,
      } satisfies TeamBoardAttachment);
      this.broadcastPresence();
    }
  }

  webSocketClose(socket: WebSocket): void {
    try {
      socket.close(1000, 'Connection closed');
    } catch {
      /* The socket has already closed. */
    }
    this.broadcastPresence();
  }

  private broadcastPresence(): void {
    const now = Date.now();
    const perCard = new Map<string, Map<string, string>>();
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const user = attachment(socket);
      if (!user?.username || now - user.lastSeenAt > PRESENCE_TTL_MS || !user.focusCardId) continue;
      const members = perCard.get(user.focusCardId) ?? new Map<string, string>();
      members.set(user.username.toLowerCase(), user.username);
      perCard.set(user.focusCardId, members);
    }
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const user = attachment(socket);
      if (!user?.username || !user.focusCardId) continue;
      send(socket, {
        type: 'board:presence',
        cardId: user.focusCardId,
        participants: [...(perCard.get(user.focusCardId)?.values() ?? [])],
      });
    }
  }

  private async canViewCard(username: string, cardId: string): Promise<boolean> {
    const visible = await this.env.DB.prepare(`
      SELECT 1 AS found FROM team_board_cards card
      LEFT JOIN team_board_members member
        ON member.card_id = card.id AND member.username = ? COLLATE NOCASE
      WHERE card.id = ? AND (
        card.owner = ? COLLATE NOCASE OR card.created_by = ? COLLATE NOCASE
        OR member.username IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM team_board_card_rooms shared
          WHERE shared.card_id = card.id AND (
            shared.room_id = 'global'
            OR EXISTS (SELECT 1 FROM chat_conversations dm
              WHERE dm.room_id = shared.room_id AND dm.username = ? COLLATE NOCASE)
            OR EXISTS (SELECT 1 FROM chat_group_members group_member
              WHERE group_member.room_id = shared.room_id AND group_member.username = ? COLLATE NOCASE)
          )
        )
      )
      LIMIT 1
    `).bind(username, cardId, username, username, username, username).first<{ found: number }>();
    return !!visible;
  }

  private broadcast(event: BoardEvent): void {
    for (const socket of this.ctx.getWebSockets()) send(socket, event);
  }
}
