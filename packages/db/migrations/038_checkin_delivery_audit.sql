-- Persist every Admiralty check-in delivery decision, including skips that never created a check-in.
-- Historical skipped attempts cannot be reconstructed from the old membership_checkins table.
CREATE TABLE IF NOT EXISTS membership_checkin_delivery_attempts (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  batch_id uuid NOT NULL,
  requested_by text NOT NULL,
  display_name text,
  username text,
  status text NOT NULL,
  reason text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS membership_delivery_latest ON membership_checkin_delivery_attempts(guild_id,user_id,attempted_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS membership_delivery_batch ON membership_checkin_delivery_attempts(guild_id,batch_id);
