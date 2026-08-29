-- Org config, CRM, auth, designs, drawing packages, trade rates → Neon.
-- Prefer jsonb snapshots (ops_snapshots pattern) for shared org data.

ALTER TABLE users ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS api_keys jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS org_configs (
  id text PRIMARY KEY DEFAULT 'default',
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_snapshots (
  id text PRIMARY KEY DEFAULT 'default',
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_snapshots (
  id text PRIMARY KEY DEFAULT 'default',
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trade_rates (
  id text PRIMARY KEY DEFAULT 'default',
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS designs (
  code text PRIMARY KEY,
  user_id text,
  name text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS designs_user_idx ON designs (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS drawing_packages (
  id text PRIMARY KEY,
  user_id text,
  meta jsonb NOT NULL,
  sheet_svgs jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan_json jsonb,
  pdf_base64 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drawing_packages_user_idx ON drawing_packages (user_id, updated_at DESC);
