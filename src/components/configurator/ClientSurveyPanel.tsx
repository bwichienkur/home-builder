import { useConfiguratorStore } from '../../store/configuratorStore';
import { curateFromSurvey } from '../../lib/configurator/surveyCurations';
import { useBuildCatalog } from '../../store/catalogStore';
import { useInventoryStore } from '../../store/inventoryStore';

type Props = { forceShow?: boolean };

export function ClientSurveyPanel({ forceShow = false }: Props) {
  const project = useConfiguratorStore((s) => s.project);
  const role = useConfiguratorStore((s) => s.role);
  const setSurvey = useConfiguratorStore((s) => s.setSurvey);
  const inventory = useInventoryStore((s) => s.items);
  const catalog = useBuildCatalog(inventory);

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
    const curated = curateFromSurvey(catalog, survey);
    console.info('Survey curated options', curated.length);
  };

  return (
    <section className="configurator-panel client-survey-panel" aria-label="Design discovery survey">
      <header className="configurator-panel-header">
        <div>
          <p className="configurator-eyebrow">Client</p>
          <strong>Design discovery</strong>
          <p className="muted">Tell us your style — we&apos;ll preload Platinum options in every room.</p>
        </div>
        {project.survey?.completedAt && <span className="configurator-status-chip is-success">Saved</span>}
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
          Save survey &amp; open configurator
        </button>
      </form>
    </section>
  );
}
