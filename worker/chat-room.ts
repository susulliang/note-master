import { DurableObject } from 'cloudflare:workers';

interface ChatMessageRow {
  id: string;
  username: string;
  markdown: string;
  created_at: number;
  updated_at: number;
  source_id: string | null;
  avatar_seed: number;
  avatar_rotation: number;
  glowing: number;
  parent_id?: string | null;
  mentions_json?: string;
  thread_count?: number;
}

interface TicketRow {
  ticket: string;
  username: string;
  expires_at: number;
  avatar_seed: number;
  avatar_rotation: number;
}

interface ChatAttachment {
  username: string;
  avatarSeed: number;
  avatarRotation: number;
}

interface ChatAvatarProfile {
  seed: number;
  rotation: number;
}

interface MessageCursor {
  createdAt: number;
  id: string;
}

interface ChatNewsEntry {
  id: string;
  date: string;
  title: string;
  author: string;
  body: string;
  updatedAt: number;
}

type ChatEvent = Record<string, unknown>;
type SqlRow<T extends object> = T & Record<string, SqlStorageValue>;

const TICKET_TTL_MS = 60_000;
const MAX_SOCKET_MESSAGE_LENGTH = 32_768;
const MAX_MARKDOWN_LENGTH = 20_000;
const HISTORY_PAGE_SIZE = 50;

function send(ws: WebSocket, event: ChatEvent): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(event));
  } catch {
    try {
      ws.close(1011, 'Unable to send chat update');
    } catch {
      /* The socket has already closed. */
    }
  }
}

function attachment(ws: WebSocket): ChatAttachment | null {
  try {
    return (ws.deserializeAttachment() as ChatAttachment | null) ?? null;
  } catch {
    return null;
  }
}

function presentMessage(row: ChatMessageRow) {
  return {
    id: row.id,
    username: row.username,
    markdown: row.markdown,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: row.source_id ? 'news' : 'chat',
    avatar: { seed: row.avatar_seed, rotation: row.avatar_rotation },
    glowing: row.glowing === 1,
    parentId: row.parent_id ?? null,
    threadCount: Number(row.thread_count ?? 0),
    mentions: (() => {
      try {
        const value: unknown = JSON.parse(row.mentions_json ?? '[]');
        return Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string') : [];
      } catch {
        return [];
      }
    })(),
  };
}

export class ChatRoom extends DurableObject<Env> {
  private readonly roomId: string;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.roomId = ctx.id.name ?? '';
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS chat_ws_tickets (
          ticket TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          avatar_seed INTEGER NOT NULL DEFAULT 0,
          avatar_rotation INTEGER NOT NULL DEFAULT 0
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          markdown TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          source_id TEXT UNIQUE,
          avatar_seed INTEGER NOT NULL DEFAULT 0,
          avatar_rotation INTEGER NOT NULL DEFAULT 0
        )
      `);
      this.ctx.storage.sql.exec(
        'CREATE INDEX IF NOT EXISTS chat_messages_created_idx ON chat_messages (created_at DESC, id DESC)',
      );
      this.ensureColumn('chat_ws_tickets', 'avatar_seed', 'INTEGER NOT NULL DEFAULT 0');
      this.ensureColumn('chat_ws_tickets', 'avatar_rotation', 'INTEGER NOT NULL DEFAULT 0');
      this.ensureColumn('chat_messages', 'avatar_seed', 'INTEGER NOT NULL DEFAULT 0');
      this.ensureColumn('chat_messages', 'avatar_rotation', 'INTEGER NOT NULL DEFAULT 0');
      this.ensureColumn('chat_messages', 'glowing', 'INTEGER NOT NULL DEFAULT 0');
      this.ensureColumn('chat_messages', 'parent_id', 'TEXT');
      this.ensureColumn('chat_messages', 'mentions_json', "TEXT NOT NULL DEFAULT '[]'");
      this.ctx.storage.sql.exec(
        'CREATE INDEX IF NOT EXISTS chat_messages_parent_idx ON chat_messages (parent_id, created_at, id)',
      );
    });
  }

  async createTicket(username: string, profile: ChatAvatarProfile): Promise<string> {
    const now = Date.now();
    const ticket = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    this.ctx.storage.sql.exec('DELETE FROM chat_ws_tickets WHERE expires_at < ?', now);
    this.ctx.storage.sql.exec(
      `INSERT INTO chat_ws_tickets
       (ticket, username, expires_at, avatar_seed, avatar_rotation) VALUES (?, ?, ?, ?, ?)`,
      ticket,
      username,
      now + TICKET_TTL_MS,
      profile.seed,
      profile.rotation,
    );
    return ticket;
  }

  async seedNews(entries: ChatNewsEntry[]): Promise<Array<ReturnType<typeof presentMessage>>> {
    const changedMessages: Array<ReturnType<typeof presentMessage>> = [];
    for (const entry of entries) {
      const title = entry.title.trim();
      const author = entry.author.trim() || 'Ecovacs Support';
      const body = entry.body.trim().replace(
        /(\]\()(?:(?:\.\.\/)|(?:\.\/))*assets\//g,
        '$1/news/assets/',
      );
      const markdown = `### ${title}\n\n${body}\n\n*Posted ${entry.date} by ${author}*`;
      const createdAt = Date.parse(entry.date)
        || (Number.isFinite(entry.updatedAt) && entry.updatedAt > 0 ? entry.updatedAt : Date.now());
      const existing = this.ctx.storage.sql
        .exec<{ id: string; markdown: string }>('SELECT id, markdown FROM chat_messages WHERE source_id = ?', entry.id)
        .toArray()[0];
      if (existing) {
        const nextMarkdown = markdown.slice(0, MAX_MARKDOWN_LENGTH);
        if (existing.markdown !== nextMarkdown) {
          const updatedAt = Date.now();
          this.ctx.storage.sql.exec(
            'UPDATE chat_messages SET username = ?, markdown = ?, updated_at = ? WHERE source_id = ?',
            author,
            nextMarkdown,
            updatedAt,
            entry.id,
          );
          const row = this.ctx.storage.sql
            .exec<SqlRow<ChatMessageRow>>('SELECT * FROM chat_messages WHERE id = ?', existing.id)
            .toArray()[0];
          if (row) {
            const message = presentMessage(row);
            changedMessages.push(message);
            this.broadcast({ type: 'message:updated', message });
          }
        }
      } else {
        this.ctx.storage.sql.exec(
          `INSERT OR IGNORE INTO chat_messages (id, username, markdown, created_at, updated_at, source_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          crypto.randomUUID(),
          author,
          markdown.slice(0, MAX_MARKDOWN_LENGTH),
          createdAt,
          createdAt,
          entry.id,
        );
        const row = this.ctx.storage.sql
          .exec<SqlRow<ChatMessageRow>>('SELECT * FROM chat_messages WHERE source_id = ?', entry.id)
          .toArray()[0];
        if (row) {
          const message = presentMessage(row);
          changedMessages.push(message);
          this.broadcast({ type: 'message:created', message });
        }
      }
    }
    return changedMessages;
  }

  async broadcastRoomTitle(title: string): Promise<void> {
    this.broadcast({ type: 'room:title', roomId: this.roomId, title });
  }

  async broadcastPinnedDocument(): Promise<void> {
    this.broadcast({ type: 'pinned-document:changed', roomId: this.roomId });
  }

  async searchMessages(query: string, limit = 12): Promise<Array<ReturnType<typeof presentMessage>>> {
    const term = query.trim().slice(0, 120);
    if (!term) return [];
    const rows = this.ctx.storage.sql.exec<SqlRow<ChatMessageRow>>(
      `SELECT id, username, markdown, created_at, updated_at, source_id,
              avatar_seed, avatar_rotation, glowing, parent_id, mentions_json,
              0 AS thread_count
       FROM chat_messages
       WHERE markdown LIKE ? ESCAPE '\\' COLLATE NOCASE
       ORDER BY created_at DESC LIMIT ?`,
      `%${term.replace(/[\\%_]/g, '\\$&')}%`,
      Math.max(1, Math.min(20, Math.trunc(limit))),
    ).toArray();
    return rows.map(presentMessage);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET' || request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket upgrade required', { status: 426 });
    }
    const ticket = url.searchParams.get('ticket');
    if (!ticket || ticket.length > 100) return new Response('Invalid connection ticket', { status: 401 });
    const row = this.ctx.storage.sql
      .exec<SqlRow<TicketRow>>(
        `SELECT ticket, username, expires_at, avatar_seed, avatar_rotation
         FROM chat_ws_tickets WHERE ticket = ? AND expires_at >= ?`,
        ticket,
        Date.now(),
      )
      .toArray()[0];
    if (!row) return new Response('Expired or invalid connection ticket', { status: 401 });
    this.ctx.storage.sql.exec('DELETE FROM chat_ws_tickets WHERE ticket = ?', ticket);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, [row.username]);
    server.serializeAttachment({
      username: row.username,
      avatarSeed: row.avatar_seed,
      avatarRotation: row.avatar_rotation,
    } satisfies ChatAttachment);
    send(server, { type: 'welcome', roomId: this.roomId });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
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
    const user = attachment(ws);
    if (!user?.username) {
      ws.close(1008, 'Missing chat identity');
      return;
    }
    if (event.type === 'message:create') {
      if (typeof event.markdown !== 'string') return;
      const markdown = event.markdown.trim();
      if (!markdown || markdown.length > MAX_MARKDOWN_LENGTH) {
        send(ws, { type: 'error', message: 'Messages must be between 1 and 20,000 characters.' });
        return;
      }
      const parentId = typeof event.parentId === 'string' ? event.parentId : null;
      if (parentId) {
        const parent = this.ctx.storage.sql.exec<{ id: string; parent_id: string | null }>(
          'SELECT id, parent_id FROM chat_messages WHERE id = ? AND source_id IS NULL',
          parentId,
        ).toArray()[0];
        if (!parent || parent.parent_id) {
          send(ws, { type: 'error', message: 'That thread is no longer available.' });
          return;
        }
      }
      const mentionedNames = [...new Set(
        Array.from(markdown.matchAll(/(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_.-]{1,32})/g), (match) => match[1].toLowerCase()),
      )].slice(0, 40);
      let mentions: string[] = [];
      if (mentionedNames.length) {
        const placeholders = mentionedNames.map(() => '?').join(', ');
        const found = await this.env.DB.prepare(
          `SELECT username FROM auth_users WHERE lower(username) IN (${placeholders})`,
        ).bind(...mentionedNames).all<{ username: string }>();
        mentions = (found.results ?? []).map((person) => person.username);
      }
      const now = Date.now();
      const row: ChatMessageRow = {
        id: crypto.randomUUID(),
        username: user.username,
        markdown,
        created_at: now,
        updated_at: now,
        source_id: null,
        avatar_seed: user.avatarSeed,
        avatar_rotation: user.avatarRotation,
        glowing: 0,
        parent_id: parentId,
        mentions_json: JSON.stringify(mentions),
      };
      this.ctx.storage.sql.exec(
        `INSERT INTO chat_messages
         (id, username, markdown, created_at, updated_at, source_id, avatar_seed, avatar_rotation, parent_id, mentions_json)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
        row.id,
        row.username,
        row.markdown,
        row.created_at,
        row.updated_at,
        row.avatar_seed,
        row.avatar_rotation,
        row.parent_id,
        row.mentions_json,
      );
      await this.sharePrivateStickers(row.id, row.markdown, user.username);
      const payload = { type: 'message:created', message: presentMessage(row) };
      this.broadcast(payload);
      if (parentId) this.broadcastThreadCount(parentId);
      await this.updateInboxPreview(markdown, now);
      return;
    }
    if (event.type === 'message:edit') {
      if (
        typeof event.id !== 'string' ||
        typeof event.markdown !== 'string' ||
        !event.markdown.trim() ||
        event.markdown.length > MAX_MARKDOWN_LENGTH
      ) {
        send(ws, { type: 'error', message: 'The edited message is empty or too long.' });
        return;
      }
      const now = Date.now();
      const changed = this.ctx.storage.sql.exec(
        `UPDATE chat_messages SET markdown = ?, updated_at = ?
         WHERE id = ? AND username = ? AND source_id IS NULL`,
        event.markdown.trim(),
        now,
        event.id,
        user.username,
      ).rowsWritten;
      if (!changed) {
        send(ws, { type: 'error', message: 'Only your own messages can be edited.' });
        return;
      }
      const row = this.ctx.storage.sql
        .exec<SqlRow<ChatMessageRow>>('SELECT * FROM chat_messages WHERE id = ?', event.id)
        .toArray()[0];
      if (row) {
        await this.sharePrivateStickers(row.id, row.markdown, user.username);
        this.broadcast({ type: 'message:updated', message: presentMessage(row) });
        await this.updateInboxPreview(row.markdown, now);
      }
      return;
    }
    if (event.type === 'message:glow') {
      if (typeof event.id !== 'string' || typeof event.glowing !== 'boolean') return;
      const changed = this.ctx.storage.sql.exec(
        'UPDATE chat_messages SET glowing = ? WHERE id = ? AND source_id IS NULL',
        event.glowing ? 1 : 0,
        event.id,
      ).rowsWritten;
      if (changed) {
        const row = this.ctx.storage.sql
          .exec<SqlRow<ChatMessageRow>>('SELECT * FROM chat_messages WHERE id = ?', event.id)
          .toArray()[0];
        if (row) this.broadcast({ type: 'message:updated', message: presentMessage(row) });
      }
      return;
    }
    if (event.type === 'message:shake') {
      if (typeof event.id !== 'string') return;
      const row = this.ctx.storage.sql
        .exec<{ id: string; source_id: string | null }>(
          'SELECT id, source_id FROM chat_messages WHERE id = ?',
          event.id,
        )
        .toArray()[0];
      if (row && !row.source_id) {
        this.broadcast({ type: 'message:shake', id: row.id, shakeId: crypto.randomUUID() });
      }
      return;
    }
    if (event.type === 'history:latest') {
      const page = this.getMessages();
      send(ws, {
        type: 'history:latest',
        messages: page.messages,
        hasOlder: page.hasOlder,
        cursor: page.cursor,
      });
      return;
    }
    if (event.type === 'thread:load') {
      const parentId = typeof event.parentId === 'string' ? event.parentId : '';
      if (!/^[0-9a-f-]{36}$/i.test(parentId)) return;
      const parent = this.ctx.storage.sql.exec<SqlRow<ChatMessageRow>>(
        `SELECT id, username, markdown, created_at, updated_at, source_id,
                avatar_seed, avatar_rotation, glowing, parent_id, mentions_json,
                (SELECT COUNT(*) FROM chat_messages replies WHERE replies.parent_id = chat_messages.id) AS thread_count
         FROM chat_messages WHERE id = ? AND parent_id IS NULL`,
        parentId,
      ).toArray()[0];
      if (!parent) return;
      const replies = this.ctx.storage.sql.exec<SqlRow<ChatMessageRow>>(
        `SELECT id, username, markdown, created_at, updated_at, source_id,
                avatar_seed, avatar_rotation, glowing, parent_id, mentions_json,
                0 AS thread_count
         FROM chat_messages WHERE parent_id = ? ORDER BY created_at, id`,
        parentId,
      ).toArray();
      send(ws, {
        type: 'thread:messages',
        parent: presentMessage(parent),
        messages: replies.map(presentMessage),
      });
      return;
    }
    if (event.type === 'history:older') {
      const rawCursor = event.cursor as Partial<MessageCursor> | null;
      if (
        !rawCursor ||
        !Number.isSafeInteger(rawCursor.createdAt) ||
        typeof rawCursor.id !== 'string' ||
        rawCursor.id.length > 80
      ) return;
      const page = this.getMessages({
        createdAt: rawCursor.createdAt as number,
        id: rawCursor.id,
      });
      send(ws, {
        type: 'history:older',
        messages: page.messages,
        hasOlder: page.hasOlder,
        cursor: page.cursor,
      });
      return;
    }
    if (event.type === 'heartbeat') send(ws, { type: 'heartbeat_ack', at: Date.now() });
  }

  webSocketClose(ws: WebSocket): void {
    try {
      ws.close(1000, 'Connection closed');
    } catch {
      /* The socket is already closed. */
    }
  }

  private getMessages(before?: MessageCursor) {
    const rows = before
      ? this.ctx.storage.sql.exec<SqlRow<ChatMessageRow>>(
        `SELECT m.id, m.username, m.markdown, m.created_at, m.updated_at, m.source_id,
                m.avatar_seed, m.avatar_rotation, m.glowing, m.parent_id, m.mentions_json,
                (SELECT COUNT(*) FROM chat_messages replies WHERE replies.parent_id = m.id) AS thread_count
         FROM chat_messages m
         WHERE m.parent_id IS NULL AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))
         ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
        before.createdAt,
        before.createdAt,
        before.id,
        HISTORY_PAGE_SIZE + 1,
      ).toArray()
      : this.ctx.storage.sql.exec<SqlRow<ChatMessageRow>>(
        `SELECT m.id, m.username, m.markdown, m.created_at, m.updated_at, m.source_id,
                m.avatar_seed, m.avatar_rotation, m.glowing, m.parent_id, m.mentions_json,
                (SELECT COUNT(*) FROM chat_messages replies WHERE replies.parent_id = m.id) AS thread_count
         FROM chat_messages m WHERE m.parent_id IS NULL ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
        HISTORY_PAGE_SIZE + 1,
      ).toArray();
    const hasOlder = rows.length > HISTORY_PAGE_SIZE;
    const pageRows = rows.slice(0, HISTORY_PAGE_SIZE);
    const oldest = pageRows.at(-1);
    return {
      messages: pageRows.reverse().map(presentMessage),
      hasOlder,
      cursor: oldest ? { createdAt: oldest.created_at, id: oldest.id } : null,
    };
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.ctx.storage.sql.exec<{ name: string }>(`PRAGMA table_info(${table})`).toArray();
    if (!columns.some((entry) => entry.name === column)) {
      this.ctx.storage.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  private broadcastThreadCount(parentId: string): void {
    const row = this.ctx.storage.sql.exec<{ count: number }>(
      'SELECT COUNT(*) AS count FROM chat_messages WHERE parent_id = ?',
      parentId,
    ).toArray()[0];
    this.broadcast({ type: 'thread:count', parentId, count: Number(row?.count ?? 0) });
  }

  private broadcast(event: ChatEvent): void {
    const serialized = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      try {
        ws.send(serialized);
      } catch {
        try {
          ws.close(1011, 'Unable to broadcast chat update');
        } catch {
          /* The socket has already closed. */
        }
      }
    }
  }

  private async updateInboxPreview(markdown: string, updatedAt: number): Promise<void> {
    if (this.roomId === 'global') return;
    try {
      if (this.roomId.startsWith('group-')) {
        await this.env.DB.prepare(
          'UPDATE chat_groups SET last_message = ?, updated_at = ? WHERE room_id = ?',
        )
          .bind(markdown.slice(0, 180), updatedAt, this.roomId)
          .run();
      } else {
        await this.env.DB.prepare(
          'UPDATE chat_conversations SET last_message = ?, updated_at = ? WHERE room_id = ?',
        )
          .bind(markdown.slice(0, 180), updatedAt, this.roomId)
          .run();
      }
    } catch (error) {
      console.error(JSON.stringify({
        event: 'chat_inbox_index_update_failed',
        roomId: this.roomId,
        error: String(error),
      }));
    }
  }

  private async sharePrivateStickers(
    messageId: string,
    markdown: string,
    username: string,
    replace = false,
  ): Promise<void> {
    try {
      const stickerIds = [...new Set(
        Array.from(markdown.matchAll(/\/api\/chat\/stickers\/private\/([0-9a-f-]{36})/g), (match) => match[1]),
      )];
      if (stickerIds.length === 0 && !replace) return;
      if (replace) {
        await this.env.DB.prepare(
          'DELETE FROM chat_sticker_shares WHERE room_id = ? AND message_id = ?',
        ).bind(this.roomId, messageId).run();
      }
      if (stickerIds.length === 0) return;
      const pack = this.env.CHAT_STICKER_PACK.getByName(
        `private-${encodeURIComponent(username.toLowerCase())}`,
      );
      for (const stickerId of stickerIds) {
        const sticker = await pack.getSticker(stickerId);
        if (!sticker) continue;
        await this.env.DB.prepare(
          `INSERT OR IGNORE INTO chat_sticker_shares
           (sticker_id, owner, room_id, message_id, created_at) VALUES (?, ?, ?, ?, ?)`,
        ).bind(stickerId, username, this.roomId, messageId, Date.now()).run();
      }
    } catch (error) {
      console.error(JSON.stringify({
        event: 'chat_private_sticker_share_failed',
        roomId: this.roomId,
        messageId,
        error: String(error),
      }));
    }
  }
}
