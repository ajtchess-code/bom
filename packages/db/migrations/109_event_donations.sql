CREATE TABLE IF NOT EXISTS guild_event_donations (
 id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES guild_event_campaigns(id),
 user_id text NOT NULL, display_name text NOT NULL,
 amount integer NOT NULL CHECK(amount BETWEEN 1 AND 1000000000),
 recorded_by text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 batch_id uuid NOT NULL, voided_by text, voided_at timestamptz,
 UNIQUE(campaign_id,batch_id,user_id)
);
CREATE INDEX IF NOT EXISTS event_donations_campaign ON guild_event_donations(campaign_id,user_id) WHERE voided_at IS NULL;
