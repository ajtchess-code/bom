-- Admiralty check-ins and reversible AFK transitions (additive migration).
ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS afk_role_id text;
ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS leave_member_role_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE member_leaves ADD COLUMN IF NOT EXISTS removed_role_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE member_leaves ADD COLUMN IF NOT EXISTS had_member_role boolean;
ALTER TABLE member_leaves ADD COLUMN IF NOT EXISTS former_nickname text;
ALTER TABLE member_leaves ADD COLUMN IF NOT EXISTS former_prefix text;
ALTER TABLE member_leaves ADD COLUMN IF NOT EXISTS role_transition_state text NOT NULL DEFAULT 'NONE';
ALTER TABLE member_leaves ADD COLUMN IF NOT EXISTS checkin_id uuid;
CREATE TABLE IF NOT EXISTS membership_checkins (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  sent_by text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CONTINUING','AWAY','NOT_CONTINUING','DM_FAILED','CANCELLED')),
  dm_channel_id text,
  dm_message_id text,
  expected_return_at timestamptz,
  return_text text,
  response_note text,
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS membership_checkins_one_pending ON membership_checkins(guild_id,user_id) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS membership_checkins_recent ON membership_checkins(guild_id,sent_at DESC);
CREATE INDEX IF NOT EXISTS membership_checkins_member ON membership_checkins(guild_id,user_id,sent_at DESC);
