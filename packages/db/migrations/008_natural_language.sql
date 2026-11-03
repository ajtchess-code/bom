CREATE TABLE IF NOT EXISTS assistant_conversation_context (
  guild_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  system TEXT NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(guild_id,actor_id,system)
);
CREATE INDEX IF NOT EXISTS idx_assistant_context_expiry ON assistant_conversation_context(expires_at);

CREATE TABLE IF NOT EXISTS assistant_user_preferences (
  guild_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'auto',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id,actor_id)
);

CREATE TABLE IF NOT EXISTS wiki_discount_presets (
  guild_id TEXT NOT NULL,
  preset_no INTEGER NOT NULL CHECK(preset_no BETWEEN 1 AND 8),
  label TEXT NOT NULL,
  description TEXT,
  modifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  PRIMARY KEY(guild_id,preset_no)
);
