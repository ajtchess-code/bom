-- BOM Christmas Secret Santa (role-gated, anonymous with live recipient wishlists)
CREATE TABLE IF NOT EXISTS secret_santa_events (
  id UUID PRIMARY KEY,
  guild_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'BOM Christmas Secret Santa',
  description TEXT NOT NULL DEFAULT '',
  budget_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  allowed_role_ids TEXT[] NOT NULL DEFAULT '{}',
  signup_closes_at TIMESTAMPTZ,
  gift_deadline_at TIMESTAMPTZ,
  channel_id TEXT,
  message_id TEXT,
  created_by TEXT NOT NULL,
  matched_at TIMESTAMPTZ,
  revealed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_secret_santa_events_guild_created
  ON secret_santa_events (guild_id, created_at DESC);

CREATE TABLE IF NOT EXISTS secret_santa_participants (
  event_id UUID NOT NULL REFERENCES secret_santa_events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  ign TEXT NOT NULL DEFAULT '',
  wishlist TEXT NOT NULL DEFAULT '',
  avoid_list TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  backup_elf BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS secret_santa_exclusions (
  event_id UUID NOT NULL REFERENCES secret_santa_events(id) ON DELETE CASCADE,
  user_a TEXT NOT NULL,
  user_b TEXT NOT NULL,
  PRIMARY KEY (event_id, user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE TABLE IF NOT EXISTS secret_santa_assignments (
  event_id UUID NOT NULL REFERENCES secret_santa_events(id) ON DELETE CASCADE,
  giver_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  gift_sent BOOLEAN NOT NULL DEFAULT FALSE,
  gift_sent_at TIMESTAMPTZ,
  gift_sent_note TEXT NOT NULL DEFAULT '',
  gift_received BOOLEAN NOT NULL DEFAULT FALSE,
  gift_received_at TIMESTAMPTZ,
  dm_delivered_at TIMESTAMPTZ,
  dm_last_error TEXT,
  last_reminded_at TIMESTAMPTZ,
  wishlist_notified_at TIMESTAMPTZ,
  PRIMARY KEY (event_id, giver_id),
  UNIQUE (event_id, recipient_id),
  CHECK (giver_id <> recipient_id)
);
