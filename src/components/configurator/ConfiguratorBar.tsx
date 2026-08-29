import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useConfiguratorStore, WORKFLOW_LABEL } from '../../store/configuratorStore';
import type { ConfiguratorRole } from '../../lib/configurator/contractTypes';
import { PLAN_VERIFICATION_LABEL } from '../../store/configuratorStore';

const ROLE_LABEL: Record<ConfiguratorRole, string> = {
  client: 'Client',
  designer: 'Designer',
  admin: 'Admin',
};

function useIsNarrow(maxWidth = 900) {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${maxWidth}px)`).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [maxWidth]);
  return narrow;
}

export function ConfiguratorBar() {
  const role = useConfiguratorStore((s) => s.role);
  const setRole = useConfiguratorStore((s) => s.setRole);
  const project = useConfiguratorStore((s) => s.project);
  const contract = useConfiguratorStore((s) => s.contract);
  const shareToken = useConfiguratorStore((s) => s.shareToken);
  const isNarrow = useIsNarrow();
  const [expanded, setExpanded] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > 900 : true,
  );

  useEffect(() => {
    // Desktop keeps details open; mobile starts collapsed so the plan stays visible.
    if (!isNarrow) setExpanded(true);
  }, [isNarrow]);

  if (!project) return null;

  const approved = project.planVerification === 'approved_for_selections';
  const showDetails = !isNarrow || expanded;

  return (
    <div
      className={`configurator-bar ${showDetails ? 'is-expanded' : 'is-collapsed'}`}
      role="region"
      aria-label="Selection project"
    >
      <button
        type="button"
        className="configurator-bar-summary"
        onClick={() => {
          if (isNarrow) setExpanded((v) => !v);
        }}
        aria-expanded={showDetails}
        aria-controls="configurator-bar-details"
        disabled={!isNarrow}
      >
        <div className="configurator-bar-summary-text">
          <p className="configurator-eyebrow">{shareToken ? 'Client portal' : 'Selection project'}</p>
          <strong>{project.name}</strong>
        </div>
        {isNarrow && (
          <span className="configurator-bar-toggle-label">
            {expanded ? 'Hide' : 'Details'}
            {expanded ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
          </span>
        )}
      </button>

      {showDetails && (
        <div id="configurator-bar-details" className="configurator-bar-details">
          <div className="configurator-bar-main">
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
      )}
    </div>
  );
}
