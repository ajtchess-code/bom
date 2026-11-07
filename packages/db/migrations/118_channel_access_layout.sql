-- One-time private channel access layouts (apps/controller/src/channelAccessLayout.ts).
CREATE TABLE IF NOT EXISTS channel_layout_runs(
  layout_key text NOT NULL,
  guild_id text NOT NULL,
  completed_at timestamptz,
  changed integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(layout_key,guild_id)
);
-- Each channel's permission overwrites before a layout was applied, for rollback.
CREATE TABLE IF NOT EXISTS channel_layout_backups(
  layout_key text NOT NULL,
  guild_id text NOT NULL,
  channel_id text NOT NULL,
  channel_name text,
  overwrites jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(layout_key,channel_id)
);
