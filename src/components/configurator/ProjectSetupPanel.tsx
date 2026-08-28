import { useConfiguratorStore, createBlankSelectionProject } from '../../store/configuratorStore';
import { WORKFLOW_LABEL } from '../../store/configuratorStore';
import type { ProjectWorkflowStatus, TeamMember, TeamRole } from '../../lib/configurator/projectTypes';

const TEAM_ROLES: TeamRole[] = ['estimator', 'designer', 'project_manager', 'client'];

export function ProjectSetupPanel() {
  const project = useConfiguratorStore((s) => s.project);
  const role = useConfiguratorStore((s) => s.role);
  const loadProject = useConfiguratorStore((s) => s.loadProject);
  const setTeam = useConfiguratorStore((s) => s.setTeam);
  const setWorkflowStatus = useConfiguratorStore((s) => s.setWorkflowStatus);
  const importContractPricingFile = useConfiguratorStore((s) => s.importContractPricingFile);

  if (role !== 'admin') return null;

  const addTeamMember = (teamRole: TeamRole) => {
    const name = window.prompt(`Name for ${teamRole}?`);
    if (!name?.trim()) return;
    const email = window.prompt('Email (optional)?') ?? undefined;
    const next: TeamMember[] = [...(project?.team ?? []), { role: teamRole, name: name.trim(), email: email?.trim() || undefined }];
    setTeam(next);
  };

  return (
    <section className="configurator-panel project-setup-panel" aria-label="Project setup">
      <header>
        <strong>Project admin</strong>
      </header>
      <div className="configurator-panel-actions">
        <button
          type="button"
          onClick={() => {
            const name = window.prompt('Project name?');
            if (!name?.trim()) return;
            loadProject(createBlankSelectionProject(name.trim()));
          }}
        >
          New client project
        </button>
        <label>
          Workflow
          <select
            value={project?.workflowStatus ?? 'draft'}
            onChange={(e) => setWorkflowStatus(e.target.value as ProjectWorkflowStatus)}
            disabled={!project}
          >
            {Object.entries(WORKFLOW_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Import contract pricing page
          <input
            type="file"
            accept=".xlsx,.xls,.pdf"
            disabled={!project}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && /\.xls/i.test(file.name)) void importContractPricingFile(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {project && (
        <>
          <div className="configurator-team-list">
            <strong>Team</strong>
            {project.team.length === 0 && <p className="muted">No team assigned yet.</p>}
            <ul>
              {project.team.map((m, i) => (
                <li key={`${m.role}-${i}`}>
                  {m.name} · {m.role}
                  {m.email ? ` · ${m.email}` : ''}
                </li>
              ))}
            </ul>
            <div className="configurator-panel-actions">
              {TEAM_ROLES.map((teamRole) => (
                <button key={teamRole} type="button" onClick={() => addTeamMember(teamRole)}>
                  + {teamRole}
                </button>
              ))}
            </div>
          </div>
          {project.levelOverrides.length > 0 && (
            <p className="muted">{project.levelOverrides.length} contract pricing override(s) loaded.</p>
          )}
        </>
      )}
    </section>
  );
}
