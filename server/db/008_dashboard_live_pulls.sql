-- Shared live dashboard pulls (Buildertrend + Pipedrive) for Owner Dashboard refresh.
-- id: 'buildertrend' | 'pipedrive'
CREATE TABLE IF NOT EXISTS dashboard_live_pulls (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
