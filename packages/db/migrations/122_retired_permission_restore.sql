-- Retain an audit of the one-time restoration of the retired private layout.
CREATE TABLE IF NOT EXISTS channel_layout_restores (
 guild_id text NOT NULL, channel_id text NOT NULL, layout_key text NOT NULL,
 before_restore jsonb NOT NULL, status text NOT NULL DEFAULT 'PENDING',
 restored_at timestamptz, PRIMARY KEY(guild_id,channel_id)
);
