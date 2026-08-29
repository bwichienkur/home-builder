import { getSurveyConfig, surveyAnswersToLegacyFields } from '../../lib/configurator/surveyConfig';
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
  const config = getSurveyConfig();

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

  const defaultFor = (id: string, mapsTo?: string) => {
    const fromAnswers = project.survey?.answers?.[id];
    if (typeof fromAnswers === 'string') return fromAnswers;
    if (Array.isArray(fromAnswers)) return fromAnswers[0] ?? '';
    if (mapsTo === 'exteriorStyle') return project.survey?.exteriorStyle ?? '';
    if (mapsTo === 'interiorStyle') return project.survey?.interiorStyle ?? '';
    if (mapsTo === 'palette') return project.survey?.palette ?? '';
    if (mapsTo === 'notes') return project.survey?.notes ?? '';
    return '';
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const answers: Record<string, string | string[]> = {};
    for (const q of config.questions) {
      if (q.type === 'multi') {
        answers[q.id] = fd.getAll(q.id).map(String);
      } else {
        answers[q.id] = String(fd.get(q.id) ?? '');
      }
    }
    const legacy = surveyAnswersToLegacyFields(answers, config);
    const survey = {
      completedAt: new Date().toISOString(),
      ...legacy,
      answers,
      surveyConfigId: config.id,
      surveyConfigVersion: config.version,
    };
    setSurvey(survey);
    const curated = [...lookbookDefaults(catalog), ...curateFromSurvey(catalog, survey)];
    setCuratedOptions(curated);

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
          <strong>{config.title}</strong>
          <p className="muted">{config.description}</p>
        </div>
        {project.survey?.completedAt && (
          <span className="configurator-status-chip is-success">
            {project.curatedOptions?.length ?? 0} curated
          </span>
        )}
      </header>

      <form className="configurator-survey-form" onSubmit={submit}>
        {config.questions.map((q) => {
          if (q.type === 'text') {
            return (
              <label key={q.id} className="configurator-field full">
                <span>{q.label}</span>
                <textarea
                  name={q.id}
                  rows={q.rows ?? 3}
                  placeholder={q.placeholder}
                  defaultValue={defaultFor(q.id, q.mapsTo)}
                  required={q.required}
                />
              </label>
            );
          }
          return (
            <label key={q.id} className="configurator-field">
              <span>{q.label}</span>
              <select name={q.id} defaultValue={defaultFor(q.id, q.mapsTo) || q.options?.[0]?.value} required={q.required}>
                {q.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {q.help ? <small className="muted">{q.help}</small> : null}
            </label>
          );
        })}
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
