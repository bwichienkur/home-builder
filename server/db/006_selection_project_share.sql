ALTER TABLE selection_projects
  ADD COLUMN IF NOT EXISTS share_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS share_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_email text;

CREATE INDEX IF NOT EXISTS selection_projects_share_token_idx
  ON selection_projects (share_token)
  WHERE share_token IS NOT NULL;
