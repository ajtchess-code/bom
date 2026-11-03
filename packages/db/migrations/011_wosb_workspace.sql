-- WoSB private dashboard workspace: ship builds and port battles.
CREATE TABLE IF NOT EXISTS ship_builds (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  owner_id text NOT NULL,
  name text NOT NULL,
  ship_key text NOT NULL,
  role text NOT NULL DEFAULT 'General',
  notes text NOT NULL DEFAULT '',
  scope text NOT NULL DEFAULT 'PERSONAL',
  allowed_role_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_pb_build boolean NOT NULL DEFAULT FALSE,
  loadout jsonb NOT NULL DEFAULT '{}'::jsonb,
  rules_revision text,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz
);
CREATE INDEX IF NOT EXISTS ship_builds_owner_idx ON ship_builds(guild_id,owner_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS ship_builds_ship_idx ON ship_builds(guild_id,ship_key,scope,is_pb_build);

CREATE TABLE IF NOT EXISTS ship_build_revisions (
  id uuid PRIMARY KEY,
  build_id uuid NOT NULL REFERENCES ship_builds(id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  revision integer NOT NULL,
  snapshot jsonb NOT NULL,
  edited_by text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ship_build_revisions_idx ON ship_build_revisions(build_id,revision DESC);

CREATE TABLE IF NOT EXISTS pb_battles (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  port_key text NOT NULL,
  port_name text NOT NULL,
  rate integer,
  team_size integer NOT NULL,
  attacker text,
  defender text,
  starts_at timestamptz,
  status text NOT NULL DEFAULT 'OPEN',
  ship_targets jsonb NOT NULL DEFAULT '{}'::jsonb,
  commander_slots jsonb NOT NULL DEFAULT '{}'::jsonb,
  discord_channel_id text,
  discord_signup_message_id text,
  discord_roster_message_id text,
  revision integer NOT NULL DEFAULT 1,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS pb_battles_schedule_idx ON pb_battles(guild_id,status,starts_at);

CREATE TABLE IF NOT EXISTS pb_signups (
  id uuid PRIMARY KEY,
  battle_id uuid NOT NULL REFERENCES pb_battles(id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  user_id text,
  guest_name text,
  display_name text NOT NULL,
  ships jsonb NOT NULL DEFAULT '[]'::jsonb,
  preferred_ships jsonb NOT NULL DEFAULT '[]'::jsonb,
  signup_status text NOT NULL DEFAULT 'ATTENDING',
  confirmed_ship text,
  horn_capable boolean,
  horn_preferred boolean NOT NULL DEFAULT FALSE,
  horn_duty text,
  formation text,
  commander_duty text,
  late_minutes integer NOT NULL DEFAULT 0,
  build_id uuid REFERENCES ship_builds(id) ON DELETE SET NULL,
  assignment_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(battle_id,user_id),
  UNIQUE(battle_id,guest_name)
);
CREATE INDEX IF NOT EXISTS pb_signups_battle_idx ON pb_signups(battle_id,signup_status,confirmed_ship);

CREATE TABLE IF NOT EXISTS pb_preferred_profiles (
  guild_id text NOT NULL,
  user_id text NOT NULL,
  rates jsonb NOT NULL DEFAULT '{}'::jsonb,
  horn_preferred boolean NOT NULL DEFAULT FALSE,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id,user_id)
);

CREATE TABLE IF NOT EXISTS pb_assignment_events (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  battle_id uuid NOT NULL REFERENCES pb_battles(id) ON DELETE CASCADE,
  signup_id uuid,
  actor_id text,
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS pb_assignment_events_battle_idx ON pb_assignment_events(battle_id,created_at DESC);
