-- Durable receipts: a repeated Discord event must not repeat an action.
CREATE TABLE IF NOT EXISTS misfit_action_receipts (
 guild_id text NOT NULL,
 request_key text NOT NULL,
 actor_id text NOT NULL,
 kind text NOT NULL,
 status text NOT NULL DEFAULT 'STARTED' CHECK(status IN ('STARTED','DONE','UNCERTAIN')),
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT NOW(),
 updated_at timestamptz NOT NULL DEFAULT NOW(),
 PRIMARY KEY(guild_id,request_key)
);
CREATE INDEX IF NOT EXISTS misfit_action_receipts_actor ON misfit_action_receipts(guild_id,actor_id,created_at DESC);
