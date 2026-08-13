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
  PencilRuler,
  Redo2,
  RotateCw,
  Scaling,
  ShoppingBag,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { roomCategories } from '../catalog/CatalogPanel';
import { usePlannerStore } from '../../store/plannerStore';
import type { RoomType } from '../../types';

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
  const view = usePlannerStore((s) => s.view);
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
  const commitPending = usePlannerStore((s) => s.commitPendingPlacement);
  const cancelPending = usePlannerStore((s) => s.cancelPendingPlacement);
  const rotatePending = usePlannerStore((s) => s.rotatePendingPlacement);
  const rotateSelected = usePlannerStore((s) => s.rotateSelected);
  const duplicateSelected = usePlannerStore((s) => s.duplicateSelected);
  const deleteSelected = usePlannerStore((s) => s.deleteSelected);
  const categories = roomCategories[roomType];
  const isRoomEdit = view === '2d';
  const isTop = !isRoomEdit && camera === 'top';
  const isWalk = !isRoomEdit && camera === 'walk';
  const showSelectionFabs = !!selectedItem && !pending && !isRoomEdit;
  const coarsePointer = useCoarsePointer();
  const [gestureHint, setGestureHint] = useState(false);

  useEffect(() => {
    if (catalogOpen || menuOpen) setViewMenu(false);
  }, [catalogOpen, menuOpen]);

  useEffect(() => {
    if (!coarsePointer || isRoomEdit || pending) return;
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
  }, [coarsePointer, isRoomEdit, pending]);

  const walkLabel = useMemo(() => (coarsePointer ? 'Eye level (preview)' : 'Eye level'), [coarsePointer]);

  /** IKEA-style top: stay in WebGL with a bird’s-eye camera centered on the floor. */
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

  /** Konva plan editor only when changing walls / openings layout. */
  const chooseEditRoom = () => {
    setView('2d');
    setCamera('top');
    setViewMenu(false);
  };

  const refocus = () => {
    window.dispatchEvent(new Event('roomcraft-refocus'));
    setViewMenu(false);
  };

  const hasSelection = !!(selectedItem || selectedWall || selectedOpening);

  return (
    <div className="studio-chrome">
      <button className="studio-fab studio-menu" onClick={menuOpen ? closeMenu : openMenu} aria-label={menuOpen ? 'Close menu' : 'Open project menu'} aria-expanded={menuOpen}>
        {menuOpen ? <X /> : <Menu />}
      </button>

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

      {pending && !isRoomEdit && (
        <div className="studio-selection-hint">Placing {pending.name} · move then click to confirm</div>
      )}

      {hasSelection && !pending && !isRoomEdit && !selectedItem && (
        <div className="studio-selection-hint">
          {selectedOpening ? 'Opening selected · adjust in Edit' : 'Wall selected · use Edit for measurements'}
        </div>
      )}

      {pending && !isRoomEdit && (
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
            <button
              onClick={() => window.dispatchEvent(new Event('roomcraft-open-product-card'))}
              aria-label="Product details"
            >
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

      {gestureHint && !pending && !isRoomEdit && (
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

      {isRoomEdit && (
        <button className="studio-view-chip studio-view-chip-warn" onClick={() => choose3d('orbit')}>
          Done editing room layout
        </button>
      )}

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

      {viewMenu && (
        <div className="studio-view-menu" role="menu">
          <button onClick={refocus}>
            <Move3D />
            Refocus the room
          </button>
          <button className={isTop ? 'active' : ''} onClick={chooseTop}>
            <Grid2X2 />
            Top view
          </button>
          <button className={view === '3d' && camera === 'orbit' ? 'active' : ''} onClick={() => choose3d('orbit')}>
            <Layers3 />
            3D view
          </button>
          {!coarsePointer && (
            <button className={isWalk ? 'active' : ''} onClick={() => choose3d('walk')}>
              <Move3D />
              {walkLabel}
            </button>
          )}
          <button className={isRoomEdit ? 'active' : ''} onClick={chooseEditRoom}>
            <Scaling />
            Edit room layout
          </button>
        </div>
      )}

      <div className="studio-bottom-left">
        <button onClick={() => setViewMenu((open) => !open)} aria-expanded={viewMenu} aria-label="Choose room view">
          {isTop || isRoomEdit ? <Grid2X2 /> : isWalk ? <Move3D /> : <Layers3 />}
        </button>
        <button onClick={refocus} aria-label="Refocus room" disabled={isRoomEdit}>
          <Move3D />
        </button>
        <button onClick={onOpenInspector} aria-label="Edit selected wall or product" disabled={!hasSelection || !!pending}>
          <PencilRuler />
        </button>
        <button className={isRoomEdit ? 'active' : ''} onClick={isRoomEdit ? () => choose3d('orbit') : chooseEditRoom} aria-label={isRoomEdit ? 'Exit room layout editor' : 'Edit room layout'}>
          <Scaling />
        </button>
      </div>

      <div className={`studio-history${coarsePointer ? ' studio-history-mobile' : ''}`}>
        <button onClick={undo} disabled={historyIndex === 0} aria-label="Undo">
          <Undo2 />
        </button>
        <button onClick={redo} disabled={historyIndex === historyLength - 1} aria-label="Redo">
          <Redo2 />
        </button>
      </div>

      <a className="studio-admin-link" href="/admin" hidden>
        <FileSpreadsheet />
        Advanced inventory
      </a>
    </div>
  );
}
