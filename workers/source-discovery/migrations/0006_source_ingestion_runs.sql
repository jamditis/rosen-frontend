CREATE TABLE source_ingestion_runs (
  source_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('published', 'no_change', 'failed')),
  canonical_commit TEXT NOT NULL,
  release_version TEXT NOT NULL,
  captured_count INTEGER NOT NULL CHECK (captured_count >= 0),
  admitted_count INTEGER NOT NULL CHECK (admitted_count >= 0),
  context_only_count INTEGER NOT NULL CHECK (context_only_count >= 0),
  added_count INTEGER NOT NULL CHECK (added_count >= 0),
  updated_count INTEGER NOT NULL CHECK (updated_count >= 0),
  version_count INTEGER NOT NULL CHECK (version_count >= 0),
  source_latest_at TEXT,
  error_class TEXT,
  PRIMARY KEY (source_id, run_id)
) STRICT;

CREATE INDEX source_ingestion_checked_index
  ON source_ingestion_runs (source_id, checked_at DESC);
