-- Unified Command OS v4.0
-- The runtime is intentionally single-guild. guild_id remains on historical tables as a
-- compatibility partition key so upgrades do not require a destructive rewrite.

CREATE TABLE IF NOT EXISTS platform_settings (
  guild_id text PRIMARY KEY,
  config_version integer NOT NULL DEFAULT 4,
  feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  navigation jsonb NOT NULL DEFAULT '{}'::jsonb,
  defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_jobs (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  priority integer NOT NULL DEFAULT 100,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  progress_message text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  requested_by text,
  claimed_by text,
  available_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS platform_jobs_queue_idx ON platform_jobs(guild_id,status,priority,available_at,created_at);
CREATE INDEX IF NOT EXISTS platform_jobs_recent_idx ON platform_jobs(guild_id,created_at DESC);

CREATE TABLE IF NOT EXISTS platform_events (
  id bigserial PRIMARY KEY,
  guild_id text NOT NULL,
  event_type text NOT NULL,
  category text NOT NULL DEFAULT 'system',
  actor_id text,
  subject_type text,
  subject_id text,
  title text NOT NULL,
  summary text,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','success','warning','error')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS platform_events_feed_idx ON platform_events(guild_id,created_at DESC);
CREATE INDEX IF NOT EXISTS platform_events_subject_idx ON platform_events(guild_id,subject_type,subject_id,created_at DESC);

CREATE TABLE IF NOT EXISTS dashboard_notification_preferences (
  guild_id text NOT NULL,
  user_id text NOT NULL,
  dashboard_enabled boolean NOT NULL DEFAULT true,
  discord_dm_enabled boolean NOT NULL DEFAULT true,
  browser_enabled boolean NOT NULL DEFAULT false,
  categories jsonb NOT NULL DEFAULT '{"battles":true,"recruitment":true,"membership":true,"music":false,"system":true,"feedback":true}'::jsonb,
  quiet_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id,user_id)
);

CREATE TABLE IF NOT EXISTS pb_roster_templates (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  name text NOT NULL,
  rate integer,
  team_size integer NOT NULL DEFAULT 20 CHECK (team_size BETWEEN 1 AND 40),
  ship_targets jsonb NOT NULL DEFAULT '{}'::jsonb,
  commander_slots jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(guild_id,name)
);

CREATE TABLE IF NOT EXISTS pb_attendance_outcomes (
  battle_id uuid NOT NULL,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('ATTENDED','LATE','CANCELLED','NO_SHOW','WAITLIST','UNKNOWN')),
  minutes_late integer NOT NULL DEFAULT 0,
  note text,
  recorded_by text,
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(battle_id,user_id)
);
CREATE INDEX IF NOT EXISTS pb_attendance_user_idx ON pb_attendance_outcomes(guild_id,user_id,recorded_at DESC);

ALTER TABLE recruitment_settings
  ADD COLUMN IF NOT EXISTS anonymous_votes boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS recruitment_trial_scorecards (
  trial_id uuid NOT NULL REFERENCES recruitment_trials(id) ON DELETE CASCADE,
  category text NOT NULL,
  score integer CHECK (score IS NULL OR score BETWEEN 1 AND 5),
  note text,
  reviewer_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(trial_id,category,reviewer_id)
);

CREATE TABLE IF NOT EXISTS wiki_article_relations (
  guild_id text NOT NULL,
  from_slug text NOT NULL,
  to_slug text NOT NULL,
  relation_type text NOT NULL DEFAULT 'RELATED',
  label text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id,from_slug,to_slug,relation_type)
);

CREATE TABLE IF NOT EXISTS wiki_article_suggestions (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  article_slug text NOT NULL,
  user_id text NOT NULL,
  kind text NOT NULL DEFAULT 'CORRECTION' CHECK (kind IN ('CORRECTION','SOURCE','CLARITY','MISSING_INFO')),
  body text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACCEPTED','DECLINED','CLOSED')),
  reviewer_id text,
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS wiki_article_suggestions_queue_idx ON wiki_article_suggestions(guild_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS wiki_source_health (
  guild_id text NOT NULL,
  source_key text NOT NULL,
  source_url text,
  source_type text NOT NULL DEFAULT 'UNKNOWN',
  confidence text NOT NULL DEFAULT 'UNVERIFIED' CHECK (confidence IN ('UNVERIFIED','COMMUNITY','CURATED','VERIFIED')),
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  content_hash text,
  status text NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN ('UNKNOWN','FRESH','STALE','CHANGED','UNREACHABLE')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(guild_id,source_key)
);

-- Officer-only Port Battle review metadata powers commander outcome dashboards without
-- exposing attendance/reliability rankings to ordinary members.
CREATE TABLE IF NOT EXISTS pb_battle_reviews (
  battle_id uuid PRIMARY KEY REFERENCES pb_battles(id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  result text NOT NULL DEFAULT 'UNKNOWN' CHECK (result IN ('WIN','LOSS','DRAW','UNKNOWN')),
  issue_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  recorded_by text,
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS pb_battle_reviews_result_idx ON pb_battle_reviews(guild_id,result,recorded_at DESC);
