-- Members who asked Misfit not to roast them unprompted (they can still /roast themselves).
CREATE TABLE IF NOT EXISTS bom_banter_optouts(
  guild_id text NOT NULL,
  user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(guild_id,user_id)
);
