import { DurableObject } from 'cloudflare:workers';
import { getCollabPermission } from './collab-access';

export type SheetFill = 'none' | 'slate' | 'blue' | 'mint' | 'amber' | 'rose' | 'violet';
export type SheetTextColor = 'auto' | 'blue' | 'green' | 'red' | 'violet';
export type SheetAlignment = 'left' | 'center' | 'right';

export interface SheetCellStyle {
  fill?: SheetFill;
  color?: SheetTextColor;
  bold?: boolean;
  align?: SheetAlignment;
}

export interface SheetCell {
  row: number;
  col: number;
  raw: string;
  style: SheetCellStyle;
}

interface SheetTicket {
  ticket: string;
  username: string;
  permission: 'view' | 'edit';
  expires_at: number;
}

interface SheetAttachment {
  username: string;
  permission: 'view' | 'edit';
  lastSeenAt: number;
  typingUntil: number;
}

interface SheetDimensions {
  rows: number;
  cols: number;
}

type SheetEvent = Record<string, unknown>;
type SqlRow<T extends object> = T & Record<string, SqlStorageValue>;

const TICKET_TTL_MS = 60_000;
const MAX_ROWS = 100;
const MAX_COLS = 100;
const MAX_CELL_LENGTH = 5_000;
const SNAPSHOT_CHUNK_SIZE = 250;
const PRESENCE_TTL_MS = 45_000;
const TYPING_TTL_MS = 4_000;
const FILLS = new Set<SheetFill>(['none', 'slate', 'blue', 'mint', 'amber', 'rose', 'violet']);
const TEXT_COLORS = new Set<SheetTextColor>(['auto', 'blue', 'green', 'red', 'violet']);
const ALIGNMENTS = new Set<SheetAlignment>(['left', 'center', 'right']);

function send(ws: WebSocket, event: SheetEvent): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(event));
  } catch {
    try {
      ws.close(1011, 'Unable to send sheet update');
    } catch {
      /* The socket has already closed. */
    }
  }
}

function normalizeCell(value: unknown, dimensions: SheetDimensions): SheetCell | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SheetCell>;
  if (
    !Number.isInteger(candidate.row) ||
    !Number.isInteger(candidate.col) ||
    (candidate.row ?? 0) < 1 ||
    (candidate.row ?? 0) > dimensions.rows ||
    (candidate.col ?? 0) < 1 ||
    (candidate.col ?? 0) > dimensions.cols ||
    typeof candidate.raw !== 'string' ||
    candidate.raw.length > MAX_CELL_LENGTH
  ) return null;

  const style = candidate.style && typeof candidate.style === 'object'
    ? candidate.style as SheetCellStyle
    : {};
  const fill = FILLS.has(style.fill as SheetFill) ? style.fill : 'none';
  const color = TEXT_COLORS.has(style.color as SheetTextColor) ? style.color : 'auto';
  const align = ALIGNMENTS.has(style.align as SheetAlignment) ? style.align : 'left';
  return {
    row: candidate.row as number,
    col: candidate.col as number,
    raw: candidate.raw,
    style: {
      fill,
      color,
      align,
      bold: style.bold === true,
    },
  };
}

export class SheetsRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS sheet_socket_tickets (
          ticket TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          permission TEXT NOT NULL DEFAULT 'edit',
          expires_at INTEGER NOT NULL
        )
      `);
      this.ensureColumn('sheet_socket_tickets', 'permission', "TEXT NOT NULL DEFAULT 'edit'");
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS sheet_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          row_count INTEGER NOT NULL DEFAULT 10,
          col_count INTEGER NOT NULL DEFAULT 10
        )
      `);
      this.ctx.storage.sql.exec(`
        INSERT OR IGNORE INTO sheet_settings (id, row_count, col_count) VALUES (1, 10, 10)
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS sheet_cells (
          row_index INTEGER NOT NULL,
          col_index INTEGER NOT NULL,
          raw TEXT NOT NULL DEFAULT '',
          style_json TEXT NOT NULL DEFAULT '{}',
          PRIMARY KEY (row_index, col_index)
        )
      `);
    });
  }

  async initialize(rows = 10, cols = 10): Promise<void> {
    const safeRows = Math.max(1, Math.min(MAX_ROWS, Math.trunc(rows)));
    const safeCols = Math.max(1, Math.min(MAX_COLS, Math.trunc(cols)));
    this.ctx.storage.sql.exec(
      'UPDATE sheet_settings SET row_count = ?, col_count = ? WHERE id = 1',
      safeRows,
      safeCols,
    );
  }

  async searchCells(query: string, limit = 12): Promise<Array<{ row: number; col: number; raw: string }>> {
    const term = query.trim().slice(0, 120);
    if (!term) return [];
    return this.ctx.storage.sql.exec<{ row_index: number; col_index: number; raw: string }>(
      `SELECT row_index, col_index, raw FROM sheet_cells
       WHERE raw LIKE ? ESCAPE '\\' COLLATE NOCASE
       ORDER BY row_index, col_index LIMIT ?`,
      `%${term.replace(/[\\%_]/g, '\\$&')}%`,
      Math.max(1, Math.min(20, Math.trunc(limit))),
    ).toArray().map((cell) => ({ row: cell.row_index, col: cell.col_index, raw: cell.raw }));
  }

  async createTicket(username: string, permission: 'view' | 'edit' = 'edit'): Promise<string> {
    const now = Date.now();
    const ticket = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    this.ctx.storage.sql.exec('DELETE FROM sheet_socket_tickets WHERE expires_at < ?', now);
    this.ctx.storage.sql.exec(
      'INSERT INTO sheet_socket_tickets (ticket, username, permission, expires_at) VALUES (?, ?, ?, ?)',
      ticket,
      username,
      permission,
      now + TICKET_TTL_MS,
    );
    return ticket;
  }

  async broadcastTitle(title: string): Promise<void> {
    this.broadcast({ type: 'sheet:title', sheetId: this.ctx.id.name, title });
  }

  async revalidatePermissions(): Promise<void> {
    const sheetId = this.ctx.id.name ?? '';
    for (const ws of this.ctx.getWebSockets()) {
      const user = this.readAttachment(ws);
      if (!user?.username) {
        ws.close(1008, 'Missing sheet identity');
        continue;
      }
      const permission = await getCollabPermission(this.env, user.username, 'sheet', sheetId);
      if (!permission) {
        ws.close(1008, 'Sheet access revoked');
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
      .exec<SqlRow<SheetTicket>>(
        'SELECT ticket, username, permission, expires_at FROM sheet_socket_tickets WHERE ticket = ? AND expires_at >= ?',
        ticket,
        Date.now(),
      )
      .toArray()[0];
    if (!row) return new Response('Expired or invalid connection ticket', { status: 401 });
    this.ctx.storage.sql.exec('DELETE FROM sheet_socket_tickets WHERE ticket = ?', ticket);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, [row.username]);
    server.serializeAttachment({
      username: row.username,
      permission: row.permission === 'view' ? 'view' : 'edit',
      lastSeenAt: Date.now(),
      typingUntil: 0,
    } satisfies SheetAttachment);
    const dimensions = this.getDimensions();
    send(server, { type: 'sheet:ready', sheetId: this.ctx.id.name, ...dimensions });
    const cells = this.getCells();
    for (let offset = 0; offset < cells.length; offset += SNAPSHOT_CHUNK_SIZE) {
      send(server, {
        type: 'sheet:snapshot',
        cells: cells.slice(offset, offset + SNAPSHOT_CHUNK_SIZE),
        done: offset + SNAPSHOT_CHUNK_SIZE >= cells.length,
      });
    }
    if (cells.length === 0) send(server, { type: 'sheet:snapshot', cells: [], done: true });
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
    if (raw.length > 1_000_000) {
      ws.close(1009, 'Sheet update too large');
      return;
    }
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const user = this.readAttachment(ws);
    if (!user?.username) {
      ws.close(1008, 'Missing sheet identity');
      return;
    }
    if (event.type === 'heartbeat') {
      const now = Date.now();
      ws.serializeAttachment({
        ...user,
        lastSeenAt: now,
        typingUntil: user.typingUntil > now ? user.typingUntil : 0,
      } satisfies SheetAttachment);
      send(ws, { type: 'heartbeat_ack', at: now });
      this.broadcastPresence();
      return;
    }
    if (event.type === 'presence:typing') {
      if (event.active !== true && event.active !== false) return;
      if (event.active && user.permission !== 'edit') return;
      const now = Date.now();
      ws.serializeAttachment({
        ...user,
        lastSeenAt: now,
        typingUntil: event.active ? now + TYPING_TTL_MS : 0,
      } satisfies SheetAttachment);
      this.broadcastPresence();
      return;
    }
    if (user.permission !== 'edit') {
      send(ws, { type: 'error', message: 'You have view access to this sheet.' });
      return;
    }

    if (event.type === 'cells:update') {
      if (!Array.isArray(event.cells) || event.cells.length > MAX_ROWS * MAX_COLS) return;
      const dimensions = this.getDimensions();
      const cells = event.cells
        .map((value) => normalizeCell(value, dimensions))
        .filter((cell): cell is SheetCell => cell !== null);
      if (cells.length !== event.cells.length) {
        send(ws, { type: 'error', message: 'One or more cell edits were invalid.' });
        return;
      }
      for (const cell of cells) this.storeCell(cell);
      const changedAt = Date.now();
      this.broadcast({ type: 'cells:updated', cells, by: user.username, changedAt });
      this.updateSheetTimestamp(changedAt);
      return;
    }

    if (event.type === 'cells:clear') {
      const range = this.readRange(event, this.getDimensions());
      if (!range) return;
      if (event.clearStyle === true) {
        this.ctx.storage.sql.exec(
          'DELETE FROM sheet_cells WHERE row_index BETWEEN ? AND ? AND col_index BETWEEN ? AND ?',
          range.startRow,
          range.endRow,
          range.startCol,
          range.endCol,
        );
      } else {
        this.ctx.storage.sql.exec(
          `UPDATE sheet_cells SET raw = ''
           WHERE row_index BETWEEN ? AND ? AND col_index BETWEEN ? AND ?`,
          range.startRow,
          range.endRow,
          range.startCol,
          range.endCol,
        );
        this.ctx.storage.sql.exec(
          `DELETE FROM sheet_cells
           WHERE raw = '' AND style_json = '{}'
             AND row_index BETWEEN ? AND ? AND col_index BETWEEN ? AND ?`,
          range.startRow,
          range.endRow,
          range.startCol,
          range.endCol,
        );
      }
      this.broadcast({ type: 'cells:cleared', ...range, clearStyle: event.clearStyle === true, by: user.username });
      this.updateSheetTimestamp(Date.now());
      return;
    }

    if (event.type === 'structure:change') {
      const dimension = event.dimension === 'column' ? 'column' : event.dimension === 'row' ? 'row' : null;
      const action = event.action === 'insert' ? 'insert' : event.action === 'delete' ? 'delete' : null;
      const index = Number(event.index);
      const current = this.getDimensions();
      const currentSize = dimension === 'row' ? current.rows : dimension === 'column' ? current.cols : 0;
      if (
        !dimension ||
        !action ||
        !Number.isInteger(index) ||
        index < 1 ||
        index > currentSize + (action === 'insert' ? 1 : 0) ||
        (action === 'insert' && currentSize >= (dimension === 'row' ? MAX_ROWS : MAX_COLS)) ||
        (action === 'delete' && currentSize <= 1)
      ) {
        send(ws, { type: 'error', message: 'That row or column change is outside the supported range.' });
        return;
      }
      const adjustedFormulas = this.changeStructure(dimension, action, index);
      const dimensions = this.getDimensions();
      this.broadcast({
        type: 'structure:changed',
        dimension,
        action,
        index,
        ...dimensions,
        by: user.username,
      });
      if (adjustedFormulas.length) {
        this.broadcast({ type: 'cells:updated', cells: adjustedFormulas, by: user.username, changedAt: Date.now() });
      }
      this.updateSheetTimestamp(Date.now());
      return;
    }

  }

  webSocketClose(ws: WebSocket): void {
    try {
      ws.close(1000, 'Connection closed');
    } catch {
      /* The socket is already closed. */
    }
    this.broadcastPresence();
  }

  private getDimensions(): SheetDimensions {
    const row = this.ctx.storage.sql
      .exec<{ row_count: number; col_count: number }>(
        'SELECT row_count, col_count FROM sheet_settings WHERE id = 1',
      )
      .one();
    return { rows: row.row_count, cols: row.col_count };
  }

  private getCells(): SheetCell[] {
    return this.ctx.storage.sql
      .exec<{ row_index: number; col_index: number; raw: string; style_json: string }>(
        'SELECT row_index, col_index, raw, style_json FROM sheet_cells ORDER BY row_index, col_index',
      )
      .toArray()
      .map((row) => ({
        row: row.row_index,
        col: row.col_index,
        raw: row.raw,
        style: this.parseStyle(row.style_json),
      }));
  }

  private parseStyle(value: string): SheetCellStyle {
    try {
      const style = JSON.parse(value) as SheetCellStyle;
      return {
        fill: FILLS.has(style.fill as SheetFill) ? style.fill : 'none',
        color: TEXT_COLORS.has(style.color as SheetTextColor) ? style.color : 'auto',
        align: ALIGNMENTS.has(style.align as SheetAlignment) ? style.align : 'left',
        bold: style.bold === true,
      };
    } catch {
      return {};
    }
  }

  private storeCell(cell: SheetCell): void {
    const style = {
      fill: cell.style.fill ?? 'none',
      color: cell.style.color ?? 'auto',
      align: cell.style.align ?? 'left',
      bold: cell.style.bold === true,
    };
    if (!cell.raw && style.fill === 'none' && style.color === 'auto' && !style.bold && style.align === 'left') {
      this.ctx.storage.sql.exec(
        'DELETE FROM sheet_cells WHERE row_index = ? AND col_index = ?',
        cell.row,
        cell.col,
      );
      return;
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO sheet_cells (row_index, col_index, raw, style_json) VALUES (?, ?, ?, ?)
       ON CONFLICT(row_index, col_index) DO UPDATE SET raw = excluded.raw, style_json = excluded.style_json`,
      cell.row,
      cell.col,
      cell.raw,
      JSON.stringify(style),
    );
  }

  private readRange(event: Record<string, unknown>, dimensions: SheetDimensions) {
    const startRow = Number(event.startRow);
    const endRow = Number(event.endRow);
    const startCol = Number(event.startCol);
    const endCol = Number(event.endCol);
    if (
      ![startRow, endRow, startCol, endCol].every(Number.isInteger) ||
      startRow < 1 || endRow < startRow || endRow > dimensions.rows ||
      startCol < 1 || endCol < startCol || endCol > dimensions.cols
    ) return null;
    return { startRow, endRow, startCol, endCol };
  }

  private changeStructure(
    dimension: 'row' | 'column',
    action: 'insert' | 'delete',
    index: number,
  ): SheetCell[] {
    const field = dimension === 'row' ? 'row_index' : 'col_index';
    const setting = dimension === 'row' ? 'row_count' : 'col_count';
    const current = this.getDimensions();
    const size = dimension === 'row' ? current.rows : current.cols;
    if (action === 'insert') {
      this.ctx.storage.sql.exec(
        `UPDATE sheet_cells SET ${field} = ${field} + 1000 WHERE ${field} >= ?`,
        index,
      );
      this.ctx.storage.sql.exec(
        `UPDATE sheet_cells SET ${field} = ${field} - 999 WHERE ${field} >= ?`,
        index + 1000,
      );
      this.ctx.storage.sql.exec(`UPDATE sheet_settings SET ${setting} = ? WHERE id = 1`, size + 1);
    } else {
      this.ctx.storage.sql.exec(`DELETE FROM sheet_cells WHERE ${field} = ?`, index);
      this.ctx.storage.sql.exec(
        `UPDATE sheet_cells SET ${field} = ${field} + 1000 WHERE ${field} > ?`,
        index,
      );
      this.ctx.storage.sql.exec(
        `UPDATE sheet_cells SET ${field} = ${field} - 1001 WHERE ${field} >= ?`,
        index + 1000,
      );
      this.ctx.storage.sql.exec(`UPDATE sheet_settings SET ${setting} = ? WHERE id = 1`, size - 1);
    }
    const changed: SheetCell[] = [];
    const formulaRows = this.ctx.storage.sql
      .exec<{ row_index: number; col_index: number; raw: string; style_json: string }>(
        "SELECT row_index, col_index, raw, style_json FROM sheet_cells WHERE raw LIKE '=%'",
      )
      .toArray();
    for (const formula of formulaRows) {
      const raw = this.adjustFormulaReferences(formula.raw, dimension, action, index);
      if (raw === formula.raw) continue;
      this.ctx.storage.sql.exec(
        'UPDATE sheet_cells SET raw = ? WHERE row_index = ? AND col_index = ?',
        raw,
        formula.row_index,
        formula.col_index,
      );
      changed.push({
        row: formula.row_index,
        col: formula.col_index,
        raw,
        style: this.parseStyle(formula.style_json),
      });
    }
    return changed;
  }

  private adjustFormulaReferences(
    formula: string,
    dimension: 'row' | 'column',
    action: 'insert' | 'delete',
    index: number,
  ): string {
    return formula.replace(
      /(^|[^A-Z0-9_.])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Z0-9_(])/gi,
      (match, prefix: string, columnAbsolute: string, letters: string, rowAbsolute: string, rowText: string) => {
        const row = Number(rowText);
        let col = 0;
        for (const character of letters.toUpperCase()) col = col * 26 + character.charCodeAt(0) - 64;
        if (dimension === 'row') {
          if (action === 'insert' && row >= index) {
            return `${prefix}${columnAbsolute}${letters}${rowAbsolute}${row + 1}`;
          }
          if (action === 'delete' && row === index) return `${prefix}#REF!`;
          if (action === 'delete' && row > index) {
            return `${prefix}${columnAbsolute}${letters}${rowAbsolute}${row - 1}`;
          }
          return match;
        }
        if (action === 'insert' && col >= index) {
          return `${prefix}${columnAbsolute}${this.columnName(col + 1)}${rowAbsolute}${rowText}`;
        }
        if (action === 'delete' && col === index) return `${prefix}#REF!`;
        if (action === 'delete' && col > index) {
          return `${prefix}${columnAbsolute}${this.columnName(col - 1)}${rowAbsolute}${rowText}`;
        }
        return match;
      },
    );
  }

  private columnName(value: number): string {
    let col = value;
    let result = '';
    while (col > 0) {
      const remainder = (col - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      col = Math.floor((col - 1) / 26);
    }
    return result;
  }

  private readAttachment(ws: WebSocket): SheetAttachment | null {
    try {
      return (ws.deserializeAttachment() as SheetAttachment | null) ?? null;
    } catch {
      return null;
    }
  }

  private broadcastPresence(): void {
    const now = Date.now();
    const participants = new Map<string, { username: string; typing: boolean }>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const user = this.readAttachment(ws);
      if (!user?.username) continue;
      const lastSeenAt = Number.isFinite(user.lastSeenAt) ? user.lastSeenAt : now;
      if (now - lastSeenAt > PRESENCE_TTL_MS) continue;
      const key = user.username.toLowerCase();
      const previous = participants.get(key);
      participants.set(key, {
        username: user.username,
        typing: (user.typingUntil ?? 0) > now || previous?.typing === true,
      });
    }
    this.broadcast({ type: 'presence:update', participants: [...participants.values()] });
  }

  private updateSheetTimestamp(updatedAt: number): void {
    void this.env.DB.prepare('UPDATE collaborative_sheets SET updated_at = ? WHERE id = ?')
      .bind(updatedAt, this.ctx.id.name ?? '')
      .run()
      .catch((error: unknown) => {
        console.error(JSON.stringify({
          event: 'sheet_timestamp_update_failed',
          sheetId: this.ctx.id.name,
          error: String(error),
        }));
      });
  }

  private broadcast(event: SheetEvent): void {
    const serialized = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      try {
        ws.send(serialized);
      } catch {
        try {
          ws.close(1011, 'Unable to broadcast sheet update');
        } catch {
          /* The socket has already closed. */
        }
      }
    }
  }

  private ensureColumn(table: string, column: string, declaration: string): void {
    const columns = this.ctx.storage.sql.exec<{ name: string }>(`PRAGMA table_info(${table})`).toArray();
    if (!columns.some((row) => row.name === column)) {
      this.ctx.storage.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
    }
  }
}
