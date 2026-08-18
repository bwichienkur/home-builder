import { ChevronLeft, ChevronRight } from 'lucide-react';
import { nextElevationFace } from '../../lib/geometry/elevationFace';
import { usePlannerStore } from '../../store/plannerStore';
import type { ElevationFace } from '../../types';

const FACES: { id: ElevationFace; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'right', label: 'Right' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' },
];

/** Face picker while the live 3D elevation camera is active. Drag to orbit the walls. */
export function ElevationView() {
  const face = usePlannerStore((s) => s.elevationFace);
  const setFace = usePlannerStore((s) => s.setElevationFace);

  return (
    <div className="elevation-view-overlay" aria-label="Elevation face">
      <div className="elevation-view-toolbar" role="tablist" aria-label="Look at each wall">
        <button
          type="button"
          className="elevation-view-spin"
          aria-label="Previous wall"
          onClick={() => setFace(nextElevationFace(face, -1))}
        >
          <ChevronLeft size={18} />
        </button>
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
        <button
          type="button"
          className="elevation-view-spin"
          aria-label="Next wall"
          onClick={() => setFace(nextElevationFace(face, 1))}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
