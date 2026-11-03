CREATE TABLE IF NOT EXISTS wiki_sources (
  source_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  file_name TEXT,
  description TEXT,
  sha256 TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wiki_records (
  id UUID PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES wiki_sources(source_id) ON DELETE CASCADE,
  record_key TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  qualifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_ref TEXT,
  content_hash TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id,record_key)
);
CREATE INDEX IF NOT EXISTS idx_wiki_records_kind ON wiki_records(kind);
CREATE INDEX IF NOT EXISTS idx_wiki_records_entity ON wiki_records(entity_key);
CREATE INDEX IF NOT EXISTS idx_wiki_records_name_lower ON wiki_records(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_wiki_records_active_kind ON wiki_records(active,kind);

CREATE TABLE IF NOT EXISTS wiki_overrides (
  id UUID PRIMARY KEY,
  guild_id TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  field_path TEXT NOT NULL,
  value JSONB NOT NULL,
  note TEXT,
  corrected_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_wiki_overrides_active ON wiki_overrides(guild_id,entity_key,field_path) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS wiki_training (
  id UUID PRIMARY KEY,
  guild_id TEXT NOT NULL,
  raw_statement TEXT NOT NULL,
  parsed_patch JSONB,
  actor_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wiki_training_status ON wiki_training(guild_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS wiki_question_log (
  id UUID PRIMARY KEY,
  guild_id TEXT NOT NULL,
  actor_id TEXT,
  question TEXT NOT NULL,
  intent TEXT,
  answered BOOLEAN NOT NULL DEFAULT FALSE,
  answer_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_wiki_question_log_recent ON wiki_question_log(guild_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wiki_question_log_unanswered ON wiki_question_log(guild_id,answered,created_at DESC);
