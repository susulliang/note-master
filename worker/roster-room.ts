import { DurableObject } from 'cloudflare:workers';

/**
 * RosterRoom — one Durable Object instance per roster month
 * (`roster-YYYY-MM`, see worker/index.ts routing). The DO's own SQLite is the
 * FIRST LINE of truth for shift cells; the shared D1 `roster_cells` table is
 * only a backup mirror. Every admin edit is broadcast over hibernation
 * WebSockets so all logged-in users viewing that month see it live.
 *
 * Wire protocol (JSON):
 *   server → client:
 *     { type: 'welcome', month, cells: [{ en, iso, code }] }   — full snapshot
 *     { type: 'roster_cell', en, iso, code }                   — single edit
 *     { type: 'roster_cells', cells: [{ en, iso, code }] }     — full upload
 *     { type: 'heartbeat_ack', at }
 *   client → server:
 *     { type: 'heartbeat' }
 */

export interface RosterCell {
  en: string;
  iso: string;
  code: string;
}

interface StoredCell extends RosterCell {
  updated_at: number;
}

interface WsTicketRow {
  ticket: string;
  username: string;
  month: string;
  expires_at: number;
}

interface RosterAttachment {
  username: string;
  seenAt: number;
}

type RoomEvent = Record<string, unknown>;

const ROOM_TICKET_TTL_MS = 60_000;
const MAX_SOCKET_MESSAGE_LENGTH = 1_024;

function send(ws: WebSocket, event: RoomEvent): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(event));
  } catch {
    try {
      ws.close(1011, 'Unable to send roster update');
    } catch {
      /* The socket has already closed. */
    }
  }
}

function attachment(ws: WebSocket): RosterAttachment | null {
  try {
    return (ws.deserializeAttachment() as RosterAttachment | null) ?? null;
  } catch {
    return null;
  }
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export class RosterRoom extends DurableObject<Env> {
  /** The month this instance owns, derived from the DO instance name. */
  private readonly month: string;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const name = ctx.id.name;
    const month = name.startsWith('roster-') ? name.slice('roster-'.length) : '';
    if (!MONTH_RE.test(month)) throw new Error(`RosterRoom requires a "roster-YYYY-MM" instance name (got "${name}")`);
    this.month = month;
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS roster_ws_tickets (
          ticket TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          month TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS roster_cells (
          en TEXT NOT NULL,
          iso TEXT NOT NULL,
          code TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (en, iso)
        )
      `);
      // Cold start: if the DO store is empty, seed it once from the D1 backup
      // so the existing D1-first data keeps working after this deploy.
      const count = this.ctx.storage.sql
        .exec<{ n: number }>('SELECT COUNT(*) AS n FROM roster_cells')
        .toArray()[0]?.n ?? 0;
      if (count === 0) await this.hydrateFromD1();
    });
  }

  /** Issue a short-lived single-use ticket for connecting to this room. */
  async createTicket(username: string): Promise<string> {
    const now = Date.now();
    const ticket = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    this.ctx.storage.sql.exec('DELETE FROM roster_ws_tickets WHERE expires_at < ?', now);
    this.ctx.storage.sql.exec(
      'INSERT INTO roster_ws_tickets (ticket, username, month, expires_at) VALUES (?, ?, ?, ?)',
      ticket,
      username,
      this.month,
      now + ROOM_TICKET_TTL_MS,
    );
    return ticket;
  }

  /** All cells for this month, straight from the DO's SQLite (first line). */
  async getCells(): Promise<Array<RosterCell & { updatedAt: number }>> {
    return this.ctx.storage.sql
      .exec<StoredCell>('SELECT en, iso, code, updated_at FROM roster_cells ORDER BY en, iso')
      .toArray()
      .map((row) => ({ en: row.en, iso: row.iso, code: row.code, updatedAt: row.updated_at }));
  }

  /** Upsert a single cell, broadcast it live, then mirror to D1 (backup). */
  async applyCell(en: string, iso: string, code: string): Promise<void> {
    const now = Date.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO roster_cells (en, iso, code, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(en, iso) DO UPDATE SET code = excluded.code, updated_at = excluded.updated_at`,
      en,
      iso,
      code,
      now,
    );
    this.broadcast({ type: 'roster_cell', en, iso, code });
    try {
      await this.env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS roster_cells (
          month_key TEXT NOT NULL, en TEXT NOT NULL, iso TEXT NOT NULL, code TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (month_key, en, iso)
        )`,
      ).run();
      await this.env.DB.prepare(
        `INSERT INTO roster_cells (month_key, en, iso, code, updated_at) VALUES (?1, ?2, ?3, ?4, datetime('now'))
         ON CONFLICT(month_key, en, iso) DO UPDATE SET code = ?4, updated_at = datetime('now')`,
      )
        .bind(this.month, en, iso, code)
        .run();
    } catch (error) {
      // The DO store already has the edit — a failed backup mirror is not fatal.
      console.error(JSON.stringify({ event: 'roster_d1_mirror_failed', mode: 'cell', month: this.month, error: String(error) }));
    }
  }

  /** Replace every cell of this month, broadcast the snapshot, mirror to D1. */
  async applyFull(cells: RosterCell[]): Promise<number> {
    const now = Date.now();
    this.ctx.storage.sql.exec('BEGIN');
    try {
      this.ctx.storage.sql.exec('DELETE FROM roster_cells');
      for (const cell of cells) {
        this.ctx.storage.sql.exec(
          'INSERT INTO roster_cells (en, iso, code, updated_at) VALUES (?, ?, ?, ?)',
          cell.en,
          cell.iso,
          cell.code,
          now,
        );
      }
      this.ctx.storage.sql.exec('COMMIT');
    } catch (error) {
      this.ctx.storage.sql.exec('ROLLBACK');
      throw error;
    }
    this.broadcast({ type: 'roster_cells', cells });
    try {
      await this.env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS roster_cells (
          month_key TEXT NOT NULL, en TEXT NOT NULL, iso TEXT NOT NULL, code TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (month_key, en, iso)
        )`,
      ).run();
      // D1 caps bound parameters per statement — chunk like the legacy path.
      const statements = [
        this.env.DB.prepare('DELETE FROM roster_cells WHERE month_key = ?1').bind(this.month),
        ...chunk(cells, 20).map(
          (part) =>
            this.env.DB.prepare(
              `INSERT INTO roster_cells (month_key, en, iso, code, updated_at) VALUES ${part
                .map((_, i) => `(?${i * 4 + 1}, ?${i * 4 + 2}, ?${i * 4 + 3}, ?${i * 4 + 4}, datetime('now'))`)
                .join(', ')}`
            ).bind(...part.flatMap((cell) => [this.month, cell.en, cell.iso, cell.code])),
        ),
      ];
      await this.env.DB.batch(statements);
    } catch (error) {
      console.error(JSON.stringify({ event: 'roster_d1_mirror_failed', mode: 'full', month: this.month, error: String(error) }));
    }
    return cells.length;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET' || request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket upgrade required', { status: 426 });
    }

    const ticket = url.searchParams.get('ticket');
    if (!ticket || ticket.length > 100) return new Response('Invalid connection ticket', { status: 401 });
    if (url.searchParams.get('month') !== this.month) {
      return new Response('Month does not match this room', { status: 400 });
    }
    const row = this.ctx.storage.sql
      .exec<WsTicketRow>(
        'SELECT ticket, username, month, expires_at FROM roster_ws_tickets WHERE ticket = ? AND month = ? AND expires_at >= ?',
        ticket,
        this.month,
        Date.now(),
      )
      .toArray()[0];
    if (!row) return new Response('Expired or invalid connection ticket', { status: 401 });

    // Consume the single-use ticket before upgrading the connection.
    this.ctx.storage.sql.exec('DELETE FROM roster_ws_tickets WHERE ticket = ?', ticket);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, [row.username]);
    server.serializeAttachment({ username: row.username, seenAt: Date.now() });

    send(server, { type: 'welcome', month: this.month, cells: await this.getCells() });
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
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    // The roster socket is read-only — edits go through the authenticated
    // HTTP API. Heartbeats just keep the attachment fresh.
    if (event.type === 'heartbeat') {
      const current = attachment(ws);
      if (current) ws.serializeAttachment({ ...current, seenAt: Date.now() });
      send(ws, { type: 'heartbeat_ack', at: Date.now() });
    }
  }

  /** Seed the DO store from the D1 backup (one-time, on cold start). */
  private async hydrateFromD1(): Promise<void> {
    try {
      const result = await this.env.DB.prepare(
        'SELECT en, iso, code FROM roster_cells WHERE month_key = ?1',
      )
        .bind(this.month)
        .all<RosterCell>();
      const cells = result.results ?? [];
      if (!cells.length) return;
      const now = Date.now();
      for (const cell of cells) {
        this.ctx.storage.sql.exec(
          'INSERT OR REPLACE INTO roster_cells (en, iso, code, updated_at) VALUES (?, ?, ?, ?)',
          cell.en,
          cell.iso,
          cell.code,
          now,
        );
      }
    } catch (error) {
      console.error(JSON.stringify({ event: 'roster_d1_hydrate_failed', month: this.month, error: String(error) }));
    }
  }

  private broadcast(event: RoomEvent): void {
    for (const ws of this.ctx.getWebSockets()) {
      send(ws, event);
    }
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
