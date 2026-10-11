CREATE TABLE IF NOT EXISTS keyword_alerts (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL,
  alert TEXT NOT NULL,
  content_format TEXT NOT NULL CHECK (content_format IN ('markdown', 'html')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS keyword_alert_login_attempts (
  ip_hash TEXT PRIMARY KEY,
  window_started INTEGER NOT NULL,
  failures INTEGER NOT NULL
);
