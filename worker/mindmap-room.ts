import { DurableObject } from 'cloudflare:workers';
import { getCollabPermission } from './collab-access';

export interface MindmapNode {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
}

export interface MindmapEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

interface MindmapTicket {
  ticket: string;
  username: string;
  permission: 'view' | 'edit';
  expires_at: number;
}

interface MindmapAttachment {
  username: string;
  permission: 'view' | 'edit';
}

type MindmapEvent = Record<string, unknown>;
type SqlRow<T extends object> = T & Record<string, SqlStorageValue>;

const TICKET_TTL_MS = 60_000;
const MAX_NODES = 500;
const MAX_TEXT_LENGTH = 2_000;
const NODE_COLORS = new Set(['slate', 'blue', 'mint', 'amber', 'rose', 'violet']);
const NODE_ID_RE = /^[0-9a-f-]{36}$/i;

function send(ws: WebSocket, event: MindmapEvent): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(event));
  } catch {
    try {
      ws.close(1011, 'Unable to send mind map update');
    } catch {
      /* The socket has already closed. */
    }
  }
}

function attachment(ws: WebSocket): MindmapAttachment | null {
  try {
    return (ws.deserializeAttachment() as MindmapAttachment | null) ?? null;
  } catch {
    return null;
  }
}

export class MindmapRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS mindmap_socket_tickets (
          ticket TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          permission TEXT NOT NULL CHECK (permission IN ('view', 'edit')),
          expires_at INTEGER NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS mindmap_nodes (
          id TEXT PRIMARY KEY,
          text TEXT NOT NULL,
          x REAL NOT NULL,
          y REAL NOT NULL,
          color TEXT NOT NULL DEFAULT 'blue'
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS mindmap_edges (
          id TEXT PRIMARY KEY,
          from_id TEXT NOT NULL,
          to_id TEXT NOT NULL,
          UNIQUE (from_id, to_id)
        )
      `);
      try {
        this.ctx.storage.sql.exec(
          "ALTER TABLE mindmap_edges ADD COLUMN label TEXT NOT NULL DEFAULT ''",
        );
      } catch {
        // Existing Durable Objects already have the label column.
      }
    });
  }

  async initialize(): Promise<void> {
    const existing = this.ctx.storage.sql.exec(
      'SELECT 1 AS found FROM mindmap_nodes LIMIT 1',
    ).toArray()[0];
    if (existing) return;
    this.ctx.storage.sql.exec(
      'INSERT INTO mindmap_nodes (id, text, x, y, color) VALUES (?, ?, ?, ?, ?)',
      crypto.randomUUID(),
      'Central idea',
      460,
      250,
      'blue',
    );
  }

  async searchNodes(query: string, limit = 12): Promise<MindmapNode[]> {
    const term = query.trim().slice(0, 120);
    if (!term) return [];
    return this.ctx.storage.sql.exec<MindmapNode>(
      `SELECT id, text, x, y, color FROM mindmap_nodes
       WHERE text LIKE ? ESCAPE '\\' COLLATE NOCASE
       ORDER BY rowid LIMIT ?`,
      `%${term.replace(/[\\%_]/g, '\\$&')}%`,
      Math.max(1, Math.min(20, Math.trunc(limit))),
    ).toArray();
  }

  async createTicket(username: string, permission: 'view' | 'edit'): Promise<string> {
    const now = Date.now();
    const ticket = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    this.ctx.storage.sql.exec('DELETE FROM mindmap_socket_tickets WHERE expires_at < ?', now);
    this.ctx.storage.sql.exec(
      `INSERT INTO mindmap_socket_tickets (ticket, username, permission, expires_at)
       VALUES (?, ?, ?, ?)`,
      ticket,
      username,
      permission,
      now + TICKET_TTL_MS,
    );
    return ticket;
  }

  async broadcastTitle(title: string): Promise<void> {
    this.broadcast({ type: 'mindmap:title', mindmapId: this.ctx.id.name, title });
  }

  async revalidatePermissions(): Promise<void> {
    const mindmapId = this.ctx.id.name ?? '';
    for (const ws of this.ctx.getWebSockets()) {
      const user = attachment(ws);
      if (!user?.username) {
        ws.close(1008, 'Missing mind map identity');
        continue;
      }
      const permission = await getCollabPermission(this.env, user.username, 'mindmap', mindmapId);
      if (!permission) {
        ws.close(1008, 'Mind map access revoked');
        continue;
      }
      if (permission !== user.permission) {
        ws.serializeAttachment({ ...user, permission });
        send(ws, { type: 'access:changed', permission });
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
    const row = this.ctx.storage.sql
      .exec<SqlRow<MindmapTicket>>(
        `SELECT ticket, username, permission, expires_at
         FROM mindmap_socket_tickets WHERE ticket = ? AND expires_at >= ?`,
        ticket,
        Date.now(),
      )
      .toArray()[0];
    if (!row) return new Response('Expired or invalid connection ticket', { status: 401 });
    this.ctx.storage.sql.exec('DELETE FROM mindmap_socket_tickets WHERE ticket = ?', ticket);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, [row.username]);
    server.serializeAttachment({ username: row.username, permission: row.permission } satisfies MindmapAttachment);
    send(server, { type: 'mindmap:ready', mindmapId: this.ctx.id.name, permission: row.permission });
    send(server, { type: 'mindmap:snapshot', nodes: this.getNodes(), edges: this.getEdges() });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
    if (raw.length > 16_000) {
      ws.close(1009, 'Mind map update too large');
      return;
    }
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const user = attachment(ws);
    if (!user?.username) {
      ws.close(1008, 'Missing mind map identity');
      return;
    }
    if (event.type === 'heartbeat') {
      send(ws, { type: 'heartbeat_ack', at: Date.now() });
      return;
    }
    if (user.permission !== 'edit') {
      send(ws, { type: 'error', message: 'You have view access to this mind map.' });
      return;
    }
    if (event.type === 'node:upsert') {
      const node = this.normalizeNode(event.node);
      if (!node) {
        send(ws, { type: 'error', message: 'This mind map node is invalid.' });
        return;
      }
      const found = this.ctx.storage.sql.exec(
        'SELECT 1 AS found FROM mindmap_nodes WHERE id = ?',
        node.id,
      ).toArray()[0];
      if (!found && this.getNodes().length >= MAX_NODES) {
        send(ws, { type: 'error', message: `Mind maps are limited to ${MAX_NODES} nodes.` });
        return;
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO mindmap_nodes (id, text, x, y, color) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET text = excluded.text, x = excluded.x,
           y = excluded.y, color = excluded.color`,
        node.id,
        node.text,
        node.x,
        node.y,
        node.color,
      );
      this.broadcast({ type: 'node:updated', node, by: user.username });
      this.updateTimestamp();
      return;
    }
    if (event.type === 'node:delete') {
      const id = typeof event.id === 'string' ? event.id : '';
      if (!NODE_ID_RE.test(id)) return;
      this.ctx.storage.sql.exec('DELETE FROM mindmap_edges WHERE from_id = ? OR to_id = ?', id, id);
      const changed = this.ctx.storage.sql.exec('DELETE FROM mindmap_nodes WHERE id = ?', id).rowsWritten;
      if (changed) {
        this.broadcast({ type: 'node:deleted', id, edges: this.getEdges(), by: user.username });
        this.updateTimestamp();
      }
      return;
    }
    if (event.type === 'edge:create') {
      const from = typeof event.from === 'string' ? event.from : '';
      const to = typeof event.to === 'string' ? event.to : '';
      if (!NODE_ID_RE.test(from) || !NODE_ID_RE.test(to) || from === to) return;
      const nodes = this.ctx.storage.sql.exec(
        'SELECT id FROM mindmap_nodes WHERE id IN (?, ?)',
        from,
        to,
      ).toArray();
      if (nodes.length !== 2) return;
      const id = crypto.randomUUID();
      try {
        this.ctx.storage.sql.exec(
          "INSERT INTO mindmap_edges (id, from_id, to_id, label) VALUES (?, ?, ?, '')",
          id,
          from,
          to,
        );
      } catch {
        return;
      }
      this.broadcast({ type: 'edge:created', edge: { id, from, to, label: '' }, by: user.username });
      this.updateTimestamp();
      return;
    }
    if (event.type === 'edge:update') {
      const id = typeof event.id === 'string' ? event.id : '';
      const label = typeof event.label === 'string' ? event.label.trim().slice(0, 120) : null;
      if (!NODE_ID_RE.test(id) || label === null) return;
      const changed = this.ctx.storage.sql.exec(
        'UPDATE mindmap_edges SET label = ? WHERE id = ?',
        label,
        id,
      ).rowsWritten;
      if (!changed) return;
      const edge = this.getEdges().find((item) => item.id === id);
      if (edge) this.broadcast({ type: 'edge:updated', edge, by: user.username });
      this.updateTimestamp();
      return;
    }
    if (event.type === 'edge:delete') {
      const id = typeof event.id === 'string' ? event.id : '';
      if (!NODE_ID_RE.test(id)) return;
      const changed = this.ctx.storage.sql.exec('DELETE FROM mindmap_edges WHERE id = ?', id).rowsWritten;
      if (changed) {
        this.broadcast({ type: 'edge:deleted', id, by: user.username });
        this.updateTimestamp();
      }
    }
  }

  webSocketClose(ws: WebSocket): void {
    try {
      ws.close(1000, 'Connection closed');
    } catch {
      /* The socket is already closed. */
    }
  }

  private normalizeNode(value: unknown): MindmapNode | null {
    if (!value || typeof value !== 'object') return null;
    const node = value as Partial<MindmapNode>;
    if (
      typeof node.id !== 'string' ||
      !NODE_ID_RE.test(node.id) ||
      typeof node.text !== 'string' ||
      node.text.trim().length < 1 ||
      node.text.length > MAX_TEXT_LENGTH ||
      typeof node.x !== 'number' ||
      !Number.isFinite(node.x) ||
      Math.abs(node.x) > 100_000 ||
      typeof node.y !== 'number' ||
      !Number.isFinite(node.y) ||
      Math.abs(node.y) > 100_000
    ) return null;
    const color = typeof node.color === 'string' && NODE_COLORS.has(node.color) ? node.color : 'blue';
    return {
      id: node.id,
      text: node.text.trim(),
      x: Math.round(node.x),
      y: Math.round(node.y),
      color,
    };
  }

  private getNodes(): MindmapNode[] {
    return this.ctx.storage.sql
      .exec<MindmapNode>('SELECT id, text, x, y, color FROM mindmap_nodes ORDER BY rowid')
      .toArray();
  }

  private getEdges(): MindmapEdge[] {
    return this.ctx.storage.sql
      .exec<{ id: string; from_id: string; to_id: string; label: string }>(
        'SELECT id, from_id, to_id, label FROM mindmap_edges ORDER BY rowid',
      )
      .toArray()
      .map((edge) => ({ id: edge.id, from: edge.from_id, to: edge.to_id, label: edge.label ?? '' }));
  }

  private broadcast(event: MindmapEvent): void {
    for (const ws of this.ctx.getWebSockets()) send(ws, event);
  }

  private updateTimestamp(): void {
    void this.env.DB.prepare('UPDATE collab_mindmaps SET updated_at = ? WHERE id = ?')
      .bind(Date.now(), this.ctx.id.name)
      .run();
  }
}
