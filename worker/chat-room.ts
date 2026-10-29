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
  quick_reply?: string | null;
  mentions_json?: string;
  thread_count?: number;
  content_type?: string;
  poll_id?: string | null;
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
  lastSeenAt: number;
  typingUntil: number;
}

interface ChatPollRow {
  poll_id: string;
  message_id: string;
  question: string;
  options_json: string;
  created_by: string;
  closes_at: number;
  closed_at: number | null;
  my_vote?: number | null;
}

interface ChatPollVoteRow {
  poll_id: string;
  option_index: number;
}

interface ChatPollSnapshot {
  id: string;
  question: string;
  options: string[];
  voteCounts: number[];
  myVote: number | null;
  closesAt: number;
  closedAt: number | null;
  closed: boolean;
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
const PRESENCE_TTL_MS = 45_000;
const TYPING_TTL_MS = 4_000;
const POLL_TTL_MS = 24 * 60 * 60 * 1000;
const QUICK_REPLIES = new Set(['👍', '👎', '❤️', '😂', '😮', '🙏', '✅', '❌']);

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
    quickReply: row.quick_reply ?? null,
    contentType: row.content_type === 'poll' || row.content_type === 'poll_result' ? row.content_type : 'markdown',
    pollId: row.poll_id ?? null,
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
      this.ensureColumn('chat_messages', 'quick_reply', 'TEXT');
      this.ensureColumn('chat_messages', 'mentions_json', "TEXT NOT NULL DEFAULT '[]'");
      this.ensureColumn('chat_messages', 'content_type', "TEXT NOT NULL DEFAULT 'markdown'");
      this.ensureColumn('chat_messages', 'poll_id', 'TEXT');
      this.ctx.storage.sql.exec(
        'CREATE INDEX IF NOT EXISTS chat_messages_parent_idx ON chat_messages (parent_id, created_at, id)',
      );
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS chat_polls (
          poll_id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL UNIQUE,
          question TEXT NOT NULL,
          options_json TEXT NOT NULL,
          created_by TEXT NOT NULL,
          closes_at INTEGER NOT NULL,
          closed_at INTEGER
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS chat_poll_votes (
          poll_id TEXT NOT NULL,
          username TEXT NOT NULL,
          option_index INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (poll_id, username)
        )
      `);
      this.ctx.storage.sql.exec(
        'CREATE INDEX IF NOT EXISTS chat_poll_votes_poll_idx ON chat_poll_votes (poll_id, option_index)',
      );
      this.ctx.storage.sql.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_poll_result_idx
        ON chat_messages (poll_id)
        WHERE content_type = 'poll_result' AND poll_id IS NOT NULL
      `);
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
      lastSeenAt: Date.now(),
      typingUntil: 0,
    } satisfies ChatAttachment);
    send(server, { type: 'welcome', roomId: this.roomId });
    this.broadcastPresence();
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
    if (event.type === 'heartbeat') {
      const now = Date.now();
      ws.serializeAttachment({
        ...user,
        lastSeenAt: now,
        typingUntil: user.typingUntil > now ? user.typingUntil : 0,
      } satisfies ChatAttachment);
      send(ws, { type: 'heartbeat_ack', at: now });
      this.broadcastPresence();
      return;
    }
    if (event.type === 'presence:typing') {
      const now = Date.now();
      ws.serializeAttachment({
        ...user,
        lastSeenAt: now,
        typingUntil: event.active === true ? now + TYPING_TTL_MS : 0,
      } satisfies ChatAttachment);
      this.broadcastPresence();
      return;
    }
    if (this.roomId.startsWith('drive-presence-')) return;
    if (event.type === 'poll:create') {
      await this.createPoll(ws, user, event);
      return;
    }
    if (event.type === 'poll:vote') {
      await this.votePoll(ws, user, event);
      return;
    }
    if (event.type === 'message:create') {
      if (typeof event.markdown !== 'string') return;
      const quickReply = typeof event.quickReply === 'string' ? event.quickReply : null;
      if (
        (event.quickReply !== undefined && quickReply === null) ||
        (quickReply !== null && (!QUICK_REPLIES.has(quickReply) || typeof event.parentId !== 'string'))
      ) {
        send(ws, { type: 'error', message: 'That quick reply is not available.' });
        return;
      }
      const markdown = quickReply ?? event.markdown.trim();
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
        quick_reply: quickReply,
        mentions_json: JSON.stringify(mentions),
      };
      this.ctx.storage.sql.exec(
        `INSERT INTO chat_messages
         (id, username, markdown, created_at, updated_at, source_id, avatar_seed, avatar_rotation, parent_id, quick_reply, mentions_json)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
        row.id,
        row.username,
        row.markdown,
        row.created_at,
        row.updated_at,
        row.avatar_seed,
        row.avatar_rotation,
        row.parent_id,
        row.quick_reply ?? null,
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
      const page = await this.getMessages(user.username);
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
                avatar_seed, avatar_rotation, glowing, parent_id, quick_reply, mentions_json, content_type, poll_id,
                (SELECT COUNT(*) FROM chat_messages replies WHERE replies.parent_id = chat_messages.id) AS thread_count
         FROM chat_messages WHERE id = ? AND parent_id IS NULL`,
        parentId,
      ).toArray()[0];
      if (!parent) return;
      const replies = this.ctx.storage.sql.exec<SqlRow<ChatMessageRow>>(
        `SELECT id, username, markdown, created_at, updated_at, source_id,
                avatar_seed, avatar_rotation, glowing, parent_id, quick_reply, mentions_json, content_type, poll_id,
                0 AS thread_count
         FROM chat_messages WHERE parent_id = ? ORDER BY created_at, id`,
        parentId,
      ).toArray();
      const parentMessage = presentMessage(parent);
      const parentPoll = parent.poll_id ? this.getPollSnapshot(parent.poll_id, user.username) : null;
      const replyMessages = replies.map((row) => {
        const message = presentMessage(row);
        const poll = row.poll_id ? this.getPollSnapshot(row.poll_id, user.username) : null;
        return poll ? { ...message, poll } : message;
      });
      send(ws, {
        type: 'thread:messages',
        parent: parentPoll ? { ...parentMessage, poll: parentPoll } : parentMessage,
        messages: replyMessages,
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
      const page = await this.getMessages(user.username, {
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
  }

  webSocketClose(ws: WebSocket): void {
    try {
      ws.close(1000, 'Connection closed');
    } catch {
      /* The socket is already closed. */
    }
    this.broadcastPresence();
  }

  async alarm(): Promise<void> {
    await this.closeExpiredPolls();
    await this.scheduleNextPollAlarm();
  }

  private broadcastPresence(): void {
    const now = Date.now();
    const activeUsers = new Map<string, {
      username: string;
      seed: number;
      rotation: number;
      typing: boolean;
    }>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const user = attachment(ws);
      if (!user?.username) continue;
      const lastSeenAt = Number.isFinite(user.lastSeenAt) ? user.lastSeenAt : now;
      if (now - lastSeenAt > PRESENCE_TTL_MS) continue;
      const key = user.username.toLowerCase();
      const previous = activeUsers.get(key);
      activeUsers.set(key, {
        username: user.username,
        seed: user.avatarSeed,
        rotation: user.avatarRotation,
        typing: (user.typingUntil ?? 0) > now || previous?.typing === true,
      });
    }
    this.broadcast({ type: 'presence:update', participants: [...activeUsers.values()] });
  }

  private async createPoll(
    ws: WebSocket,
    user: ChatAttachment,
    event: Record<string, unknown>,
  ): Promise<void> {
    const question = typeof event.question === 'string'
      ? event.question.trim().replace(/\s+/g, ' ').slice(0, 240)
      : '';
    const rawOptions = Array.isArray(event.options) ? event.options : [];
    const options = rawOptions
      .filter((option): option is string => typeof option === 'string')
      .map((option) => option.trim().replace(/\s+/g, ' ').slice(0, 80))
      .filter(Boolean);
    const uniqueOptions = [...new Map(options.map((option) => [option.toLowerCase(), option])).values()];
    if (!question || uniqueOptions.length < 2 || uniqueOptions.length > 6) {
      send(ws, { type: 'error', message: 'Polls need a question and 2–6 different options.' });
      return;
    }

    const now = Date.now();
    const pollId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const closesAt = now + POLL_TTL_MS;
    const row: ChatMessageRow = {
      id: messageId,
      username: user.username,
      markdown: question,
      created_at: now,
      updated_at: now,
      source_id: null,
      avatar_seed: user.avatarSeed,
      avatar_rotation: user.avatarRotation,
      glowing: 0,
      parent_id: null,
      mentions_json: '[]',
      content_type: 'poll',
      poll_id: pollId,
    };
    this.ctx.storage.sql.exec(
      `INSERT INTO chat_messages
       (id, username, markdown, created_at, updated_at, source_id, avatar_seed,
        avatar_rotation, glowing, parent_id, mentions_json, content_type, poll_id)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 0, NULL, '[]', 'poll', ?)`,
      messageId,
      user.username,
      question,
      now,
      now,
      user.avatarSeed,
      user.avatarRotation,
      pollId,
    );
    this.ctx.storage.sql.exec(
      `INSERT INTO chat_polls
       (poll_id, message_id, question, options_json, created_by, closes_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      pollId,
      messageId,
      question,
      JSON.stringify(uniqueOptions),
      user.username,
      closesAt,
    );
    const poll = this.getPollSnapshot(pollId, user.username);
    this.broadcast({ type: 'message:created', message: { ...presentMessage(row), poll } });
    await this.updateInboxPreview(`Poll: ${question}`, now);
    await this.scheduleNextPollAlarm();
  }

  private async votePoll(
    ws: WebSocket,
    user: ChatAttachment,
    event: Record<string, unknown>,
  ): Promise<void> {
    const pollId = typeof event.pollId === 'string' ? event.pollId : '';
    const optionIndex = Number(event.optionIndex);
    if (!/^[0-9a-f-]{36}$/i.test(pollId) || !Number.isInteger(optionIndex)) return;
    const poll = this.ctx.storage.sql.exec<ChatPollRow>(
      'SELECT * FROM chat_polls WHERE poll_id = ?',
      pollId,
    ).toArray()[0];
    if (!poll) return;
    if (poll.closed_at !== null || poll.closes_at <= Date.now()) {
      await this.closePoll(pollId);
      send(ws, { type: 'error', message: 'This poll is closed.' });
      return;
    }
    let options: string[];
    try {
      options = JSON.parse(poll.options_json) as string[];
    } catch {
      return;
    }
    if (optionIndex < 0 || optionIndex >= options.length) return;
    const now = Date.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO chat_poll_votes (poll_id, username, option_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(poll_id, username) DO UPDATE SET
         option_index = excluded.option_index, updated_at = excluded.updated_at`,
      pollId,
      user.username,
      optionIndex,
      now,
      now,
    );
    this.broadcastPollUpdate(pollId);
  }

  private getPollSnapshot(pollId: string, username?: string): ChatPollSnapshot | null {
    const poll = this.ctx.storage.sql.exec<ChatPollRow>(
      'SELECT * FROM chat_polls WHERE poll_id = ?',
      pollId,
    ).toArray()[0];
    if (!poll) return null;
    let options: string[];
    try {
      const parsed: unknown = JSON.parse(poll.options_json);
      options = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      options = [];
    }
    const counts = Array.from({ length: options.length }, () => 0);
    const voteRows = this.ctx.storage.sql.exec<{ option_index: number; count: number }>(
      `SELECT option_index, COUNT(*) AS count FROM chat_poll_votes
       WHERE poll_id = ? GROUP BY option_index`,
      pollId,
    ).toArray();
    for (const row of voteRows) {
      if (row.option_index >= 0 && row.option_index < counts.length) counts[row.option_index] = Number(row.count);
    }
    const myVote = username
      ? this.ctx.storage.sql.exec<{ option_index: number }>(
        'SELECT option_index FROM chat_poll_votes WHERE poll_id = ? AND username = ? COLLATE NOCASE',
        pollId,
        username,
      ).toArray()[0]?.option_index ?? null
      : null;
    return {
      id: poll.poll_id,
      question: poll.question,
      options,
      voteCounts: counts,
      myVote,
      closesAt: poll.closes_at,
      closedAt: poll.closed_at,
      closed: poll.closed_at !== null || poll.closes_at <= Date.now(),
    };
  }

  private broadcastPollUpdate(pollId: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const user = attachment(ws);
      if (!user?.username) continue;
      const poll = this.getPollSnapshot(pollId, user.username);
      if (poll) send(ws, { type: 'poll:update', poll });
    }
  }

  private async closePoll(pollId: string): Promise<void> {
    const poll = this.ctx.storage.sql.exec<ChatPollRow>(
      'SELECT * FROM chat_polls WHERE poll_id = ?',
      pollId,
    ).toArray()[0];
    if (!poll || poll.closed_at !== null) return;
    const now = Date.now();
    const changed = this.ctx.storage.sql.exec(
      'UPDATE chat_polls SET closed_at = ? WHERE poll_id = ? AND closed_at IS NULL',
      now,
      pollId,
    ).rowsWritten;
    if (!changed) return;
    const source = this.ctx.storage.sql.exec<{
      username: string;
      avatar_seed: number;
      avatar_rotation: number;
    }>(
      'SELECT username, avatar_seed, avatar_rotation FROM chat_messages WHERE id = ?',
      poll.message_id,
    ).toArray()[0];
    if (source) {
      const resultId = crypto.randomUUID();
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO chat_messages
         (id, username, markdown, created_at, updated_at, source_id, avatar_seed,
          avatar_rotation, glowing, parent_id, mentions_json, content_type, poll_id)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 0, NULL, '[]', 'poll_result', ?)`,
        resultId,
        source.username,
        `Poll results: ${poll.question}`,
        now,
        now,
        source.avatar_seed,
        source.avatar_rotation,
        pollId,
      );
      const result = this.ctx.storage.sql.exec<SqlRow<ChatMessageRow>>(
        `SELECT *, 0 AS thread_count FROM chat_messages
         WHERE content_type = 'poll_result' AND poll_id = ?`,
        pollId,
      ).toArray()[0];
      const snapshot = this.getPollSnapshot(pollId);
      if (result && snapshot) {
        this.broadcast({ type: 'message:created', message: { ...presentMessage(result), poll: snapshot } });
      }
      await this.updateInboxPreview(`Poll results: ${poll.question}`, now);
    }
    this.broadcastPollUpdate(pollId);
  }

  private async closeExpiredPolls(): Promise<void> {
    const now = Date.now();
    const due = this.ctx.storage.sql.exec<{ poll_id: string }>(
      'SELECT poll_id FROM chat_polls WHERE closed_at IS NULL AND closes_at <= ?',
      now,
    ).toArray();
    for (const row of due) await this.closePoll(row.poll_id);
  }

  private async scheduleNextPollAlarm(): Promise<void> {
    const row = this.ctx.storage.sql.exec<{ next_close: number | null }>(
      'SELECT MIN(closes_at) AS next_close FROM chat_polls WHERE closed_at IS NULL',
    ).toArray()[0];
    if (row?.next_close == null) {
      await this.ctx.storage.deleteAlarm();
    } else {
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1_000, row.next_close));
    }
  }

  private async getMessages(username: string, before?: MessageCursor) {
    await this.closeExpiredPolls();
    const rows = before
      ? this.ctx.storage.sql.exec<SqlRow<ChatMessageRow>>(
        `SELECT m.id, m.username, m.markdown, m.created_at, m.updated_at, m.source_id,
                m.avatar_seed, m.avatar_rotation, m.glowing, m.parent_id, m.mentions_json,
                m.content_type, m.poll_id,
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
                m.content_type, m.poll_id,
                (SELECT COUNT(*) FROM chat_messages replies WHERE replies.parent_id = m.id) AS thread_count
         FROM chat_messages m WHERE m.parent_id IS NULL ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
        HISTORY_PAGE_SIZE + 1,
      ).toArray();
    const hasOlder = rows.length > HISTORY_PAGE_SIZE;
    const pageRows = rows.slice(0, HISTORY_PAGE_SIZE);
    const oldest = pageRows.at(-1);
    const parentIds = pageRows.map((row) => row.id);
    const quickRepliesByParent = new Map<string, Array<{ id: string; username: string; quickReply: string }>>();
    if (parentIds.length) {
      const quickReplyRows = this.ctx.storage.sql.exec<SqlRow<ChatMessageRow>>(
        `SELECT id, username, parent_id, quick_reply
         FROM chat_messages WHERE quick_reply IS NOT NULL AND parent_id IN (${parentIds.map(() => '?').join(', ')})
         ORDER BY created_at, id`,
        ...parentIds,
      ).toArray();
      for (const reply of quickReplyRows) {
        if (!reply.parent_id || !reply.quick_reply) continue;
        const collection = quickRepliesByParent.get(reply.parent_id) ?? [];
        collection.push({ id: reply.id, username: reply.username, quickReply: reply.quick_reply });
        quickRepliesByParent.set(reply.parent_id, collection);
      }
    }
    const messages = pageRows.reverse().map((row) => {
      const message = presentMessage(row);
      const poll = row.poll_id ? this.getPollSnapshot(row.poll_id, username) : null;
      return {
        ...message,
        quickReplies: quickRepliesByParent.get(row.id) ?? [],
        ...(poll ? { poll } : {}),
      };
    });
    return {
      messages,
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
