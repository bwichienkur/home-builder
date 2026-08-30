import { useMemo, useState } from 'react';
import { Blend, X } from 'lucide-react';
import { usePlannerStore } from '../../store/plannerStore';
import type { LayerVisibility } from '../../types';

const LAYER_LABELS: { key: keyof LayerVisibility; label: string }[] = [
  { key: 'cadOverlay', label: 'CAD overlay' },
  { key: 'labels', label: 'Room labels' },
  { key: 'dims', label: 'Wall dims' },
  { key: 'openings', label: 'Doors / windows' },
  { key: 'furniture', label: 'Furniture' },
  { key: 'annotations', label: 'Notes' },
  { key: 'framing', label: 'Framing (16″ o.c.)' },
  { key: 'roof', label: 'Roof (3D)' },
  { key: 'setbacks', label: 'Setbacks' },
];

/** Compact trade-layer toggles for plan / 3D. */
export function LayersMenu() {
  const layers = usePlannerStore((s) => s.layerVisibility);
  const setLayers = usePlannerStore((s) => s.setLayerVisibility);
  const [open, setOpen] = useState(false);
  const activeCount = useMemo(() => Object.values(layers).filter(Boolean).length, [layers]);

  return (
    <div className={`layers-menu-root${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className={`studio-dock-action${open ? ' is-active' : ''}`}
        title="Layers"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Blend size={15} />
        <span>Layers</span>
      </button>
      {open && (
        <div className="layers-menu-panel" role="dialog" aria-label="Layer visibility">
          <header>
            <strong>Layers · {activeCount}</strong>
            <button type="button" aria-label="Close layers" onClick={() => setOpen(false)}>
              <X size={14} />
            </button>
          </header>
          <ul>
            {LAYER_LABELS.map(({ key, label }) => (
              <li key={key}>
                <label>
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={(e) => setLayers({ [key]: e.target.checked })}
                  />
                  {label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
