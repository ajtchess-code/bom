CREATE TABLE IF NOT EXISTS guild_event_crafting_costs(
 guild_id text NOT NULL,ship_name text NOT NULL,costs jsonb NOT NULL DEFAULT '{}'::jsonb,
 version integer NOT NULL DEFAULT 1,updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(guild_id,ship_name));
CREATE TABLE IF NOT EXISTS guild_event_earnings(
 campaign_id uuid NOT NULL REFERENCES guild_event_campaigns(id),user_id text NOT NULL,
 additional_lollipops bigint NOT NULL DEFAULT 0 CHECK(additional_lollipops BETWEEN 0 AND 1000000000),
 version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(campaign_id,user_id));
-- Preserve previously completed manual Culverin goals; reconcile partial counts.
UPDATE guild_event_items SET quantity=65 WHERE item_key='8-culverin' AND completed AND quantity<65;
UPDATE guild_event_items SET completed=true,completed_at=COALESCE(completed_at,changed_at),version=version+1,due_at=now()+interval '30 seconds' WHERE item_key='8-culverin' AND NOT completed AND quantity>=65;
