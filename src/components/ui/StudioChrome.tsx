import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bath,
  BedDouble,
  FileSpreadsheet,
  Grid2X2,
  Home,
  Lamp,
  Layers3,
  Menu,
  Move3D,
  PencilRuler,
  Redo2,
  Scaling,
  ShoppingBag,
  Undo2,
  X,
} from 'lucide-react';
import { roomCategories } from '../catalog/CatalogPanel';
import { usePlannerStore } from '../../store/plannerStore';
import type { RoomType } from '../../types';

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
  const categories = roomCategories[roomType];
  const isRoomEdit = view === '2d';
  const isTop = !isRoomEdit && camera === 'top';

  useEffect(() => {
    if (catalogOpen || menuOpen) setViewMenu(false);
  }, [catalogOpen, menuOpen]);

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

      {hasSelection && !isRoomEdit && (
        <div className="studio-selection-hint">
          {selectedItem ? 'Drag to move · use Edit for exact controls' : selectedOpening ? 'Opening selected · adjust in Edit' : 'Wall selected · use Edit for measurements'}
        </div>
      )}

      {isTop && (
        <button className="studio-view-chip" onClick={() => choose3d('orbit')}>
          Change to 3D view
        </button>
      )}

      {isRoomEdit && (
        <button className="studio-view-chip" onClick={() => choose3d('orbit')}>
          Done editing room
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
          <button className={camera === 'walk' && !isRoomEdit ? 'active' : ''} onClick={() => choose3d('walk')}>
            <Move3D />
            Eye level
          </button>
          <button className={isRoomEdit ? 'active' : ''} onClick={chooseEditRoom}>
            <Scaling />
            Edit room layout
          </button>
        </div>
      )}

      <div className="studio-bottom-left">
        <button onClick={() => setViewMenu((open) => !open)} aria-expanded={viewMenu} aria-label="Choose room view">
          {isTop || isRoomEdit ? <Grid2X2 /> : <Layers3 />}
        </button>
        <button onClick={refocus} aria-label="Refocus room" disabled={isRoomEdit}>
          <Move3D />
        </button>
        <button onClick={onOpenInspector} aria-label="Edit selected wall or product" disabled={!hasSelection}>
          <PencilRuler />
        </button>
        <button className={isRoomEdit ? 'active' : ''} onClick={isRoomEdit ? () => choose3d('orbit') : chooseEditRoom} aria-label={isRoomEdit ? 'Exit room layout editor' : 'Edit room layout'}>
          <Scaling />
        </button>
      </div>

      <div className="studio-history">
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
