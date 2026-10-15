-- Spice credit system + store for the note-master account system.
-- Applied to the eco-data D1 database via `wrangler d1 migrations apply eco-data --remote`.

-- Per-user spice balance (starts at 0; +1 per login, +3/5/10 per QA tier).
ALTER TABLE auth_users ADD COLUMN spice INTEGER NOT NULL DEFAULT 0;

-- Append-only audit trail of every spice movement (login / qa / store).
CREATE TABLE IF NOT EXISTS spice_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  delta INTEGER NOT NULL,           -- positive = earned, negative = spent
  reason TEXT NOT NULL,             -- 'login' | 'qa' | 'store'
  detail TEXT,                      -- e.g. 'qa:85' or product name
  created_at INTEGER NOT NULL       -- unix ms
);
CREATE INDEX IF NOT EXISTS idx_spice_ledger_username
  ON spice_ledger(username, reason, created_at);

-- Store products launched by admins (virtual items, e.g. "Cat food").
CREATE TABLE IF NOT EXISTS store_products (
  id TEXT PRIMARY KEY,              -- crypto random uuid
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🎁',
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,           -- spice units, >= 1
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,      -- unix ms
  updated_at INTEGER NOT NULL       -- unix ms
);

-- Purchase history (one row per successful checkout).
CREATE TABLE IF NOT EXISTS store_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  price INTEGER NOT NULL,
  created_at INTEGER NOT NULL       -- unix ms
);
CREATE INDEX IF NOT EXISTS idx_store_purchases_username
  ON store_purchases(username, created_at);
