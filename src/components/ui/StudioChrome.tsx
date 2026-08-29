import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bath,
  BedDouble,
  Box,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  DoorOpen,
  FileSpreadsheet,
  FolderKanban,
  Focus,
  Grid2X2,
  Home,
  Info,
  Lamp,
  PanelTop,
  Pentagon,
  Plus,
  Redo2,
  RotateCw,
  Save,
  Scan,
  Share2,
  ShoppingBag,
  SlidersHorizontal,
  Sofa,
  Square,
  StickyNote,
  Trash2,
  Undo2,
  Wallpaper,
  X,
} from 'lucide-react';
import { roomCategories } from '../catalog/CatalogPanel';
import { usePlannerStore } from '../../store/plannerStore';
import { useConfiguratorStore } from '../../store/configuratorStore';
import type { RoomType } from '../../types';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';
import { computeHouseTakeoff } from '../../lib/houseEstimate';
import { pickTradeRates, useTradeRatesStore } from '../../store/tradeRatesStore';
import { formatArea, formatLength } from '../../lib/measurements';
import { LayersMenu } from './LayersMenu';
import { StoryOverview } from './StoryOverview';
import { BuildingChecksBar } from './BuildingChecksBar';
import { RoomDimTray } from './RoomDimTray';
import { nextElevationFace } from '../../lib/geometry/elevationFace';
import { addRoomPlanAction, planToolHint } from '../../lib/planToolHint';

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
  onCloseInspector?: () => void;
  /** Quick-access project actions — keep Save/Share usable without opening the menu. */
  onSave?: () => void;
  onShare?: () => void;
  onOpenElevations?: () => void;
};

export function StudioChrome({
  roomType,
  itemCount,
  total,
  catalogOpen,
  menuOpen,
  openCatalog,
  openMenu,
  closeMenu,
  openBom,
  openCategory,
  onOpenInspector,
  onCloseInspector,
  onSave,
  onShare,
  onOpenElevations,
}: Props) {
  const [storiesOpen, setStoriesOpen] = useState(false);
  const [fabsOpen, setFabsOpen] = useState(true);
  const [takeoffOpen, setTakeoffOpen] = useState(false);
  const camera = usePlannerStore((s) => s.cameraMode);
  const rotateViewYaw = usePlannerStore((s) => s.rotateViewYaw);
  const elevationFace = usePlannerStore((s) => s.elevationFace);
  const setElevationFace = usePlannerStore((s) => s.setElevationFace);
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
  const pendingCorner = usePlannerStore((s) => s.pendingCorner);
  const selectedVertexIndex = usePlannerStore((s) => s.selectedVertexIndex);
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
  const commitPendingCorner = usePlannerStore((s) => s.commitPendingCorner);
  const cancelPendingCorner = usePlannerStore((s) => s.cancelPendingCorner);
  const rotatePending = usePlannerStore((s) => s.rotatePendingPlacement);
  const rotateSelected = usePlannerStore((s) => s.rotateSelected);
  const duplicateSelected = usePlannerStore((s) => s.duplicateSelected);
  const deleteSelected = usePlannerStore((s) => s.deleteSelected);
  const furniture = usePlannerStore((s) => s.furniture);
  const walls = usePlannerStore((s) => s.walls);
  const openings = usePlannerStore((s) => s.openings);
  const unitSystem = usePlannerStore((s) => s.unitSystem);
  const selectedFurniture = furniture.find((f) => f.id === selectedItem);
  const isTrimSelected = selectedFurniture?.placementKind === 'perimeter-trim';

  const takeoff = useMemo(() => {
    const rates = pickTradeRates(useTradeRatesStore.getState());
    return computeHouseTakeoff({
      floors,
      activeFloorId,
      live: { walls, openings, furniture, planRooms },
      wasteFactor: rates.wasteFactor,
    });
  }, [floors, activeFloorId, walls, openings, furniture, planRooms]);
  const addAnnotation = usePlannerStore((s) => s.addAnnotation);
  const roomFloorCenterHint = useMemo(() => {
    if (!walls.length) return { x: 0, z: 0 };
    const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
    const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
    return {
      x: ((Math.min(...xs) + Math.max(...xs)) / 2 - WORLD_ORIGIN.x) / PIXELS_PER_METER,
      z: ((Math.min(...ys) + Math.max(...ys)) / 2 - WORLD_ORIGIN.y) / PIXELS_PER_METER,
    };
  }, [walls]);
  const categories = roomCategories[roomType];
  const isTop = camera === 'top';
  const isElevation = camera === 'elevation';
  const planWallTool = usePlannerStore((s) => s.planWallTool);
  const setPlanWallTool = usePlannerStore((s) => s.setPlanWallTool);
  const showSelectionFabs = !!selectedItem && !pending;
  const showOpeningFabs = !!selectedOpening && !pending && !selectedWall;
  const showActionFabs = showSelectionFabs || !!pending || !!pendingCorner || showOpeningFabs || !!pendingFloorFill;

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

  const chooseElevation = () => {
    setView('3d');
    setCamera('elevation');
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
    }, 0);
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
    if (isElevation) {
      setElevationFace(nextElevationFace(elevationFace, 1));
      window.setTimeout(() => {
        window.dispatchEvent(new Event('roomcraft-fit-plan'));
        window.dispatchEvent(new Event('roomcraft-refocus'));
      }, 0);
      return;
    }
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
  const contextTitle =
    inRoom && selectedRoom
      ? selectedRoom.name
      : selectedRoom
        ? selectedRoom.name
        : activeFloor
          ? activeFloor.name.replace(/\s*floor$/i, '') || activeFloor.name
          : houseLabel;
  const showCatalogRail = inRoom && !pending;
  /** Plan-level wall tools (house/floor plate) — not while inside a room. */
  const atPlanLevel = !atStart && !inRoom;
  /** Floor tabs stay available in-room so multi-story GCs can jump floors without hunting the exit. */
  const showFloorChrome = (atPlanLevel || inRoom) && !pending;
  const configuratorRole = useConfiguratorStore((s) => s.role);
  const shareToken = useConfiguratorStore((s) => s.shareToken);
  const clientStructuralLock = configuratorRole === 'client' || !!shareToken;
  const showFloorManage = atPlanLevel && !clientStructuralLock;
  const pendingRoomShape = usePlannerStore((s) => s.pendingRoomShape);
  const setPendingRoomShape = usePlannerStore((s) => s.setPendingRoomShape);
  const pendingAttachMode = usePlannerStore((s) => s.pendingAttachMode);
  const setPendingAttachMode = usePlannerStore((s) => s.setPendingAttachMode);
  const placePlanRoom = usePlannerStore((s) => s.placePlanRoom);
  const deletePlanRoom = usePlannerStore((s) => s.deletePlanRoom);
  const enterRoom = usePlannerStore((s) => s.enterRoom);
  const selectRoom = usePlannerStore((s) => s.selectRoom);
  const showPlanRoomActions = atPlanLevel && !pending && !!selectedRoom && !clientStructuralLock;
  /** Black rail only after a room is selected — never empty tool chrome on plan load. */
  const showPlanRail = showPlanRoomActions;

  useEffect(() => {
    if (inRoom) setStudioMode('furnish');
  }, [inRoom, setStudioMode]);

  useEffect(() => {
    if (clientStructuralLock) setStudioMode('furnish');
  }, [clientStructuralLock, setStudioMode]);

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
    onCloseInspector?.();
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
    const next = addRoomPlanAction({
      selectedRoomId,
      onlyRoomId: planRooms.length === 1 ? planRooms[0]!.id : null,
      pendingAttachMode,
    });
    if (next.selectId && next.selectId !== selectedRoomId) selectRoom(next.selectId);
    setPendingAttachMode(next.attach);
    if (next.prompt) {
      usePlannerStore.setState({ openingNotice: 'Tap a room to add onto, then pick a side.' });
    }
  };

  const planHint = planToolHint({
    tool,
    pendingAttachMode,
    selectedRoomId,
    planWallTool,
    pendingCorner: !!pendingCorner,
    selectedVertexIndex,
  });

  /** Enter the room for furnishing — do not auto-open the properties panel. */
  const editSelectedPlanRoom = () => {
    if (!selectedRoomId) return;
    onCloseInspector?.();
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
            <button
              type="button"
              className="studio-fab studio-project"
              onClick={menuOpen ? closeMenu : openMenu}
              aria-label={menuOpen ? 'Close project menu' : 'Open project menu'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X /> : <FolderKanban />}
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
          <button
            type="button"
            className="studio-fab studio-project"
            onClick={menuOpen ? closeMenu : openMenu}
            aria-label={menuOpen ? 'Close project menu' : 'Open project menu'}
            aria-expanded={menuOpen}
            title="Project"
          >
            {menuOpen ? <X /> : <FolderKanban />}
          </button>

          <div className="studio-context">
            <p className="studio-context-title" title={contextTitle}>
              {contextTitle}
            </p>
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
          </div>

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

          <BuildingChecksBar />

          <button
            className="studio-bag"
            onClick={openBom}
            aria-label={`${itemCount} FF&E items, sell total $${total.toFixed(2)} — open list and estimate`}
            title="FF&E list & builder estimate"
          >
            <span>
              <ShoppingBag size={18} />
              {itemCount}
            </span>
            <strong>
              $
              {total >= 1000
                ? `${(total / 1000).toFixed(total >= 10000 ? 0 : 1)}k`
                : total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </strong>
            <ArrowRight />
          </button>
        </div>

        {(!atStart && (walls.length > 0 || showFloorChrome)) && (
          <div className="studio-subbar">
            {!atStart && walls.length > 0 && (
              <div className={`studio-takeoff-strip${takeoffOpen ? ' is-open' : ''}`} aria-label="Construction takeoff">
                <button
                  type="button"
                  className="studio-takeoff-toggle"
                  aria-expanded={takeoffOpen}
                  onClick={() => setTakeoffOpen((v) => !v)}
                  title="Construction takeoff"
                >
                  {formatArea(takeoff.floorAreaM2, unitSystem)}
                  <span aria-hidden>·</span>
                  {takeoff.doorCount}d/{takeoff.windowCount}w
                  <ChevronDown size={14} />
                </button>
                <div className="studio-takeoff-details">
                  <div className="studio-takeoff-row">
                    <span>Area</span>
                    <strong>{formatArea(takeoff.floorAreaM2, unitSystem)}</strong>
                  </div>
                  <div className="studio-takeoff-row">
                    <span>Walls</span>
                    <strong>{formatLength(takeoff.wallLengthM, unitSystem)}</strong>
                  </div>
                  {takeoff.exteriorWallLengthM > 0 && (
                    <div className="studio-takeoff-row">
                      <span>Exterior</span>
                      <strong>{formatLength(takeoff.exteriorWallLengthM, unitSystem)}</strong>
                    </div>
                  )}
                  <div className="studio-takeoff-row">
                    <span>Drywall</span>
                    <strong>{formatArea(takeoff.drywallAreaM2, unitSystem)}</strong>
                  </div>
                  <div className="studio-takeoff-row">
                    <span>Studs</span>
                    <strong>{takeoff.studCount}</strong>
                  </div>
                  <div className="studio-takeoff-row">
                    <span>Openings</span>
                    <strong>
                      {takeoff.doorCount} dr · {takeoff.windowCount} win
                      {takeoff.passageCount ? ` · ${takeoff.passageCount} open` : ''}
                    </strong>
                  </div>
                  {takeoff.stairCount > 0 && (
                    <div className="studio-takeoff-row">
                      <span>Stairs</span>
                      <strong>{takeoff.stairCount}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

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
                      {f.name.replace(/\s*(floor|story)$/i, '') || f.name}
                    </button>
                  ))}
                  {showFloorManage && (
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
                  )}
                  {showFloorManage && floors.length > 1 && (
                    <button
                      type="button"
                      className="studio-floor-add studio-floor-remove"
                      aria-label="Delete floor"
                      title="Delete this floor"
                      onClick={() => {
                        const floor = floors.find((f) => f.id === activeFloorId);
                        if (!floor) return;
                        if (!window.confirm(`Delete “${floor.name}”? This cannot be undone.`)) return;
                        if (!deleteFloor(floor.id)) return;
                        window.setTimeout(() => {
                          window.dispatchEvent(new Event('roomcraft-fit-plan'));
                          window.dispatchEvent(new Event('roomcraft-refocus'));
                        }, 80);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                {showFloorManage && floors.length > 1 && (
                  <button type="button" className="studio-floor-all" onClick={() => setStoriesOpen(true)} title="View all floors">
                    All
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {planHint && (
        <div className="studio-plan-hint" role="status">
          {planHint}
        </div>
      )}

      {pendingFloorFill && !pending && !pendingCorner && (
        <div className="studio-selection-fabs" role="toolbar" aria-label="Floor fill">
          <button type="button" className="is-danger" onClick={() => cancelFloorFill()} aria-label="Cancel floor fill" title="Cancel">
            <X />
          </button>
        </div>
      )}

      {pendingCorner && !pending && (
        <div className="studio-selection-fabs" role="toolbar" aria-label="Place corner">
          <button className="is-primary" onClick={() => commitPendingCorner()} aria-label="Confirm corner">
            <Check />
          </button>
          <button className="is-danger" onClick={() => cancelPendingCorner()} aria-label="Cancel corner">
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
            className={planWallTool ? 'is-active' : ''}
            onClick={() => setPlanWallTool(!planWallTool)}
            aria-label="Tap a wall to edit its length"
            title="Tap a wall to edit its length"
            aria-pressed={planWallTool}
          >
            <Square />
            <span>Walls</span>
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
          <RoomDimTray />
          <div className="studio-dock-row studio-dock-row--views">
            <div className="studio-dock-seg" role="group" aria-label="View mode">
              <button type="button" className={isTop ? 'is-active' : ''} onClick={chooseTop} title="Plan view — orthographic">
                <Grid2X2 size={16} />
                <span>Plan</span>
              </button>
              <button
                type="button"
                className={isElevation ? 'is-active' : ''}
                onClick={chooseElevation}
                title="Front elevation — wall heights and openings"
              >
                <Scan size={16} />
                <span>Front</span>
              </button>
              <button type="button" className={!isTop && !isElevation && camera === 'orbit' ? 'is-active' : ''} onClick={() => choose3d('orbit')} title="3D view">
                <Box size={16} />
                <span>3D</span>
              </button>
            </div>
            <span className="studio-dock-rule" aria-hidden="true" />
            <button type="button" className="studio-dock-action studio-dock-priority" onClick={refocus} title="Fit in view">
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
          <div className="studio-dock-row studio-dock-row--tools">
            {atPlanLevel && !pending && (
              <>
                <button
                  type="button"
                  className={`studio-dock-action studio-dock-priority${tool === 'door' ? ' is-active' : ''}`}
                  title="Place door — switches to plan, then tap a wall"
                  aria-pressed={tool === 'door'}
                  onClick={() => {
                    onCloseInspector?.();
                    setPendingAttachMode(false);
                    setTool(tool === 'door' ? 'select' : 'door');
                    setCamera('top');
                  }}
                >
                  <DoorOpen size={15} />
                  <span>Door</span>
                </button>
                <button
                  type="button"
                  className={`studio-dock-action studio-dock-priority${tool === 'window' ? ' is-active' : ''}`}
                  title="Place window — switches to plan, then tap a wall"
                  aria-pressed={tool === 'window'}
                  onClick={() => {
                    onCloseInspector?.();
                    setPendingAttachMode(false);
                    setTool(tool === 'window' ? 'select' : 'window');
                    setCamera('top');
                  }}
                >
                  <PanelTop size={15} />
                  <span>Win</span>
                </button>
                <button
                  type="button"
                  className={`studio-dock-action studio-dock-priority${tool === 'corner' ? ' is-active' : ''}`}
                  title="Add a corner — drag along a wall, then Confirm"
                  aria-pressed={tool === 'corner'}
                  onClick={() => {
                    onCloseInspector?.();
                    setPendingAttachMode(false);
                    setPlanWallTool(false);
                    setCamera('top');
                    if (tool === 'corner') {
                      cancelPendingCorner();
                      setTool('select');
                      return;
                    }
                    if (!selectedRoomId && planRooms.length === 1) selectRoom(planRooms[0]!.id);
                    if (!selectedRoomId && planRooms.length !== 1) {
                      setTool('corner');
                      usePlannerStore.setState({ openingNotice: 'Tap a room, then drag along a wall to add a corner.' });
                      return;
                    }
                    setTool('corner');
                  }}
                >
                  <Pentagon size={15} />
                  <span>Corner</span>
                </button>
                <button
                  type="button"
                  className={`studio-dock-action studio-dock-priority${pendingAttachMode ? ' is-active' : ''}`}
                  onClick={startAddRoom}
                  aria-pressed={pendingAttachMode}
                  title="Add room"
                >
                  <Plus size={15} />
                  <span>{pendingAttachMode ? 'Cancel' : 'Add'}</span>
                </button>
              </>
            )}
            {onOpenElevations && !atStart && (
              <button type="button" className="studio-dock-action studio-dock-secondary" onClick={onOpenElevations} title="Elevation preview" disabled={walls.length === 0}>
                <FileSpreadsheet size={15} />
                <span>Elev</span>
              </button>
            )}
            {atPlanLevel && !pending && (
              <button
                type="button"
                className="studio-dock-action studio-dock-secondary"
                title="Add plan note"
                onClick={() => {
                  setCamera('top');
                  addAnnotation('note', roomFloorCenterHint.x, roomFloorCenterHint.z, 'Note');
                  window.dispatchEvent(new Event('roomcraft-open-properties'));
                }}
              >
                <StickyNote size={15} />
                <span>Note</span>
              </button>
            )}
            {!atStart && <LayersMenu />}
            <button type="button" className="studio-dock-action" onClick={rotateView} title={isElevation ? 'Next wall' : 'Rotate view 90°'}>
              <RotateCw size={15} />
              <span>Rotate</span>
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
