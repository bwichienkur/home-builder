import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { drawElevationToCanvas, type ElevationFace } from '../../lib/planExport/drawElevations';
import { usePlannerStore } from '../../store/plannerStore';

const FACES: { id: ElevationFace; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
];

/** Lightweight in-app elevation preview (same renderer as the CD PDF). */
export function ElevationPreview({ open, onClose }: { open: boolean; onClose: () => void }) {
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
    if (!open) return;
    const canvas = drawElevationToCanvas(input, face, { widthPx: 1100, heightPx: 720 });
    const next = canvas.toDataURL('image/png');
    setUrl(next);
    return () => {
      /* revoke not needed for data URLs */
    };
  }, [open, face, input]);

  if (!open) return null;

  return (
    <div className="elevation-preview-root" role="dialog" aria-label="Elevation preview">
      <button type="button" className="elevation-preview-backdrop" aria-label="Close elevation" onClick={onClose} />
      <div className="elevation-preview-sheet">
        <header>
          <strong>Elevations</strong>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="elevation-face-pills" role="tablist">
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
        {walls.length === 0 ? (
          <p className="muted">Add walls to preview elevations.</p>
        ) : url ? (
          <img src={url} alt={`${face} elevation`} className="elevation-preview-img" />
        ) : (
          <p className="muted">Drawing…</p>
        )}
        <p className="muted">Same elevation sheets appear in the construction-set PDF export.</p>
      </div>
    </div>
  );
}
