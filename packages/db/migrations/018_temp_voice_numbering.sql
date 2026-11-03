-- v3.8.1: configurable numbering for Join-to-Create temporary voice rooms.
ALTER TABLE voice_automation_rules
  ADD COLUMN IF NOT EXISTS number_style VARCHAR(16) NOT NULL DEFAULT 'NONE';

ALTER TABLE temp_voice_sessions
  ADD COLUMN IF NOT EXISTS room_number INT NULL;

CREATE INDEX IF NOT EXISTS idx_temp_voice_rule_number
  ON temp_voice_sessions (guild_id, rule_id, room_number)
  WHERE status='ACTIVE' AND room_number IS NOT NULL;
