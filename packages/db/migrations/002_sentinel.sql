CREATE TABLE IF NOT EXISTS sentinel_events (
 id UUID PRIMARY KEY, guild_id TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 source TEXT NOT NULL, category TEXT NOT NULL, action TEXT NOT NULL,
 actor_id TEXT, target_id TEXT, channel_id TEXT, correlation_id TEXT,
 caused_by_event_id UUID, outcome TEXT NOT NULL DEFAULT 'observed',
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
 CONSTRAINT sentinel_metadata_object CHECK (jsonb_typeof(metadata)='object')
);
CREATE INDEX IF NOT EXISTS sentinel_events_guild_time ON sentinel_events(guild_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS sentinel_events_action_time ON sentinel_events(guild_id,action,occurred_at DESC);
CREATE INDEX IF NOT EXISTS sentinel_events_actor_time ON sentinel_events(guild_id,actor_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS sentinel_events_target_time ON sentinel_events(guild_id,target_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS sentinel_events_channel_time ON sentinel_events(guild_id,channel_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS sentinel_events_correlation ON sentinel_events(guild_id,correlation_id);
CREATE TABLE IF NOT EXISTS sentinel_snapshots (
 id UUID PRIMARY KEY, guild_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 kind TEXT NOT NULL, state JSONB NOT NULL, sha256 TEXT NOT NULL,
 created_by TEXT, status TEXT NOT NULL DEFAULT 'verified'
);
CREATE INDEX IF NOT EXISTS sentinel_snapshots_time ON sentinel_snapshots(guild_id,created_at DESC);
CREATE TABLE IF NOT EXISTS sentinel_restore_jobs (
 id UUID PRIMARY KEY, guild_id TEXT NOT NULL, requested_by TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), target_type TEXT NOT NULL,
 target_id TEXT, snapshot_id UUID REFERENCES sentinel_snapshots(id),
 plan JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'preview',
 CONSTRAINT sentinel_restore_status CHECK(status IN ('preview','approved','running','complete','failed','cancelled'))
);
