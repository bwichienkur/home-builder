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
  Menu,
  Plus,
  Redo2,
  RotateCw,
  Save,
  Share2,
  ShoppingBag,
  SlidersHorizontal,
  Sofa,
  Trash2,
  Undo2,
  Wallpaper,
  X,
} from 'lucide-react';
import { roomCategories } from '../catalog/CatalogPanel';
import { usePlannerStore } from '../../store/plannerStore';
import type { RoomType } from '../../types';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import { StoryOverview } from './StoryOverview';

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
  /** Quick-access project actions — keep Save/Share usable without opening the menu. */
  onSave?: () => void;
  onShare?: () => void;
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
  onSave,
  onShare,
}: Props) {
  const [storiesOpen, setStoriesOpen] = useState(false);
  const [fabsOpen, setFabsOpen] = useState(true);
  const camera = usePlannerStore((s) => s.cameraMode);
  const rotateViewYaw = usePlannerStore((s) => s.rotateViewYaw);
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
  const duplicateSelected = usePlannerStore((s) => s.duplicateSelected);
  const deleteSelected = usePlannerStore((s) => s.deleteSelected);
  const furniture = usePlannerStore((s) => s.furniture);
  const selectedFurniture = furniture.find((f) => f.id === selectedItem);
  const isTrimSelected = selectedFurniture?.placementKind === 'perimeter-trim';
  const categories = roomCategories[roomType];
  const isTop = camera === 'top';
  const planWallTool = usePlannerStore((s) => s.planWallTool);
  const setPlanWallTool = usePlannerStore((s) => s.setPlanWallTool);
  const showSelectionFabs = !!selectedItem && !pending;
  const showOpeningFabs = !!selectedOpening && !pending && !selectedWall;
  const showActionFabs = showSelectionFabs || !!pending || showOpeningFabs || !!pendingFloorFill;

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

  const rotateView = () => {
    rotateViewYaw(90);
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
    }, 0);
  };

  const selectedRoom = planRooms.find((r) => r.id === selectedRoomId);
  const activeFloor = floors.find((f) => f.id === activeFloorId);
  const houseLabel = housePlanName || (planRooms.length > 1 ? 'House plan' : 'Room');
  const atStart = workflowStage === 'start';
  const inRoom = workflowStage === 'room';
  const showCatalogRail = inRoom && !pending;
  /** Plan-level wall tools (house/floor plate) — not while inside a room. */
  const atPlanLevel = !atStart && !inRoom;
  const showFloorChrome = atPlanLevel && !pending;
  const pendingRoomShape = usePlannerStore((s) => s.pendingRoomShape);
  const setPendingRoomShape = usePlannerStore((s) => s.setPendingRoomShape);
  const pendingAttachMode = usePlannerStore((s) => s.pendingAttachMode);
  const setPendingAttachMode = usePlannerStore((s) => s.setPendingAttachMode);
  const placePlanRoom = usePlannerStore((s) => s.placePlanRoom);
  const deletePlanRoom = usePlannerStore((s) => s.deletePlanRoom);
  const enterRoom = usePlannerStore((s) => s.enterRoom);
  const showPlanRoomActions = atPlanLevel && !pending && !!selectedRoom;
  /** Black rail only after a room is selected — never empty tool chrome on plan load. */
  const showPlanRail = showPlanRoomActions;

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
    // Walls tool removed from the rail — keep planWallTool off.
    if (planWallTool) setPlanWallTool(false);
  }, [planWallTool, setPlanWallTool]);

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

  const startAddRoom = () => {
    setStudioMode('architect');
    setTool('select');
    setDraftStart(null);
    setView('3d');
    setCamera('top');
    setPlanWallTool(false);
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

  /** Plan-level room properties panel (name, type, dims, units) — same sheet as furnish Room. */
  const openSelectedPlanRoomEditor = () => {
    if (!selectedRoomId) return;
    setPlanWallTool(false);
    usePlannerStore.getState().selectWall(null);
    onOpenInspector();
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

          {(onSave || onShare) && (
            <div className="studio-topbar-actions" role="group" aria-label="Project actions">
              {onSave && (
                <button type="button" className="studio-fab studio-save" onClick={onSave} aria-label="Save build" title="Save">
                  <Save />
                </button>
              )}
              {onShare && (
                <button type="button" className="studio-fab studio-share" onClick={onShare} aria-label="Share build" title="Share">
                  <Share2 />
                </button>
              )}
            </div>
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
                <Plus size={14} />
              </button>
            </div>
            {floors.length > 1 && (
              <div className="studio-story-bar-actions">
                <button
                  type="button"
                  className="studio-floor-delete"
                  aria-label="Delete current floor"
                  title="Delete current floor"
                  onClick={() => removeFloor(activeFloorId)}
                >
                  <Trash2 size={14} />
                </button>
                <button type="button" className="studio-floor-all" onClick={() => setStoriesOpen(true)} title="View all floors">
                  All
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {pendingFloorFill && !pending && (
        <div className="studio-selection-fabs" role="toolbar" aria-label="Floor fill">
          <button type="button" className="is-danger" onClick={() => cancelFloorFill()} aria-label="Cancel floor fill" title="Cancel">
            <X />
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
            <button type="button" onClick={onOpenInspector} aria-label="Item info" title="Item info">
              <Info />
            </button>
            {!isTrimSelected && (
              <button onClick={() => rotateSelected()} aria-label="Rotate product">
                <RotateCw />
              </button>
            )}
            {!isTrimSelected && (
              <button type="button" onClick={() => duplicateSelected()} aria-label="Clone product" title="Clone">
                <Copy />
              </button>
            )}
            <button className="is-danger" onClick={() => deleteSelected()} aria-label="Delete product">
              <Trash2 />
            </button>
          </div>
        </div>
      )}

      {showPlanRail && (
        <div className="studio-category-rail studio-plan-rail" aria-label="Plan tools">
          <button
            type="button"
            className="studio-rail-room-edit"
            onClick={openSelectedPlanRoomEditor}
            aria-label="Edit room"
            title="Edit room"
          >
            <SlidersHorizontal />
            <span>Edit</span>
          </button>
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
        </div>
      )}

      {showCatalogRail && (
        <div className={`studio-category-rail${catalogOpen ? ' is-active' : ''}`} aria-label={`${roomType} product categories`}>
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

      <div className={`studio-dock${inRoom ? ' is-room' : ''}`} role="toolbar" aria-label="Studio controls">
        <div className="studio-dock-shell studio-dock-flat">
          <div className="studio-dock-row">
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
            {atPlanLevel && isTop && !pending && (
              <button
                type="button"
                className={`studio-dock-action${pendingAttachMode ? ' is-active' : ''}`}
                onClick={startAddRoom}
                aria-pressed={pendingAttachMode}
                title="Add room"
              >
                <Plus size={15} />
                <span>{pendingAttachMode ? 'Cancel' : 'Add'}</span>
              </button>
            )}
            <button type="button" className="studio-dock-action" onClick={refocus} title="Fit in view">
              <Focus size={15} />
              <span>Fit</span>
            </button>
            <button type="button" className="studio-dock-action" onClick={rotateView} title="Rotate view 90°">
              <RotateCw size={15} />
              <span>Rotate</span>
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
      </div>

      <a className="studio-admin-link" href="/admin" hidden>
        <FileSpreadsheet />
        Advanced inventory
      </a>

      <StoryOverview open={storiesOpen} onClose={() => setStoriesOpen(false)} />
    </div>
  );
}
