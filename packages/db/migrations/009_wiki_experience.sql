-- Living Wiki experience, correction review, sharing, analytics and article support.
-- Safe to run repeatedly on PostgreSQL.

CREATE TABLE IF NOT EXISTS wiki_answer_history (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  actor_id text,
  surface text NOT NULL DEFAULT 'dashboard',
  question text NOT NULL,
  canonical_question text,
  answer text NOT NULL,
  intent text,
  confidence text,
  entity_key text,
  language text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS wiki_answer_history_actor_idx ON wiki_answer_history(guild_id,actor_id,created_at DESC);
CREATE INDEX IF NOT EXISTS wiki_answer_history_entity_idx ON wiki_answer_history(guild_id,entity_key,created_at DESC);

CREATE TABLE IF NOT EXISTS wiki_feedback_queue (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  answer_id uuid,
  actor_id text,
  question text,
  original_answer text,
  suggestion text NOT NULL,
  entity_key text,
  field_path text,
  proposed_value jsonb,
  language text,
  status text NOT NULL DEFAULT 'PENDING',
  source_surface text NOT NULL DEFAULT 'dashboard',
  source_message_id text,
  source_channel_id text,
  reviewer_id text,
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS wiki_feedback_queue_status_idx ON wiki_feedback_queue(guild_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS wiki_shared_answers (
  token text PRIMARY KEY,
  guild_id text NOT NULL,
  answer_id uuid NOT NULL,
  owner_id text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS wiki_shared_answers_answer_idx ON wiki_shared_answers(guild_id,answer_id);

CREATE TABLE IF NOT EXISTS wiki_usage_events (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  actor_id text,
  event_type text NOT NULL,
  intent text,
  entity_key text,
  query_text text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS wiki_usage_events_kind_idx ON wiki_usage_events(guild_id,event_type,created_at DESC);
CREATE INDEX IF NOT EXISTS wiki_usage_events_intent_idx ON wiki_usage_events(guild_id,intent,created_at DESC);

CREATE TABLE IF NOT EXISTS wiki_aliases (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  entity_key text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  status text NOT NULL DEFAULT 'APPROVED',
  usage_count integer NOT NULL DEFAULT 0,
  created_by text,
  reviewed_by text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at timestamptz,
  UNIQUE(guild_id,language,normalized_alias)
);
CREATE INDEX IF NOT EXISTS wiki_aliases_entity_idx ON wiki_aliases(guild_id,entity_key,status);

CREATE TABLE IF NOT EXISTS wiki_settings (
  guild_id text PRIMARY KEY,
  passive_qa_enabled boolean NOT NULL DEFAULT FALSE,
  passive_qa_channel_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  passive_min_confidence text NOT NULL DEFAULT 'confirmed',
  passive_reply_cooldown_seconds integer NOT NULL DEFAULT 20,
  article_featured_entities jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wiki_article_notes (
  guild_id text NOT NULL,
  entity_key text NOT NULL,
  intro text,
  category_label text,
  featured boolean NOT NULL DEFAULT FALSE,
  sort_order integer NOT NULL DEFAULT 0,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id,entity_key)
);
