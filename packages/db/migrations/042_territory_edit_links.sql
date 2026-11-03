CREATE TABLE IF NOT EXISTS wosb_territory_edit_links (
 token_hash text PRIMARY KEY,
 guild_id text NOT NULL,
 user_id text NOT NULL,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS territory_edit_links_expiry ON wosb_territory_edit_links(expires_at);
