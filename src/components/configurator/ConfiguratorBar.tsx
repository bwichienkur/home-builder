import { useConfiguratorStore, WORKFLOW_LABEL } from '../../store/configuratorStore';
import type { ConfiguratorRole } from '../../lib/configurator/contractTypes';
import { PLAN_VERIFICATION_LABEL } from '../../store/configuratorStore';

const ROLE_LABEL: Record<ConfiguratorRole, string> = {
  client: 'Client survey',
  designer: 'Designer',
  admin: 'Admin',
};

export function ConfiguratorBar() {
  const role = useConfiguratorStore((s) => s.role);
  const setRole = useConfiguratorStore((s) => s.setRole);
  const project = useConfiguratorStore((s) => s.project);
  const contract = useConfiguratorStore((s) => s.contract);

  if (!project) return null;

  const ext = project;

  return (
    <div className="configurator-bar" role="region" aria-label="Selection project">
      <div className="configurator-bar-main">
        <strong>{project.name}</strong>
        <span>{project.planRef}</span>
        {project.lotRef && <span>{project.lotRef}</span>}
        <span className="configurator-status-chip">{WORKFLOW_LABEL[ext.workflowStatus]}</span>
        <span className="configurator-status-chip">{PLAN_VERIFICATION_LABEL[ext.planVerification]}</span>
      </div>
      <div className="configurator-bar-controls">
        <label>
          View as
          <select value={role} onChange={(e) => setRole(e.target.value as ConfiguratorRole)} aria-label="Configurator role">
            {(['client', 'designer', 'admin'] as ConfiguratorRole[]).map((value) => (
              <option key={value} value={value}>
                {ROLE_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        {contract && (
          <span className="configurator-contract-chip" title={contract.notes}>
            Platinum · {contract.includedLevels.length} included tiers
          </span>
        )}
      </div>
    </div>
  );
}
