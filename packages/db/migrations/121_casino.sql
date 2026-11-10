CREATE TABLE IF NOT EXISTS casino_accounts (
 guild_id text NOT NULL, account text NOT NULL, balance numeric(78,0) NOT NULL DEFAULT 0 CHECK(balance>=0),
 PRIMARY KEY(guild_id,account)
);
CREATE TABLE IF NOT EXISTS casino_ledger (
 id uuid PRIMARY KEY, guild_id text NOT NULL, from_account text NOT NULL, to_account text NOT NULL,
 amount numeric(78,0) NOT NULL CHECK(amount>0), reason text NOT NULL, reference text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS casino_ledger_account ON casino_ledger(guild_id,created_at DESC);
CREATE TABLE IF NOT EXISTS casino_requests (
 id uuid PRIMARY KEY, guild_id text NOT NULL, user_id text NOT NULL, item text NOT NULL,
 quantity numeric(78,0) NOT NULL CHECK(quantity>0), screenshot bytea NOT NULL, screenshot_hash text NOT NULL, notes text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 coins numeric(78,0), reviewed_by text, review_note text, created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
 request_key uuid NOT NULL, UNIQUE(guild_id,user_id,request_key), UNIQUE(guild_id,screenshot_hash)
);
CREATE TABLE IF NOT EXISTS casino_rates (
 guild_id text NOT NULL, item text NOT NULL, coins_per_unit numeric(78,8) NOT NULL CHECK(coins_per_unit>0),
 enabled boolean NOT NULL DEFAULT true, updated_by text NOT NULL, PRIMARY KEY(guild_id,item)
);
CREATE TABLE IF NOT EXISTS casino_battles (
 id uuid PRIMARY KEY, guild_id text NOT NULL, port text NOT NULL, attackers text NOT NULL, defenders text NOT NULL,
 starts_at timestamptz NOT NULL, battle_day date NOT NULL, created_by text NOT NULL,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','FINAL','VOID')),
 outcome text CHECK(outcome IN ('ATTACKER','DEFENDER','DRAW')), results jsonb,
 evidence text, settled_by text, settled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS casino_wagers (
 id uuid PRIMARY KEY, guild_id text NOT NULL, creator_id text NOT NULL, taker_id text,
 stake numeric(78,0) NOT NULL CHECK(stake>0), fee_bps integer NOT NULL DEFAULT 200,
 legs jsonb NOT NULL, closes_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'OPEN'
 CHECK(status IN ('OPEN','MATCHED','WON','VOID','CANCELLED','EXPIRED')),
 winner_id text, fee numeric(78,0) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz,
 request_key uuid NOT NULL, UNIQUE(guild_id,creator_id,request_key)
);
CREATE TABLE IF NOT EXISTS casino_flips (
 id uuid PRIMARY KEY, guild_id text NOT NULL, user_id text NOT NULL, stake numeric(78,0) NOT NULL,
 choice text NOT NULL, outcome text NOT NULL, payout numeric(78,0) NOT NULL,
 request_key uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(guild_id,user_id,request_key)
);
