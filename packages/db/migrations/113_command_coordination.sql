CREATE TABLE IF NOT EXISTS pb_withdrawal_requests (
 id uuid PRIMARY KEY, guild_id text NOT NULL,battle_id uuid NOT NULL REFERENCES pb_battles(id) ON DELETE CASCADE,
 user_id text NOT NULL,reason text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,resolved_by text,
 UNIQUE(battle_id,user_id)
);
CREATE TABLE IF NOT EXISTS pb_player_phases (
 guild_id text NOT NULL,battle_id uuid NOT NULL REFERENCES pb_battles(id) ON DELETE CASCADE,user_id text NOT NULL,
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,transfer_minutes integer NOT NULL DEFAULT 0 CHECK(transfer_minutes BETWEEN 0 AND 120),
 note text NOT NULL DEFAULT '',updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(battle_id,user_id),CHECK(ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS pb_player_phases_user ON pb_player_phases(guild_id,user_id,starts_at);
CREATE TABLE IF NOT EXISTS pb_attendance_audit (
 id bigserial PRIMARY KEY,guild_id text NOT NULL,battle_id uuid NOT NULL,user_id text NOT NULL,
 before_state jsonb,after_state jsonb,actor_id text,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION audit_pb_attendance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO pb_attendance_audit(guild_id,battle_id,user_id,before_state,after_state,actor_id)
 VALUES(NEW.guild_id,NEW.battle_id,NEW.user_id,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW),NEW.recorded_by);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pb_attendance_audit_trigger ON pb_attendance_outcomes;
CREATE TRIGGER pb_attendance_audit_trigger AFTER INSERT OR UPDATE ON pb_attendance_outcomes FOR EACH ROW EXECUTE FUNCTION audit_pb_attendance();

CREATE TABLE IF NOT EXISTS dashboard_saved_views (
 guild_id text NOT NULL,user_id text NOT NULL,section text NOT NULL,name text NOT NULL,
 state jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(guild_id,user_id,section,name)
);

CREATE TABLE IF NOT EXISTS music_session_suggestions(id uuid PRIMARY KEY,guild_id text NOT NULL,room_id uuid NOT NULL REFERENCES music_rooms(id) ON DELETE CASCADE,created_by text NOT NULL,query text NOT NULL,status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','QUEUED')),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS music_session_votes(suggestion_id uuid REFERENCES music_session_suggestions(id) ON DELETE CASCADE,user_id text NOT NULL,PRIMARY KEY(suggestion_id,user_id));

CREATE TABLE IF NOT EXISTS port_strategy_notes(guild_id text NOT NULL,port_key text NOT NULL,priority text NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('LOW','NORMAL','HIGH','CRITICAL')),notes text NOT NULL DEFAULT '',version integer NOT NULL DEFAULT 1,updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(guild_id,port_key));
CREATE INDEX IF NOT EXISTS wiki_articles_global_search ON wiki_articles USING gin(to_tsvector('simple',coalesce(title,'')||' '||coalesce(summary,'')||' '||coalesce(content,'')));

CREATE TABLE IF NOT EXISTS dm_delivery_history(id bigserial PRIMARY KEY,guild_id text NOT NULL,user_id text NOT NULL,source text NOT NULL,status text NOT NULL CHECK(status IN ('SENT','MUTED','BLOCKED','FAILED')),message_id text,error_code text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS dm_delivery_user ON dm_delivery_history(guild_id,user_id,created_at DESC);

ALTER TABLE room_music_settings ADD COLUMN IF NOT EXISTS fair_queue boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS pb_roster_checkpoints(id uuid PRIMARY KEY,guild_id text NOT NULL,battle_id uuid NOT NULL REFERENCES pb_battles(id) ON DELETE CASCADE,name text NOT NULL,roster jsonb NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS pb_roster_checkpoints_battle ON pb_roster_checkpoints(guild_id,battle_id,created_at DESC);
