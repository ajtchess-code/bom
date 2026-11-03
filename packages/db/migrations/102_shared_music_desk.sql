-- Several voice rooms may post separate player panels in one Control Desk channel.
-- The voice-room identity remains unique within the guild.
ALTER TABLE music_rooms DROP CONSTRAINT IF EXISTS music_rooms_text_channel_id_key;
CREATE INDEX IF NOT EXISTS music_rooms_guild_text_channel_idx ON music_rooms(guild_id,text_channel_id);
