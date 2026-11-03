-- BOM v4.2.9: provider-independent AI routing, per-feature budgets and metadata-only usage.
CREATE TABLE IF NOT EXISTS bom_ai_routes (
  guild_id TEXT NOT NULL,
  feature TEXT NOT NULL CHECK (feature IN ('banter','wiki','sentinel')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  primary_provider TEXT NOT NULL DEFAULT 'groq' CHECK (primary_provider IN ('groq','gemini','openai','none')),
  fallback_provider TEXT NOT NULL DEFAULT 'gemini' CHECK (fallback_provider IN ('groq','gemini','openai','none')),
  groq_model TEXT NOT NULL DEFAULT 'openai/gpt-oss-20b',
  gemini_model TEXT NOT NULL DEFAULT 'gemini-3.5-flash-lite',
  openai_model TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  allow_gemini_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  allow_private_gemini BOOLEAN NOT NULL DEFAULT FALSE,
  daily_limit INTEGER NOT NULL DEFAULT 80 CHECK (daily_limit BETWEEN 1 AND 1000),
  minute_limit INTEGER NOT NULL DEFAULT 8 CHECK (minute_limit BETWEEN 1 AND 30),
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id,feature)
);
CREATE TABLE IF NOT EXISTS bom_ai_usage_daily (
  guild_id TEXT NOT NULL,
  usage_date DATE NOT NULL,
  feature TEXT NOT NULL,
  provider TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  successes INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  estimated_input_tokens BIGINT NOT NULL DEFAULT 0,
  latency_total_ms BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id,usage_date,feature,provider)
);
CREATE INDEX IF NOT EXISTS bom_ai_usage_recent ON bom_ai_usage_daily(guild_id,usage_date DESC);
