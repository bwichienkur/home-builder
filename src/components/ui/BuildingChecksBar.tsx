import { useMemo, useState } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { evaluateBuildingChecks } from '../../lib/buildingChecks';
import { usePlannerStore } from '../../store/plannerStore';

/** Compact advisory strip — does not block editing. */
export function BuildingChecksBar() {
  const walls = usePlannerStore((s) => s.walls);
  const furniture = usePlannerStore((s) => s.furniture);
  const siteSetback = usePlannerStore((s) => s.siteSetback);
  const workflowStage = usePlannerStore((s) => s.workflowStage);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const checks = useMemo(
    () =>
      evaluateBuildingChecks({
        walls,
        furniture,
        siteSetback,
        storyHeightM: walls[0]?.height,
      }).filter((c) => !dismissed.includes(c.id)),
    [walls, furniture, siteSetback, dismissed],
  );

  if (workflowStage === 'start' || checks.length === 0) return null;

  return (
    <div className="building-checks" role="status" aria-label="Building checks">
      {checks.slice(0, 3).map((check) => (
        <div key={check.id} className={`building-check is-${check.severity}`}>
          {check.severity === 'warn' ? <AlertTriangle size={14} /> : <Info size={14} />}
          <div>
            <strong>{check.title}</strong>
            <span>{check.detail}</span>
          </div>
          <button
            type="button"
            aria-label={`Dismiss ${check.title}`}
            onClick={() => setDismissed((ids) => [...ids, check.id])}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
