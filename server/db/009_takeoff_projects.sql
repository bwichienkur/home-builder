-- PDF plan takeoff projects (Plan Takeoff studio).
CREATE TABLE IF NOT EXISTS takeoff_projects (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
