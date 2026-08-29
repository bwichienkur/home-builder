import { useConfiguratorStore, WORKFLOW_LABEL } from '../../store/configuratorStore';
import type { ConfiguratorRole } from '../../lib/configurator/contractTypes';
import { PLAN_VERIFICATION_LABEL } from '../../store/configuratorStore';

const ROLE_LABEL: Record<ConfiguratorRole, string> = {
  client: 'Client',
  designer: 'Designer',
  admin: 'Admin',
};

export function ConfiguratorBar() {
  const role = useConfiguratorStore((s) => s.role);
  const setRole = useConfiguratorStore((s) => s.setRole);
  const project = useConfiguratorStore((s) => s.project);
  const contract = useConfiguratorStore((s) => s.contract);
  const shareToken = useConfiguratorStore((s) => s.shareToken);

  if (!project) return null;

  const approved = project.planVerification === 'approved_for_selections';

  return (
    <div className="configurator-bar" role="region" aria-label="Selection project">
      <div className="configurator-bar-main">
        <div>
          <p className="configurator-eyebrow">{shareToken ? 'Client portal' : 'Selection project'}</p>
          <strong>{project.name}</strong>
        </div>
        <div className="configurator-bar-meta">
          <span>{project.planRef}</span>
          {project.lotRef && <span>{project.lotRef}</span>}
          <span className="configurator-status-chip is-info">{WORKFLOW_LABEL[project.workflowStatus]}</span>
          <span className={`configurator-status-chip ${approved ? 'is-success' : 'is-warn'}`}>
            {PLAN_VERIFICATION_LABEL[project.planVerification]}
          </span>
        </div>
      </div>
      <div className="configurator-bar-controls">
        {!shareToken && (
          <label className="configurator-field inline">
            <span>View as</span>
            <select value={role} onChange={(e) => setRole(e.target.value as ConfiguratorRole)} aria-label="Configurator role">
              {(['client', 'designer', 'admin'] as ConfiguratorRole[]).map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
        )}
        {contract && (
          <span className="configurator-contract-chip" title={contract.notes}>
            Platinum · {contract.includedLevels.length} included tiers
          </span>
        )}
      </div>
    </div>
  );
}
