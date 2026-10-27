import { DurableObject } from 'cloudflare:workers';

interface StickerRow {
  id: string;
  owner: string;
  name: string;
  png: ArrayBuffer;
  created_at: number;
}

interface StickerMetaRow {
  id: string;
  owner: string;
  name: string;
  created_at: number;
}

type SqlRow<T extends object> = T & Record<string, SqlStorageValue>;

export interface ChatStickerMetadata {
  id: string;
  owner: string;
  name: string;
  createdAt: number;
}

export class ChatStickerPack extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS chat_stickers (
          id TEXT PRIMARY KEY,
          owner TEXT NOT NULL,
          name TEXT NOT NULL,
          png BLOB NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(
        'CREATE INDEX IF NOT EXISTS chat_stickers_created_idx ON chat_stickers (created_at DESC)',
      );
    });
  }

  async addSticker(id: string, owner: string, name: string, png: ArrayBuffer): Promise<ChatStickerMetadata> {
    const createdAt = Date.now();
    this.ctx.storage.sql.exec(
      'INSERT INTO chat_stickers (id, owner, name, png, created_at) VALUES (?, ?, ?, ?, ?)',
      id,
      owner,
      name,
      png,
      createdAt,
    );
    return { id, owner, name, createdAt };
  }

  async listStickers(): Promise<ChatStickerMetadata[]> {
    return this.ctx.storage.sql
      .exec<SqlRow<StickerMetaRow>>(
        'SELECT id, owner, name, created_at FROM chat_stickers ORDER BY created_at DESC LIMIT 200',
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        owner: row.owner,
        name: row.name,
        createdAt: row.created_at,
      }));
  }

  async getSticker(id: string): Promise<StickerRow | null> {
    return this.ctx.storage.sql
      .exec<SqlRow<StickerRow>>(
        'SELECT id, owner, name, png, created_at FROM chat_stickers WHERE id = ? LIMIT 1',
        id,
      )
      .toArray()[0] ?? null;
  }
}
