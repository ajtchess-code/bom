CREATE TABLE IF NOT EXISTS community_settings (
 guild_id text PRIMARY KEY, ask_enabled boolean NOT NULL DEFAULT false,
 ask_channel_id text, assistance_role_id text, no_role_id text, correction_role_id text,
 rules_channel_id text, rules_message_ids jsonb NOT NULL DEFAULT '[]',
 rules jsonb NOT NULL DEFAULT '[]', trade_rules jsonb NOT NULL DEFAULT '[]',
 welcome_emojis jsonb NOT NULL DEFAULT '{}', revision integer NOT NULL DEFAULT 1,
 updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ask_knowledge (
 id text NOT NULL, guild_id text NOT NULL, title text NOT NULL, content text NOT NULL,
 revision integer NOT NULL DEFAULT 1, updated_by text, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(guild_id,id)
);
CREATE TABLE IF NOT EXISTS ask_answers (
 message_id text PRIMARY KEY, guild_id text NOT NULL, user_id text NOT NULL,
 question text NOT NULL, answer text NOT NULL, sources jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ask_corrections (
 id uuid PRIMARY KEY, guild_id text NOT NULL, answer_id text NOT NULL REFERENCES ask_answers(message_id),
 source_id text NOT NULL, old_content text NOT NULL, new_content text NOT NULL,
 source_revision text NOT NULL, submitted_by text NOT NULL, reviewed_by text,
 status text NOT NULL DEFAULT 'PENDING', created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz
);
ALTER TABLE custom_role_requests ADD COLUMN IF NOT EXISTS color_style text NOT NULL DEFAULT 'SOLID';
ALTER TABLE custom_role_requests ADD COLUMN IF NOT EXISTS tertiary_color integer;
