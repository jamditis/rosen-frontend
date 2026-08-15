CREATE TABLE discovery_origin_state (
  origin TEXT PRIMARY KEY,
  backoff_until TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0
    CHECK (consecutive_failures >= 0),
  last_checked_at TEXT NOT NULL,
  last_status TEXT NOT NULL
) STRICT;
