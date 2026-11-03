-- v4.1.0 Dashboard and Port Battle planner refresh

CREATE TABLE IF NOT EXISTS dashboard_action_usage(
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action_key TEXT NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id,user_id,action_key)
);

CREATE TABLE IF NOT EXISTS member_card_ids(
  member_no BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(guild_id,user_id)
);

ALTER TABLE pb_preferred_profiles ADD COLUMN IF NOT EXISTS horn_capable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pb_preferred_profiles ADD COLUMN IF NOT EXISTS horn_requirements_ack BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE pb_discord_settings ADD COLUMN IF NOT EXISTS preferred_ship_catalog JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pb_discord_settings ADD COLUMN IF NOT EXISTS default_ship_targets JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pb_discord_settings ADD COLUMN IF NOT EXISTS guild_catalog JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE pb_discord_settings ADD COLUMN IF NOT EXISTS game_time_offset_minutes INTEGER NOT NULL DEFAULT 60;

CREATE TABLE IF NOT EXISTS pb_tactical_briefs(
  id UUID PRIMARY KEY,
  guild_id TEXT NOT NULL,
  battle_id UUID NOT NULL,
  role_key TEXT NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT,
  port_name TEXT,
  map_key TEXT,
  drawing JSONB NOT NULL DEFAULT '[]'::jsonb,
  revision INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(guild_id,battle_id,role_key)
);

CREATE TABLE IF NOT EXISTS pb_tactical_dispatches(
  id UUID PRIMARY KEY,
  guild_id TEXT NOT NULL,
  battle_id UUID NOT NULL,
  role_key TEXT NOT NULL,
  brief_id UUID REFERENCES pb_tactical_briefs(id) ON DELETE SET NULL,
  requested_by TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  delivered_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pb_tactical_dispatches_queue_idx ON pb_tactical_dispatches(status,created_at);
