ALTER TABLE pb_signups ADD COLUMN IF NOT EXISTS fleet_pending boolean NOT NULL DEFAULT false;
ALTER TABLE pb_signups ADD COLUMN IF NOT EXISTS fleet_role text NOT NULL DEFAULT 'Heavy';
ALTER TABLE pb_battles ADD COLUMN IF NOT EXISTS cancellation_silent boolean NOT NULL DEFAULT false;
ALTER TABLE pb_battle_reviews ADD COLUMN IF NOT EXISTS report_submitted_at timestamptz;
ALTER TABLE pb_battle_reviews ADD COLUMN IF NOT EXISTS report_url text;
ALTER TABLE pb_roster_templates ADD COLUMN IF NOT EXISTS roster jsonb NOT NULL DEFAULT '[]';
ALTER TABLE pb_roster_templates ADD COLUMN IF NOT EXISTS battle_settings jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS pb_experience_settings(
 guild_id text PRIMARY KEY, activated_at timestamptz NOT NULL DEFAULT now(),
 officer_channel_id text, alliance_channel_id text, horn_guide_url text NOT NULL DEFAULT '', flare_guide_url text NOT NULL DEFAULT '',
 timezone text NOT NULL DEFAULT 'America/Chicago', night_hour integer NOT NULL DEFAULT 23 CHECK(night_hour BETWEEN 0 AND 23)
);
-- Capture the rollout boundary once, not on each restart. Existing battles never enter the reminder cohort.
INSERT INTO pb_experience_settings(guild_id) SELECT guild_id FROM pb_discord_settings ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS pb_nightly_messages(
 guild_id text NOT NULL, night date NOT NULL, kind text NOT NULL, page integer NOT NULL,
 channel_id text NOT NULL, message_id text NOT NULL, PRIMARY KEY(guild_id,night,kind,page)
);
CREATE TABLE IF NOT EXISTS pb_signup_digest(
 guild_id text NOT NULL,user_id text NOT NULL,message_id text,channel_id text,fingerprint text,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(guild_id,user_id)
);
CREATE TABLE IF NOT EXISTS pb_campaign_steps(
 id uuid PRIMARY KEY,guild_id text NOT NULL,user_id text NOT NULL,display_name text NOT NULL,
 battle_id uuid REFERENCES pb_battles(id) ON DELETE SET NULL, kind text NOT NULL CHECK(kind IN('TENSION','BATTLE','TRAVEL')),
 origin text NOT NULL DEFAULT '',destination text NOT NULL,starts_at timestamptz NOT NULL,arrive_by timestamptz NOT NULL,
 travel_mode text NOT NULL CHECK(travel_mode IN('SMALL','LARGE','SAIL')),
 small_travels integer NOT NULL DEFAULT 0 CHECK(small_travels>=0),large_travels integer NOT NULL DEFAULT 0 CHECK(large_travels>=0),
 note text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1,updated_by text,updated_at timestamptz NOT NULL DEFAULT now()
);
