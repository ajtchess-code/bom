ALTER TABLE guild_event_campaigns ADD COLUMN IF NOT EXISTS event_end_at timestamptz;
ALTER TABLE guild_event_campaigns ADD COLUMN IF NOT EXISTS reward_version integer NOT NULL DEFAULT 0;
UPDATE guild_event_campaigns SET event_end_at=CASE WHEN start_date BETWEEN '2026-10-20' AND '2026-10-31' THEN '2026-11-07T00:00:00+04:00'::timestamptz ELSE (start_date+14)::timestamp AT TIME ZONE timezone END WHERE event_end_at IS NULL;
CREATE TABLE IF NOT EXISTS guild_event_donation_requests(
 id uuid PRIMARY KEY,campaign_id uuid NOT NULL REFERENCES guild_event_campaigns(id),user_id text NOT NULL,display_name text NOT NULL,
 resource text NOT NULL CHECK(resource IN ('HEAVY','SAXON')),purpose text NOT NULL CHECK(purpose IN ('GOAL','TICKETS')),
 amount integer NOT NULL CHECK(amount BETWEEN 1 AND 1000000000),tickets integer NOT NULL DEFAULT 0,
 request_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','EXPIRED','VOIDED')),
 reviewed_by text,reviewed_at timestamptz,voided_by text,voided_at timestamptz,thread_id text,message_id text,channel_id text,due_at timestamptz DEFAULT now(),error text,
 UNIQUE(campaign_id,user_id,request_key),
 CHECK((purpose='GOAL' AND resource='HEAVY' AND tickets=0) OR (purpose='TICKETS' AND ((resource='HEAVY' AND amount%5000=0 AND tickets=amount/5000) OR (resource='SAXON' AND amount%10000=0 AND tickets=amount/10000))))
);
CREATE INDEX IF NOT EXISTS event_request_due ON guild_event_donation_requests(due_at) WHERE due_at IS NOT NULL;
ALTER TABLE guild_event_donations ADD COLUMN IF NOT EXISTS request_id uuid UNIQUE REFERENCES guild_event_donation_requests(id);
CREATE TABLE IF NOT EXISTS guild_event_results(
 campaign_id uuid PRIMARY KEY REFERENCES guild_event_campaigns(id),drawn_at timestamptz NOT NULL DEFAULT now(),
 total_tickets bigint NOT NULL,winning_ticket bigint,winner_id text,snapshot jsonb NOT NULL,
 donor_winners jsonb NOT NULL,collector_winners jsonb NOT NULL,published_at timestamptz,next_publish_at timestamptz NOT NULL DEFAULT now(),message_id text,channel_id text,error text
);
CREATE TABLE IF NOT EXISTS guild_event_prizes(
 campaign_id uuid NOT NULL REFERENCES guild_event_campaigns(id),user_id text NOT NULL,kind text NOT NULL,prize text NOT NULL,
 fulfilled_at timestamptz,fulfilled_by text,PRIMARY KEY(campaign_id,user_id,kind)
);
ALTER TABLE bot_branding_state ADD COLUMN IF NOT EXISTS banner_sha text;
ALTER TABLE bot_branding_state ADD COLUMN IF NOT EXISTS role_icon_sha text;
ALTER TABLE guild_event_campaigns ADD COLUMN IF NOT EXISTS rewards_enabled boolean NOT NULL DEFAULT true;
UPDATE guild_event_campaigns SET rewards_enabled=false WHERE NOT active;
