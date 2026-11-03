-- Safe fleet-panel reset jobs: retain historical battle records and member attendance.
CREATE TABLE IF NOT EXISTS pb_reset_jobs (
 id uuid PRIMARY KEY,
 guild_id text NOT NULL,
 actor_id text NOT NULL,
 status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','COMPLETED','PARTIAL','FAILED')),
 affected_battles jsonb NOT NULL DEFAULT '[]'::jsonb,
 removed_discord_messages integer NOT NULL DEFAULT 0,
 cleanup_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT NOW(),
 updated_at timestamptz NOT NULL DEFAULT NOW(),
 completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS pb_reset_jobs_guild_idx ON pb_reset_jobs(guild_id, created_at DESC);
