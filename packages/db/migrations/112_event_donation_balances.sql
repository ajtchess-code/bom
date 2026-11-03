-- Signed correction entries preserve all original receipts.
ALTER TABLE guild_event_donations DROP CONSTRAINT IF EXISTS guild_event_donations_amount_check;
ALTER TABLE guild_event_donations ADD CONSTRAINT guild_event_donations_amount_check CHECK(amount BETWEEN -1000000000 AND 1000000000 AND amount <> 0);
ALTER TABLE guild_event_donations ADD COLUMN IF NOT EXISTS correction_reason text;
ALTER TABLE guild_event_donations ADD COLUMN IF NOT EXISTS balance_before bigint;
ALTER TABLE guild_event_donations ADD COLUMN IF NOT EXISTS balance_after bigint;
