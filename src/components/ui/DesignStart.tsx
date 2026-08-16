import { useMemo } from 'react';
import { Home, LayoutTemplate, Ruler } from 'lucide-react';
import { Link } from 'react-router-dom';
import { listBuiltinHousePlans } from '../../lib/housePlans/planRegistry';
import { usePlannerStore } from '../../store/plannerStore';

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
    <section className="design-start" aria-label="Start your design">
      <div className="design-start-panel">
        <p className="design-start-eyebrow">Build</p>
        <h1>Start a design</h1>
        <p className="design-start-lede">
          Quick start here, or open the{' '}
          <Link to="/plans" style={{ color: 'var(--accent)', fontWeight: 700 }}>
            House plans
          </Link>{' '}
          library to import DXF/JSON.
        </p>
        <div className="design-start-choices">
          <button type="button" className="design-start-choice" onClick={startRoom}>
            <Home size={28} strokeWidth={1.6} />
            <div>
              <strong>Start with one room</strong>
              <span>A simple rectangle you can furnish right away</span>
            </div>
          </button>
          <button type="button" className="design-start-choice" onClick={startCustomHouse}>
            <Ruler size={28} strokeWidth={1.6} />
            <div>
              <strong>Build a custom plan</strong>
              <span>Begin with an L-shaped shell and shape rooms</span>
            </div>
          </button>
        </div>
        <p className="design-start-eyebrow" style={{ marginTop: 22 }}>
          Sample plans
        </p>
        <div className="design-start-gallery">
          {plans.map((plan) => (
            <button key={plan.id} type="button" className="design-start-plan" onClick={() => loadPlan(plan.id)}>
              <LayoutTemplate size={18} />
              <strong>{plan.name}</strong>
              <span>
                {plan.beds} bed · {plan.baths} bath · {plan.livingSqFt.toLocaleString()} sf
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
