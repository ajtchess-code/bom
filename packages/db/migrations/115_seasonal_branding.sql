-- Seasonal bot persona: also track the server icon so it is uploaded once per artwork change.
ALTER TABLE bot_branding_state ADD COLUMN IF NOT EXISTS guild_icon_sha text;
