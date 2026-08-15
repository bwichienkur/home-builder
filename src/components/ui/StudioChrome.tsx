import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bath,
  BedDouble,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileSpreadsheet,
  Focus,
  Grid2X2,
  Home,
  Info,
  Lamp,
  Layers3,
  LayoutTemplate,
  Menu,
  MousePointer2,
  PencilRuler,
  Plus,
  Redo2,
  RotateCw,
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
  const [storiesOpen, setStoriesOpen] = useState(false);
  const [fabsOpen, setFabsOpen] = useState(true);
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
  const deleteFloor = usePlannerStore((s) => s.deleteFloor);
  const exitRoom = usePlannerStore((s) => s.exitRoom);
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
  const wallEditMode = studioMode === 'architect' && isTop && tool === 'select';
  const showSelectionFabs = !!selectedItem && !pending;
  const showWallFabs = wallEditMode && !!selectedWall && !pending;
  const showActionFabs = showSelectionFabs || !!pending || showWallFabs;
  const coarsePointer = useCoarsePointer();
  const [gestureHint, setGestureHint] = useState(false);

  useEffect(() => {
    if (catalogOpen || menuOpen) setStoriesOpen(false);
  }, [catalogOpen, menuOpen]);

  const goToFloor = (id: string) => {
    switchFloor(id);
    setView('3d');
    setCamera('top');
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
    }, 80);
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

  /** Flat top-down stay in WebGL — never leave the 3D scene. */
  const chooseTop = () => {
    setView('3d');
    setCamera('top');
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
    }, 0);
  };

  const choose3d = (mode: 'orbit' | 'walk' = 'orbit') => {
    setView('3d');
    setCamera(mode);
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
    }, 0);
  };

  const refocus = () => {
    window.dispatchEvent(new Event('roomcraft-fit-plan'));
    window.dispatchEvent(new Event('roomcraft-refocus'));
  };

  const hasSelection = !!(selectedItem || selectedWall || selectedOpening || selectedRoomId);
  const selectedRoom = planRooms.find((r) => r.id === selectedRoomId);
  const activeFloor = floors.find((f) => f.id === activeFloorId);
  const houseLabel = housePlanName || (planRooms.length > 1 ? 'House plan' : 'Room');
  const atStart = workflowStage === 'start';
  const inRoom = workflowStage === 'room';
  const showCatalogRail = inRoom && !pending;
  /** Plan-level wall tools (house/floor plate) — not while inside a room. */
  const atPlanLevel = !atStart && !inRoom;
  const showPlanTools = atPlanLevel && isTop && !pending && studioMode === 'architect';
  const showFloorChrome = atPlanLevel && !pending;
  const showPlanRail = atPlanLevel && !pending;
  const pendingRoomShape = usePlannerStore((s) => s.pendingRoomShape);
  const setPendingRoomShape = usePlannerStore((s) => s.setPendingRoomShape);
  const deletePlanRoom = usePlannerStore((s) => s.deletePlanRoom);
  const enterRoom = usePlannerStore((s) => s.enterRoom);

  useEffect(() => {
    if (inRoom) setStudioMode('furnish');
  }, [inRoom, setStudioMode]);

  useEffect(() => {
    if (inRoom && tool === 'room') setTool('select');
  }, [inRoom, tool, setTool]);

  const goBackToHouse = () => {
    exitRoom();
    setTool('select');
    setStudioMode('architect');
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
    }, 0);
  };

  const removeFloor = (id: string) => {
    if (floors.length <= 1) return;
    const floor = floors.find((f) => f.id === id);
    if (!floor) return;
    if (!window.confirm(`Delete “${floor.name}”? This cannot be undone.`)) return;
    if (!deleteFloor(id)) return;
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
    }, 80);
  };

  useEffect(() => {
    if (pending) setFabsOpen(true);
  }, [pending]);

  const planTools: { id: Tool; label: string; icon: typeof MousePointer2 }[] = [
    { id: 'select', label: 'Walls', icon: PencilRuler },
    { id: 'wall', label: 'Draw', icon: Wallpaper },
  ];

  const roomShapes: { id: 'rectangle' | 'wide' | 'l-shape'; label: string; icon: typeof Square }[] = [
    { id: 'rectangle', label: 'Square', icon: Square },
    { id: 'wide', label: 'Wide', icon: LayoutTemplate },
    { id: 'l-shape', label: 'L-shape', icon: Home },
  ];

  const choosePlanTool = (id: Tool) => {
    setPendingRoomShape(null);
    setStudioMode('architect');
    setTool(id);
    setDraftStart(null);
    setView('3d');
    setCamera('top');
    if (id !== 'select') usePlannerStore.getState().selectWall(null);
  };

  const chooseRoomShape = (shape: 'rectangle' | 'wide' | 'l-shape') => {
    setStudioMode('architect');
    setView('3d');
    setCamera('top');
    setPendingRoomShape(pendingRoomShape === shape ? null : shape);
  };

  const editSelectedPlanRoom = () => {
    if (!selectedRoomId) return;
    enterRoom(selectedRoomId);
    setPendingRoomShape(null);
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
      onOpenInspector();
    }, 60);
  };

  const removeSelectedPlanRoom = () => {
    if (!selectedRoomId) return;
    const room = planRooms.find((r) => r.id === selectedRoomId);
    if (!room) return;
    if (!window.confirm(`Remove “${room.name}” from this floor?`)) return;
    deletePlanRoom(selectedRoomId);
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
    }, 40);
  };

  useEffect(() => {
    if (wallEditMode) return;
    if (usePlannerStore.getState().selectedWallId) usePlannerStore.getState().selectWall(null);
  }, [wallEditMode]);

  const openFurnishCategory = (category: string) => {
    setStudioMode('furnish');
    openCategory(category);
  };

  if (atStart) {
    return (
      <div className="studio-chrome is-start">
        <div className="studio-topbar">
          <div className="studio-topbar-row">
            <button className="studio-fab studio-menu" onClick={menuOpen ? closeMenu : openMenu} aria-label={menuOpen ? 'Close menu' : 'Open project menu'} aria-expanded={menuOpen}>
              {menuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`studio-chrome${showActionFabs ? ' has-action-fabs' : ''}${inRoom ? ' is-room-focus' : ''}`}>
      <div className="studio-topbar">
        <div className="studio-topbar-row">
          {inRoom && (
            <button type="button" className="studio-fab studio-back-plan" onClick={goBackToHouse} aria-label="Back to plan" title="Back to plan">
              <ArrowLeft />
            </button>
          )}
          <button className="studio-fab studio-menu" onClick={menuOpen ? closeMenu : openMenu} aria-label={menuOpen ? 'Close menu' : 'Open project menu'} aria-expanded={menuOpen}>
            {menuOpen ? <X /> : <Menu />}
          </button>

          {inRoom && selectedRoom ? (
            <div className="studio-breadcrumb studio-room-title" aria-label="Current room">
              <span className="studio-breadcrumb-static is-current" title={selectedRoom.name}>
                {selectedRoom.name}
              </span>
            </div>
          ) : (
            <nav className="studio-breadcrumb" aria-label="Design location">
              <button type="button" onClick={showStart} title="Start over">
                Start
              </button>
              <span aria-hidden="true">/</span>
              <button type="button" className={!selectedRoom ? 'is-current' : ''} title={houseLabel}>
                {houseLabel}
              </button>
              {activeFloor && (
                <>
                  <span aria-hidden="true">/</span>
                  <button
                    type="button"
                    className={!selectedRoom ? 'is-current' : ''}
                    onClick={() => (floors.length > 1 ? setStoriesOpen(true) : undefined)}
                    title={activeFloor.name}
                  >
                    {activeFloor.name}
                  </button>
                </>
              )}
              {selectedRoom && (
                <>
                  <span aria-hidden="true">/</span>
                  <span className="studio-breadcrumb-static is-current" title={selectedRoom.name}>
                    {selectedRoom.name}
                  </span>
                </>
              )}
            </nav>
          )}

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
        </div>

        {showFloorChrome && (
          <div className="studio-top-tools" aria-label="Stories and plan tools">
            <div className="studio-floor-stack studio-floor-stack--bar" role="tablist" aria-label="Stories">
              {floors.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={f.id === activeFloorId}
                  className={f.id === activeFloorId ? 'active' : ''}
                  onClick={() => goToFloor(f.id)}
                  title={f.name}
                >
                  {f.name}
                </button>
              ))}
              <div className="studio-floor-stack-actions">
                <button
                  type="button"
                  className="studio-floor-add"
                  aria-label="Add story"
                  title="Add story"
                  onClick={() => {
                    setStudioMode('architect');
                    addFloor();
                    window.setTimeout(() => {
                      window.dispatchEvent(new Event('roomcraft-fit-plan'));
                      window.dispatchEvent(new Event('roomcraft-refocus'));
                    }, 80);
                  }}
                >
                  <Plus size={14} />
                </button>
                {floors.length > 1 && (
                  <button
                    type="button"
                    className="studio-floor-delete"
                    aria-label="Delete current story"
                    title="Delete current story"
                    onClick={() => removeFloor(activeFloorId)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                {floors.length > 1 && (
                  <button type="button" className="studio-floor-all" onClick={() => setStoriesOpen(true)} title="View all stories">
                    All
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {!inRoom && planRooms.length >= 1 && !pending && !selectedItem && tool === 'select' && !selectedRoom && (
        <div className="studio-selection-hint studio-hint-float">Tap a room to select · use the right rail to edit or remove</div>
      )}

      {showPlanTools && tool === 'select' && !selectedWall && !selectedRoom && (
        <div className="studio-selection-hint studio-hint-float">Tap a wall · drag ends to resize</div>
      )}
      {showPlanTools && tool === 'wall' && (
        <div className="studio-selection-hint studio-hint-float">
          {draftStart ? 'Tap wall end' : 'Tap to draw walls'}
          {draftStart && (
            <button type="button" className="studio-hint-action" onClick={() => setDraftStart(null)}>
              Cancel
            </button>
          )}
        </div>
      )}
      {pendingRoomShape && (
        <div className="studio-selection-hint studio-hint-float">Drag on the plan to place a {pendingRoomShape === 'l-shape' ? 'L-shaped' : pendingRoomShape} room</div>
      )}

      {pending && <div className="studio-selection-hint studio-hint-float">Placing {pending.name} · move then tap to confirm</div>}

      {hasSelection && !pending && !selectedItem && !inRoom && wallEditMode && selectedWall && (
        <div className="studio-selection-hint studio-hint-float">Wall selected · drag blue handles to resize</div>
      )}

      {wallEditMode && selectedWall && !pending && (
        <div className="studio-selection-fabs" role="toolbar" aria-label="Wall actions">
          <button
            type="button"
            className="is-danger"
            onClick={() => {
              if (!window.confirm('Delete this wall?')) return;
              deleteSelected();
            }}
            aria-label="Delete wall"
            title="Delete wall"
          >
            <Trash2 />
          </button>
          <button type="button" onClick={onOpenInspector} aria-label="Wall properties" title="Wall properties">
            <Info />
          </button>
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
        <div className={`studio-selection-fabs${fabsOpen ? '' : ' is-collapsed'}`} role="toolbar" aria-label="Selected product actions">
          <button
            type="button"
            className="studio-fabs-toggle"
            aria-expanded={fabsOpen}
            aria-label={fabsOpen ? 'Hide actions' : 'Show actions'}
            onClick={() => setFabsOpen((open) => !open)}
          >
            {fabsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <div className="studio-fabs-tray" aria-hidden={!fabsOpen}>
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
        </div>
      )}

      {gestureHint && !pending && !atStart && (
        <div className="studio-selection-hint studio-gesture-hint studio-hint-float">
          {isTop
            ? 'Drag furniture to move · Empty space pans · Pinch to zoom'
            : 'Drag furniture through open walls · Drag empty space to orbit · Pinch to zoom'}
        </div>
      )}

      {showPlanRail && (
        <div className="studio-category-rail studio-plan-rail" aria-label="Plan tools">
          {isTop &&
            planTools.map((t) => {
              const Icon = t.icon;
              const active = !pendingRoomShape && studioMode === 'architect' && tool === t.id;
              return (
                <button key={t.id} type="button" className={active ? 'is-active' : ''} onClick={() => choosePlanTool(t.id)} aria-label={t.label} title={t.label}>
                  <Icon />
                  <span>{t.label}</span>
                </button>
              );
            })}
          {isTop &&
            roomShapes.map((s) => {
              const Icon = s.icon;
              const active = pendingRoomShape === s.id;
              return (
                <button key={s.id} type="button" className={active ? 'is-active' : ''} onClick={() => chooseRoomShape(s.id)} aria-label={`Place ${s.label} room`} title={`Place ${s.label} room`}>
                  <Icon />
                  <span>{s.label}</span>
                </button>
              );
            })}
          {selectedRoom && (
            <>
              <button type="button" className="is-active" onClick={editSelectedPlanRoom} aria-label="Edit room" title="Edit room">
                <PencilRuler />
                <span>Edit</span>
              </button>
              <button type="button" className="is-danger" onClick={removeSelectedPlanRoom} aria-label="Remove room" title="Remove room">
                <Trash2 />
                <span>Remove</span>
              </button>
            </>
          )}
        </div>
      )}

      {showCatalogRail && (
        <div className={`studio-category-rail${catalogOpen ? ' is-active' : ''}`} aria-label={`${roomType} product categories`}>
          <button type="button" onClick={onOpenInspector} aria-label="Edit room" title="Edit room">
            <PencilRuler />
            <span>Edit</span>
          </button>
          {categories.map((category) => {
            const Icon = icons[category] ?? ShoppingBag;
            return (
              <button key={category} onClick={() => openFurnishCategory(category)} aria-label={`Show ${category}`} title={category}>
                <Icon />
                <span>{category}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="studio-dock" role="toolbar" aria-label="Studio controls">
        <div className="studio-dock-shell studio-dock-flat">
          <div className="studio-dock-seg" role="group" aria-label="View mode">
            <button type="button" className={isTop ? 'is-active' : ''} onClick={chooseTop} title="Plan view">
              <Grid2X2 size={16} />
              <span>Plan</span>
            </button>
            <button type="button" className={!isTop && camera === 'orbit' ? 'is-active' : ''} onClick={() => choose3d('orbit')} title="3D view">
              <Layers3 size={16} />
              <span>3D</span>
            </button>
          </div>
          <button type="button" className="studio-dock-action" onClick={refocus} title="Fit in view">
            <Focus size={15} />
            <span>Fit</span>
          </button>
          <button type="button" className="studio-dock-action" onClick={undo} disabled={historyIndex === 0} title="Undo">
            <Undo2 size={15} />
            <span>Undo</span>
          </button>
          <button type="button" className="studio-dock-action" onClick={redo} disabled={historyIndex === historyLength - 1} title="Redo">
            <Redo2 size={15} />
            <span>Redo</span>
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
