-- Channel-manager and anchor configuration for closed-by-default temporary voice rooms.
ALTER TABLE voice_automation_rules ADD COLUMN IF NOT EXISTS manager_role_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE voice_automation_rules ADD COLUMN IF NOT EXISTS position_above_channel_id text;
