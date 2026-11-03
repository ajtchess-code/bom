CREATE TABLE IF NOT EXISTS wosb_diplomacy (
 guild_id text PRIMARY KEY, revision integer NOT NULL DEFAULT 0,
 data jsonb NOT NULL DEFAULT '{"blocs":[],"alliances":[],"memberships":[],"relations":[]}',
 updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wosb_diplomacy_events (
 id uuid PRIMARY KEY, guild_id text NOT NULL, actor_id text NOT NULL,
 revision integer NOT NULL, before_data jsonb NOT NULL, after_data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS guild_donations (
 id uuid PRIMARY KEY, guild_id text NOT NULL, user_id text NOT NULL, items jsonb NOT NULL,
 fort_name text NOT NULL, note text, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','VERIFIED','DECLINED')),
 reviewed_by text, review_note text, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 request_key uuid NOT NULL, UNIQUE(guild_id,user_id,request_key)
);
CREATE TABLE IF NOT EXISTS guild_treasury_entries (
 id uuid PRIMARY KEY, guild_id text NOT NULL, actor_id text NOT NULL, amount numeric(18,0) NOT NULL CHECK(amount<>0),
 reason text NOT NULL, kind text NOT NULL CHECK(kind IN('OPENING','DEPOSIT','WITHDRAWAL','REVERSAL')),
 reverses_id uuid REFERENCES guild_treasury_entries(id), created_at timestamptz NOT NULL DEFAULT now(),
 request_key uuid NOT NULL, UNIQUE(guild_id,request_key), UNIQUE(reverses_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS treasury_single_opening ON guild_treasury_entries(guild_id) WHERE kind='OPENING';
CREATE TABLE IF NOT EXISTS community_operations_settings (
 guild_id text PRIMARY KEY, ledger_role_id text, rejoin_role_id text, officer_channel_id text
);
CREATE TABLE IF NOT EXISTS community_jobs (
 id uuid PRIMARY KEY, guild_id text NOT NULL, user_id text NOT NULL, actor_id text NOT NULL,
 action text NOT NULL CHECK(action IN('LEAVE','RETURN')), payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN('QUEUED','RUNNING','DONE','FAILED')),
 error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_jobs_pending ON community_jobs(guild_id,status,created_at);
ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS music_desk_message_id text;
ALTER TABLE member_leaves ADD COLUMN IF NOT EXISTS thread_archive_at timestamptz;
ALTER TABLE member_leaves ADD COLUMN IF NOT EXISTS thread_error text;
CREATE TABLE IF NOT EXISTS member_departures (
 id uuid PRIMARY KEY, guild_id text NOT NULL, user_id text NOT NULL, role_ids jsonb NOT NULL,
 nickname text, departure_kind text NOT NULL DEFAULT 'UNKNOWN' CHECK(departure_kind IN('VOLUNTARY','KICKED','BANNED','UNKNOWN')),
 departed_at timestamptz NOT NULL DEFAULT now(), returned_at timestamptz,
 review_status text NOT NULL DEFAULT 'AWAITING_RETURN' CHECK(review_status IN('AWAITING_RETURN','PENDING','APPROVED','DECLINED')),
 reviewed_by text, reviewed_at timestamptz, restored_role_ids jsonb, error text
);
CREATE INDEX IF NOT EXISTS departures_member ON member_departures(guild_id,user_id,departed_at DESC);
CREATE TABLE IF NOT EXISTS channel_permission_presets (
 id uuid PRIMARY KEY, guild_id text NOT NULL, name text NOT NULL, source_channel_id text NOT NULL,
 overwrites jsonb NOT NULL, include_members boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz,
 UNIQUE(guild_id,name)
);
CREATE TABLE IF NOT EXISTS channel_permission_batches (
 id uuid PRIMARY KEY, guild_id text NOT NULL, preset_id uuid NOT NULL REFERENCES channel_permission_presets(id),
 actor_id text NOT NULL, changes jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL CHECK(status IN('PREVIEW','APPLYING','APPLIED','PARTIAL','UNDONE')), expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes'
);

ALTER TABLE wosb_territory_settings ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;
ALTER TABLE wosb_territory_settings ADD COLUMN IF NOT EXISTS last_sync_error text;
ALTER TABLE channel_permission_batches ADD COLUMN IF NOT EXISTS preset_ids jsonb NOT NULL DEFAULT '[]';
ALTER TABLE room_music_settings ADD COLUMN IF NOT EXISTS avoid_recently_played boolean NOT NULL DEFAULT true;
ALTER TABLE room_music_settings ADD COLUMN IF NOT EXISTS recover_queue boolean NOT NULL DEFAULT true;
