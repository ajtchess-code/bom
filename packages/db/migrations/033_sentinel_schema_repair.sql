-- The supplied fresh-install snapshot omitted Sentinel's historical schema migrations.
-- Add missing tables without replacing existing audit data or configuration.
CREATE TABLE IF NOT EXISTS sentinel_settings (
 guild_id TEXT PRIMARY KEY,enabled BOOLEAN NOT NULL DEFAULT TRUE,
 message_archive_enabled BOOLEAN NOT NULL DEFAULT TRUE,media_archive_enabled BOOLEAN NOT NULL DEFAULT TRUE,
 backup_interval_minutes INTEGER NOT NULL DEFAULT 360,standard_retention_days INTEGER NOT NULL DEFAULT 90,
 message_retention_days INTEGER NOT NULL DEFAULT 90,security_retention_days INTEGER NOT NULL DEFAULT 365,
 technical_retention_days INTEGER NOT NULL DEFAULT 30,restore_marker_enabled BOOLEAN NOT NULL DEFAULT TRUE,
 webhook_pool_enabled BOOLEAN NOT NULL DEFAULT FALSE,passive_qa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 passive_qa_channel_id TEXT,updated_by TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sentinel_events (
 id UUID PRIMARY KEY,guild_id TEXT NOT NULL,occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 source TEXT NOT NULL,category TEXT NOT NULL,action TEXT NOT NULL,actor_id TEXT,initiator_id TEXT,executor_id TEXT,
 target_id TEXT,channel_id TEXT,correlation_id TEXT,caused_by_event_id UUID,outcome TEXT NOT NULL DEFAULT 'observed',
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb,before_state JSONB,after_state JSONB,source_event_key TEXT,
 attribution_confidence TEXT NOT NULL DEFAULT 'observed',reversible BOOLEAN NOT NULL DEFAULT FALSE,severity TEXT NOT NULL DEFAULT 'info'
);
CREATE UNIQUE INDEX IF NOT EXISTS sentinel_event_source_key ON sentinel_events(guild_id,source,source_event_key) WHERE source_event_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS sentinel_event_guild_time ON sentinel_events(guild_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS sentinel_event_target_action ON sentinel_events(guild_id,target_id,action,occurred_at DESC);
CREATE INDEX IF NOT EXISTS sentinel_event_channel_time ON sentinel_events(guild_id,channel_id,occurred_at DESC);
CREATE TABLE IF NOT EXISTS sentinel_source_health (
 guild_id TEXT NOT NULL,source TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'unknown',last_event_at TIMESTAMPTZ,
 last_success_at TIMESTAMPTZ,last_error_at TIMESTAMPTZ,last_error TEXT,dropped_events BIGINT NOT NULL DEFAULT 0,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,source)
);
CREATE TABLE IF NOT EXISTS sentinel_access_current (
 guild_id TEXT NOT NULL,member_id TEXT NOT NULL,channel_id TEXT NOT NULL,can_view BOOLEAN NOT NULL,can_send BOOLEAN NOT NULL,
 role_ids JSONB NOT NULL DEFAULT '[]'::jsonb,last_event_id UUID,computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(guild_id,member_id,channel_id)
);
CREATE TABLE IF NOT EXISTS sentinel_access_changes (
 id UUID PRIMARY KEY,guild_id TEXT NOT NULL,member_id TEXT NOT NULL,channel_id TEXT NOT NULL,
 before_view BOOLEAN NOT NULL,after_view BOOLEAN NOT NULL,before_send BOOLEAN NOT NULL,after_send BOOLEAN NOT NULL,
 before_roles JSONB NOT NULL DEFAULT '[]'::jsonb,after_roles JSONB NOT NULL DEFAULT '[]'::jsonb,event_id UUID,occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sentinel_access_change_lookup ON sentinel_access_changes(guild_id,member_id,channel_id,occurred_at DESC);
CREATE TABLE IF NOT EXISTS sentinel_assets (
 id UUID PRIMARY KEY,guild_id TEXT NOT NULL,sha256 TEXT NOT NULL,asset_kind TEXT NOT NULL,mime_type TEXT,file_name TEXT,
 size_bytes BIGINT NOT NULL DEFAULT 0,width INTEGER,height INTEGER,external_url TEXT,provider TEXT,provider_key TEXT,title TEXT,
 data BYTEA,metadata JSONB NOT NULL DEFAULT '{}'::jsonb,ref_count BIGINT NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sentinel_asset_hash ON sentinel_assets(guild_id,sha256);
CREATE TABLE IF NOT EXISTS sentinel_messages (
 message_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,thread_id TEXT,author_id TEXT,author_username TEXT,
 author_display_name TEXT,author_avatar_url TEXT,webhook_id TEXT,content TEXT NOT NULL DEFAULT '',content_sha256 TEXT,
 embeds JSONB NOT NULL DEFAULT '[]'::jsonb,components JSONB NOT NULL DEFAULT '[]'::jsonb,stickers JSONB NOT NULL DEFAULT '[]'::jsonb,
 referenced_message_id TEXT,created_at TIMESTAMPTZ,edited_at TIMESTAMPTZ,deleted_at TIMESTAMPTZ,last_event_id UUID,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb,archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),restore_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sentinel_message_channel_time ON sentinel_messages(guild_id,channel_id,created_at DESC);
CREATE TABLE IF NOT EXISTS sentinel_message_revisions (
 id UUID PRIMARY KEY,message_id TEXT NOT NULL,event_id UUID,revision_type TEXT NOT NULL,content TEXT,
 embeds JSONB NOT NULL DEFAULT '[]'::jsonb,components JSONB NOT NULL DEFAULT '[]'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sentinel_message_assets (
 message_id TEXT NOT NULL,asset_id UUID NOT NULL,position INTEGER NOT NULL DEFAULT 0,attachment_id TEXT,original_url TEXT,description TEXT,
 PRIMARY KEY(message_id,asset_id)
);
CREATE TABLE IF NOT EXISTS sentinel_emoji_assets (
 guild_id TEXT NOT NULL,emoji_id TEXT NOT NULL,name TEXT NOT NULL,animated BOOLEAN NOT NULL DEFAULT FALSE,asset_id UUID,
 last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,emoji_id)
);
CREATE TABLE IF NOT EXISTS sentinel_backfill_state (
 guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',before_id TEXT,archived_count BIGINT NOT NULL DEFAULT 0,
 last_error TEXT,oldest_message_at TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,channel_id)
);
CREATE TABLE IF NOT EXISTS sentinel_snapshots (
 id UUID PRIMARY KEY,guild_id TEXT NOT NULL,kind TEXT NOT NULL,state JSONB NOT NULL,sha256 TEXT NOT NULL,created_by TEXT,
 status TEXT NOT NULL DEFAULT 'verified',scope JSONB NOT NULL DEFAULT '{}'::jsonb,size_bytes BIGINT NOT NULL DEFAULT 0,
 verified_at TIMESTAMPTZ,verification_error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sentinel_restore_jobs (
 id UUID PRIMARY KEY,guild_id TEXT NOT NULL,plan JSONB NOT NULL,requested_by TEXT,snapshot_id UUID,status TEXT NOT NULL DEFAULT 'preview',
 target_id TEXT,target_type TEXT,approved_by TEXT,approved_at TIMESTAMPTZ,started_at TIMESTAMPTZ,completed_at TIMESTAMPTZ,
 pre_restore_snapshot_id UUID,result JSONB,error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sentinel_resource_map (
 guild_id TEXT NOT NULL,resource_type TEXT NOT NULL,original_id TEXT NOT NULL,restored_id TEXT NOT NULL,restore_job_id UUID,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,resource_type,original_id,restored_id)
);
CREATE TABLE IF NOT EXISTS sentinel_restore_webhooks (
 guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,webhook_id TEXT NOT NULL,encrypted_token TEXT NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,channel_id)
);
