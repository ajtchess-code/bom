-- Ensure sentinel_events has expires_at even on databases created/repaired by 033_sentinel_schema_repair.sql
ALTER TABLE sentinel_events ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_sentinel_events_expires_at ON sentinel_events(guild_id, expires_at) WHERE expires_at IS NOT NULL;
