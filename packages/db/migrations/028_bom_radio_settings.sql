-- Optional dedicated 24/7 radio configuration for music account 8.
CREATE TABLE IF NOT EXISTS bom_radio_settings(
  guild_id text PRIMARY KEY,
  voice_channel_id text,
  stream_url text,
  enabled boolean NOT NULL DEFAULT false,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
