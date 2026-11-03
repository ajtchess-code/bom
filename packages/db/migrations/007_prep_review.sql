CREATE TABLE IF NOT EXISTS prep_review_sessions (
  id UUID PRIMARY KEY,
  guild_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('PREP','REVIEW')),
  title TEXT NOT NULL,
  port_name TEXT NOT NULL,
  map_key TEXT,
  video_url TEXT,
  drawing JSONB NOT NULL DEFAULT '[]'::jsonb,
  map_drawing JSONB NOT NULL DEFAULT '[]'::jsonb,
  view_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_prep_review_sessions_guild_kind_updated ON prep_review_sessions(guild_id,kind,updated_at DESC);

CREATE TABLE IF NOT EXISTS prep_review_revisions (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES prep_review_sessions(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_prep_review_revisions_session_created ON prep_review_revisions(session_id,created_at DESC);
