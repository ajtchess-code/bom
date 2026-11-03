-- Restart-safety / Sentinel maintenance support.
-- These indexes match the background retention predicates so archive cleanup
-- stays cheap as Sentinel history grows.
CREATE INDEX IF NOT EXISTS sentinel_messages_guild_created_time
  ON sentinel_messages(guild_id,created_at);

CREATE INDEX IF NOT EXISTS sentinel_assets_guild_last_seen
  ON sentinel_assets(guild_id,last_seen_at);
