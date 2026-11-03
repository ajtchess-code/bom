-- BOM Banter: deliberately separate optional AI personality from Wiki/Sentinel.
-- No historic messages, message contents, or personal dossiers are stored.
CREATE TABLE IF NOT EXISTS bom_banter_settings (
  guild_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  spontaneous_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  roast_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  aggression INTEGER NOT NULL DEFAULT 9 CHECK (aggression BETWEEN 1 AND 10),
  spontaneity INTEGER NOT NULL DEFAULT 5 CHECK (spontaneity BETWEEN 0 AND 30),
  channel_cooldown_minutes INTEGER NOT NULL DEFAULT 45 CHECK (channel_cooldown_minutes BETWEEN 5 AND 240),
  daily_spontaneous_limit INTEGER NOT NULL DEFAULT 12 CHECK (daily_spontaneous_limit BETWEEN 0 AND 100),
  daily_total_limit INTEGER NOT NULL DEFAULT 80 CHECK (daily_total_limit BETWEEN 1 AND 500),
  context_messages INTEGER NOT NULL DEFAULT 12 CHECK (context_messages BETWEEN 3 AND 20),
  spontaneous_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  excluded_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  excluded_role_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_instructions TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS bom_banter_activity (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('mention','reply','spontaneous','roast')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bom_banter_activity_recent ON bom_banter_activity(guild_id,created_at DESC);
