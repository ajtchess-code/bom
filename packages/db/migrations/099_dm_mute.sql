CREATE TABLE IF NOT EXISTS bot_dm_mutes (
  user_id text PRIMARY KEY,
  muted_until timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
