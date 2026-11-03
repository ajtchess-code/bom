-- BOM Feedback Center: bugs, suggestions, general feedback, releases and delivery state.
-- Roadmap-specific tables/UI are intentionally deferred.
CREATE TABLE IF NOT EXISTS feedback_settings (
  guild_id text PRIMARY KEY,
  feedback_channel_id text,
  changelog_channel_id text,
  discord_panel_message_id text,
  enabled boolean NOT NULL DEFAULT TRUE,
  bug_reports_enabled boolean NOT NULL DEFAULT TRUE,
  suggestions_enabled boolean NOT NULL DEFAULT TRUE,
  general_feedback_enabled boolean NOT NULL DEFAULT TRUE,
  comments_enabled boolean NOT NULL DEFAULT TRUE,
  reactions_enabled boolean NOT NULL DEFAULT TRUE,
  auto_release_posts boolean NOT NULL DEFAULT TRUE,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback_items (
  id uuid PRIMARY KEY,
  reference_no bigserial UNIQUE,
  guild_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('BUG','SUGGESTION','FEEDBACK')),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  status text NOT NULL DEFAULT 'NEW',
  visibility text NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC','STAFF')),
  severity text,
  priority text NOT NULL DEFAULT 'NORMAL',
  created_by text NOT NULL,
  assigned_to text,
  duplicate_of uuid REFERENCES feedback_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS feedback_items_queue_idx ON feedback_items(guild_id,type,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS feedback_items_category_idx ON feedback_items(guild_id,category,updated_at DESC);

CREATE TABLE IF NOT EXISTS feedback_submissions (
  id uuid PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  surface text NOT NULL DEFAULT 'dashboard',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS feedback_submissions_item_idx ON feedback_submissions(item_id,created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_submissions_user_idx ON feedback_submissions(guild_id,user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS feedback_reactions (
  item_id uuid NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('SUPPORT','AFFECTED')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(item_id,user_id,kind)
);
CREATE INDEX IF NOT EXISTS feedback_reactions_item_idx ON feedback_reactions(item_id,kind);

CREATE TABLE IF NOT EXISTS feedback_comments (
  id uuid PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  body text NOT NULL,
  internal boolean NOT NULL DEFAULT FALSE,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_at timestamptz
);
CREATE INDEX IF NOT EXISTS feedback_comments_item_idx ON feedback_comments(item_id,created_at);

CREATE TABLE IF NOT EXISTS feedback_status_history (
  id uuid PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  actor_id text,
  old_status text,
  new_status text,
  note text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS feedback_status_history_item_idx ON feedback_status_history(item_id,created_at DESC);

CREATE TABLE IF NOT EXISTS feedback_releases (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  version text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'MANUAL',
  released_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  discord_message_id text,
  discord_posted_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(guild_id,version)
);
CREATE INDEX IF NOT EXISTS feedback_releases_date_idx ON feedback_releases(guild_id,released_at DESC);

CREATE TABLE IF NOT EXISTS feedback_release_items (
  release_id uuid NOT NULL REFERENCES feedback_releases(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  PRIMARY KEY(release_id,item_id)
);

CREATE TABLE IF NOT EXISTS feedback_notifications (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  recipient_id text NOT NULL,
  item_id uuid REFERENCES feedback_items(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at timestamptz,
  delivery_error text
);
CREATE INDEX IF NOT EXISTS feedback_notifications_pending_idx ON feedback_notifications(guild_id,delivered_at,created_at);
