-- Knowledge-base documents (D1 first line; bundled blobs stay as client fallback).
-- Self-healing copies of this schema also live in worker/kb.ts handlers.

CREATE TABLE IF NOT EXISTS kb_documents (
  kind TEXT NOT NULL,          -- 'faq' | 'product' | 'gbu' | 'app_update' | 'firmware_update'
  id TEXT NOT NULL,            -- document id (file stem / sheet stem / slug)
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '', -- full markdown document
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, id)
);

-- Tombstones so clients can hide the matching prepackaged bundled blob
-- after an admin deletes a document.
CREATE TABLE IF NOT EXISTS kb_deletions (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, id)
);

CREATE INDEX IF NOT EXISTS idx_kb_documents_kind ON kb_documents(kind);
