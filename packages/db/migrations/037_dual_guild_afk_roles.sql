-- Separate BOM and BoM 2 AFK mappings. Additive; previous leaves stay valid.
-- membership_settings.afk_role_id remains the BOM AFK role for backwards compatibility.
ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS bom2_member_role_id text;
ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS bom2_afk_role_id text;
-- Freeze the assigned AFK role on the leave, so settings changes cannot break return.
ALTER TABLE member_leaves ADD COLUMN IF NOT EXISTS assigned_afk_role_id text;
ALTER TABLE member_leaves ADD COLUMN IF NOT EXISTS membership_group text;
-- Existing leave rows had one global AFK role. A NULL snapshot falls back to that setting.
