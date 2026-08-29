import { useConfiguratorStore } from '../../store/configuratorStore';
import { buildBtSelectionRows, downloadBtSelectionsCsv, tradeGroupedSummary } from '../../lib/configurator/exportBtSelections';
import { downloadCofExcel } from '../../lib/configurator/exportCof';
import { usePlannerStore } from '../../store/plannerStore';
import { useBuildCatalog } from '../../store/catalogStore';
import { useInventoryStore } from '../../store/inventoryStore';

function signClass(status: string) {
  if (status === 'approved') return 'is-success';
  if (status === 'declined') return 'is-danger';
  return 'is-warn';
}

export function SignOffPanel() {
  const project = useConfiguratorStore((s) => s.project);
  const role = useConfiguratorStore((s) => s.role);
  const setSignOff = useConfiguratorStore((s) => s.setSignOff);
  const completeCloseout = useConfiguratorStore((s) => s.completeCloseout);
  const markClientFinished = useConfiguratorStore((s) => s.markClientFinished);
  const furniture = usePlannerStore((s) => s.furniture);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const inventory = useInventoryStore((s) => s.items);
  const catalog = useBuildCatalog(inventory);

  if (!project) return null;

  const btRows = buildBtSelectionRows({ project, catalog, furniture, planRooms });
  const trades = tradeGroupedSummary(btRows);
  const bothSigned = project.signOff.cof === 'approved' && project.signOff.buildertrend === 'approved';

  return (
    <section className="configurator-panel signoff-panel" aria-label="Sign-off and export">
      <header className="configurator-panel-header">
        <div>
          <p className="configurator-eyebrow">Close-out</p>
          <strong>Sign-off &amp; export</strong>
          <p className="muted">One action exports COF + BT CSV and marks both signed (no BT API write-back).</p>
        </div>
      </header>

      <div className="configurator-sign-row">
        <div className="configurator-sign-card">
          <span className="configurator-eyebrow">Customer Option Form</span>
          <span className={`configurator-status-chip ${signClass(project.signOff.cof)}`}>{project.signOff.cof}</span>
        </div>
        <div className="configurator-sign-card">
          <span className="configurator-eyebrow">Buildertrend CSV</span>
          <span className={`configurator-status-chip ${signClass(project.signOff.buildertrend)}`}>
            {project.signOff.buildertrend === 'approved' ? 'csv ready' : project.signOff.buildertrend}
          </span>
        </div>
      </div>

      {role === 'client' && project.workflowStatus === 'client_configurator' && (
        <button type="button" className="configurator-btn primary full" onClick={() => markClientFinished()}>
          Finish remote selections — schedule meeting
        </button>
      )}

      {(role === 'designer' || role === 'admin') && (
        <div className="configurator-panel-actions">
          <button
            type="button"
            className="configurator-btn primary full"
            disabled={bothSigned}
            onClick={() => void completeCloseout()}
          >
            {bothSigned ? 'Signed & exported' : 'Sign & export COF + BT CSV'}
          </button>
          <button
            type="button"
            className="configurator-btn"
            onClick={() =>
              void downloadCofExcel({
                project,
                contract: project.contract,
                catalog,
                furniture,
                planRooms,
                takeoff: project.takeoff,
                levelOverrides: project.levelOverrides,
                allowances: project.allowances,
              })
            }
          >
            Export COF only
          </button>
          <button type="button" className="configurator-btn" onClick={() => downloadBtSelectionsCsv(btRows)}>
            Export BT CSV only
          </button>
          <button type="button" className="configurator-btn" onClick={() => setSignOff('cof', 'approved')}>
            Mark COF signed
          </button>
          <button type="button" className="configurator-btn" onClick={() => setSignOff('buildertrend', 'approved')}>
            Mark BT CSV submitted
          </button>
        </div>
      )}

      {trades.length > 0 && role !== 'client' && (
        <ul className="configurator-trade-summary">
          {trades.map((t) => (
            <li key={t.trade}>
              <strong>{t.trade}</strong>
              <span>
                {t.count} items · upgrades ${t.upgradeTotal.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
