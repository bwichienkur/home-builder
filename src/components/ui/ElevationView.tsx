import { usePlannerStore } from '../../store/plannerStore';
import type { ElevationFace } from '../../types';

const FACES: { id: ElevationFace; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
];

/** Face picker while the live 3D elevation camera is active. */
export function ElevationView() {
  const face = usePlannerStore((s) => s.elevationFace);
  const setFace = usePlannerStore((s) => s.setElevationFace);

  return (
    <div className="elevation-view-overlay" aria-label="Elevation face">
      <div className="elevation-view-toolbar" role="tablist" aria-label="Elevation face">
        {FACES.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={face === f.id}
            className={face === f.id ? 'is-active' : undefined}
            onClick={() => setFace(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
