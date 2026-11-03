-- Moderated guild-expression requests (emoji, animated emoji, sticker, soundboard)
CREATE TABLE IF NOT EXISTS guild_media_requests (
 id UUID PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK (kind IN ('EMOJI','ANIMATED_EMOJI','STICKER','SOUNDBOARD')),
 name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '',
 mime TEXT NOT NULL, content BYTEA, status TEXT NOT NULL DEFAULT 'PENDING'
 CHECK (status IN ('PENDING','PROCESSING','APPROVED','DECLINED')),
 reviewer_id TEXT, reviewer_note TEXT, discord_asset_id TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS guild_media_requests_queue ON guild_media_requests (guild_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS guild_media_requests_member ON guild_media_requests (guild_id,user_id,created_at DESC);
