import { useMemo, useRef } from 'react';
import { useConfiguratorStore } from '../../store/configuratorStore';
import { PLAN_VERIFICATION_LABEL } from '../../store/configuratorStore';
import { reconcileTakeoffWithGeometry, importedLinesSummary } from '../../lib/configurator/planReconciliation';
import { usePlannerStore } from '../../store/plannerStore';
import { computeProjectRollup } from '../../lib/configurator/roomRollups';
import { useBuildCatalog } from '../../store/catalogStore';
import { useInventoryStore } from '../../store/inventoryStore';

function statusClass(status: string) {
  if (status === 'match') return 'is-success';
  if (status === 'review') return 'is-warn';
  return 'is-neutral';
}

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

  const approved = project.planVerification === 'approved_for_selections';

  return (
    <section className="configurator-panel plan-verification-panel" aria-label="Plan verification">
      <header className="configurator-panel-header">
        <div>
          <p className="configurator-eyebrow">Estimator</p>
          <strong>Plan verification</strong>
        </div>
        <span className={`configurator-status-chip ${approved ? 'is-success' : 'is-warn'}`}>
          {PLAN_VERIFICATION_LABEL[project.planVerification]}
        </span>
      </header>

      {(rollup || project.takeoff || planRooms.length > 0) && (
        <div className="configurator-kpi-row">
          <div className="configurator-kpi">
            <span className="configurator-eyebrow">Live job delta</span>
            <strong className={rollup && rollup.jobDelta > 0 ? 'is-upgrade' : rollup && rollup.jobDelta < 0 ? 'is-credit' : ''}>
              {rollup ? `${rollup.jobDelta >= 0 ? '+' : ''}$${rollup.jobDelta.toLocaleString()}` : '—'}
            </strong>
          </div>
          <div className="configurator-kpi">
            <span className="configurator-eyebrow">Rooms</span>
            <strong>{planRooms.length || '—'}</strong>
          </div>
          <div className="configurator-kpi">
            <span className="configurator-eyebrow">Takeoff lines</span>
            <strong>{project.takeoff?.lines.length ?? 0}</strong>
          </div>
          <div className="configurator-kpi">
            <span className="configurator-eyebrow">Qty source</span>
            <strong>
              {project.planVerification === 'approved_for_selections' && project.takeoff?.lines.length
                ? 'Takeoff'
                : project.takeoff?.qtySource === 'takeoff'
                  ? 'Takeoff'
                  : 'Geometry'}
            </strong>
          </div>
        </div>
      )}

      <div className="configurator-field-grid">
        <label className="configurator-field">
          <span>House plan template</span>
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
      </div>

      <div className="configurator-panel-actions">
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
        <button type="button" className="configurator-btn" onClick={() => inputRef.current?.click()}>
          Import takeoff / COF qty
        </button>
        <button
          type="button"
          className="configurator-btn primary"
          disabled={approved}
          onClick={() => setPlanVerification('approved_for_selections')}
        >
          {approved ? 'Approved for selections' : 'Approve for selections'}
        </button>
      </div>

      {project.takeoff && (
        <p className="muted">
          Imported from {project.takeoff.sourceFile ?? 'workbook'} ·{' '}
          {importedLinesSummary(project.takeoff)
            .slice(0, 4)
            .map((s) => `${s.sheet} (${s.count})`)
            .join(', ')}
        </p>
      )}

      {reconciliation.length > 0 && (
        <div className="configurator-table-wrap">
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
                  <td>
                    <span className={`configurator-status-chip ${statusClass(row.status)}`}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
