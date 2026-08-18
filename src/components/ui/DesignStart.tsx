import { useMemo } from 'react';
import { Home, Ruler } from 'lucide-react';
import { Link } from 'react-router-dom';
import { listBuiltinHousePlans } from '../../lib/housePlans/planRegistry';
import { usePlannerStore } from '../../store/plannerStore';
import { HousePlanCard } from './HousePlanThumb';

/**
 * Build entry when no project is loaded yet.
 * House plans live under /plans — this only offers quick starts + samples.
 */
export function DesignStart({ onBegan }: { onBegan?: () => void }) {
  const applyHousePlan = usePlannerStore((s) => s.applyHousePlan);
  const applyRoomTemplate = usePlannerStore((s) => s.applyRoomTemplate);
  const enterHouse = usePlannerStore((s) => s.enterHouse);
  const setStudioMode = usePlannerStore((s) => s.setStudioMode);
  const setUnit = usePlannerStore((s) => s.setUnitSystem);
  const plans = useMemo(() => listBuiltinHousePlans(), []);

  const finish = () => {
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
    }, 80);
    onBegan?.();
  };

  const loadPlan = (id: string) => {
    if (!applyHousePlan(id)) return;
    finish();
  };

  const startRoom = () => {
    applyRoomTemplate('rectangle');
    finish();
  };

  const startCustomHouse = () => {
    applyRoomTemplate('l-shape');
    enterHouse();
    setStudioMode('architect');
    setUnit('imperial');
    finish();
  };

  return (
    <section className="design-start" aria-label="Start a job">
      <div className="design-start-panel">
        <p className="design-start-eyebrow">Mahnikka · Build</p>
        <h1>Open a job</h1>
        <p className="design-start-lede">
          Frame rooms, place materials, then pull FF&amp;E and takeoff from the bag. Or import from{' '}
          <Link to="/plans">House plans</Link>.
        </p>
        <div className="design-start-choices">
          <button type="button" className="design-start-choice" onClick={startRoom}>
            <Home size={28} strokeWidth={1.6} />
            <div>
              <strong>One room</strong>
              <span>Rectangle shell — furnish and price FF&amp;E</span>
            </div>
          </button>
          <button type="button" className="design-start-choice" onClick={startCustomHouse}>
            <Ruler size={28} strokeWidth={1.6} />
            <div>
              <strong>Custom plan</strong>
              <span>L-shaped shell — edit walls, then takeoff</span>
            </div>
          </button>
        </div>
        <p className="design-start-eyebrow" style={{ marginTop: 22 }}>
          Sample plans
        </p>
        <div className="design-start-gallery">
          {plans.map((plan) => (
            <HousePlanCard key={plan.id} plan={plan} onSelect={() => loadPlan(plan.id)} />
          ))}
        </div>
      </div>
    </section>
  );
}
