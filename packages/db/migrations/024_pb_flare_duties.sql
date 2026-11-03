-- Allow independent flare volunteering and one active duty per captain and flare.
ALTER TABLE pb_signups ADD COLUMN IF NOT EXISTS flare_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE pb_signups ADD COLUMN IF NOT EXISTS flare_duty TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS pb_signups_flare_lookup ON pb_signups(battle_id,flare_duty) WHERE flare_duty IS NOT NULL;
