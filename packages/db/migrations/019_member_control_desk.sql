ALTER TABLE membership_settings
  ADD COLUMN IF NOT EXISTS leave_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS leave_officer_role_id text,
  ADD COLUMN IF NOT EXISTS leave_reminder_channel_id text;

CREATE TABLE IF NOT EXISTS member_leaves (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  status text NOT NULL DEFAULT 'AWAY' CHECK (status IN ('AWAY','RETURNED','CANCELLED')),
  return_at timestamptz NOT NULL,
  reason text,
  starter_message_id text,
  thread_id text,
  reminder_message_id text,
  reminded boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz,
  returned_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS member_leaves_one_active_idx ON member_leaves(guild_id,user_id) WHERE status='AWAY';
CREATE INDEX IF NOT EXISTS member_leaves_due_idx ON member_leaves(guild_id,status,return_at) WHERE status='AWAY';
CREATE INDEX IF NOT EXISTS member_leaves_history_idx ON member_leaves(guild_id,user_id,started_at DESC);
