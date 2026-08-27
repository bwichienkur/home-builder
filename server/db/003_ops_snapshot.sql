CREATE TABLE IF NOT EXISTS ops_snapshots (
  id text PRIMARY KEY DEFAULT 'default',
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
