import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bath,
  BedDouble,
  Check,
  ChevronDown,
  ChevronUp,
  Columns2,
  FileSpreadsheet,
  Focus,
  Grid2X2,
  Home,
  Info,
  Lamp,
  Layers3,
  Menu,
  PencilRuler,
  Plus,
  Redo2,
  RotateCw,
  ShoppingBag,
  SlidersHorizontal,
  Sofa,
  Trash2,
  Undo2,
  Wallpaper,
  DoorOpen,
  SquareDashed,
  X,
} from 'lucide-react';
import { roomCategories } from '../catalog/CatalogPanel';
import { usePlannerStore } from '../../store/plannerStore';
import type { RoomType, Tool } from '../../types';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
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
  Trim: Wallpaper,
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
  const pendingFloorFill = usePlannerStore((s) => s.pendingFloorFill);
  const cancelFloorFill = usePlannerStore((s) => s.cancelFloorFill);
  const addOpening = usePlannerStore((s) => s.addOpening);
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
  const setDraftStart = usePlannerStore((s) => s.setDraftStart);
  const commitPending = usePlannerStore((s) => s.commitPendingPlacement);
  const cancelPending = usePlannerStore((s) => s.cancelPendingPlacement);
  const rotatePending = usePlannerStore((s) => s.rotatePendingPlacement);
  const rotateSelected = usePlannerStore((s) => s.rotateSelected);
  const deleteSelected = usePlannerStore((s) => s.deleteSelected);
  const removePerimeterTrim = usePlannerStore((s) => s.removePerimeterTrim);
  const clearFloorFinish = usePlannerStore((s) => s.clearFloorFinish);
  const furniture = usePlannerStore((s) => s.furniture);
  const floorColor = usePlannerStore((s) => s.floorColor);
  const selectedFurniture = furniture.find((f) => f.id === selectedItem);
  const isTrimSelected = selectedFurniture?.placementKind === 'perimeter-trim';
  const hasCrown = furniture.some((f) => f.placementKind === 'perimeter-trim' && f.trimEdge === 'ceiling');
  const hasBaseboard = furniture.some((f) => f.placementKind === 'perimeter-trim' && f.trimEdge === 'floor');
  const crownName = furniture.find((f) => f.placementKind === 'perimeter-trim' && f.trimEdge === 'ceiling')?.name;
  const baseName = furniture.find((f) => f.placementKind === 'perimeter-trim' && f.trimEdge === 'floor')?.name;
  const categories = roomCategories[roomType];
  const isTop = camera === 'top';
  const wallEditMode = studioMode === 'architect' && isTop && tool === 'select';
  const showSelectionFabs = !!selectedItem && !pending;
  const showOpeningFabs = !!selectedOpening && !pending && !selectedWall;
  const showWallFabs = wallEditMode && !!selectedWall && !pending;
  const showActionFabs = showSelectionFabs || !!pending || showWallFabs || showOpeningFabs;
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
  const roomFloorColor = selectedRoom?.floorColor ?? floorColor;
  const hasCustomFloor = !!selectedRoom?.floorColor || floorColor !== '#c9b18f';
  const activeFloor = floors.find((f) => f.id === activeFloorId);
  const houseLabel = housePlanName || (planRooms.length > 1 ? 'House plan' : 'Room');
  const atStart = workflowStage === 'start';
  const inRoom = workflowStage === 'room';
  const showCatalogRail = inRoom && !pending;
  /** Plan-level wall tools (house/floor plate) — not while inside a room. */
  const atPlanLevel = !atStart && !inRoom;
  const showPlanTools = atPlanLevel && isTop && !pending && studioMode === 'architect';
  const showFloorChrome = atPlanLevel && !pending;
  const pendingRoomShape = usePlannerStore((s) => s.pendingRoomShape);
  const setPendingRoomShape = usePlannerStore((s) => s.setPendingRoomShape);
  const pendingAttachMode = usePlannerStore((s) => s.pendingAttachMode);
  const setPendingAttachMode = usePlannerStore((s) => s.setPendingAttachMode);
  const placePlanRoom = usePlannerStore((s) => s.placePlanRoom);
  const deletePlanRoom = usePlannerStore((s) => s.deletePlanRoom);
  const enterRoom = usePlannerStore((s) => s.enterRoom);
  const showPlanToolButtons = showPlanTools;
  const showPlanRoomActions = atPlanLevel && !pending && !!selectedRoom;
  /** Never render an empty black rail strip (e.g. 3D plan with nothing selected). */
  const showPlanRail =
    (((atPlanLevel && !pending && isTop) || showPlanRoomActions) && !selectedWall);

  useEffect(() => {
    if (inRoom) setStudioMode('furnish');
  }, [inRoom, setStudioMode]);

  useEffect(() => {
    if (inRoom && tool === 'room') setTool('select');
  }, [inRoom, tool, setTool]);

  useEffect(() => {
    if (!atPlanLevel || !isTop) {
      if (pendingRoomShape) setPendingRoomShape(null);
      if (pendingAttachMode) setPendingAttachMode(false);
    }
  }, [atPlanLevel, isTop, pendingRoomShape, pendingAttachMode, setPendingRoomShape, setPendingAttachMode]);

  useEffect(() => {
    const hasRail = showPlanRail || showCatalogRail;
    if (hasRail) document.body.dataset.rightRail = '1';
    else delete document.body.dataset.rightRail;
    window.dispatchEvent(new Event('roomcraft-rail-changed'));
    return () => {
      delete document.body.dataset.rightRail;
    };
  }, [showPlanRail, showCatalogRail]);

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

  const planTools: { id: Tool; label: string; icon: typeof PencilRuler }[] = [
    { id: 'select', label: 'Walls', icon: Columns2 },
  ];

  const choosePlanTool = (id: Tool) => {
    setPendingRoomShape(null);
    setPendingAttachMode(false);
    setStudioMode('architect');
    setTool(id === 'wall' ? 'select' : id);
    setDraftStart(null);
    setView('3d');
    setCamera('top');
    if (id !== 'select') usePlannerStore.getState().selectWall(null);
  };

  const startAddRoom = () => {
    setStudioMode('architect');
    setTool('select');
    setDraftStart(null);
    setView('3d');
    setCamera('top');
    if (!planRooms.length) {
      const id = placePlanRoom(WORLD_ORIGIN, 'rectangle', 'Room 1');
      if (id) {
        window.setTimeout(() => {
          window.dispatchEvent(new Event('roomcraft-fit-plan'));
          window.dispatchEvent(new Event('roomcraft-refocus'));
        }, 40);
      }
      return;
    }
    setPendingAttachMode(!pendingAttachMode);
  };

  /** Enter the room for furnishing — do not auto-open the properties panel. */
  const editSelectedPlanRoom = () => {
    if (!selectedRoomId) return;
    enterRoom(selectedRoomId);
    setPendingRoomShape(null);
    setPendingAttachMode(false);
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
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

  const confirmClearCrown = () => {
    if (!window.confirm('Remove crown molding from this room?')) return;
    removePerimeterTrim('ceiling');
  };
  const confirmClearBaseboard = () => {
    if (!window.confirm('Remove baseboard from this room?')) return;
    removePerimeterTrim('floor');
  };
  const confirmClearFlooring = () => {
    if (!window.confirm('Clear the floor finish from this room?')) return;
    clearFloorFinish();
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
          <div className="studio-story-bar" aria-label="Floors">
            <div className="studio-floor-stack studio-floor-stack--bar" role="tablist" aria-label="Floor levels">
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
                  {f.name.replace(/\s*floor$/i, '') || f.name}
                </button>
              ))}
            </div>
            <div className="studio-story-bar-actions">
              <button
                type="button"
                className="studio-floor-add"
                aria-label="Add floor"
                title="Add floor"
                onClick={() => {
                  setStudioMode('architect');
                  addFloor();
                  window.setTimeout(() => {
                    window.dispatchEvent(new Event('roomcraft-fit-plan'));
                    window.dispatchEvent(new Event('roomcraft-refocus'));
                  }, 80);
                }}
              >
                <Plus size={16} />
                <span>Floor</span>
              </button>
              {floors.length > 1 && (
                <button
                  type="button"
                  className="studio-floor-delete"
                  aria-label="Delete current floor"
                  title="Delete current floor"
                  onClick={() => removeFloor(activeFloorId)}
                >
                  <Trash2 size={14} />
                </button>
              )}
              {floors.length > 1 && (
                <button type="button" className="studio-floor-all" onClick={() => setStoriesOpen(true)} title="View all floors">
                  All
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {atPlanLevel && isTop && !pending && (
        <button
          type="button"
          className={`studio-plan-add-room${pendingAttachMode ? ' is-active' : ''}`}
          onClick={startAddRoom}
          aria-pressed={pendingAttachMode}
          aria-label="Add room"
          title="Add room"
        >
          <Plus size={16} />
          <span>{pendingAttachMode ? 'Cancel add' : 'Add room'}</span>
        </button>
      )}

      {!inRoom && planRooms.length >= 1 && !pending && !selectedItem && tool === 'select' && !selectedRoom && !pendingAttachMode && (
        <div className="studio-selection-hint studio-hint-float">Tap a room to select · drag to move · Furnish on the right rail</div>
      )}
      {!inRoom && planRooms.length >= 1 && !pending && !selectedItem && tool === 'select' && selectedRoom && !pendingAttachMode && (
        <div className="studio-selection-hint studio-hint-float">Drag to move · Furnish to enter · tap empty space for walls</div>
      )}
      {pendingAttachMode && !selectedRoom && planRooms.length >= 1 && (
        <div className="studio-selection-hint studio-hint-float">Select a room, then pick Left / Right / Above / Below</div>
      )}
      {pendingAttachMode && selectedRoom && (
        <div className="studio-selection-hint studio-hint-float">
          Add a matching square beside “{selectedRoom.name}” — blocked sides stay grey
        </div>
      )}

      {showPlanTools && tool === 'select' && !selectedWall && !selectedRoom && !pendingAttachMode && (
        <div className="studio-selection-hint studio-hint-float">Tap a wall · enter length on the plan · add openings from wall actions</div>
      )}
      {pendingFloorFill && (
        <div className="studio-selection-hint studio-hint-float">
          Tap a room to tile the floor with {pendingFloorFill.name}
          <button type="button" className="studio-hint-action" onClick={() => cancelFloorFill()}>
            Cancel
          </button>
        </div>
      )}

      {pending && <div className="studio-selection-hint studio-hint-float">Placing {pending.name} · move then tap to confirm</div>}

      {hasSelection && !pending && !selectedItem && !inRoom && wallEditMode && selectedWall && (
        <div className="studio-selection-hint studio-hint-float">Wall selected · add a door or opening · dim card outside the room</div>
      )}

      {selectedOpening && !pending && (
        <div className="studio-selection-hint studio-hint-float">Drag the opening to slide it · Edit for swing &amp; face</div>
      )}

      {isTrimSelected && !pending && (
        <div className="studio-selection-hint studio-hint-float">
          {selectedFurniture?.trimEdge === 'ceiling' ? 'Crown molding' : 'Baseboard'} selected · Edit profile height &amp; finish
        </div>
      )}

      {(hasCrown || hasBaseboard || roomFloorColor) && inRoom && !pending && (
        <div className="studio-finish-bar" role="status" aria-label="Room finishes">
          {hasCrown && (
            <span className="studio-finish-chip">
              Crown: {crownName ?? 'on'}
            </span>
          )}
          {hasBaseboard && (
            <span className="studio-finish-chip">
              Base: {baseName ?? 'on'}
            </span>
          )}
          <span className="studio-finish-chip studio-finish-floor">
            Floor
            <span className="studio-finish-swatch" style={{ background: roomFloorColor }} aria-hidden />
          </span>
        </div>
      )}

      {wallEditMode && selectedWall && !pending && (
        <div className="studio-selection-fabs" role="toolbar" aria-label="Wall actions">
          <button
            type="button"
            onClick={() => addOpening(selectedWall, 'door')}
            aria-label="Add door"
            title="Add door"
          >
            <DoorOpen />
          </button>
          <button
            type="button"
            onClick={() => addOpening(selectedWall, 'passage')}
            aria-label="Add opening"
            title="Add room opening"
          >
            <SquareDashed />
          </button>
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

      {showOpeningFabs && (
        <div className="studio-selection-fabs" role="toolbar" aria-label="Opening actions">
          <button type="button" onClick={onOpenInspector} aria-label="Edit opening" title="Edit opening">
            <Info />
          </button>
          <button
            type="button"
            className="is-danger"
            onClick={() => deleteSelected()}
            aria-label="Delete opening"
            title="Delete opening"
          >
            <Trash2 />
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
            {isTrimSelected ? (
              <button type="button" onClick={onOpenInspector} aria-label="Edit trim">
                <Info />
              </button>
            ) : (
              <button onClick={() => rotateSelected()} aria-label="Rotate product">
                <RotateCw />
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
          {showPlanToolButtons &&
            planTools.map((t) => {
              const Icon = t.icon;
              const active = !pendingAttachMode && studioMode === 'architect' && tool === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`studio-rail-walls${active ? ' is-active' : ''}`}
                  onClick={() => choosePlanTool(t.id)}
                  aria-label={t.label}
                  title={t.label}
                >
                  <Icon />
                  <span>{t.label}</span>
                </button>
              );
            })}
          {showPlanRoomActions && (
            <>
              <button
                type="button"
                className="studio-rail-furnish"
                onClick={editSelectedPlanRoom}
                aria-label="Furnish room"
                title="Furnish room"
              >
                <Sofa />
                <span>Furnish</span>
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
          <button type="button" className="studio-rail-room-edit" onClick={onOpenInspector} aria-label="Room properties" title="Room properties">
            <SlidersHorizontal />
            <span>Room</span>
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
          {inRoom && !pending && (
            <div className="studio-dock-seg studio-dock-clear" role="group" aria-label="Clear finishes">
              <button type="button" className="studio-dock-action" disabled={!hasCrown} onClick={confirmClearCrown} title="Clear crown molding">
                <span>Crown</span>
              </button>
              <button type="button" className="studio-dock-action" disabled={!hasBaseboard} onClick={confirmClearBaseboard} title="Clear baseboard">
                <span>Base</span>
              </button>
              <button type="button" className="studio-dock-action" disabled={!hasCustomFloor} onClick={confirmClearFlooring} title="Clear flooring">
                <span>Floor</span>
              </button>
            </div>
          )}
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
