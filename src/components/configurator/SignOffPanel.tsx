import { useConfiguratorStore } from '../../store/configuratorStore';
import { buildBtSelectionRows, downloadBtSelectionsCsv, tradeGroupedSummary } from '../../lib/configurator/exportBtSelections';
import { downloadCofExcel } from '../../lib/configurator/exportCof';
import { usePlannerStore } from '../../store/plannerStore';
import { useBuildCatalog } from '../../store/catalogStore';
import { useInventoryStore } from '../../store/inventoryStore';

export function SignOffPanel() {
  const project = useConfiguratorStore((s) => s.project);
  const role = useConfiguratorStore((s) => s.role);
  const setSignOff = useConfiguratorStore((s) => s.setSignOff);
  const markClientFinished = useConfiguratorStore((s) => s.markClientFinished);
  const furniture = usePlannerStore((s) => s.furniture);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const inventory = useInventoryStore((s) => s.items);
  const catalog = useBuildCatalog(inventory);

  if (!project) return null;

  const btRows = buildBtSelectionRows({ project, catalog, furniture, planRooms });
  const trades = tradeGroupedSummary(btRows);

  return (
    <section className="configurator-panel signoff-panel" aria-label="Sign-off and export">
      <header>
        <strong>Sign-off</strong>
        <span>COF: {project.signOff.cof}</span>
        <span>BT: {project.signOff.buildertrend}</span>
      </header>

      {role === 'client' && project.workflowStatus === 'client_configurator' && (
        <button type="button" onClick={() => markClientFinished()}>
          Finish remote selections — schedule meeting
        </button>
      )}

      {(role === 'designer' || role === 'admin') && (
        <div className="configurator-panel-actions">
          <button
            type="button"
            onClick={() =>
              downloadCofExcel({
                project,
                contract: project.contract,
                catalog,
                furniture,
                planRooms,
                takeoff: project.takeoff,
                levelOverrides: project.levelOverrides,
              })
            }
          >
            Export COF Excel
          </button>
          <button type="button" onClick={() => downloadBtSelectionsCsv(btRows)}>
            Export BT selections CSV
          </button>
          <button type="button" onClick={() => setSignOff('cof', 'approved')}>
            Mark COF signed
          </button>
          <button type="button" onClick={() => setSignOff('buildertrend', 'approved')}>
            Mark BT approved
          </button>
        </div>
      )}

      {trades.length > 0 && role !== 'client' && (
        <ul className="configurator-trade-summary">
          {trades.map((t) => (
            <li key={t.trade}>
              {t.trade}: {t.count} items · upgrades ${t.upgradeTotal.toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
