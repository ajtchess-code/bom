-- Discord presentation and delivery state for the Port Battle workspace.
-- The old Python AAR/archive/voice-role workflow is intentionally not recreated.
CREATE TABLE IF NOT EXISTS pb_discord_settings (
  guild_id text PRIMARY KEY,
  signup_channel_id text,
  roster_channel_id text,
  schedule_channel_id text,
  manager_role_id text,
  signup_role_id text,
  schedule_message_id text,
  enabled boolean NOT NULL DEFAULT TRUE,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE pb_battles ADD COLUMN IF NOT EXISTS discord_signup_channel_id text;
ALTER TABLE pb_battles ADD COLUMN IF NOT EXISTS discord_roster_channel_id text;
ALTER TABLE pb_battles ADD COLUMN IF NOT EXISTS last_discord_sync_at timestamptz;

ALTER TABLE pb_assignment_events ADD COLUMN IF NOT EXISTS notified_at timestamptz;
ALTER TABLE pb_assignment_events ADD COLUMN IF NOT EXISTS notification_error text;

CREATE TABLE IF NOT EXISTS pb_reminder_deliveries (
  battle_id uuid NOT NULL REFERENCES pb_battles(id) ON DELETE CASCADE,
  signup_id uuid NOT NULL REFERENCES pb_signups(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  minutes_before integer NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivery_error text,
  PRIMARY KEY(battle_id,signup_id,minutes_before)
);
CREATE INDEX IF NOT EXISTS pb_reminder_deliveries_battle_idx ON pb_reminder_deliveries(battle_id,delivered_at DESC);
