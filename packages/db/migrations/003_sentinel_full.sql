-- BOM Sentinel full observability, archive, causal attribution, access history, and recovery schema.
ALTER TABLE sentinel_events ADD COLUMN IF NOT EXISTS initiator_id TEXT;
ALTER TABLE sentinel_events ADD COLUMN IF NOT EXISTS executor_id TEXT;
ALTER TABLE sentinel_events ADD COLUMN IF NOT EXISTS attribution_confidence TEXT NOT NULL DEFAULT 'observed';
ALTER TABLE sentinel_events ADD COLUMN IF NOT EXISTS source_event_key TEXT;
ALTER TABLE sentinel_events ADD COLUMN IF NOT EXISTS before_state JSONB;
ALTER TABLE sentinel_events ADD COLUMN IF NOT EXISTS after_state JSONB;
ALTER TABLE sentinel_events ADD COLUMN IF NOT EXISTS reversible BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sentinel_events ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info';
ALTER TABLE sentinel_events ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS sentinel_events_source_key_unique
  ON sentinel_events(guild_id,source,source_event_key) WHERE source_event_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS sentinel_events_initiator_time ON sentinel_events(guild_id,initiator_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS sentinel_events_executor_time ON sentinel_events(guild_id,executor_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS sentinel_events_severity_time ON sentinel_events(guild_id,severity,occurred_at DESC);
CREATE INDEX IF NOT EXISTS sentinel_events_search_idx ON sentinel_events USING GIN
  (to_tsvector('simple',coalesce(action,'') || ' ' || coalesce(category,'') || ' ' || coalesce(source,'') || ' ' || coalesce(metadata::text,'')));

CREATE TABLE IF NOT EXISTS sentinel_messages (
  message_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  thread_id TEXT,
  author_id TEXT,
  author_username TEXT,
  author_display_name TEXT,
  author_avatar_url TEXT,
  webhook_id TEXT,
  content TEXT,
  content_sha256 TEXT,
  embeds JSONB NOT NULL DEFAULT '[]'::jsonb,
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  stickers JSONB NOT NULL DEFAULT '[]'::jsonb,
  referenced_message_id TEXT,
  created_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_event_id UUID REFERENCES sentinel_events(id) ON DELETE SET NULL,
  restore_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS sentinel_messages_guild_channel_time ON sentinel_messages(guild_id,channel_id,created_at DESC);
CREATE INDEX IF NOT EXISTS sentinel_messages_author_time ON sentinel_messages(guild_id,author_id,created_at DESC);
CREATE INDEX IF NOT EXISTS sentinel_messages_deleted_time ON sentinel_messages(guild_id,deleted_at DESC) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS sentinel_messages_content_search ON sentinel_messages USING GIN(to_tsvector('simple',coalesce(content,'')));

CREATE TABLE IF NOT EXISTS sentinel_message_revisions (
  id UUID PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES sentinel_messages(message_id) ON DELETE CASCADE,
  event_id UUID REFERENCES sentinel_events(id) ON DELETE SET NULL,
  revision_type TEXT NOT NULL,
  content TEXT,
  embeds JSONB NOT NULL DEFAULT '[]'::jsonb,
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sentinel_message_revisions_message_time ON sentinel_message_revisions(message_id,created_at DESC);

CREATE TABLE IF NOT EXISTS sentinel_assets (
  id UUID PRIMARY KEY,
  guild_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  asset_kind TEXT NOT NULL,
  mime_type TEXT,
  file_name TEXT,
  size_bytes BIGINT,
  width INTEGER,
  height INTEGER,
  external_url TEXT,
  provider TEXT,
  provider_key TEXT,
  title TEXT,
  data BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ref_count BIGINT NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(guild_id,sha256)
);
CREATE INDEX IF NOT EXISTS sentinel_assets_provider_key ON sentinel_assets(guild_id,provider,provider_key) WHERE provider_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS sentinel_message_assets (
  message_id TEXT NOT NULL REFERENCES sentinel_messages(message_id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES sentinel_assets(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0,
  attachment_id TEXT,
  original_url TEXT,
  description TEXT,
  PRIMARY KEY(message_id,asset_id,position)
);

CREATE TABLE IF NOT EXISTS sentinel_emoji_assets (
  guild_id TEXT NOT NULL,
  emoji_id TEXT NOT NULL,
  name TEXT,
  animated BOOLEAN NOT NULL DEFAULT FALSE,
  asset_id UUID REFERENCES sentinel_assets(id) ON DELETE SET NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(guild_id,emoji_id)
);

CREATE TABLE IF NOT EXISTS sentinel_access_current (
  guild_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  can_view BOOLEAN NOT NULL,
  can_send BOOLEAN NOT NULL DEFAULT FALSE,
  role_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_event_id UUID REFERENCES sentinel_events(id) ON DELETE SET NULL,
  PRIMARY KEY(guild_id,member_id,channel_id)
);
CREATE INDEX IF NOT EXISTS sentinel_access_current_channel ON sentinel_access_current(guild_id,channel_id,can_view);

CREATE TABLE IF NOT EXISTS sentinel_access_changes (
  id UUID PRIMARY KEY,
  guild_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  before_view BOOLEAN NOT NULL,
  after_view BOOLEAN NOT NULL,
  before_send BOOLEAN NOT NULL DEFAULT FALSE,
  after_send BOOLEAN NOT NULL DEFAULT FALSE,
  before_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  after_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  event_id UUID REFERENCES sentinel_events(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sentinel_access_changes_member_channel ON sentinel_access_changes(guild_id,member_id,channel_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS sentinel_resource_map (
  guild_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  original_id TEXT NOT NULL,
  restored_id TEXT NOT NULL,
  restore_job_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(guild_id,resource_type,original_id,restored_id)
);

CREATE TABLE IF NOT EXISTS sentinel_restore_webhooks (
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  webhook_id TEXT NOT NULL,
  encrypted_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(guild_id,channel_id)
);

CREATE TABLE IF NOT EXISTS sentinel_source_health (
  guild_id TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'healthy',
  last_event_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error TEXT,
  dropped_events BIGINT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(guild_id,source)
);

CREATE TABLE IF NOT EXISTS sentinel_settings (
  guild_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  message_archive_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  media_archive_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  backup_interval_minutes INTEGER NOT NULL DEFAULT 360,
  standard_retention_days INTEGER NOT NULL DEFAULT 90,
  message_retention_days INTEGER NOT NULL DEFAULT 90,
  security_retention_days INTEGER NOT NULL DEFAULT 365,
  technical_retention_days INTEGER NOT NULL DEFAULT 30,
  restore_marker_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  webhook_pool_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  offsite_backup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

ALTER TABLE sentinel_restore_jobs ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE sentinel_restore_jobs ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE sentinel_restore_jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE sentinel_restore_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE sentinel_restore_jobs ADD COLUMN IF NOT EXISTS result JSONB;
ALTER TABLE sentinel_restore_jobs ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE sentinel_restore_jobs ADD COLUMN IF NOT EXISTS pre_restore_snapshot_id UUID REFERENCES sentinel_snapshots(id);

ALTER TABLE sentinel_snapshots ADD COLUMN IF NOT EXISTS scope JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sentinel_snapshots ADD COLUMN IF NOT EXISTS size_bytes BIGINT;
ALTER TABLE sentinel_snapshots ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE sentinel_snapshots ADD COLUMN IF NOT EXISTS verification_error TEXT;

-- Mirror every existing BOM application audit entry into Sentinel automatically.
CREATE OR REPLACE FUNCTION sentinel_mirror_audit_log() RETURNS TRIGGER AS $$
DECLARE
  event_uuid UUID;
  target_guess TEXT;
  channel_guess TEXT;
  correlation_guess TEXT;
  category_guess TEXT;
BEGIN
  event_uuid := md5(NEW.guild_id || ':' || NEW.id::text)::uuid;
  target_guess := COALESCE(NEW.details->>'targetId', NEW.details->>'memberId', NEW.details->>'userId', NEW.details->>'requesterId', NEW.details->>'workerId', NEW.details->>'roomId');
  channel_guess := COALESCE(NEW.details->>'channelId', NEW.details->>'voiceChannelId', NEW.details->>'textChannelId');
  correlation_guess := COALESCE(NEW.details->>'correlationId', NEW.details->>'traceId', NEW.details->>'requestId');
  category_guess := split_part(NEW.action,'.',1);
  INSERT INTO sentinel_events(id,guild_id,occurred_at,source,category,action,actor_id,initiator_id,executor_id,target_id,channel_id,correlation_id,outcome,metadata,source_event_key,attribution_confidence,reversible,severity)
  VALUES(event_uuid,NEW.guild_id,NEW.created_at,'bom',category_guess,NEW.action,NEW.actor_id,NEW.actor_id,'bom',target_guess,channel_guess,correlation_guess,'recorded',NEW.details,'audit_log:'||NEW.id::text,'confirmed',FALSE,'info')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_sentinel_mirror_audit_log ON audit_log;
CREATE TRIGGER trg_sentinel_mirror_audit_log AFTER INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION sentinel_mirror_audit_log();

-- Backfill prior BOM audit history once, preserving original timestamps.
INSERT INTO sentinel_events(id,guild_id,occurred_at,source,category,action,actor_id,initiator_id,executor_id,target_id,channel_id,correlation_id,outcome,metadata,source_event_key,attribution_confidence,reversible,severity)
SELECT md5(a.guild_id || ':' || a.id::text)::uuid,a.guild_id,a.created_at,'bom',split_part(a.action,'.',1),a.action,a.actor_id,a.actor_id,'bom',
       COALESCE(a.details->>'targetId',a.details->>'memberId',a.details->>'userId',a.details->>'requesterId',a.details->>'workerId',a.details->>'roomId'),
       COALESCE(a.details->>'channelId',a.details->>'voiceChannelId',a.details->>'textChannelId'),
       COALESCE(a.details->>'correlationId',a.details->>'traceId',a.details->>'requestId'),
       'recorded',a.details,'audit_log:'||a.id::text,'confirmed',FALSE,'info'
FROM audit_log a
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS sentinel_backfill_state (
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  before_id TEXT,
  archived_count BIGINT NOT NULL DEFAULT 0,
  oldest_message_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(guild_id,channel_id),
  CONSTRAINT sentinel_backfill_status CHECK(status IN ('pending','running','complete','failed','skipped'))
);
