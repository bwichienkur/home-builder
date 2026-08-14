import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bath,
  BedDouble,
  Check,
  Copy,
  FileSpreadsheet,
  Grid2X2,
  Home,
  Info,
  Lamp,
  Layers3,
  Menu,
  Move3D,
  MousePointer2,
  PencilRuler,
  Plus,
  Redo2,
  RotateCw,
  Scaling,
  ShoppingBag,
  Square,
  Trash2,
  Undo2,
  Wallpaper,
  X,
} from 'lucide-react';
import { roomCategories } from '../catalog/CatalogPanel';
import { usePlannerStore } from '../../store/plannerStore';
import type { RoomType, Tool } from '../../types';
import { StoryOverview } from './StoryOverview';

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(pointer: coarse)');
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);
  return coarse;
}

const icons: Record<string, typeof ShoppingBag> = {
  Bedroom: BedDouble,
  Lighting: Lamp,
  Plumbing: Bath,
  Surfaces: Grid2X2,
  Tile: Grid2X2,
  Seating: Home,
  Tables: Home,
  Storage: Home,
  Cabinetry: Home,
  Appliances: Home,
  Decor: ShoppingBag,
  Paneling: Grid2X2,
};

type Props = {
  roomType: RoomType;
  itemCount: number;
  total: number;
  catalogOpen: boolean;
  menuOpen: boolean;
  openCatalog: () => void;
  openMenu: () => void;
  closeMenu: () => void;
  openBom: () => void;
  openCategory: (category: string) => void;
  onOpenInspector: () => void;
};

export function StudioChrome({
  roomType,
  itemCount,
  total,
  catalogOpen,
  menuOpen,
  openMenu,
  closeMenu,
  openBom,
  openCategory,
  onOpenInspector,
}: Props) {
  const [viewMenu, setViewMenu] = useState(false);
  const [storiesOpen, setStoriesOpen] = useState(false);
  const camera = usePlannerStore((s) => s.cameraMode);
  const setView = usePlannerStore((s) => s.setView);
  const setCamera = usePlannerStore((s) => s.setCameraMode);
  const undo = usePlannerStore((s) => s.undo);
  const redo = usePlannerStore((s) => s.redo);
  const historyIndex = usePlannerStore((s) => s.historyIndex);
  const historyLength = usePlannerStore((s) => s.history.length);
  const selectedItem = usePlannerStore((s) => s.selectedFurnitureId);
  const selectedWall = usePlannerStore((s) => s.selectedWallId);
  const selectedOpening = usePlannerStore((s) => s.selectedOpeningId);
  const pending = usePlannerStore((s) => s.pendingPlacement);
  const workflowStage = usePlannerStore((s) => s.workflowStage);
  const studioMode = usePlannerStore((s) => s.studioMode);
  const setStudioMode = usePlannerStore((s) => s.setStudioMode);
  const housePlanName = usePlannerStore((s) => s.housePlanName);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const floors = usePlannerStore((s) => s.floors);
  const activeFloorId = usePlannerStore((s) => s.activeFloorId);
  const switchFloor = usePlannerStore((s) => s.switchFloor);
  const addFloor = usePlannerStore((s) => s.addFloor);
  const exitRoom = usePlannerStore((s) => s.exitRoom);
  const enterRoom = usePlannerStore((s) => s.enterRoom);
  const showStart = usePlannerStore((s) => s.showStart);
  const tool = usePlannerStore((s) => s.tool);
  const setTool = usePlannerStore((s) => s.setTool);
  const draftStart = usePlannerStore((s) => s.draftStart);
  const setDraftStart = usePlannerStore((s) => s.setDraftStart);
  const commitPending = usePlannerStore((s) => s.commitPendingPlacement);
  const cancelPending = usePlannerStore((s) => s.cancelPendingPlacement);
  const rotatePending = usePlannerStore((s) => s.rotatePendingPlacement);
  const rotateSelected = usePlannerStore((s) => s.rotateSelected);
  const duplicateSelected = usePlannerStore((s) => s.duplicateSelected);
  const deleteSelected = usePlannerStore((s) => s.deleteSelected);
  const categories = roomCategories[roomType];
  const isTop = camera === 'top';
  const isWalk = camera === 'walk';
  const showSelectionFabs = !!selectedItem && !pending;
  const showActionFabs = showSelectionFabs || !!pending;
  const coarsePointer = useCoarsePointer();
  const [gestureHint, setGestureHint] = useState(false);

  useEffect(() => {
    if (catalogOpen || menuOpen) {
      setViewMenu(false);
      setStoriesOpen(false);
    }
  }, [catalogOpen, menuOpen]);

  const goToFloor = (id: string) => {
    switchFloor(id);
    setView('3d');
    setCamera('top');
    window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 40);
  };

  useEffect(() => {
    if (!coarsePointer || pending) return;
    try {
      if (sessionStorage.getItem('roomcraft-gesture-hint') === '1') return;
      setGestureHint(true);
      const t = window.setTimeout(() => {
        setGestureHint(false);
        sessionStorage.setItem('roomcraft-gesture-hint', '1');
      }, 4200);
      return () => window.clearTimeout(t);
    } catch {
      /* private mode */
    }
  }, [coarsePointer, pending]);

  const walkLabel = useMemo(() => (coarsePointer ? 'Eye level (preview)' : 'Eye level'), [coarsePointer]);

  /** Flat top-down stay in WebGL — never leave the 3D scene. */
  const chooseTop = () => {
    setView('3d');
    setCamera('top');
    window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 0);
    setViewMenu(false);
  };

  const choose3d = (mode: 'orbit' | 'walk' = 'orbit') => {
    setView('3d');
    setCamera(mode);
    window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 0);
    setViewMenu(false);
  };

  /** Room layout edits happen in Top 3D + inspector — no Konva 2D plan. */
  const chooseEditRoom = () => {
    setView('3d');
    setCamera('top');
    setViewMenu(false);
    onOpenInspector();
    window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 0);
  };

  const refocus = () => {
    window.dispatchEvent(new Event('roomcraft-refocus'));
    setViewMenu(false);
  };

  const hasSelection = !!(selectedItem || selectedWall || selectedOpening || selectedRoomId);
  const selectedRoom = planRooms.find((r) => r.id === selectedRoomId);
  const activeFloor = floors.find((f) => f.id === activeFloorId);
  const houseLabel = housePlanName || (planRooms.length > 1 ? 'House plan' : 'Room');
  const atStart = workflowStage === 'start';
  const inRoom = workflowStage === 'room';
  const showCatalogRail = !atStart && studioMode === 'furnish' && !pending;
  const showPlanTools = !atStart && studioMode === 'architect' && isTop && !pending;

  const planTools: { id: Tool; label: string; icon: typeof MousePointer2 }[] = [
    { id: 'select', label: 'Select', icon: MousePointer2 },
    { id: 'wall', label: 'Wall', icon: Wallpaper },
    { id: 'room', label: 'Square room', icon: Square },
  ];

  const choosePlanTool = (id: Tool) => {
    setTool(id);
    setDraftStart(null);
    if (id !== 'select') {
      setView('3d');
      setCamera('top');
    }
  };

  if (atStart) {
    return (
      <div className="studio-chrome is-start">
        <button className="studio-fab studio-menu" onClick={menuOpen ? closeMenu : openMenu} aria-label={menuOpen ? 'Close menu' : 'Open project menu'} aria-expanded={menuOpen}>
          {menuOpen ? <X /> : <Menu />}
        </button>
      </div>
    );
  }

  return (
    <div className={`studio-chrome${showActionFabs ? ' has-action-fabs' : ''}${inRoom ? ' is-room-focus' : ''}`}>
      <button className="studio-fab studio-menu" onClick={menuOpen ? closeMenu : openMenu} aria-label={menuOpen ? 'Close menu' : 'Open project menu'} aria-expanded={menuOpen}>
        {menuOpen ? <X /> : <Menu />}
      </button>

      <nav className="studio-breadcrumb" aria-label="Design location">
        <button type="button" onClick={showStart} title="Start over">
          Start
        </button>
        <span aria-hidden="true">/</span>
        <button
          type="button"
          className={!inRoom ? 'is-current' : ''}
          onClick={() => {
            if (inRoom) {
              exitRoom();
              window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 0);
            }
          }}
        >
          {houseLabel}
        </button>
        {activeFloor && floors.length > 1 && (
          <>
            <span aria-hidden="true">/</span>
            <button type="button" className="is-current" onClick={() => setStoriesOpen(true)} title="All stories">
              {activeFloor.name}
            </button>
          </>
        )}
        {selectedRoom && (
          <>
            <span aria-hidden="true">/</span>
            <span className="studio-breadcrumb-static is-current">{selectedRoom.name}</span>
          </>
        )}
      </nav>

      {(floors.length > 1 || studioMode === 'architect') && !pending && (
        <div className="studio-floor-tabs" role="tablist" aria-label="Stories">
          {floors.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={f.id === activeFloorId}
              className={f.id === activeFloorId ? 'active' : ''}
              onClick={() => goToFloor(f.id)}
            >
              {f.name}
            </button>
          ))}
          {studioMode === 'architect' && (
            <button
              type="button"
              className="studio-floor-add"
              aria-label="Add story"
              title="Add story"
              onClick={() => {
                addFloor();
                window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 40);
              }}
            >
              <Plus size={14} />
            </button>
          )}
          {floors.length > 1 && (
            <button type="button" className="studio-floor-all" onClick={() => setStoriesOpen(true)} title="View all stories">
              All
            </button>
          )}
        </div>
      )}

      <div className="studio-mode-toggle" role="group" aria-label="Studio mode">
        <button type="button" className={studioMode === 'architect' ? 'active' : ''} onClick={() => setStudioMode('architect')}>
          Plan
        </button>
        <button type="button" className={studioMode === 'furnish' ? 'active' : ''} onClick={() => setStudioMode('furnish')}>
          Furnish
        </button>
      </div>

      <button
        className="studio-bag"
        onClick={openBom}
        aria-label={`${itemCount} products, estimated total $${total.toFixed(2)}`}
      >
        <span>
          <ShoppingBag size={18} />
          {itemCount}
        </span>
        <strong>
          ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </strong>
        <ArrowRight />
      </button>

      {inRoom && selectedRoom && !pending && tool === 'select' && (
        <div className="studio-selection-hint">
          Editing {selectedRoom.name} only
          <button
            type="button"
            className="studio-hint-action"
            onClick={() => {
              exitRoom();
              window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 0);
            }}
          >
            Back to house
          </button>
        </div>
      )}

      {inRoom && selectedRoom && !pending && tool !== 'select' && (
        <button
          type="button"
          className="studio-back-house"
          onClick={() => {
            exitRoom();
            setTool('select');
            window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 0);
          }}
        >
          Back to house
        </button>
      )}

      {showPlanTools && (
        <div className="studio-plan-tools" role="toolbar" aria-label="Plan tools">
          {planTools.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                className={tool === t.id ? 'active' : ''}
                onClick={() => choosePlanTool(t.id)}
                aria-label={t.label}
                title={t.label}
              >
                <Icon size={16} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {showPlanTools && tool === 'wall' && !pending && (
        <div className="studio-selection-hint">
          {draftStart ? 'Tap where the wall ends · snaps to corners' : 'Tap to start a wall · drag blue handles to move ends'}
          {draftStart && (
            <button type="button" className="studio-hint-action" onClick={() => setDraftStart(null)}>
              Cancel
            </button>
          )}
        </div>
      )}

      {showPlanTools && tool === 'room' && !pending && (
        <div className="studio-selection-hint">Tap to place a 12×12 ft room · resize or split in Edit</div>
      )}

      {!inRoom && planRooms.length > 1 && !pending && !selectedItem && tool === 'select' && (
        <div className="studio-selection-hint">Tap a room to zoom in and edit it alone · Pinch to zoom the full floor</div>
      )}

      {pending && <div className="studio-selection-hint">Placing {pending.name} · move then tap to confirm</div>}

      {hasSelection && !pending && !selectedItem && !inRoom && (
        <div className="studio-selection-hint">
          {selectedOpening ? 'Opening selected · adjust in Edit' : selectedWall ? 'Wall selected · use Edit for measurements' : 'Room selected'}
        </div>
      )}

      {pending && (
        <div className="studio-selection-fabs" role="toolbar" aria-label="Place product">
          <button onClick={() => rotatePending()} aria-label="Rotate preview">
            <RotateCw />
          </button>
          <button className="is-primary" onClick={() => commitPending()} aria-label="Confirm placement">
            <Check />
          </button>
          <button className="is-danger" onClick={() => cancelPending()} aria-label="Cancel placement">
            <X />
          </button>
        </div>
      )}

      {showSelectionFabs && (
        <div className="studio-selection-fabs" role="toolbar" aria-label="Selected product actions">
          <button onClick={() => rotateSelected()} aria-label="Rotate product">
            <RotateCw />
          </button>
          {!coarsePointer && (
            <button onClick={() => window.dispatchEvent(new Event('roomcraft-open-product-card'))} aria-label="Product details">
              <Info />
            </button>
          )}
          <button onClick={onOpenInspector} aria-label="Edit product">
            <PencilRuler />
          </button>
          {!coarsePointer && (
            <button onClick={() => duplicateSelected()} aria-label="Duplicate product">
              <Copy />
            </button>
          )}
          <button className="is-danger" onClick={() => deleteSelected()} aria-label="Delete product">
            <Trash2 />
          </button>
        </div>
      )}

      {gestureHint && !pending && !atStart && (
        <div className="studio-selection-hint studio-gesture-hint">Drag to orbit · Pinch to zoom · Two-finger pan</div>
      )}

      {isTop && !pending && (
        <button className="studio-view-chip" onClick={() => choose3d('orbit')}>
          Change to 3D view
        </button>
      )}

      {isWalk && !pending && (
        <button className="studio-view-chip" onClick={() => choose3d('orbit')}>
          Exit eye level
        </button>
      )}

      {showCatalogRail && (
        <div className={`studio-category-rail${catalogOpen ? ' is-active' : ''}`} aria-label={`${roomType} product categories`}>
          {categories.map((category) => {
            const Icon = icons[category] ?? ShoppingBag;
            return (
              <button key={category} onClick={() => openCategory(category)} aria-label={`Show ${category}`} title={category}>
                <Icon />
                <span>{category}</span>
              </button>
            );
          })}
        </div>
      )}

      {viewMenu && (
        <div className="studio-view-menu" role="menu">
          <button onClick={refocus}>
            <Move3D />
            Fit entire floor
          </button>
          <button className={isTop ? 'active' : ''} onClick={chooseTop}>
            <Grid2X2 />
            Plan view
          </button>
          <button className={camera === 'orbit' ? 'active' : ''} onClick={() => choose3d('orbit')}>
            <Layers3 />
            3D view
          </button>
          {!coarsePointer && (
            <button className={isWalk ? 'active' : ''} onClick={() => choose3d('walk')}>
              <Move3D />
              {walkLabel}
            </button>
          )}
          <button
            onClick={() => {
              chooseEditRoom();
              if (selectedRoomId) enterRoom(selectedRoomId);
            }}
          >
            <Scaling />
            Edit room
          </button>
        </div>
      )}

      <div className="studio-dock" role="toolbar" aria-label="Studio controls">
        <div className="studio-dock-group">
          <button onClick={() => setViewMenu((open) => !open)} aria-expanded={viewMenu} aria-label="Choose room view">
            {isTop ? <Grid2X2 /> : isWalk ? <Move3D /> : <Layers3 />}
          </button>
          <button onClick={refocus} aria-label="Fit entire floor">
            <Move3D />
          </button>
          <button onClick={onOpenInspector} aria-label="Edit selected wall or room" disabled={!hasSelection || !!pending}>
            <PencilRuler />
          </button>
          <button onClick={chooseEditRoom} aria-label="Edit room size">
            <Scaling />
          </button>
        </div>
        <div className="studio-dock-group studio-dock-history">
          <button onClick={undo} disabled={historyIndex === 0} aria-label="Undo">
            <Undo2 />
          </button>
          <button onClick={redo} disabled={historyIndex === historyLength - 1} aria-label="Redo">
            <Redo2 />
          </button>
        </div>
      </div>

      <a className="studio-admin-link" href="/admin" hidden>
        <FileSpreadsheet />
        Advanced inventory
      </a>

      <StoryOverview open={storiesOpen} onClose={() => setStoriesOpen(false)} />
    </div>
  );
}
