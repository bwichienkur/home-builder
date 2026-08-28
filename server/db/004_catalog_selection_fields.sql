-- Selection catalog fields for Olsen configurator / delta pricing
ALTER TABLE products ADD COLUMN IF NOT EXISTS level text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_tab text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS section text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS placement_mode text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS texture_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS roughness_map_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS normal_map_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS texture_repeat numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS roughness numeric;

CREATE INDEX IF NOT EXISTS products_source_tab_idx ON products(source_tab, category) WHERE active;

-- Configurator selection projects (contract + role metadata)
CREATE TABLE IF NOT EXISTS selection_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  name text NOT NULL,
  plan_ref text,
  lot_ref text,
  contract_json jsonb NOT NULL DEFAULT '{}',
  scene_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS selection_projects_user_idx ON selection_projects(user_id, updated_at DESC);
