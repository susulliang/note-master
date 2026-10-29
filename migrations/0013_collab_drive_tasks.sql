-- Team Drive metadata, folders, task tracking, and task mention indexing.
CREATE TABLE IF NOT EXISTS collab_drive_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('team', 'personal')),
  owner TEXT NOT NULL,
  parent_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS collab_drive_folders_parent_idx
  ON collab_drive_folders (scope, parent_id, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS collab_drive_files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('team', 'personal')),
  owner TEXT NOT NULL,
  folder_id TEXT,
  object_key TEXT NOT NULL,
  text_index TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS collab_drive_files_folder_idx
  ON collab_drive_files (scope, folder_id, name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS collab_drive_files_owner_idx
  ON collab_drive_files (scope, owner COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS collab_drive_upload_reservations (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS collab_drive_upload_reservations_user_idx
  ON collab_drive_upload_reservations (username, created_at);

CREATE TABLE IF NOT EXISTS collab_drive_file_shares (
  file_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  shared_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (file_id, room_id)
);

CREATE INDEX IF NOT EXISTS collab_drive_file_shares_room_idx
  ON collab_drive_file_shares (room_id, file_id);

CREATE TABLE IF NOT EXISTS collab_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL CHECK (scope IN ('personal', 'team')),
  owner TEXT NOT NULL,
  assignee TEXT NOT NULL,
  due_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS collab_tasks_owner_idx
  ON collab_tasks (owner, updated_at DESC);

CREATE INDEX IF NOT EXISTS collab_tasks_assignee_idx
  ON collab_tasks (assignee, due_at);

CREATE INDEX IF NOT EXISTS collab_tasks_team_idx
  ON collab_tasks (scope, due_at, completed_at);

CREATE TABLE IF NOT EXISTS collab_task_mentions (
  task_id TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, username)
);

CREATE INDEX IF NOT EXISTS collab_task_mentions_user_idx
  ON collab_task_mentions (username, created_at DESC);

CREATE TABLE IF NOT EXISTS collab_notifications (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  target_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);

CREATE INDEX IF NOT EXISTS collab_notifications_user_idx
  ON collab_notifications (username, read_at, created_at DESC);
