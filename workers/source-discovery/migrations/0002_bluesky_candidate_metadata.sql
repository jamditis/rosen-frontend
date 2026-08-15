ALTER TABLE discovery_candidates ADD COLUMN content_id TEXT;

ALTER TABLE discovery_candidates ADD COLUMN post_type TEXT
  CHECK (post_type IS NULL OR post_type IN (
    'original_post', 'reply', 'quote_post', 'repost', 'thread_entry'
  ));

ALTER TABLE discovery_candidates ADD COLUMN root_id TEXT;

ALTER TABLE discovery_candidates ADD COLUMN parent_id TEXT;
