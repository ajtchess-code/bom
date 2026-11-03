-- Dashboard polish, health and performance telemetry.
CREATE TABLE IF NOT EXISTS dashboard_performance_samples (
  id UUID PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT,
  route TEXT NOT NULL,
  metric TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  rating TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dashboard_perf_guild_created
  ON dashboard_performance_samples(guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_perf_metric
  ON dashboard_performance_samples(guild_id, metric, created_at DESC);
