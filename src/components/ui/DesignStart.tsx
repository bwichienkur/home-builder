import { useMemo, useState } from 'react';
import { ArrowLeft, Home, LayoutTemplate, Ruler } from 'lucide-react';
import { olsenHousePlans } from '../../lib/housePlans/olsenPlans';
import { usePlannerStore } from '../../store/plannerStore';

type StartView = 'chooser' | 'gallery';

/**
 * First-run IA: choose load plan / single room / custom house.
 * One composition — no dashboard chrome.
 */
export function DesignStart({ onBegan }: { onBegan?: () => void }) {
  const [view, setView] = useState<StartView>('chooser');
  const applyHousePlan = usePlannerStore((s) => s.applyHousePlan);
  const applyRoomTemplate = usePlannerStore((s) => s.applyRoomTemplate);
  const enterHouse = usePlannerStore((s) => s.enterHouse);
  const setStudioMode = usePlannerStore((s) => s.setStudioMode);
  const setUnit = usePlannerStore((s) => s.setUnitSystem);

  const plans = useMemo(
    () => [...olsenHousePlans].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const finish = () => {
    // Instant fit after walls commit — avoids blank/fogged or diagonal first frames.
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

  const startRoom = (shape: 'rectangle' | 'wide' | 'l-shape') => {
    applyRoomTemplate(shape);
    // Stay at plan level — room edit opens from the right rail.
    finish();
  };

  const startCustomHouse = () => {
    applyRoomTemplate('l-shape');
    enterHouse();
    setStudioMode('architect');
    setUnit('imperial');
    finish();
  };

  if (view === 'gallery') {
    return (
      <section className="design-start" aria-label="Choose a house plan">
        <div className="design-start-panel">
          <button type="button" className="design-start-back" onClick={() => setView('chooser')}>
            <ArrowLeft size={18} /> Back
          </button>
          <p className="design-start-eyebrow">House plans</p>
          <h1>Load an existing plan</h1>
          <p className="design-start-lede">
            Pick a floor plate — it opens looking straight down, centered. Multi-story plans include First and Second story tabs.
          </p>
          <div className="design-start-gallery">
            {plans.map((plan) => (
              <button key={plan.id} type="button" className="design-start-plan" onClick={() => loadPlan(plan.id)}>
                <strong>{plan.name}</strong>
                <span>
                  {plan.beds} bed · {plan.baths} bath · {plan.livingSqFt.toLocaleString()} sf · {plan.stories === 1 ? '1 story' : '2 story'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="design-start" aria-label="Start your design">
      <div className="design-start-panel">
        <p className="design-start-eyebrow">Mahnikka</p>
        <h1>How do you want to begin?</h1>
        <p className="design-start-lede">Choose a path. You can always return here from the project menu.</p>
        <div className="design-start-choices">
          <button type="button" className="design-start-choice" onClick={() => setView('gallery')}>
            <LayoutTemplate size={28} strokeWidth={1.6} />
            <div>
              <strong>Load a house plan</strong>
              <span>Start from a full multi-room floor plate</span>
            </div>
          </button>
          <button type="button" className="design-start-choice" onClick={() => startRoom('rectangle')}>
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
      </div>
    </section>
  );
}
