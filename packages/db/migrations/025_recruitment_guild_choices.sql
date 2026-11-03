-- Distinguish BOM and BoM acceptance tracks without separate trial workflows.
ALTER TABLE recruitment_applications ADD COLUMN IF NOT EXISTS target_guild_tag TEXT NOT NULL DEFAULT 'BOM';
ALTER TABLE recruitment_settings ADD COLUMN IF NOT EXISTS accepted_second_guild_role_id TEXT;
