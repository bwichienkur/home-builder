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
  const [sideOpen, setSideOpen] = useState(true);
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
  const showSelectionFabs = !!selectedItem && !pending;
  const showActionFabs = showSelectionFabs || !!pending;
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
  const showPlanTools = !atStart && isTop && !pending && studioMode === 'architect';
  const showSideRail = !atStart && !pending && (floors.length > 1 || studioMode === 'architect' || inRoom || showPlanTools);

  useEffect(() => {
    if (coarsePointer) setSideOpen(false);
  }, [coarsePointer]);

  useEffect(() => {
    if (inRoom) setStudioMode('furnish');
  }, [inRoom, setStudioMode]);

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
    { id: 'select', label: 'Select', icon: MousePointer2 },
    { id: 'wall', label: 'Wall', icon: Wallpaper },
    { id: 'room', label: 'Square', icon: Square },
  ];

  const choosePlanTool = (id: Tool) => {
    setStudioMode('architect');
    setTool(id);
    setDraftStart(null);
    if (id !== 'select') {
      setView('3d');
      setCamera('top');
    }
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
    <div className={`studio-chrome${showActionFabs ? ' has-action-fabs' : ''}${inRoom ? ' is-room-focus' : ''}${sideOpen ? ' is-side-open' : ''}`}>
      <div className="studio-topbar">
        <div className="studio-topbar-row">
          <button className="studio-fab studio-menu" onClick={menuOpen ? closeMenu : openMenu} aria-label={menuOpen ? 'Close menu' : 'Open project menu'} aria-expanded={menuOpen}>
            {menuOpen ? <X /> : <Menu />}
          </button>

          {showSideRail && (
            <button
              type="button"
              className={`studio-side-toggle${sideOpen ? ' is-open' : ''}`}
              aria-expanded={sideOpen}
              aria-controls="studio-side-rail"
              aria-label={sideOpen ? 'Hide tools' : 'Show tools'}
              onClick={() => setSideOpen((open) => !open)}
            >
              {sideOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}

          <nav className="studio-breadcrumb" aria-label="Design location">
            <button type="button" onClick={showStart} title="Start over">
              Start
            </button>
            <span aria-hidden="true">/</span>
            <button
              type="button"
              className={!inRoom && !selectedRoom ? 'is-current' : ''}
              title={houseLabel}
              onClick={() => {
                if (inRoom) goBackToHouse();
              }}
            >
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
      </div>

      {showSideRail && (
        <aside id="studio-side-rail" className={`studio-side-rail${sideOpen ? ' is-open' : ' is-collapsed'}`} aria-label="Studio tools">
          <div className="studio-side-rail-inner">
            {inRoom && selectedRoom && (
              <button type="button" className="studio-side-back" onClick={goBackToHouse} aria-label={`Back to ${houseLabel}`} title={`Back to ${houseLabel}`}>
                <ArrowLeft size={16} />
                <Home size={15} />
                <span>House</span>
              </button>
            )}

            {(floors.length > 1 || studioMode === 'architect') && (
              <div className="studio-floor-stack" role="tablist" aria-label="Stories">
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
            )}

            {isTop && (
              <div className="studio-plan-stack" role="toolbar" aria-label="Plan tools">
                {planTools.map((t) => {
                  const Icon = t.icon;
                  const active = studioMode === 'architect' && tool === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={active ? 'active' : ''}
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

            {showPlanTools && tool === 'wall' && (
              <p className="studio-side-hint">
                {draftStart ? 'Tap wall end' : 'Tap to draw walls'}
                {draftStart && (
                  <button type="button" className="studio-hint-action" onClick={() => setDraftStart(null)}>
                    Cancel
                  </button>
                )}
              </p>
            )}
            {showPlanTools && tool === 'room' && <p className="studio-side-hint">Tap to place 12×12 ft</p>}
          </div>
        </aside>
      )}

      {!inRoom && planRooms.length > 1 && !pending && !selectedItem && tool === 'select' && (
        <div className="studio-selection-hint studio-hint-float">Tap a room to open its top view</div>
      )}

      {pending && <div className="studio-selection-hint studio-hint-float">Placing {pending.name} · move then tap to confirm</div>}

      {hasSelection && !pending && !selectedItem && !inRoom && (
        <div className="studio-selection-hint studio-hint-float">
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
          {isTop ? 'Drag to pan · Pinch to zoom' : 'Drag to orbit · Pinch to zoom · Two-finger pan'}
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
          <button type="button" className="studio-dock-action" onClick={onOpenInspector} disabled={!hasSelection || !!pending} title="Edit selected">
            <PencilRuler size={15} />
            <span>Edit</span>
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
