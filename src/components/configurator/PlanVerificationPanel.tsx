import { useMemo, useRef } from 'react';
import { useConfiguratorStore } from '../../store/configuratorStore';
import { PLAN_VERIFICATION_LABEL, WORKFLOW_LABEL } from '../../store/configuratorStore';
import { reconcileTakeoffWithGeometry, importedLinesSummary } from '../../lib/configurator/planReconciliation';
import { usePlannerStore } from '../../store/plannerStore';
import { computeProjectRollup } from '../../lib/configurator/roomRollups';
import { useBuildCatalog } from '../../store/catalogStore';
import { useInventoryStore } from '../../store/inventoryStore';

export function PlanVerificationPanel() {
  const project = useConfiguratorStore((s) => s.project);
  const role = useConfiguratorStore((s) => s.role);
  const setPlanVerification = useConfiguratorStore((s) => s.setPlanVerification);
  const importTakeoffFile = useConfiguratorStore((s) => s.importTakeoffFile);
  const setHousePlanId = useConfiguratorStore((s) => s.setHousePlanId);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const inputRef = useRef<HTMLInputElement>(null);

  const inventory = useInventoryStore((s) => s.items);
  const catalog = useBuildCatalog(inventory);

  const reconciliation = useMemo(
    () => reconcileTakeoffWithGeometry(project?.takeoff, planRooms),
    [project?.takeoff, planRooms],
  );

  const rollup = useMemo(() => {
    if (!project?.contract) return null;
    return computeProjectRollup({
      catalog,
      contract: project.contract,
      furniture: usePlannerStore.getState().furniture,
      planRooms,
      takeoff: project.takeoff,
      allowances: project.allowances,
      levelOverrides: project.levelOverrides,
      role,
    });
  }, [project, catalog, planRooms, role]);

  if (!project || (role !== 'designer' && role !== 'admin')) return null;

  return (
    <section className="configurator-panel plan-verification-panel" aria-label="Plan verification">
      <header>
        <strong>Plan verification</strong>
        <span className="configurator-status-chip">{PLAN_VERIFICATION_LABEL[project.planVerification]}</span>
        <span className="configurator-status-chip">{WORKFLOW_LABEL[project.workflowStatus]}</span>
      </header>

      <div className="configurator-panel-actions">
        <label>
          House plan template
          <select
            value={project.housePlanId ?? 'stillwater-183'}
            onChange={(e) => setHousePlanId(e.target.value)}
            aria-label="House plan template"
          >
            <option value="stillwater-183">183 Stillwater (from MODEL.dwg)</option>
            <option value="granada">Granada (flyer proxy)</option>
            <option value="custom">Custom / imported</option>
          </select>
        </label>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importTakeoffFile(file);
            e.target.value = '';
          }}
        />
        <button type="button" onClick={() => inputRef.current?.click()}>
          Import takeoff / COF qty
        </button>
        <button
          type="button"
          disabled={project.planVerification === 'approved_for_selections'}
          onClick={() => setPlanVerification('approved_for_selections')}
        >
          Approve for selections
        </button>
      </div>

      {project.takeoff && (
        <p className="muted">
          Imported {project.takeoff.lines.length} takeoff lines from {project.takeoff.sourceFile ?? 'workbook'} ·{' '}
          {importedLinesSummary(project.takeoff)
            .slice(0, 4)
            .map((s) => `${s.sheet} (${s.count})`)
            .join(', ')}
        </p>
      )}

      {rollup && (
        <p className="configurator-live-pricing">
          Live job delta: <strong>${rollup.jobDelta.toLocaleString()}</strong>
        </p>
      )}

      {reconciliation.length > 0 && (
        <table className="configurator-mini-table">
          <thead>
            <tr>
              <th>Room</th>
              <th>Category</th>
              <th>Imported</th>
              <th>Geometry</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {reconciliation.slice(0, 8).map((row) => (
              <tr key={`${row.roomName}-${row.category}`}>
                <td>{row.roomName}</td>
                <td>{row.category}</td>
                <td>{row.importedQty ?? '—'}</td>
                <td>{row.geometryQty ?? '—'}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
