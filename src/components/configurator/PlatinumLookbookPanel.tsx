import { useConfiguratorStore } from '../../store/configuratorStore';
import { usePlannerStore } from '../../store/plannerStore';
import { useBuildCatalog } from '../../store/catalogStore';
import { useInventoryStore } from '../../store/inventoryStore';
import { PLATINUM_INCLUDED_LEVELS } from '../../lib/configurator/contractTypes';

/** Client-facing Platinum Features + Look Book summary inside the configurator dock. */
export function PlatinumLookbookPanel() {
  const project = useConfiguratorStore((s) => s.project);
  const role = useConfiguratorStore((s) => s.role);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const applyLookbookToRoom = usePlannerStore((s) => s.applyLookbookToRoom);
  const inventory = useInventoryStore((s) => s.items);
  const catalog = useBuildCatalog(inventory);

  if (!project) return null;
  if (role !== 'client' && !project.survey) return null;

  const levels = project.contract?.includedLevels?.length
    ? project.contract.includedLevels
    : PLATINUM_INCLUDED_LEVELS;
  const lookbook = (project.curatedOptions ?? []).filter((o) => o.tier === 'lookbook');
  const curated = (project.curatedOptions ?? []).filter((o) => o.tier === 'survey');
  const focusRoom = planRooms.find((r) => r.id === selectedRoomId);

  const applyPick = (catalogId: string, label: string) => {
    const item = catalog.find((c) => c.id === catalogId);
    const color = item?.color ?? '#c9b18f';
    const isFloor = !item || /floor|tile|plank|surface/i.test(`${item.category} ${item.name} ${label}`);
    applyLookbookToRoom({
      roomId: selectedRoomId,
      floorColor: isFloor ? color : undefined,
      floorCatalogId: isFloor ? catalogId : undefined,
      floorName: isFloor ? label : undefined,
      wallColor: !isFloor && /wall|paint/i.test(`${item?.category} ${label}`) ? color : undefined,
      ceilingColor: !isFloor && /ceiling/i.test(`${item?.category} ${label}`) ? color : undefined,
    });
  };

  return (
    <section className="configurator-panel platinum-lookbook-panel" aria-label="Platinum features and Look Book">
      <header className="configurator-panel-header">
        <div>
          <p className="configurator-eyebrow">Included</p>
          <strong>Platinum Features &amp; Look Book</strong>
          <p className="muted">
            Selections stay within Platinum — no pricing shown. Structural changes (walls, doors, windows) are locked.
            {focusRoom ? ` Applying to ${focusRoom.name}.` : ' Select a room to apply finishes.'}
          </p>
        </div>
      </header>

      <div className="configurator-section">
        <div className="configurator-section-title">
          <strong>Platinum included tiers</strong>
        </div>
        <ul className="configurator-trade-summary">
          {levels.map((row) => (
            <li key={row.pricingCategory}>
              <strong>{row.label}</strong>
              <span>{row.includedLevel}</span>
            </li>
          ))}
        </ul>
      </div>

      {lookbook.length > 0 && (
        <div className="configurator-section">
          <div className="configurator-section-title">
            <strong>Look Book picks</strong>
          </div>
          <ul className="configurator-trade-summary">
            {lookbook.map((opt) => (
              <li key={`lb-${opt.catalogId}`}>
                <strong>{opt.roomType}</strong>
                <span>{opt.label}</span>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!selectedRoomId}
                  onClick={() => applyPick(opt.catalogId, opt.label)}
                >
                  Apply to room
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {curated.length > 0 && (
        <div className="configurator-section">
          <div className="configurator-section-title">
            <strong>Curated from your survey</strong>
          </div>
          <ul className="configurator-trade-summary">
            {curated.slice(0, 12).map((opt) => (
              <li key={`sv-${opt.roomType}-${opt.catalogId}`}>
                <strong>{opt.roomType}</strong>
                <span>{opt.label}</span>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!selectedRoomId}
                  onClick={() => applyPick(opt.catalogId, opt.label)}
                >
                  Apply to room
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
