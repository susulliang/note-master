CREATE TABLE IF NOT EXISTS test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  suite_id TEXT NOT NULL,
  suite_label TEXT NOT NULL,
  score_pct REAL NOT NULL,
  correct INTEGER NOT NULL,
  total INTEGER NOT NULL,
  report TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_test_results_submitted_at
  ON test_results(submitted_at DESC, id DESC);
