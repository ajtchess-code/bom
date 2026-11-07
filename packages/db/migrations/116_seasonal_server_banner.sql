-- Seasonal server banner, uploaded once per artwork change.
ALTER TABLE bot_branding_state ADD COLUMN IF NOT EXISTS guild_banner_sha text;
