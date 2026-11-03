-- v3.9.1: Welcome role action + persistent Port Battle channel surfaces.
ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS trade_role_id text;

ALTER TABLE pb_discord_settings ADD COLUMN IF NOT EXISTS signup_landing_message_id text;
ALTER TABLE pb_discord_settings ADD COLUMN IF NOT EXISTS signup_index_message_id text;
ALTER TABLE pb_discord_settings ADD COLUMN IF NOT EXISTS roster_landing_message_id text;
ALTER TABLE pb_discord_settings ADD COLUMN IF NOT EXISTS roster_index_message_id text;
