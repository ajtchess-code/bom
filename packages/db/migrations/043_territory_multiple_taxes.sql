ALTER TABLE wosb_territories ADD COLUMN IF NOT EXISTS taxes jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Move the old single-tax protection to its tax entry without extending the deadline.
UPDATE wosb_territories
SET taxes=jsonb_build_array(jsonb_build_object(
 'id','legacy-'||port_key,'tag',taxing_tag,
 'started_at',protection_started_at,'protected_until',protected_until)),
 protection_started_at=NULL,protected_until=NULL
WHERE taxing_tag IS NOT NULL AND taxing_tag<>'' AND taxes='[]'::jsonb;
