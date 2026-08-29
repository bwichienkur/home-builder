import { useState } from 'react';
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
  const createClientInvite = useConfiguratorStore((s) => s.createClientInvite);
  const lastInviteUrl = useConfiguratorStore((s) => s.lastInviteUrl);

  const [projectName, setProjectName] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<TeamRole>('designer');
  const [clientEmail, setClientEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);

  if (role !== 'admin') return null;

  const addTeamMember = () => {
    if (!memberName.trim()) return;
    const next: TeamMember[] = [
      ...(project?.team ?? []),
      { role: memberRole, name: memberName.trim(), email: memberEmail.trim() || undefined },
    ];
    setTeam(next);
    setMemberName('');
    setMemberEmail('');
  };

  return (
    <section className="configurator-panel project-setup-panel" aria-label="Project setup">
      <header className="configurator-panel-header">
        <div>
          <p className="configurator-eyebrow">Admin</p>
          <strong>Project setup</strong>
        </div>
      </header>

      <div className="configurator-field-grid">
        <label className="configurator-field">
          <span>New project name</span>
          <div className="configurator-inline-row">
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. 48 Hammock Beach Cir"
            />
            <button
              type="button"
              className="configurator-btn primary"
              onClick={() => {
                if (!projectName.trim()) return;
                loadProject(createBlankSelectionProject(projectName.trim()));
                setProjectName('');
              }}
            >
              Create
            </button>
          </div>
        </label>

        <label className="configurator-field">
          <span>Workflow stage</span>
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

        <label className="configurator-field">
          <span>Contract pricing page</span>
          <input
            type="file"
            accept=".xlsx,.xls"
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
        <div className="configurator-section">
          <div className="configurator-section-title">
            <strong>Team</strong>
            {project.levelOverrides.length > 0 && (
              <span className="configurator-status-chip is-info">{project.levelOverrides.length} pricing overrides</span>
            )}
          </div>

          {project.team.length === 0 ? (
            <p className="muted">Assign estimator, designer, PM, and client.</p>
          ) : (
            <ul className="configurator-team-list">
              {project.team.map((m, i) => (
                <li key={`${m.role}-${i}`}>
                  <span className="configurator-status-chip is-neutral">{m.role}</span>
                  <span>
                    {m.name}
                    {m.email ? <small className="muted"> · {m.email}</small> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="configurator-field-grid compact">
            <label className="configurator-field">
              <span>Name</span>
              <input value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="Full name" />
            </label>
            <label className="configurator-field">
              <span>Role</span>
              <select value={memberRole} onChange={(e) => setMemberRole(e.target.value as TeamRole)}>
                {TEAM_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="configurator-field">
              <span>Email</span>
              <input value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="optional" />
            </label>
            <button type="button" className="configurator-btn" onClick={addTeamMember} disabled={!memberName.trim()}>
              Add teammate
            </button>
          </div>

          {(project.levelOverrides.length > 0 || project.allowances.length > 0) && (
            <div className="configurator-section">
              <div className="configurator-section-title">
                <strong>Contract pricing</strong>
              </div>
              <ul className="configurator-trade-summary">
                {project.levelOverrides.map((o) => (
                  <li key={`${o.pricingCategory}-${o.includedLevel}`}>
                    <strong>{o.pricingCategory}</strong>
                    <span>Included {o.includedLevel}</span>
                  </li>
                ))}
                {project.allowances.map((a) => (
                  <li key={`${a.pricingCategory}-${a.label}`}>
                    <strong>{a.label || a.pricingCategory}</strong>
                    <span>${a.budgetAmount.toLocaleString()} allowance</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="configurator-section">
            <div className="configurator-section-title">
              <strong>Client invite</strong>
            </div>
            <p className="muted">Creates a share link for the client portal (survey + Platinum selections). Copy into email — SMTP is not configured.</p>
            <div className="configurator-inline-row">
              <input
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="client@email.com (optional)"
              />
              <button
                type="button"
                className="configurator-btn primary"
                disabled={inviteBusy}
                onClick={() => {
                  setInviteBusy(true);
                  void createClientInvite(clientEmail.trim() || undefined)
                    .then((url) => {
                      void navigator.clipboard?.writeText(url);
                    })
                    .finally(() => setInviteBusy(false));
                }}
              >
                {inviteBusy ? 'Creating…' : 'Create invite link'}
              </button>
            </div>
            {lastInviteUrl && (
              <p className="muted">
                Link copied · <a className="configurator-invite-link" href={lastInviteUrl}>{lastInviteUrl}</a>
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
