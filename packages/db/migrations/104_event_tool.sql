CREATE TABLE IF NOT EXISTS guild_event_campaigns(
 id uuid PRIMARY KEY,guild_id text NOT NULL,name text NOT NULL,start_date date NOT NULL,timezone text NOT NULL,
 announcement_channel_id text,participant_role_ids jsonb NOT NULL DEFAULT '[]',active boolean NOT NULL DEFAULT true,
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_guild_event ON guild_event_campaigns(guild_id) WHERE active;
CREATE TABLE IF NOT EXISTS guild_event_items(
 campaign_id uuid NOT NULL REFERENCES guild_event_campaigns(id),user_id text NOT NULL,item_key text NOT NULL,
 completed boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,changed_at timestamptz NOT NULL DEFAULT now(),
 due_at timestamptz,announcement_id text,announcement_channel_id text,error text,
 PRIMARY KEY(campaign_id,user_id,item_key)
);
CREATE INDEX IF NOT EXISTS guild_event_items_due ON guild_event_items(due_at) WHERE due_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS guild_event_quests(
 campaign_id uuid NOT NULL REFERENCES guild_event_campaigns(id),user_id text NOT NULL,quest_date date NOT NULL,
 completed boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(campaign_id,user_id,quest_date)
);
CREATE TABLE IF NOT EXISTS guild_event_reminders(
 campaign_id uuid NOT NULL REFERENCES guild_event_campaigns(id),user_id text NOT NULL,enabled boolean NOT NULL DEFAULT false,
 mode text NOT NULL DEFAULT 'TIMES',times jsonb NOT NULL DEFAULT '["09:00"]',interval_minutes integer,
 timezone text NOT NULL DEFAULT 'America/Chicago',next_due_at timestamptz,last_slot text,last_status text,error text,
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(campaign_id,user_id)
);
CREATE INDEX IF NOT EXISTS guild_event_reminders_due ON guild_event_reminders(next_due_at) WHERE enabled;
