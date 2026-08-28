import { useConfiguratorStore } from '../../store/configuratorStore';
import { curateFromSurvey } from '../../lib/configurator/surveyCurations';
import { useBuildCatalog } from '../../store/catalogStore';
import { useInventoryStore } from '../../store/inventoryStore';

export function ClientSurveyPanel() {
  const project = useConfiguratorStore((s) => s.project);
  const role = useConfiguratorStore((s) => s.role);
  const setSurvey = useConfiguratorStore((s) => s.setSurvey);
  const inventory = useInventoryStore((s) => s.items);
  const catalog = useBuildCatalog(inventory);

  if (!project || role !== 'client') return null;
  if (project.workflowStatus !== 'client_survey' && project.workflowStatus !== 'ready_for_client_survey' && !project.survey) {
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
      <header>
        <strong>Design discovery</strong>
        <span>Tell us your style — we&apos;ll preload Platinum options in every room.</span>
      </header>
      <form onSubmit={submit}>
        <label>
          Exterior style
          <select name="exterior" defaultValue="coastal">
            <option value="coastal">Coastal</option>
            <option value="modern">Modern</option>
            <option value="traditional">Traditional</option>
          </select>
        </label>
        <label>
          Interior style
          <select name="interior" defaultValue="warm">
            <option value="warm">Warm transitional</option>
            <option value="modern">Modern</option>
            <option value="traditional">Traditional</option>
          </select>
        </label>
        <label>
          Color palette
          <select name="palette" defaultValue="neutrals">
            <option value="neutrals">Neutrals</option>
            <option value="contrast">High contrast</option>
            <option value="earth">Earth tones</option>
          </select>
        </label>
        <label>
          Notes
          <textarea name="notes" rows={2} placeholder="Anything else we should know?" />
        </label>
        <button type="submit">Save survey &amp; open configurator</button>
      </form>
    </section>
  );
}
