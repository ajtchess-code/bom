-- Dashboard Experience v3.3: durable user preferences, favorites, recents and notification read state.
CREATE TABLE IF NOT EXISTS dashboard_user_preferences (
  guild_id text NOT NULL,
  user_id text NOT NULL,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id,user_id)
);

CREATE TABLE IF NOT EXISTS dashboard_favorites (
  guild_id text NOT NULL,
  user_id text NOT NULL,
  kind text NOT NULL,
  item_key text NOT NULL,
  label text NOT NULL,
  href text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id,user_id,kind,item_key)
);
CREATE INDEX IF NOT EXISTS dashboard_favorites_user_idx ON dashboard_favorites(guild_id,user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS dashboard_recents (
  guild_id text NOT NULL,
  user_id text NOT NULL,
  kind text NOT NULL,
  item_key text NOT NULL,
  label text NOT NULL,
  href text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  view_count integer NOT NULL DEFAULT 1,
  last_viewed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id,user_id,kind,item_key)
);
CREATE INDEX IF NOT EXISTS dashboard_recents_user_idx ON dashboard_recents(guild_id,user_id,last_viewed_at DESC);

CREATE TABLE IF NOT EXISTS dashboard_notification_reads (
  guild_id text NOT NULL,
  user_id text NOT NULL,
  notification_key text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id,user_id,notification_key)
);
CREATE INDEX IF NOT EXISTS dashboard_notification_reads_user_idx ON dashboard_notification_reads(guild_id,user_id,read_at DESC);
