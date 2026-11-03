-- More flexible spontaneous Banter; no member preferences or opt-out controls.
ALTER TABLE bom_banter_settings ADD COLUMN IF NOT EXISTS spontaneous_user_cooldown_seconds INTEGER NOT NULL DEFAULT 30 CHECK (spontaneous_user_cooldown_seconds BETWEEN 0 AND 3600);
ALTER TABLE bom_banter_settings ADD COLUMN IF NOT EXISTS minimum_participants INTEGER NOT NULL DEFAULT 1 CHECK (minimum_participants BETWEEN 1 AND 5);
ALTER TABLE bom_banter_settings DROP CONSTRAINT IF EXISTS bom_banter_settings_spontaneity_check;
ALTER TABLE bom_banter_settings ADD CONSTRAINT bom_banter_settings_spontaneity_check CHECK (spontaneity BETWEEN 0 AND 100);
ALTER TABLE bom_banter_settings DROP CONSTRAINT IF EXISTS bom_banter_settings_channel_cooldown_minutes_check;
ALTER TABLE bom_banter_settings ADD CONSTRAINT bom_banter_settings_channel_cooldown_minutes_check CHECK (channel_cooldown_minutes BETWEEN 0 AND 240);
ALTER TABLE bom_banter_settings DROP CONSTRAINT IF EXISTS bom_banter_settings_daily_spontaneous_limit_check;
ALTER TABLE bom_banter_settings ADD CONSTRAINT bom_banter_settings_daily_spontaneous_limit_check CHECK (daily_spontaneous_limit BETWEEN 0 AND 1000);
ALTER TABLE bom_banter_settings DROP CONSTRAINT IF EXISTS bom_banter_settings_daily_total_limit_check;
ALTER TABLE bom_banter_settings ADD CONSTRAINT bom_banter_settings_daily_total_limit_check CHECK (daily_total_limit BETWEEN 1 AND 1000);
ALTER TABLE bom_banter_settings ALTER COLUMN spontaneity SET DEFAULT 20;
ALTER TABLE bom_banter_settings ALTER COLUMN channel_cooldown_minutes SET DEFAULT 3;
ALTER TABLE bom_banter_settings ALTER COLUMN daily_spontaneous_limit SET DEFAULT 100;
ALTER TABLE bom_banter_settings ALTER COLUMN daily_total_limit SET DEFAULT 300;
-- Existing administrator settings and provider budgets are preserved.
