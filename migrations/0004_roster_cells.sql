-- Roster cells — per-cell storage for the monthly shift rosters.
-- month_key: 'YYYY-MM' · en: agent English name · iso: 'YYYY-MM-DD' · code: shift code.
-- Written by the Shifts workspace (admin logins) via POST /api/roster:
-- the first submit for a month uploads the entire table, subsequent edits
-- upsert single cells.
CREATE TABLE IF NOT EXISTS roster_cells (
  month_key TEXT NOT NULL,
  en TEXT NOT NULL,
  iso TEXT NOT NULL,
  code TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (month_key, en, iso)
);
CREATE INDEX IF NOT EXISTS idx_roster_cells_month ON roster_cells(month_key);
