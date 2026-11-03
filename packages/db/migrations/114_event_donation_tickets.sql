-- Recover all approved Heavy receipts missing from the donation ledger.
-- Preserve their IDs, and do not duplicate receipts already recorded there.
ALTER TABLE guild_event_donation_requests DROP CONSTRAINT IF EXISTS guild_event_donation_requests_check;
INSERT INTO guild_event_donations(id,campaign_id,user_id,display_name,amount,recorded_by,batch_id,request_id,recorded_at)
SELECT r.id,r.campaign_id,r.user_id,r.display_name,r.amount,COALESCE(r.reviewed_by,'migration'),r.id,r.id,COALESCE(r.reviewed_at,r.created_at)
FROM guild_event_donation_requests r WHERE r.status='APPROVED' AND r.resource='HEAVY'
ON CONFLICT DO NOTHING;
