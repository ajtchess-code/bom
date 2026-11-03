
ALTER TABLE recruitment_settings ADD COLUMN IF NOT EXISTS cleanup_delay_seconds integer NOT NULL DEFAULT 60 CHECK(cleanup_delay_seconds BETWEEN 10 AND 86400);
ALTER TABLE recruitment_settings ADD COLUMN IF NOT EXISTS archive_channel_id text;
CREATE TABLE IF NOT EXISTS recruitment_completion_jobs(
 application_id uuid PRIMARY KEY REFERENCES recruitment_applications(id), guild_id text NOT NULL,
 status text NOT NULL DEFAULT 'QUEUED', role_state text NOT NULL DEFAULT 'PENDING', dm_state text NOT NULL DEFAULT 'PENDING',
 archive_state text NOT NULL DEFAULT 'PENDING',transcript_state text NOT NULL DEFAULT 'PENDING', transcript_cursor text, transcript jsonb NOT NULL DEFAULT '[]',
 delete_after timestamptz, error text, attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, deletion_cancelled boolean NOT NULL DEFAULT false, channel_deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pb_cancellation_deliveries(
 battle_id uuid NOT NULL REFERENCES pb_battles(id), user_id text NOT NULL, status text NOT NULL DEFAULT 'PENDING',
 error text, attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 PRIMARY KEY(battle_id,user_id)
);
ALTER TABLE pb_battles ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE pb_battles ADD COLUMN IF NOT EXISTS cancelled_by text;
ALTER TABLE pb_battles ADD COLUMN IF NOT EXISTS cancellation_reason text;
-- Preserve existing rows while extending historical status checks for explicit cancellation.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT conname FROM pg_constraint WHERE conrelid='pb_battles'::regclass AND contype='c' AND pg_get_constraintdef(oid) ~ '\mstatus\M'
 LOOP EXECUTE format('ALTER TABLE pb_battles DROP CONSTRAINT %I',r.conname); END LOOP;
END $$;
ALTER TABLE pb_battles ADD CONSTRAINT pb_battle_lifecycle_check CHECK(status IN('OPEN','CLOSED','FINISHED','DELETED','CANCELLED'));
CREATE INDEX IF NOT EXISTS recruitment_completion_due ON recruitment_completion_jobs(next_attempt_at) WHERE status NOT IN('COMPLETE','CANCELLED');
CREATE TABLE IF NOT EXISTS game_hub_settings(
 guild_id text NOT NULL,module text NOT NULL CHECK(module IN('minecraft','clash')),settings jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(guild_id,module)
);
CREATE TABLE IF NOT EXISTS game_hub_records(
 id uuid PRIMARY KEY,guild_id text NOT NULL,module text NOT NULL CHECK(module IN('minecraft','clash')),
 kind text NOT NULL,owner_id text NOT NULL,title text NOT NULL,body text NOT NULL DEFAULT '',data jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_hub_records_scope ON game_hub_records(guild_id,module,kind,updated_at DESC);
CREATE TABLE IF NOT EXISTS game_hub_links(
 guild_id text NOT NULL,module text NOT NULL,account_id text NOT NULL,user_id text NOT NULL,display_name text NOT NULL,
 primary_account boolean NOT NULL DEFAULT false,linked_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(guild_id,module,account_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS game_hub_primary_account ON game_hub_links(guild_id,module,user_id) WHERE primary_account;
CREATE TABLE IF NOT EXISTS game_hub_link_codes(
 code_hash text PRIMARY KEY,guild_id text NOT NULL,user_id text NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz
);
CREATE TABLE IF NOT EXISTS game_hub_snapshots(
 guild_id text NOT NULL,module text NOT NULL,resource text NOT NULL,data jsonb,error text,fetched_at timestamptz,checked_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(guild_id,module,resource)
);
CREATE TABLE IF NOT EXISTS game_hub_history(
 id bigserial PRIMARY KEY,guild_id text NOT NULL,module text NOT NULL,resource text NOT NULL,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_hub_history_scope ON game_hub_history(guild_id,module,resource,created_at DESC);
CREATE TABLE IF NOT EXISTS game_hub_jobs(
 id uuid PRIMARY KEY,guild_id text NOT NULL,module text NOT NULL,user_id text NOT NULL,kind text NOT NULL,payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'QUEUED',result jsonb,error text,attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS game_hub_notices(
 id uuid PRIMARY KEY,guild_id text NOT NULL,module text NOT NULL,user_id text NOT NULL,dedupe_key text NOT NULL,title text NOT NULL,body text NOT NULL,
 read_at timestamptz,dm_status text NOT NULL DEFAULT 'PENDING',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(guild_id,module,user_id,dedupe_key)
);
CREATE TABLE IF NOT EXISTS game_hub_nonces(nonce text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS game_hub_reservations(
 id uuid PRIMARY KEY,guild_id text NOT NULL,clan_tag text NOT NULL,war_key text NOT NULL,target integer NOT NULL,user_id text NOT NULL,account_id text NOT NULL,
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(guild_id,clan_tag,war_key,target)
);

ALTER TABLE pb_battles ADD COLUMN IF NOT EXISTS discord_scheduled_event_id text;
ALTER TABLE pb_battles ADD COLUMN IF NOT EXISTS discord_event_cancelled_at timestamptz;
ALTER TABLE pb_battles ADD COLUMN IF NOT EXISTS discord_event_error text;
