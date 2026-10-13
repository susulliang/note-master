-- Auth users + sessions for the note-master account system.
-- Applied to the eco-data D1 database via `wrangler d1 migrations apply eco-data --remote`.

CREATE TABLE IF NOT EXISTS auth_users (
  username TEXT PRIMARY KEY,          -- exact display name (roster en alias / Yolanda / Jingyang / Troy / Dezzy)
  hash TEXT NOT NULL,                 -- "pbkdf2-sha256$100000$<salt_b64>$<hash_b64>" (same scheme as the alert admin hash)
  is_admin INTEGER NOT NULL DEFAULT 0,
  dash_visible INTEGER NOT NULL DEFAULT 1,
  roster_visible INTEGER NOT NULL DEFAULT 1,
  trak_visible INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,        -- unix ms
  updated_at INTEGER NOT NULL         -- unix ms
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,             -- 128-bit random, base64url
  username TEXT NOT NULL,
  expires_at INTEGER NOT NULL,        -- unix ms
  created_at INTEGER NOT NULL         -- unix ms
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_username
  ON auth_sessions(username);
