-- Shared document access and one pinned document per chat room.
CREATE TABLE IF NOT EXISTS collab_document_permissions (
  document_type TEXT NOT NULL,
  document_id TEXT NOT NULL,
  username TEXT NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('view', 'edit')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_type, document_id, username)
);

CREATE INDEX IF NOT EXISTS collab_document_permissions_user_idx
  ON collab_document_permissions (username, updated_at DESC);

CREATE TABLE IF NOT EXISTS collab_mindmaps (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  owner TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_pinned_documents (
  room_id TEXT PRIMARY KEY,
  document_type TEXT NOT NULL CHECK (document_type IN ('sheet', 'mindmap')),
  document_id TEXT NOT NULL,
  pinned_by TEXT NOT NULL,
  pinned_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO collab_document_permissions
  (document_type, document_id, username, permission, updated_at)
SELECT 'sheet', id, owner, 'edit', updated_at
FROM collaborative_sheets;

INSERT OR IGNORE INTO collab_document_permissions
  (document_type, document_id, username, permission, updated_at)
SELECT 'sheet', sheet_id, username, 'edit', joined_at
FROM collaborative_sheet_members;
