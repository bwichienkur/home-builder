import { useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, Info, X } from 'lucide-react';
import { evaluateBuildingChecks, type BuildingCheck } from '../../lib/buildingChecks';
import { usePlannerStore } from '../../store/plannerStore';

function jumpToCheck(check: BuildingCheck) {
  const store = usePlannerStore.getState();
  if (check.id.startsWith('stair-') && check.id !== 'stair-missing-link') {
    const stairId = check.id.replace(/^stair-(?:riser|tread|width|story)-/, '');
    const item = store.furniture.find((f) => f.id === stairId || check.id.endsWith(f.id));
    if (item) {
      store.selectFurniture(item.id);
      window.dispatchEvent(new Event('roomcraft-open-properties'));
      return;
    }
  }
  if (check.id === 'no-exterior') {
    const wall = store.walls[0];
    if (wall) {
      store.selectWall(wall.id);
      window.dispatchEvent(new Event('roomcraft-open-properties'));
    }
  }
}

/** Badge + panel for soft building checks — never blocks editing. */
export function BuildingChecksBar() {
  const walls = usePlannerStore((s) => s.walls);
  const furniture = usePlannerStore((s) => s.furniture);
  const siteSetback = usePlannerStore((s) => s.siteSetback);
  const workflowStage = usePlannerStore((s) => s.workflowStage);
  const floors = usePlannerStore((s) => s.floors);
  const activeFloorId = usePlannerStore((s) => s.activeFloorId);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const allChecks = useMemo(() => {
    const floorsWithStairs = floors.filter((f) => {
      const live = f.id === activeFloorId;
      const list = live ? furniture : f.scene.furniture;
      return list.some((item) => item.placementKind === 'stair');
    }).length;
    return evaluateBuildingChecks({
      walls,
      furniture,
      siteSetback,
      storyHeightM: walls[0]?.height,
      floorCount: floors.length,
      floorsWithStairs,
    });
  }, [walls, furniture, siteSetback, floors, activeFloorId]);

  const checks = allChecks.filter((c) => !dismissed.includes(c.id));
  const warnCount = checks.filter((c) => c.severity === 'warn').length;

  if (workflowStage === 'start') return null;
  if (checks.length === 0 && !open) return null;

  return (
    <div className="building-checks-root">
      {checks.length > 0 && (
        <button
          type="button"
          className={`building-checks-badge${warnCount ? ' has-warn' : ''}`}
          aria-expanded={open}
          aria-controls="building-checks-panel"
          onClick={() => setOpen((v) => !v)}
        >
          <ClipboardCheck size={15} />
          Checks
          <span>{checks.length}</span>
        </button>
      )}

      {open && (
        <div id="building-checks-panel" className="building-checks-panel" role="dialog" aria-label="Building checks">
          <header>
            <strong>Building checks</strong>
            <button type="button" aria-label="Close checks" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </header>
          <p className="muted">Advisory only — adjust geometry when your jurisdiction requires it.</p>
          {checks.length === 0 ? (
            <p className="muted">No open checks.</p>
          ) : (
            <ul>
              {checks.map((check) => (
                <li key={check.id} className={`building-check is-${check.severity}`}>
                  {check.severity === 'warn' ? <AlertTriangle size={14} /> : <Info size={14} />}
                  <div>
                    <strong>{check.title}</strong>
                    <span>{check.detail}</span>
                    <button type="button" className="linkish" onClick={() => jumpToCheck(check)}>
                      Go to issue
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-label={`Dismiss ${check.title}`}
                    onClick={() => setDismissed((ids) => [...ids, check.id])}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!open && checks.length > 0 && (
        <div className="building-checks" role="status" aria-label="Building checks">
          {checks.slice(0, 2).map((check) => (
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
      )}
    </div>
  );
}
