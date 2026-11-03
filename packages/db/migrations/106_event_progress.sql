ALTER TABLE guild_event_items ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 0;
ALTER TABLE guild_event_items ADD COLUMN IF NOT EXISTS already_owned boolean NOT NULL DEFAULT false;
ALTER TABLE guild_event_items ADD COLUMN IF NOT EXISTS completed_at timestamptz;
UPDATE guild_event_items SET completed_at=changed_at WHERE completed AND completed_at IS NULL;
-- Preserve completed legacy quantities, using the original published targets.
UPDATE guild_event_items SET quantity=CASE item_key WHEN 'heavy-shot' THEN 50000 WHEN 'saxon-shot' THEN 100000 WHEN '32-long' THEN 170 WHEN '36-unicorn' THEN 170 WHEN '42-carronade' THEN 170 WHEN '18-long' THEN 80 WHEN '28-carronade' THEN 80 WHEN '16-carronade' THEN 55 ELSE quantity END WHERE completed AND quantity=0;
CREATE TABLE IF NOT EXISTS guild_event_participants(campaign_id uuid NOT NULL REFERENCES guild_event_campaigns(id),user_id text NOT NULL,display_name text NOT NULL,joined_at timestamptz NOT NULL DEFAULT now(),last_active_at timestamptz NOT NULL DEFAULT now(),last_rank integer,PRIMARY KEY(campaign_id,user_id));
INSERT INTO guild_event_participants(campaign_id,user_id,display_name)
SELECT campaign_id,user_id,'Captain '||right(user_id,4) FROM guild_event_items UNION SELECT campaign_id,user_id,'Captain '||right(user_id,4) FROM guild_event_quests UNION SELECT campaign_id,user_id,'Captain '||right(user_id,4) FROM guild_event_reminders WHERE enabled ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS guild_event_milestones(campaign_id uuid NOT NULL,user_id text NOT NULL,item_key text NOT NULL,milestone integer NOT NULL CHECK(milestone BETWEEN 1 AND 4),message_id text NOT NULL,channel_id text NOT NULL,PRIMARY KEY(campaign_id,user_id,item_key,milestone),FOREIGN KEY(campaign_id,user_id,item_key) REFERENCES guild_event_items(campaign_id,user_id,item_key));
INSERT INTO guild_event_milestones(campaign_id,user_id,item_key,milestone,message_id,channel_id) SELECT campaign_id,user_id,item_key,4,announcement_id,announcement_channel_id FROM guild_event_items WHERE announcement_id IS NOT NULL AND announcement_channel_id IS NOT NULL ON CONFLICT DO NOTHING;
ALTER TABLE guild_event_campaigns ADD COLUMN IF NOT EXISTS sticky_message_id text;
ALTER TABLE guild_event_campaigns ADD COLUMN IF NOT EXISTS sticky_channel_id text;
ALTER TABLE guild_event_campaigns ADD COLUMN IF NOT EXISTS sticky_hash text;
