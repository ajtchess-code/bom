-- Give the public Battle Map its own Discord message and gray action row.
-- This leaves the Membership Control Desk as a separate pinned surface.
ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS battle_map_message_id TEXT;
