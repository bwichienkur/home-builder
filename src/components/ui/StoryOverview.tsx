import { Plus, X } from 'lucide-react';
import { usePlannerStore } from '../../store/plannerStore';
import { FloorPlateThumb } from './FloorPlateThumb';

/**
 * Side-by-side story plates (Captiva-style overview). Tap a story to open it
 * head-on in top view; add blank or copy-footprint upper stories.
 */
export function StoryOverview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const floors = usePlannerStore((s) => s.floors);
  const activeFloorId = usePlannerStore((s) => s.activeFloorId);
  const switchFloor = usePlannerStore((s) => s.switchFloor);
  const addFloor = usePlannerStore((s) => s.addFloor);
  const walls = usePlannerStore((s) => s.walls);
  const planRooms = usePlannerStore((s) => s.planRooms);

  if (!open) return null;

  const plates = floors.map((f) => {
    const live = f.id === activeFloorId;
    return {
      id: f.id,
      name: f.name,
      walls: live ? walls : f.scene.walls,
      planRooms: live ? planRooms : f.planRooms ?? [],
    };
  });

  const openStory = (id: string) => {
    switchFloor(id);
    onClose();
    window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 40);
  };

  return (
    <div className="story-overview" role="dialog" aria-label="All stories">
      <header>
        <div>
          <p className="story-overview-eyebrow">House plan</p>
          <h2>Stories</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close stories">
          <X size={18} />
        </button>
      </header>
      <div className="story-overview-grid">
        {plates.map((plate) => (
          <FloorPlateThumb key={plate.id} floor={plate} active={plate.id === activeFloorId} onSelect={() => openStory(plate.id)} />
        ))}
      </div>
      <div className="story-overview-actions">
        <button
          type="button"
          onClick={() => {
            addFloor();
            onClose();
            window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 40);
          }}
        >
          <Plus size={16} /> Blank story
        </button>
        <button
          type="button"
          onClick={() => {
            addFloor({ copyActive: true });
            onClose();
            window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 40);
          }}
        >
          <Plus size={16} /> Copy footprint up
        </button>
      </div>
      <p className="muted story-overview-hint">Each story opens head-on from above. Switch tabs anytime while editing.</p>
    </div>
  );
}
