CREATE TABLE IF NOT EXISTS wosb_territories (
 guild_id text NOT NULL, port_key text NOT NULL, name text NOT NULL,
 owner_tag text, taxing_tag text, window_start text, window_end text,
 time_zone text NOT NULL DEFAULT 'America/Chicago', game_offset_minutes integer NOT NULL DEFAULT 60,
 protection_started_at timestamptz, protected_until timestamptz,
 capture_bans jsonb NOT NULL DEFAULT '[]', version integer NOT NULL DEFAULT 1,
 updated_by text, updated_at timestamptz NOT NULL DEFAULT NOW(), PRIMARY KEY(guild_id,port_key)
);
CREATE TABLE IF NOT EXISTS wosb_territory_events (
 id text PRIMARY KEY, guild_id text NOT NULL, port_key text NOT NULL, actor_id text NOT NULL,
 kind text NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS wosb_territory_settings (
 guild_id text PRIMARY KEY, channel_id text, reviewer_ids jsonb NOT NULL DEFAULT '[]',
 map_message_id text, image_hash text, last_review_date text
);
CREATE TABLE IF NOT EXISTS wosb_territory_reviews (
 id text PRIMARY KEY, guild_id text NOT NULL, review_date text NOT NULL, ports jsonb NOT NULL,
 expires_at timestamptz NOT NULL, completed jsonb NOT NULL DEFAULT '[]', UNIQUE(guild_id,review_date)
);
