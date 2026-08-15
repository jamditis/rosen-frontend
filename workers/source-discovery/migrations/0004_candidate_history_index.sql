CREATE INDEX discovery_candidates_source_seen_index
  ON discovery_candidates (source_id, last_seen_at DESC);
