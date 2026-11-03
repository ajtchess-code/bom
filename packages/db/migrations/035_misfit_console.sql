ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS music_console_message_id text;
CREATE TABLE IF NOT EXISTS bot_branding_state(guild_id text PRIMARY KEY,avatar_sha text NOT NULL);
