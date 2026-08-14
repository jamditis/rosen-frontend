CREATE TABLE discovery_source_state (
  source_id TEXT PRIMARY KEY,
  etag TEXT,
  last_modified TEXT,
  last_checked_at TEXT NOT NULL,
  last_success_at TEXT,
  last_status TEXT NOT NULL
) STRICT;

CREATE TABLE discovery_runs (
  run_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  source_count INTEGER NOT NULL CHECK (source_count >= 0),
  candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  outcome TEXT NOT NULL CHECK (outcome IN ('running', 'completed', 'failed'))
) STRICT;

CREATE TABLE discovery_candidates (
  source_id TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  external_timestamp TEXT,
  etag TEXT,
  fingerprint TEXT,
  latest_run_id TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (review_status IN ('pending_review', 'accepted', 'rejected')),
  PRIMARY KEY (source_id, canonical_url)
) STRICT;

CREATE INDEX discovery_candidates_review_index
  ON discovery_candidates (review_status, first_seen_at);
