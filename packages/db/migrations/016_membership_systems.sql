CREATE TABLE IF NOT EXISTS membership_settings (
  guild_id text PRIMARY KEY,
  welcome_enabled boolean NOT NULL DEFAULT false,
  welcome_channel_id text,
  welcome_panel_message_id text,
  welcome_last_joiner_id text,
  welcome_last_joiner_name text,
  welcome_last_joiner_avatar text,
  application_url text,
  trade_url text,
  diplomacy_enabled boolean NOT NULL DEFAULT true,
  diplomacy_category_id text,
  diplomacy_role_id text,
  diplomacy_archive_channel_id text,
  diplomacy_voice_enabled boolean NOT NULL DEFAULT true,
  custom_roles_enabled boolean NOT NULL DEFAULT true,
  custom_role_approval_channel_id text,
  custom_role_approval_role_id text,
  custom_role_anchor_role_id text,
  member_role_id text,
  member_console_channel_id text,
  member_console_message_id text,
  roster_enabled boolean NOT NULL DEFAULT true,
  profile_reminder_role_id text,
  officer_role_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS member_profiles (
  guild_id text NOT NULL,
  user_id text NOT NULL,
  display_name text,
  username text,
  avatar_url text,
  captain_name text,
  game_rank integer CHECK (game_rank IS NULL OR (game_rank BETWEEN 15 AND 30)),
  joined_at timestamptz,
  profile_completed_at timestamptz,
  last_reminded_at timestamptz,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id,user_id)
);
CREATE INDEX IF NOT EXISTS member_profiles_name_idx ON member_profiles(guild_id,lower(coalesce(display_name,'')),lower(coalesce(captain_name,'')));

ALTER TABLE pb_preferred_profiles ADD COLUMN IF NOT EXISTS owned_rates jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS custom_role_requests (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  requested_name text NOT NULL,
  primary_color integer NOT NULL DEFAULT 0,
  secondary_color integer,
  gradient_direction text CHECK (gradient_direction IS NULL OR gradient_direction IN ('LEFT_TO_RIGHT','RIGHT_TO_LEFT')),
  unicode_emoji text,
  icon_url text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','DECLINED','CANCELLED')),
  reviewer_id text,
  reviewer_note text,
  discord_role_id text,
  discord_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS custom_role_one_pending_idx ON custom_role_requests(guild_id,user_id) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS custom_role_queue_idx ON custom_role_requests(guild_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS member_custom_roles (
  guild_id text NOT NULL,
  user_id text NOT NULL,
  discord_role_id text NOT NULL,
  last_request_id uuid REFERENCES custom_role_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id,user_id),
  UNIQUE (guild_id,discord_role_id)
);

CREATE TABLE IF NOT EXISTS role_connections (
  guild_id text NOT NULL,
  source_role_id text NOT NULL,
  destination_role_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id,source_role_id)
);

CREATE TABLE IF NOT EXISTS guild_prefix_rules (
  guild_id text NOT NULL,
  role_id text NOT NULL,
  prefix text NOT NULL,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id,role_id)
);

CREATE TABLE IF NOT EXISTS diplomacy_requests (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  owner_id text NOT NULL,
  captain_name text,
  represented_guild text,
  topic text NOT NULL,
  authority text,
  summary text,
  text_channel_id text,
  voice_channel_id text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by text,
  transcript text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS diplomacy_open_idx ON diplomacy_requests(guild_id,status,opened_at DESC);

CREATE TABLE IF NOT EXISTS diplomacy_participants (
  request_id uuid NOT NULL REFERENCES diplomacy_requests(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','DECLINED')),
  requested_by text,
  decided_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  PRIMARY KEY (request_id,user_id)
);
