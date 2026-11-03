-- BOM Sentinel natural-language and channel readiness settings.
ALTER TABLE sentinel_settings ADD COLUMN IF NOT EXISTS passive_qa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sentinel_settings ADD COLUMN IF NOT EXISTS passive_qa_channel_id TEXT;
CREATE INDEX IF NOT EXISTS sentinel_restore_webhooks_channel_health ON sentinel_restore_webhooks(guild_id,channel_id,updated_at DESC);
