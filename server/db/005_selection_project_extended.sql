-- Extended selection project payload (workflow, takeoff, selections, team)
ALTER TABLE selection_projects ADD COLUMN IF NOT EXISTS workflow_json jsonb NOT NULL DEFAULT '{}';
ALTER TABLE selection_projects ADD COLUMN IF NOT EXISTS selections_json jsonb NOT NULL DEFAULT '{}';
ALTER TABLE selection_projects ADD COLUMN IF NOT EXISTS takeoff_json jsonb NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS selection_projects_workflow_idx ON selection_projects((workflow_json->>'workflowStatus'));
