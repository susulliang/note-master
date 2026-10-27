-- Collaborative spreadsheet metadata and per-sheet membership.
CREATE TABLE IF NOT EXISTS collaborative_sheets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  owner TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS collaborative_sheet_members (
  sheet_id TEXT NOT NULL,
  username TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (sheet_id, username)
);

CREATE INDEX IF NOT EXISTS collaborative_sheet_members_user_idx
  ON collaborative_sheet_members (username, joined_at DESC);
