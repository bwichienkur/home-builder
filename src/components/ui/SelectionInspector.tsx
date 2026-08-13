import { useMemo } from 'react';
import { FileSpreadsheet, Grid2X2, X } from 'lucide-react';
import { usePlannerStore } from '../../store/plannerStore';
import { wallLengthMeters } from '../../lib/geometry/snapping';
import type { FurnitureItem, Opening, RoomType, Wall } from '../../types';

const finishes: [string, string][] = [
  ['Oak', '#c9b18f'],
  ['Walnut', '#7d5c43'],
  ['Stone', '#a8aaa4'],
  ['Ivory', '#e9e2d2'],
  ['Sage', '#9aa697'],
  ['Charcoal', '#454b48'],
];

const roomTypes: RoomType[] = [
  'Bedroom',
  'Living room',
  'Bathroom',
  'Kitchen',
  'Dining room',
  'Office',
  'Children’s room',
  'Laundry',
  'Hallway',
  'Storage / wardrobe',
  'Outdoor',
];

export function SelectionInspector({ open, onClose }: { open: boolean; onClose: () => void }) {
  const walls = usePlannerStore((s) => s.walls);
  const openings = usePlannerStore((s) => s.openings);
  const furniture = usePlannerStore((s) => s.furniture);
  const selectedWallId = usePlannerStore((s) => s.selectedWallId);
  const selectedOpeningId = usePlannerStore((s) => s.selectedOpeningId);
  const selectedFurnitureId = usePlannerStore((s) => s.selectedFurnitureId);
  const selectedWall = walls.find((w) => w.id === selectedWallId);
  const selectedOpening = openings.find((o) => o.id === selectedOpeningId);
  const selectedFurniture = furniture.find((f) => f.id === selectedFurnitureId);

  if (!open) return null;

  return (
    <aside className="selection-inspector" aria-label="Selection properties">
      <header>
        <strong>
          {selectedOpening ? 'Opening' : selectedWall ? 'Wall' : selectedFurniture ? selectedFurniture.name : 'Room'}
        </strong>
        <button onClick={onClose} aria-label="Close inspector">
          <X size={18} />
        </button>
      </header>
      <div className="selection-inspector-body">
        {selectedOpening ? (
          <OpeningProperties opening={selectedOpening} />
        ) : selectedWall ? (
          <WallProperties wall={selectedWall} />
        ) : selectedFurniture ? (
          <FurnitureProperties item={selectedFurniture} />
        ) : (
          <RoomPanel />
        )}
      </div>
    </aside>
  );
}

function RoomPanel() {
  return (
    <>
      <RoomDesigner />
      <a className="inventory-open-button" href="/admin">
        <FileSpreadsheet />
        Advanced · import inventory
      </a>
      <div className="empty-state compact">
        <div className="select-icon">
          <Grid2X2 size={22} />
        </div>
        <h3>Room finishes</h3>
        <p>Select a wall or product for precise controls.</p>
      </div>
      <FinishSwatches />
    </>
  );
}

function FinishSwatches() {
  const set = usePlannerStore((s) => s.setFinish);
  return (
    <>
      <label>
        Floor material
        <div className="swatches">
          {finishes.map(([n, c]) => (
            <button title={n} key={c} style={{ background: c }} onClick={() => set('floor', c)} />
          ))}
        </div>
      </label>
      <label>
        Wall color
        <div className="swatches">
          {finishes.slice(3).map(([n, c]) => (
            <button title={n} key={c} style={{ background: c }} onClick={() => set('wall', c)} />
          ))}
        </div>
      </label>
    </>
  );
}

export function RoomDesigner({ compact = false }: { compact?: boolean }) {
  const roomType = usePlannerStore((s) => s.roomType);
  const setRoomType = usePlannerStore((s) => s.setRoomType);
  const unit = usePlannerStore((s) => s.unitSystem);
  const setUnit = usePlannerStore((s) => s.setUnitSystem);
  const apply = usePlannerStore((s) => s.applyRoomTemplate);
  const setCeiling = usePlannerStore((s) => s.setCeilingHeight);
  const walls = usePlannerStore((s) => s.walls);
  const furniture = usePlannerStore((s) => s.furniture);
  const ceiling = walls[0]?.height ?? 2.7;

  const template = (shape: 'rectangle' | 'wide' | 'l-shape') => {
    if ((walls.length || furniture.length) && !window.confirm('Replace the current room layout? Products in this room will be removed.')) return;
    apply(shape);
  };

  return (
    <div className={`room-designer${compact ? ' compact' : ''}`}>
      <label>
        Room type
        <select value={roomType} onChange={(e) => setRoomType(e.target.value as RoomType)}>
          {roomTypes.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </label>
      <label>
        Measurements
        <select value={unit} onChange={(e) => setUnit(e.target.value as 'metric' | 'imperial')}>
          <option value="metric">Metric (m / cm)</option>
          <option value="imperial">Imperial (ft / in)</option>
        </select>
      </label>
      <label>
        Ceiling height
        <div className="number-input">
          <input type="number" min="2" max="6" step=".05" value={ceiling} onChange={(e) => setCeiling(+e.target.value)} />
          <span>m</span>
        </div>
      </label>
      <span className="template-label">Start with a shape</span>
      <div className="room-templates">
        <button onClick={() => template('rectangle')}>Rectangle</button>
        <button onClick={() => template('wide')}>Wide</button>
        <button onClick={() => template('l-shape')}>L-shape</button>
      </div>
    </div>
  );
}

function FurnitureProperties({ item }: { item: FurnitureItem }) {
  const update = usePlannerStore((s) => s.updateFurniture);
  const move = usePlannerStore((s) => s.moveSelected);
  const duplicate = usePlannerStore((s) => s.duplicateSelected);
  const remove = usePlannerStore((s) => s.deleteSelected);
  return (
    <>
      <label>
        Mounting
        <select
          value={item.mountingType ?? 'floor'}
          onChange={(e) => update(item.id, { mountingType: e.target.value as FurnitureItem['mountingType'] })}
        >
          <option value="floor">Floor</option>
          <option value="wall">Wall</option>
          <option value="ceiling">Ceiling</option>
        </select>
      </label>
      <Numeric label="Position X" value={item.x} onChange={(x) => update(item.id, { x })} />
      <Numeric label="Position Z" value={item.z} onChange={(z) => update(item.id, { z })} />
      {(item.mountingType === 'wall' || item.mountingType === 'ceiling') && (
        <Numeric label="Height Y" value={item.y ?? 0} onChange={(y) => update(item.id, { y })} />
      )}
      <label>
        Rotation
        <input className="property-input" type="range" min="0" max="6.28" step="0.1" value={item.rotation} onChange={(e) => update(item.id, { rotation: +e.target.value })} />
      </label>
      <label className="room-filter">
        <input type="checkbox" checked={!!item.showClearance} onChange={(e) => update(item.id, { showClearance: e.target.checked })} />
        Show clearance
      </label>
      <div className="nudge">
        <button onClick={() => move(-0.25, 0)}>←</button>
        <button onClick={() => move(0, -0.25)}>↑</button>
        <button onClick={() => move(0, 0.25)}>↓</button>
        <button onClick={() => move(0.25, 0)}>→</button>
      </div>
      <button className="duplicate" onClick={duplicate}>
        Duplicate item
      </button>
      <button className="delete-item" onClick={remove}>
        Delete item
      </button>
      <label>
        Color
        <div className="swatches">
          {finishes.map(([name, color]) => (
            <button title={name} key={color} style={{ background: color }} onClick={() => update(item.id, { color })} />
          ))}
        </div>
      </label>
    </>
  );
}

function OpeningProperties({ opening }: { opening: Opening }) {
  const update = usePlannerStore((s) => s.updateOpening);
  const remove = usePlannerStore((s) => s.deleteOpening);
  return (
    <>
      <h2>{opening.type[0].toUpperCase() + opening.type.slice(1)}</h2>
      <label>
        Position along wall
        <input type="range" min=".03" max=".97" step=".01" value={opening.offset} onChange={(e) => update(opening.id, { offset: +e.target.value })} />
      </label>
      <Numeric label="Width" value={opening.width} onChange={(width) => update(opening.id, { width: Math.max(0.3, width) })} />
      {opening.type !== 'passage' && (
        <Numeric label="Height" value={opening.height} onChange={(height) => update(opening.id, { height: Math.max(0.3, height) })} />
      )}
      {opening.type === 'window' && (
        <Numeric label="Sill height" value={opening.sill} onChange={(sill) => update(opening.id, { sill: Math.max(0, sill) })} />
      )}
      {opening.type === 'door' && (
        <label>
          Door swing
          <select value={opening.swing ?? 'left'} onChange={(e) => update(opening.id, { swing: e.target.value as 'left' | 'right' | 'none' })}>
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="none">No swing</option>
          </select>
        </label>
      )}
      <button className="delete-item" onClick={() => remove(opening.id)}>
        Remove opening
      </button>
    </>
  );
}

function WallProperties({ wall }: { wall: Wall }) {
  const allOpenings = usePlannerStore((s) => s.openings);
  const openings = useMemo(() => allOpenings.filter((o) => o.wallId === wall.id), [allOpenings, wall.id]);
  const updateOpening = usePlannerStore((s) => s.updateOpening);
  const remove = usePlannerStore((s) => s.deleteOpening);
  const updateWall = usePlannerStore((s) => s.updateWall);
  const setLength = usePlannerStore((s) => s.setWallLength);
  const split = usePlannerStore((s) => s.splitWall);
  const offset = usePlannerStore((s) => s.offsetWall);
  return (
    <>
      <Numeric label="Exact length" value={+wallLengthMeters(wall.start, wall.end).toFixed(2)} onChange={(value) => setLength(wall.id, value)} />
      <Numeric label="Thickness" value={wall.thickness} onChange={(value) => updateWall(wall.id, { thickness: Math.max(0.05, value) })} />
      <Numeric label="Height" value={wall.height} onChange={(value) => updateWall(wall.id, { height: Math.max(2, value) })} />
      <div className="wall-actions">
        <button onClick={() => offset(wall.id, -0.25)}>Move −25 cm</button>
        <button onClick={() => split(wall.id)}>Split wall</button>
        <button onClick={() => offset(wall.id, 0.25)}>Move +25 cm</button>
      </div>
      <Property label="Openings" value={String(openings.length)} />
      {openings.map((o) => (
        <div className="opening-editor" key={o.id}>
          <strong>{o.type}</strong>
          <label>
            Position
            <input type="range" min=".05" max=".95" step=".05" value={o.offset} onChange={(e) => updateOpening(o.id, { offset: +e.target.value })} />
          </label>
          <label>
            Width
            <input type="number" min=".4" max="3" step=".1" value={o.width} onChange={(e) => updateOpening(o.id, { width: +e.target.value })} />
          </label>
          <button onClick={() => remove(o.id)}>Remove</button>
        </div>
      ))}
      <p className="muted">Dragging or moving this segment keeps connected corners attached.</p>
    </>
  );
}

function Property({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <label>
      {label}
      <div className="input">
        {value}
        {unit && <span>{unit}</span>}
      </div>
    </label>
  );
}

function Numeric({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      {label}
      <div className="number-input">
        <input type="number" step="0.25" value={value} onChange={(e) => onChange(+e.target.value)} />
        <span>m</span>
      </div>
    </label>
  );
}
