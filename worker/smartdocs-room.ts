import { DurableObject } from 'cloudflare:workers';
import { getSmartDocPermission } from './collab-access';

interface SmartDocTicket {
  ticket: string;
  username: string;
  permission: 'view' | 'edit';
  expires_at: number;
}

interface SmartDocAttachment {
  username: string;
  permission: 'view' | 'edit';
  lastSeenAt: number;
}

type SmartDocEvent = Record<string, unknown>;
type SqlRow<T extends object> = T & Record<string, SqlStorageValue>;

const TICKET_TTL_MS = 60_000;
const MAX_MARKDOWN_LENGTH = 500_000;

function send(socket: WebSocket, event: SmartDocEvent): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(event));
  } catch {
    try {
      socket.close(1011, 'Unable to send document update');
    } catch {
      /* The socket has already closed. */
    }
  }
}

export class SmartDocsRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS smartdoc_socket_tickets (
          ticket TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          permission TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS smartdoc_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          markdown TEXT NOT NULL DEFAULT '',
          revision INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL DEFAULT 0
        )
      `);
      this.ctx.storage.sql.exec(`
        INSERT OR IGNORE INTO smartdoc_state (id, markdown, revision, updated_at)
        VALUES (1, '', 0, ?)
      `, Date.now());
    });
  }

  async initialize(): Promise<void> {
    // The constructor's blockConcurrencyWhile initializes the SQL state before
    // this RPC is served. This method lets document creation force that setup.
  }

  async initializeMarkdown(markdown: string): Promise<void> {
    if (markdown.length > MAX_MARKDOWN_LENGTH) throw new Error('Initial document content is too large.');
    this.ctx.storage.sql.exec(
      `UPDATE smartdoc_state
       SET markdown = ?, revision = 1, updated_at = ?
       WHERE id = 1 AND revision = 0 AND markdown = ''`,
      markdown.replace(/\u0000/g, ''),
      Date.now(),
    );
  }

  async createTicket(username: string, permission: 'view' | 'edit'): Promise<string> {
    const now = Date.now();
    const ticket = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    this.ctx.storage.sql.exec('DELETE FROM smartdoc_socket_tickets WHERE expires_at < ?', now);
    this.ctx.storage.sql.exec(
      'INSERT INTO smartdoc_socket_tickets (ticket, username, permission, expires_at) VALUES (?, ?, ?, ?)',
      ticket,
      username,
      permission,
      now + TICKET_TTL_MS,
    );
    return ticket;
  }

  async broadcastTitle(title: string): Promise<void> {
    this.broadcast({ type: 'smartdoc:title', documentId: this.ctx.id.name, title });
  }

  async deleteDocumentData(): Promise<void> {
    this.ctx.storage.sql.exec('DELETE FROM smartdoc_socket_tickets');
    this.ctx.storage.sql.exec('DELETE FROM smartdoc_state');
  }

  async revalidatePermissions(): Promise<void> {
    const documentId = this.ctx.id.name ?? '';
    for (const socket of this.ctx.getWebSockets()) {
      const user = this.readAttachment(socket);
      if (!user?.username) {
        socket.close(1008, 'Missing document identity');
        continue;
      }
      const permission = await getSmartDocPermission(this.env, user.username, documentId);
      if (!permission) {
        socket.close(1008, 'Document access revoked');
        continue;
      }
      if (permission !== user.permission) {
        socket.serializeAttachment({ ...user, permission });
        send(socket, { type: 'access:changed', permission });
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET' || request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket upgrade required', { status: 426 });
    }
    const ticket = url.searchParams.get('ticket');
    if (!ticket || ticket.length > 100) return new Response('Invalid connection ticket', { status: 401 });
    const row = this.ctx.storage.sql.exec<SqlRow<SmartDocTicket>>(
      `SELECT ticket, username, permission, expires_at
       FROM smartdoc_socket_tickets WHERE ticket = ? AND expires_at >= ?`,
      ticket,
      Date.now(),
    ).toArray()[0];
    if (!row) return new Response('Expired or invalid connection ticket', { status: 401 });
    this.ctx.storage.sql.exec('DELETE FROM smartdoc_socket_tickets WHERE ticket = ?', ticket);

    const currentPermission = await getSmartDocPermission(this.env, row.username, this.ctx.id.name ?? '');
    if (!currentPermission) return new Response('Document access revoked', { status: 403 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, [row.username]);
    server.serializeAttachment({
      username: row.username,
      permission: currentPermission,
      lastSeenAt: Date.now(),
    } satisfies SmartDocAttachment);
    const snapshot = this.readSnapshot();
    send(server, { type: 'smartdoc:ready', documentId: this.ctx.id.name, permission: currentPermission });
    send(server, { type: 'smartdoc:snapshot', ...snapshot });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
    if (raw.length > MAX_MARKDOWN_LENGTH * 6 + 8_192) {
      socket.close(1009, 'Document update is too large');
      return;
    }
    let event: SmartDocEvent;
    try {
      event = JSON.parse(raw) as SmartDocEvent;
    } catch {
      return;
    }
    const user = this.readAttachment(socket);
    if (!user?.username) {
      socket.close(1008, 'Missing document identity');
      return;
    }
    if (event.type === 'heartbeat') {
      socket.serializeAttachment({ ...user, lastSeenAt: Date.now() });
      send(socket, { type: 'heartbeat_ack', at: Date.now() });
      return;
    }
    if (event.type !== 'document:update') return;

    const documentId = this.ctx.id.name ?? '';
    const permission = await getSmartDocPermission(this.env, user.username, documentId);
    if (!permission) {
      socket.close(1008, 'Document access revoked');
      return;
    }
    if (permission !== user.permission) {
      socket.serializeAttachment({ ...user, permission, lastSeenAt: Date.now() });
    }
    if (permission !== 'edit') {
      send(socket, { type: 'error', message: 'You have view access to this document.' });
      return;
    }
    if (typeof event.markdown !== 'string' || event.markdown.length > MAX_MARKDOWN_LENGTH) {
      send(socket, { type: 'error', message: 'Document content is invalid or too large.' });
      return;
    }

    const updatedAt = Date.now();
    this.ctx.storage.sql.exec(
      'UPDATE smartdoc_state SET markdown = ?, revision = revision + 1, updated_at = ? WHERE id = 1',
      event.markdown.replace(/\u0000/g, ''),
      updatedAt,
    );
    const snapshot = this.readSnapshot();
    await this.env.DB.prepare('UPDATE collab_smartdocs SET updated_at = ? WHERE id = ?')
      .bind(updatedAt, documentId)
      .run();
    this.broadcast({
      type: 'document:updated',
      documentId,
      ...snapshot,
      by: user.username,
    });
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    try {
      socket.close(1000, 'Connection closed');
    } catch {
      /* The socket is already closed. */
    }
  }

  private readSnapshot(): { markdown: string; revision: number; updatedAt: number } {
    const row = this.ctx.storage.sql.exec<{
      markdown: string;
      revision: number;
      updated_at: number;
    }>('SELECT markdown, revision, updated_at FROM smartdoc_state WHERE id = 1').toArray()[0];
    return {
      markdown: row?.markdown ?? '',
      revision: row?.revision ?? 0,
      updatedAt: row?.updated_at ?? Date.now(),
    };
  }

  private readAttachment(socket: WebSocket): SmartDocAttachment | null {
    try {
      const value = socket.deserializeAttachment() as Partial<SmartDocAttachment> | null;
      return value && typeof value.username === 'string' &&
        (value.permission === 'view' || value.permission === 'edit')
        ? value as SmartDocAttachment
        : null;
    } catch {
      return null;
    }
  }

  private broadcast(event: SmartDocEvent): void {
    for (const socket of this.ctx.getWebSockets()) send(socket, event);
  }
}
