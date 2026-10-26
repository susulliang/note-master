CREATE TABLE IF NOT EXISTS saved_ticket_notes (
  id TEXT PRIMARY KEY,
  note_text TEXT NOT NULL,
  issue_type TEXT NOT NULL DEFAULT '',
  solved INTEGER NOT NULL DEFAULT 0 CHECK (solved IN (0, 1)),
  pushed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saved_ticket_notes_issue_pushed
  ON saved_ticket_notes(issue_type, pushed_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_ticket_notes_pushed
  ON saved_ticket_notes(pushed_at DESC, id DESC);
