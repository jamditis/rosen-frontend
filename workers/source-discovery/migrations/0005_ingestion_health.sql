CREATE TABLE archive_ingestion_runs (
  run_id TEXT PRIMARY KEY,
  checked_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('published', 'no_change', 'failed')),
  canonical_commit TEXT NOT NULL,
  release_version TEXT NOT NULL,
  captured_count INTEGER NOT NULL CHECK (captured_count >= 0),
  admitted_count INTEGER NOT NULL CHECK (admitted_count >= 0),
  context_only_count INTEGER NOT NULL CHECK (context_only_count >= 0),
  source_latest_at TEXT,
  error_class TEXT
) STRICT;

CREATE INDEX archive_ingestion_checked_index
  ON archive_ingestion_runs (checked_at DESC);
