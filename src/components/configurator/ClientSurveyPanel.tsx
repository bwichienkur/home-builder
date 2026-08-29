import { useConfiguratorStore } from '../../store/configuratorStore';
import { curateFromSurvey, lookbookDefaults } from '../../lib/configurator/surveyCurations';
import { useBuildCatalog } from '../../store/catalogStore';
import { useInventoryStore } from '../../store/inventoryStore';
import { usePlannerStore } from '../../store/plannerStore';

type Props = { forceShow?: boolean };

export function ClientSurveyPanel({ forceShow = false }: Props) {
  const project = useConfiguratorStore((s) => s.project);
  const role = useConfiguratorStore((s) => s.role);
  const setSurvey = useConfiguratorStore((s) => s.setSurvey);
  const setCuratedOptions = useConfiguratorStore((s) => s.setCuratedOptions);
  const inventory = useInventoryStore((s) => s.items);
  const catalog = useBuildCatalog(inventory);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const updatePlanRoom = usePlannerStore((s) => s.updatePlanRoom);

  if (!project) return null;
  if (role !== 'client' && !forceShow) return null;
  if (
    !forceShow &&
    project.workflowStatus !== 'client_survey' &&
    project.workflowStatus !== 'ready_for_client_survey' &&
    !project.survey
  ) {
    return null;
  }

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const survey = {
      completedAt: new Date().toISOString(),
      exteriorStyle: String(fd.get('exterior') ?? ''),
      interiorStyle: String(fd.get('interior') ?? ''),
      palette: String(fd.get('palette') ?? ''),
      notes: String(fd.get('notes') ?? ''),
    };
    setSurvey(survey);
    const curated = [...lookbookDefaults(catalog), ...curateFromSurvey(catalog, survey)];
    setCuratedOptions(curated);

    // Preload Look Book / survey floor picks onto living rooms when empty.
    const floorPick = curated.find((c) => {
      const item = catalog.find((p) => p.id === c.catalogId);
      return item?.placementMode === 'floor-fill' || item?.sourceTab === 'Tile-Floor';
    });
    if (floorPick) {
      const product = catalog.find((p) => p.id === floorPick.catalogId);
      for (const room of planRooms) {
        if (room.floorCatalogId) continue;
        if (room.roomType === 'Outdoor' || room.roomType === 'Storage / wardrobe') continue;
        updatePlanRoom(room.id, {
          floorCatalogId: floorPick.catalogId,
          floorName: product?.name,
          floorColor: product?.color,
        });
      }
    }
  };

  return (
    <section className="configurator-panel client-survey-panel" aria-label="Design discovery survey">
      <header className="configurator-panel-header">
        <div>
          <p className="configurator-eyebrow">Client</p>
          <strong>Design discovery</strong>
          <p className="muted">Tell us your style — we&apos;ll preload Platinum options in every room.</p>
        </div>
        {project.survey?.completedAt && (
          <span className="configurator-status-chip is-success">
            {project.curatedOptions?.length ?? 0} curated
          </span>
        )}
      </header>

      <form className="configurator-survey-form" onSubmit={submit}>
        <label className="configurator-field">
          <span>Exterior style</span>
          <select name="exterior" defaultValue={project.survey?.exteriorStyle ?? 'coastal'}>
            <option value="coastal">Coastal</option>
            <option value="modern">Modern</option>
            <option value="traditional">Traditional</option>
          </select>
        </label>
        <label className="configurator-field">
          <span>Interior style</span>
          <select name="interior" defaultValue={project.survey?.interiorStyle ?? 'warm'}>
            <option value="warm">Warm transitional</option>
            <option value="modern">Modern</option>
            <option value="traditional">Traditional</option>
          </select>
        </label>
        <label className="configurator-field">
          <span>Color palette</span>
          <select name="palette" defaultValue={project.survey?.palette ?? 'neutrals'}>
            <option value="neutrals">Neutrals</option>
            <option value="contrast">High contrast</option>
            <option value="earth">Earth tones</option>
          </select>
        </label>
        <label className="configurator-field full">
          <span>Notes</span>
          <textarea name="notes" rows={3} placeholder="Anything else we should know?" defaultValue={project.survey?.notes ?? ''} />
        </label>
        <button type="submit" className="configurator-btn primary full">
          Save survey &amp; preload Platinum options
        </button>
      </form>

      {project.curatedOptions && project.curatedOptions.length > 0 && (
        <ul className="configurator-trade-summary">
          {project.curatedOptions.slice(0, 8).map((opt) => (
            <li key={`${opt.roomType}-${opt.catalogId}`}>
              <strong>{opt.roomType}</strong>
              <span>{opt.label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
