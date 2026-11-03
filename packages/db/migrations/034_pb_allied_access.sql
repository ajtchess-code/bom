ALTER TABLE pb_battles ADD COLUMN IF NOT EXISTS signup_guild text NOT NULL DEFAULT 'BOM';
ALTER TABLE pb_discord_settings ADD COLUMN IF NOT EXISTS schedule_message_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE pb_discord_settings ADD COLUMN IF NOT EXISTS duty_emojis jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS pb_battles_signup_guild ON pb_battles(guild_id,signup_guild);
