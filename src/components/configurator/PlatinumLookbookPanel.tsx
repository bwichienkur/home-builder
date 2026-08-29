import { useConfiguratorStore } from '../../store/configuratorStore';
import { PLATINUM_INCLUDED_LEVELS } from '../../lib/configurator/contractTypes';

/** Client-facing Platinum Features + Look Book summary inside the configurator dock. */
export function PlatinumLookbookPanel() {
  const project = useConfiguratorStore((s) => s.project);
  const role = useConfiguratorStore((s) => s.role);
  if (!project) return null;
  if (role !== 'client' && !project.survey) return null;

  const levels = project.contract?.includedLevels?.length
    ? project.contract.includedLevels
    : PLATINUM_INCLUDED_LEVELS;
  const lookbook = (project.curatedOptions ?? []).filter((o) => o.tier === 'lookbook');
  const curated = (project.curatedOptions ?? []).filter((o) => o.tier === 'survey');

  return (
    <section className="configurator-panel platinum-lookbook-panel" aria-label="Platinum features and Look Book">
      <header className="configurator-panel-header">
        <div>
          <p className="configurator-eyebrow">Included</p>
          <strong>Platinum Features &amp; Look Book</strong>
          <p className="muted">
            Selections stay within Platinum — no pricing shown. Structural changes (walls, doors, windows) are locked.
          </p>
        </div>
      </header>

      <div className="configurator-section">
        <div className="configurator-section-title">
          <strong>Platinum included tiers</strong>
        </div>
        <ul className="configurator-trade-summary">
          {levels.slice(0, 10).map((row) => (
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
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
