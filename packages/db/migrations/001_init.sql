CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id VARCHAR(20) PRIMARY KEY,
  default_language VARCHAR(15) NOT NULL DEFAULT 'en-US',
  autoplay_default BOOLEAN NOT NULL DEFAULT TRUE,
  skip_mode VARCHAR(32) NOT NULL DEFAULT 'MAJORITY',
  sticky_after_messages INT NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS music_rooms (
  id UUID PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  name VARCHAR(80) NOT NULL,
  text_channel_id VARCHAR(20) NOT NULL UNIQUE,
  voice_channel_id VARCHAR(20) NOT NULL,
  controller_message_id VARCHAR(20) NULL,
  preferred_worker_id VARCHAR(8) NULL,
  language VARCHAR(15) NULL,
  autoplay BOOLEAN NOT NULL DEFAULT TRUE,
  delete_requests BOOLEAN NOT NULL DEFAULT TRUE,
  skip_mode VARCHAR(32) NULL,
  default_filter VARCHAR(64) NOT NULL DEFAULT 'flat',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_music_rooms_voice UNIQUE (guild_id, voice_channel_id),
  CONSTRAINT fk_music_rooms_guild FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS music_permission_rules (
  id BIGSERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  role_id VARCHAR(20) NOT NULL,
  permission VARCHAR(64) NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_music_permission UNIQUE (guild_id, role_id, permission),
  CONSTRAINT fk_permission_guild FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS track_history (
  id BIGSERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  room_id UUID NULL,
  requester_id VARCHAR(32) NULL,
  identifier VARCHAR(255) NOT NULL,
  title VARCHAR(512) NOT NULL,
  author VARCHAR(255) NOT NULL,
  source_name VARCHAR(64) NOT NULL,
  uri TEXT NULL,
  artwork_url TEXT NULL,
  isrc VARCHAR(32) NULL,
  duration_ms BIGINT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ(3) NULL,
  end_reason VARCHAR(64) NULL,
  CONSTRAINT fk_track_room FOREIGN KEY (room_id) REFERENCES music_rooms(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_music_preferences (
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  language VARCHAR(15) NULL,
  autoplay_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
  explicit_content BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY(guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS favorites (
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  identifier VARCHAR(255) NOT NULL,
  title VARCHAR(512) NOT NULL,
  author VARCHAR(255) NOT NULL,
  source_name VARCHAR(64) NOT NULL,
  uri TEXT NULL,
  artwork_url TEXT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id, user_id, identifier, source_name)
);

CREATE TABLE IF NOT EXISTS integrations (
  guild_id VARCHAR(20) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL,
  PRIMARY KEY(guild_id, provider),
  CONSTRAINT fk_integrations_guild FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  actor_id VARCHAR(20) NOT NULL,
  action VARCHAR(96) NOT NULL,
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- PostgreSQL-backed live-state fallback when REDIS_URL is not available.
CREATE TABLE IF NOT EXISTS live_kv (
  key_name VARCHAR(191) PRIMARY KEY,
  value_text TEXT NOT NULL,
  expires_at TIMESTAMPTZ(3) NULL,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS live_lists (
  id BIGSERIAL PRIMARY KEY,
  key_name VARCHAR(191) NOT NULL,
  value_text TEXT NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS live_sets (
  key_name VARCHAR(191) NOT NULL,
  member VARCHAR(191) NOT NULL,
  expires_at TIMESTAMPTZ(3) NULL,
  PRIMARY KEY(key_name, member)
);

CREATE TABLE IF NOT EXISTS live_sorted_sets (
  key_name VARCHAR(191) NOT NULL,
  member VARCHAR(191) NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  PRIMARY KEY(key_name, member)
);

CREATE TABLE IF NOT EXISTS live_streams (
  seq BIGSERIAL PRIMARY KEY,
  stream_name VARCHAR(191) NOT NULL,
  payload TEXT NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS listening_events (
  id UUID PRIMARY KEY,
  history_id BIGINT NOT NULL,
  guild_id VARCHAR(20) NOT NULL,
  room_id UUID NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  joined_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMPTZ(3) NULL,
  listened_ms BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT fk_listening_history FOREIGN KEY (history_id) REFERENCES track_history(id) ON DELETE CASCADE,
  CONSTRAINT fk_listening_room FOREIGN KEY (room_id) REFERENCES music_rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS track_metadata_cache (
  cache_key VARCHAR(320) PRIMARY KEY,
  identifier VARCHAR(255) NOT NULL,
  source_name VARCHAR(64) NOT NULL,
  metadata JSONB NOT NULL,
  fetched_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS worker_branding (
  guild_id VARCHAR(20) NOT NULL,
  worker_id SMALLINT NOT NULL,
  color_key VARCHAR(20) NOT NULL,
  color_hex VARCHAR(7) NOT NULL,
  avatar_source VARCHAR(255) NOT NULL,
  banner_source VARCHAR(255) NOT NULL,
  custom_avatar_path VARCHAR(512) NULL,
  custom_banner_path VARCHAR(512) NULL,
  custom_role_icon_path VARCHAR(512) NULL,
  role_id VARCHAR(20) NULL,
  applied_signature VARCHAR(128) NULL,
  last_applied_at TIMESTAMPTZ(3) NULL,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id, worker_id),
  CONSTRAINT fk_worker_branding_guild FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
);

-- Music platform vNext: resilience, collaborative queue, discovery, radio, profiles and telemetry.
CREATE TABLE IF NOT EXISTS music_feature_settings (
  guild_id VARCHAR(20) PRIMARY KEY,
  autoplay_profile VARCHAR(32) NOT NULL DEFAULT 'SIMILAR',
  radio_mode BOOLEAN NOT NULL DEFAULT FALSE,
  radio_profile VARCHAR(32) NOT NULL DEFAULT 'BOM_RADIO',
  transition_mode VARCHAR(32) NOT NULL DEFAULT 'GAPLESS',
  transition_ms INT NOT NULL DEFAULT 0,
  default_mood VARCHAR(32) NULL,
  collaborative_queue BOOLEAN NOT NULL DEFAULT TRUE,
  queue_reorder_mode VARCHAR(32) NOT NULL DEFAULT 'ALL_LISTENERS',
  recommendations_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  achievements_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  station_ids_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  diagnostics_retention_days INT NOT NULL DEFAULT 14,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_feature_settings_guild FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS room_music_settings (
  room_id UUID PRIMARY KEY,
  autoplay_profile VARCHAR(32) NULL,
  mood VARCHAR(32) NULL,
  transition_mode VARCHAR(32) NULL,
  transition_ms INT NULL,
  collaborative_queue BOOLEAN NULL,
  queue_reorder_mode VARCHAR(32) NULL,
  saved_filter VARCHAR(64) NULL,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_room_feature_room FOREIGN KEY (room_id) REFERENCES music_rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS track_feedback (
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  identifier VARCHAR(255) NOT NULL,
  source_name VARCHAR(64) NOT NULL,
  title VARCHAR(512) NOT NULL,
  author VARCHAR(255) NOT NULL,
  artwork_url TEXT NULL,
  rating SMALLINT NOT NULL,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id,user_id,identifier,source_name)
);

CREATE TABLE IF NOT EXISTS music_user_profiles (
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  display_mode VARCHAR(32) NOT NULL DEFAULT 'PUBLIC',
  preferred_mood VARCHAR(32) NULL,
  discovery_level VARCHAR(32) NOT NULL DEFAULT 'BALANCED',
  favorite_genres JSONB NULL,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id,user_id)
);

CREATE TABLE IF NOT EXISTS achievement_definitions (
  guild_id VARCHAR(20) NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(96) NOT NULL,
  description VARCHAR(255) NOT NULL,
  icon VARCHAR(32) NOT NULL DEFAULT '🏆',
  metric VARCHAR(64) NOT NULL,
  threshold_value BIGINT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY(guild_id,code)
);

CREATE TABLE IF NOT EXISTS user_achievements (
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  code VARCHAR(64) NOT NULL,
  unlocked_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id,user_id,code)
);

CREATE TABLE IF NOT EXISTS scheduled_radio (
  id UUID PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  name VARCHAR(96) NOT NULL,
  cron_expr VARCHAR(96) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  profile VARCHAR(32) NOT NULL DEFAULT 'BOM_RADIO',
  mood VARCHAR(32) NULL,
  voice_channel_id VARCHAR(20) NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(20) NOT NULL,
  last_started_at TIMESTAMPTZ(3) NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS music_metrics (
  id BIGSERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  worker_id VARCHAR(8) NULL,
  room_id UUID NULL,
  request_id UUID NULL,
  trace_id VARCHAR(64) NULL,
  metric VARCHAR(64) NOT NULL,
  value_ms DOUBLE PRECISION NOT NULL,
  details JSONB NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS worker_health_history (
  id BIGSERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  worker_id VARCHAR(8) NOT NULL,
  health_score INT NOT NULL,
  lavalink_ping_ms INT NULL,
  event_loop_lag_ms INT NULL,
  reconnects INT NOT NULL DEFAULT 0,
  failures INT NOT NULL DEFAULT 0,
  quarantined_until TIMESTAMPTZ(3) NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS queue_snapshots (
  room_id UUID PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  queue_json JSONB NOT NULL,
  state_json JSONB NULL,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_queue_snapshot_room FOREIGN KEY (room_id) REFERENCES music_rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS music_diagnostics (
  id UUID PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  actor_id VARCHAR(20) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS station_ids (
  id UUID PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  name VARCHAR(96) NOT NULL,
  audio_url TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  weight INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Research-inspired resolver/provenance layer. Kept in separate tables so existing installs do not require destructive ALTERs.
CREATE TABLE IF NOT EXISTS music_resolver_settings (
  guild_id VARCHAR(20) PRIMARY KEY,
  search_chain JSONB NOT NULL,
  max_candidates INT NOT NULL DEFAULT 10,
  reject_variants BOOLEAN NOT NULL DEFAULT TRUE,
  fallback_on_failure BOOLEAN NOT NULL DEFAULT TRUE,
  preferred_source VARCHAR(32) NULL,
  voice_ducking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  voice_ducking_percent INT NOT NULL DEFAULT 35,
  voice_ducking_provider VARCHAR(32) NOT NULL DEFAULT 'NONE',
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_resolver_settings_guild FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS track_provenance (
  history_id BIGINT PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  origin VARCHAR(32) NOT NULL DEFAULT 'USER',
  surface VARCHAR(32) NOT NULL DEFAULT 'SYSTEM',
  requested_query TEXT NULL,
  resolver_strategy VARCHAR(64) NULL,
  resolver_provider VARCHAR(64) NULL,
  resolver_score DOUBLE PRECISION NULL,
  resolution_attempts INT NULL,
  fallback_reason VARCHAR(255) NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_track_provenance_history FOREIGN KEY (history_id) REFERENCES track_history(id) ON DELETE CASCADE
);

-- Server automations + social feeds.
CREATE TABLE IF NOT EXISTS voice_automation_rules (
  id UUID PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  creator_channel_id VARCHAR(20) NOT NULL,
  category_id VARCHAR(20) NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  name_template VARCHAR(96) NOT NULL DEFAULT '{displayName}''s Room',
  bitrate INT NULL,
  user_limit INT NOT NULL DEFAULT 0,
  visibility VARCHAR(32) NOT NULL DEFAULT 'INHERIT',
  allowed_role_ids JSONB NULL,
  denied_role_ids JSONB NULL,
  owner_can_manage BOOLEAN NOT NULL DEFAULT TRUE,
  delete_delay_seconds INT NOT NULL DEFAULT 10,
  clone_permissions BOOLEAN NOT NULL DEFAULT TRUE,
  linked_text_channel BOOLEAN NOT NULL DEFAULT FALSE,
  text_name_template VARCHAR(96) NOT NULL DEFAULT '{displayName}-room',
  waiting_room BOOLEAN NOT NULL DEFAULT FALSE,
  waiting_name_template VARCHAR(96) NOT NULL DEFAULT '{displayName}''s Waiting Room',
  created_by VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_voice_automation_creator UNIQUE (guild_id, creator_channel_id)
);

CREATE TABLE IF NOT EXISTS temp_voice_sessions (
  id UUID PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  rule_id UUID NOT NULL,
  owner_id VARCHAR(20) NOT NULL,
  channel_id VARCHAR(20) NOT NULL,
  waiting_channel_id VARCHAR(20) NULL,
  text_channel_id VARCHAR(20) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  empty_since TIMESTAMPTZ(3) NULL,
  deleted_at TIMESTAMPTZ(3) NULL,
  CONSTRAINT uq_temp_voice_channel UNIQUE (channel_id),
  CONSTRAINT fk_temp_voice_rule FOREIGN KEY (rule_id) REFERENCES voice_automation_rules(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS channel_automation_rules (
  id UUID PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  channel_id VARCHAR(20) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_thread BOOLEAN NOT NULL DEFAULT FALSE,
  thread_name_template VARCHAR(100) NOT NULL DEFAULT '{author} — {message}',
  auto_archive_minutes INT NOT NULL DEFAULT 1440,
  reaction_emojis JSONB NULL,
  only_attachments BOOLEAN NOT NULL DEFAULT FALSE,
  only_links BOOLEAN NOT NULL DEFAULT FALSE,
  ignore_bots BOOLEAN NOT NULL DEFAULT TRUE,
  ignore_webhooks BOOLEAN NOT NULL DEFAULT TRUE,
  allowed_role_ids JSONB NULL,
  excluded_role_ids JSONB NULL,
  starter_message TEXT NULL,
  created_by VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_channel_automation UNIQUE (guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS social_credentials (
  guild_id VARCHAR(20) NOT NULL,
  provider VARCHAR(24) NOT NULL,
  encrypted_json TEXT NOT NULL,
  updated_by VARCHAR(20) NOT NULL,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id, provider)
);

CREATE TABLE IF NOT EXISTS social_feeds (
  id UUID PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  provider VARCHAR(24) NOT NULL,
  source_input VARCHAR(512) NOT NULL,
  account_key VARCHAR(255) NOT NULL,
  account_name VARCHAR(255) NULL,
  account_url TEXT NULL,
  target_channel_id VARCHAR(20) NOT NULL,
  mention_role_id VARCHAR(20) NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  event_types JSONB NOT NULL,
  config JSONB NOT NULL,
  template JSONB NULL,
  polling_seconds INT NOT NULL DEFAULT 120,
  initialized_at TIMESTAMPTZ(3) NULL,
  last_checked_at TIMESTAMPTZ(3) NULL,
  last_cursor VARCHAR(512) NULL,
  last_error TEXT NULL,
  created_by VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS social_content (
  id UUID PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  feed_id UUID NULL,
  provider VARCHAR(24) NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  content_type VARCHAR(32) NOT NULL,
  author_name VARCHAR(255) NULL,
  title VARCHAR(512) NULL,
  body TEXT NULL,
  canonical_url TEXT NULL,
  media_json JSONB NULL,
  published_at TIMESTAMPTZ(3) NULL,
  raw_json JSONB NULL,
  discovered_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_social_content UNIQUE (guild_id, provider, external_id),
  CONSTRAINT fk_social_content_feed FOREIGN KEY (feed_id) REFERENCES social_feeds(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS social_deliveries (
  id UUID PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  feed_id UUID NOT NULL,
  content_id UUID NOT NULL,
  target_channel_id VARCHAR(20) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  discord_message_id VARCHAR(20) NULL,
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT NULL,
  delivered_at TIMESTAMPTZ(3) NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_social_delivery UNIQUE (feed_id, content_id, target_channel_id),
  CONSTRAINT fk_social_delivery_feed FOREIGN KEY (feed_id) REFERENCES social_feeds(id) ON DELETE CASCADE,
  CONSTRAINT fk_social_delivery_content FOREIGN KEY (content_id) REFERENCES social_content(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS social_live_state (
  feed_id UUID PRIMARY KEY,
  external_id VARCHAR(255) NULL,
  online BOOLEAN NOT NULL DEFAULT FALSE,
  discord_message_id VARCHAR(20) NULL,
  started_at TIMESTAMPTZ(3) NULL,
  ended_at TIMESTAMPTZ(3) NULL,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_social_live_feed FOREIGN KEY (feed_id) REFERENCES social_feeds(id) ON DELETE CASCADE
);


-- PostgreSQL indexes for common lookup and reporting paths.
CREATE INDEX IF NOT EXISTS idx_music_rooms_guild ON music_rooms (guild_id);
CREATE INDEX IF NOT EXISTS idx_track_history_guild_started ON track_history (guild_id, started_at);
CREATE INDEX IF NOT EXISTS idx_track_history_room_open ON track_history (room_id, ended_at, started_at);
CREATE INDEX IF NOT EXISTS idx_audit_guild_created ON audit_log (guild_id, created_at);
CREATE INDEX IF NOT EXISTS idx_live_kv_expiry ON live_kv (expires_at);
CREATE INDEX IF NOT EXISTS idx_live_lists_key_id ON live_lists (key_name, id);
CREATE INDEX IF NOT EXISTS idx_live_sets_expiry ON live_sets (expires_at);
CREATE INDEX IF NOT EXISTS idx_live_zset_score ON live_sorted_sets (key_name, score);
CREATE INDEX IF NOT EXISTS idx_live_stream_seq ON live_streams (stream_name, seq);
CREATE INDEX IF NOT EXISTS idx_listening_user ON listening_events (guild_id, user_id, joined_at);
CREATE INDEX IF NOT EXISTS idx_listening_open ON listening_events (history_id, user_id, left_at);
CREATE INDEX IF NOT EXISTS idx_track_metadata_expiry ON track_metadata_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON track_feedback (guild_id,user_id,rating,updated_at);
CREATE INDEX IF NOT EXISTS idx_user_achievement_recent ON user_achievements (guild_id,user_id,unlocked_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_radio_enabled ON scheduled_radio (guild_id,enabled);
CREATE INDEX IF NOT EXISTS idx_metrics_guild_metric_time ON music_metrics (guild_id,metric,created_at);
CREATE INDEX IF NOT EXISTS idx_metrics_worker_time ON music_metrics (worker_id,created_at);
CREATE INDEX IF NOT EXISTS idx_worker_health_worker_time ON worker_health_history (guild_id,worker_id,created_at);
CREATE INDEX IF NOT EXISTS idx_diag_created ON music_diagnostics (guild_id,created_at);
CREATE INDEX IF NOT EXISTS idx_station_ids_enabled ON station_ids (guild_id,enabled);
CREATE INDEX IF NOT EXISTS idx_provenance_guild_origin ON track_provenance (guild_id, origin, created_at);
CREATE INDEX IF NOT EXISTS idx_voice_automation_enabled ON voice_automation_rules (guild_id, enabled);
CREATE INDEX IF NOT EXISTS idx_temp_voice_active ON temp_voice_sessions (guild_id, status);
CREATE INDEX IF NOT EXISTS idx_channel_automation_enabled ON channel_automation_rules (guild_id, enabled);
CREATE INDEX IF NOT EXISTS idx_social_feed_due ON social_feeds (guild_id, enabled, last_checked_at);
CREATE INDEX IF NOT EXISTS idx_social_feed_provider ON social_feeds (guild_id, provider);
CREATE INDEX IF NOT EXISTS idx_social_content_feed_time ON social_content (feed_id, published_at);
CREATE INDEX IF NOT EXISTS idx_social_delivery_pending ON social_deliveries (status, next_attempt_at);

-- Keep updated_at columns current on every row update.
CREATE OR REPLACE FUNCTION bom_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_channel_automation_rules_updated_at ON channel_automation_rules;
CREATE TRIGGER trg_channel_automation_rules_updated_at BEFORE UPDATE ON channel_automation_rules FOR EACH ROW EXECUTE FUNCTION bom_set_updated_at();

DROP TRIGGER IF EXISTS trg_guild_settings_updated_at ON guild_settings;
CREATE TRIGGER trg_guild_settings_updated_at BEFORE UPDATE ON guild_settings FOR EACH ROW EXECUTE FUNCTION bom_set_updated_at();

DROP TRIGGER IF EXISTS trg_live_kv_updated_at ON live_kv;
CREATE TRIGGER trg_live_kv_updated_at BEFORE UPDATE ON live_kv FOR EACH ROW EXECUTE FUNCTION bom_set_updated_at();

DROP TRIGGER IF EXISTS trg_music_feature_settings_updated_at ON music_feature_settings;
CREATE TRIGGER trg_music_feature_settings_updated_at BEFORE UPDATE ON music_feature_settings FOR EACH ROW EXECUTE FUNCTION bom_set_updated_at();

DROP TRIGGER IF EXISTS trg_music_resolver_settings_updated_at ON music_resolver_settings;
CREATE TRIGGER trg_music_resolver_settings_updated_at BEFORE UPDATE ON music_resolver_settings FOR EACH ROW EXECUTE FUNCTION bom_set_updated_at();

DROP TRIGGER IF EXISTS trg_music_rooms_updated_at ON music_rooms;
CREATE TRIGGER trg_music_rooms_updated_at BEFORE UPDATE ON music_rooms FOR EACH ROW EXECUTE FUNCTION bom_set_updated_at();

DROP TRIGGER IF EXISTS trg_music_user_profiles_updated_at ON music_user_profiles;
CREATE TRIGGER trg_music_user_profiles_updated_at BEFORE UPDATE ON music_user_profiles FOR EACH ROW EXECUTE FUNCTION bom_set_updated_at();

DROP TRIGGER IF EXISTS trg_queue_snapshots_updated_at ON queue_snapshots;
CREATE TRIGGER trg_queue_snapshots_updated_at BEFORE UPDATE ON queue_snapshots FOR EACH ROW EXECUTE FUNCTION bom_set_updated_at();

DROP TRIGGER IF EXISTS trg_room_music_settings_updated_at ON room_music_settings;
CREATE TRIGGER trg_room_music_settings_updated_at BEFORE UPDATE ON room_music_settings FOR EACH ROW EXECUTE FUNCTION bom_set_updated_at();

DROP TRIGGER IF EXISTS trg_social_credentials_updated_at ON social_credentials;
CREATE TRIGGER trg_social_credentials_updated_at BEFORE UPDATE ON social_credentials FOR EACH ROW EXECUTE FUNCTION bom_set_updated_at();

DROP TRIGGER IF EXISTS trg_social_feeds_updated_at ON social_feeds;
CREATE TRIGGER trg_social_feeds_updated_at BEFORE UPDATE ON social_feeds FOR EACH ROW EXECUTE FUNCTION bom_set_updated_at();

DROP TRIGGER IF EXISTS trg_social_live_state_updated_at ON social_live_state;
CREATE TRIGGER trg_social_live_state_updated_at BEFORE UPDATE ON social_live_state FOR EACH ROW EXECUTE FUNCTION bom_set_updated_at();

DROP TRIGGER IF EXISTS trg_track_feedback_updated_at ON track_feedback;
CREATE TRIGGER trg_track_feedback_updated_at BEFORE UPDATE ON track_feedback FOR EACH ROW EXECUTE FUNCTION bom_set_updated_at();

DROP TRIGGER IF EXISTS trg_voice_automation_rules_updated_at ON voice_automation_rules;
CREATE TRIGGER trg_voice_automation_rules_updated_at BEFORE UPDATE ON voice_automation_rules FOR EACH ROW EXECUTE FUNCTION bom_set_updated_at();

DROP TRIGGER IF EXISTS trg_worker_branding_updated_at ON worker_branding;
CREATE TRIGGER trg_worker_branding_updated_at BEFORE UPDATE ON worker_branding FOR EACH ROW EXECUTE FUNCTION bom_set_updated_at();
