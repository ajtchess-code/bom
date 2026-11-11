-- New Player Guide progress: which wiki chapters each member has marked as read.
CREATE TABLE IF NOT EXISTS wiki_reading_progress (
  guild_id text NOT NULL,
  user_id text NOT NULL,
  slug text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id,user_id,slug)
);
CREATE INDEX IF NOT EXISTS wiki_reading_progress_slug_idx ON wiki_reading_progress(guild_id,slug);
