import { useEffect, useMemo, useState } from 'react';
import { drawElevationToCanvas, type ElevationFace } from '../../lib/planExport/drawElevations';
import { usePlannerStore } from '../../store/plannerStore';

const FACES: { id: ElevationFace; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
];

/** In-canvas elevation view — wall heights, doors, windows, and openings per face. */
export function ElevationView() {
  const walls = usePlannerStore((s) => s.walls);
  const openings = usePlannerStore((s) => s.openings);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const unitSystem = usePlannerStore((s) => s.unitSystem);
  const floors = usePlannerStore((s) => s.floors);
  const activeFloorId = usePlannerStore((s) => s.activeFloorId);
  const housePlanName = usePlannerStore((s) => s.housePlanName);
  const [face, setFace] = useState<ElevationFace>('front');
  const [url, setUrl] = useState('');

  const floorName = floors.find((f) => f.id === activeFloorId)?.name;

  const input = useMemo(
    () => ({
      name: housePlanName || 'Design',
      floorName,
      walls,
      openings,
      planRooms,
      unitSystem,
    }),
    [housePlanName, floorName, walls, openings, planRooms, unitSystem],
  );

  useEffect(() => {
    if (walls.length === 0) {
      setUrl('');
      return;
    }
    const canvas = drawElevationToCanvas(input, face, { widthPx: 1400, heightPx: 900 });
    setUrl(canvas.toDataURL('image/png'));
  }, [face, input, walls.length]);

  return (
    <div className="elevation-view" aria-label="Front elevation view">
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
      <div className="elevation-view-stage">
        {walls.length === 0 ? (
          <p className="muted">Add walls to preview elevations.</p>
        ) : url ? (
          <img src={url} alt={`${face} elevation`} className="elevation-view-img" />
        ) : (
          <p className="muted">Drawing…</p>
        )}
      </div>
    </div>
  );
}
