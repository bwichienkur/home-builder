import { useEffect, useMemo, useRef } from 'react';
import { FileSpreadsheet, Grid2X2, X } from 'lucide-react';
import { usePlannerStore } from '../../store/plannerStore';
import { wallLengthMeters } from '../../lib/geometry/snapping';
import { formatLength, parseLength } from '../../lib/measurements';
import { olsenHousePlans } from '../../lib/housePlans/olsenPlans';
import { planRoomSizeFeet } from '../../lib/housePlans/buildPlan';
import type { FurnitureItem, Opening, PlanRoomLabel, RoomType, Wall } from '../../types';

const finishes: [string, string][] = [
  ['Oak', '#c9b18f'],
  ['Walnut', '#7d5c43'],
  ['Stone', '#a8aaa4'],
  ['Ivory', '#e9e2d2'],
  ['Sage', '#9aa697'],
  ['Charcoal', '#454b48'],
  ['Cloud', '#f4f6f8'],
  ['Warm white', '#fff8ef'],
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
  const planRooms = usePlannerStore((s) => s.planRooms);
  const selectedWallId = usePlannerStore((s) => s.selectedWallId);
  const selectedOpeningId = usePlannerStore((s) => s.selectedOpeningId);
  const selectedFurnitureId = usePlannerStore((s) => s.selectedFurnitureId);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const selectedSurface = usePlannerStore((s) => s.selectedSurface);
  const selectedWall = walls.find((w) => w.id === selectedWallId);
  const selectedOpening = openings.find((o) => o.id === selectedOpeningId);
  const selectedFurniture = furniture.find((f) => f.id === selectedFurnitureId);
  const selectedRoom = planRooms.find((r) => r.id === selectedRoomId);

  if (!open) return null;

  const title = selectedOpening
    ? 'Opening'
    : selectedWall
      ? 'Wall'
      : selectedFurniture
        ? selectedFurniture.name
        : selectedRoom
          ? selectedRoom.name
          : selectedSurface === 'ceiling'
            ? 'Ceiling'
            : selectedSurface === 'floor'
              ? 'Floor'
              : 'Room';

  return (
    <aside className="selection-inspector" aria-label="Selection properties">
      <header>
        <strong>{title}</strong>
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
        ) : selectedRoom ? (
          <PlanRoomProperties room={selectedRoom} />
        ) : (
          <RoomPanel surface={selectedSurface} />
        )}
      </div>
    </aside>
  );
}

function RoomPanel({ surface }: { surface: 'floor' | 'wall' | 'ceiling' | null }) {
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
        <h3>{surface === 'ceiling' ? 'Ceiling finish' : surface === 'floor' ? 'Floor finish' : 'Room finishes'}</h3>
        <p>
          {surface
            ? 'Choose a finish below.'
            : 'Tap a room label or floor to edit that room. Select a wall or product for precise controls.'}
        </p>
      </div>
      <FinishSwatches highlight={surface} />
    </>
  );
}

function PlanRoomProperties({ room }: { room: PlanRoomLabel }) {
  const update = usePlannerStore((s) => s.updatePlanRoom);
  const resize = usePlannerStore((s) => s.resizePlanRoom);
  const remove = usePlannerStore((s) => s.deletePlanRoom);
  const split = usePlannerStore((s) => s.splitPlanRoom);
  const exitRoom = usePlannerStore((s) => s.exitRoom);
  const unit = usePlannerStore((s) => s.unitSystem);
  const size = planRoomSizeFeet(room.points);
  const areaSqFt = size.widthFt * size.depthFt;

  return (
    <>
      <p className="muted">Editing this room only</p>
      <label>
        Room name
        <input className="property-input" value={room.name} onChange={(e) => update(room.id, { name: e.target.value })} />
      </label>
      <label>
        Room type
        <select value={room.roomType} onChange={(e) => update(room.id, { roomType: e.target.value as RoomType })}>
          {roomTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        About {Math.round(areaSqFt).toLocaleString()} sf
        {unit === 'metric'
          ? ` · ${formatLength(size.widthFt * 0.3048, unit)} × ${formatLength(size.depthFt * 0.3048, unit)}`
          : ` · ${size.widthFt.toFixed(1)}′ × ${size.depthFt.toFixed(1)}′`}
      </p>
      <LengthField
        label="Width"
        value={size.widthFt * 0.3048}
        min={1}
        max={30}
        onChange={(meters) => resize(room.id, meters / 0.3048, size.depthFt)}
      />
      <LengthField
        label="Depth"
        value={size.depthFt * 0.3048}
        min={1}
        max={30}
        onChange={(meters) => resize(room.id, size.widthFt, meters / 0.3048)}
      />
      <label>
        Room floor finish
        <div className="swatches">
          {finishes.slice(0, 6).map(([n, c]) => (
            <button
              title={n}
              key={c}
              style={{ background: c, outline: room.floorColor === c ? '2px solid #0058a3' : undefined }}
              onClick={() => update(room.id, { floorColor: c })}
            />
          ))}
        </div>
      </label>
      <div className="wall-actions">
        <button
          type="button"
          className="inspector-back-btn"
          onClick={() => {
            exitRoom();
            window.setTimeout(() => {
              window.dispatchEvent(new Event('roomcraft-fit-plan'));
              window.dispatchEvent(new Event('roomcraft-refocus'));
            }, 0);
          }}
        >
          ← House
        </button>
        <button type="button" onClick={() => split(room.id)}>
          Split room
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Remove “${room.name}” from this floor?`)) remove(room.id);
          }}
        >
          Delete room
        </button>
      </div>
    </>
  );
}

function FinishSwatches({ highlight = null }: { highlight?: 'floor' | 'wall' | 'ceiling' | null }) {
  const set = usePlannerStore((s) => s.setFinish);
  return (
    <>
      <label className={highlight === 'floor' ? 'finish-highlight' : ''}>
        Floor material
        <div className="swatches">
          {finishes.slice(0, 6).map(([n, c]) => (
            <button title={n} key={c} style={{ background: c }} onClick={() => set('floor', c)} />
          ))}
        </div>
      </label>
      <label className={highlight === 'wall' ? 'finish-highlight' : ''}>
        Wall color
        <div className="swatches">
          {finishes.slice(3, 6).map(([n, c]) => (
            <button title={n} key={`wall-${c}`} style={{ background: c }} onClick={() => set('wall', c)} />
          ))}
        </div>
      </label>
      <label className={highlight === 'ceiling' ? 'finish-highlight' : ''}>
        Ceiling color
        <div className="swatches">
          {finishes.slice(5).map(([n, c]) => (
            <button title={n} key={`ceil-${c}`} style={{ background: c }} onClick={() => set('ceiling', c)} />
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
  const applyHousePlan = usePlannerStore((s) => s.applyHousePlan);
  const housePlanId = usePlannerStore((s) => s.housePlanId);
  const housePlanName = usePlannerStore((s) => s.housePlanName);
  const setCeiling = usePlannerStore((s) => s.setCeilingHeight);
  const setCameraMode = usePlannerStore((s) => s.setCameraMode);
  const walls = usePlannerStore((s) => s.walls);
  const furniture = usePlannerStore((s) => s.furniture);
  const ceiling = walls[0]?.height ?? 2.7;

  const template = (shape: 'rectangle' | 'wide' | 'l-shape') => {
    if ((walls.length || furniture.length) && !window.confirm('Replace the current room layout? Products in this room will be removed.')) return;
    apply(shape);
  };

  const loadHouse = (planId: string) => {
    if ((walls.length || furniture.length) && !window.confirm('Load this house plan? Current walls and products will be replaced.')) return;
    if (applyHousePlan(planId)) setCameraMode('top');
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
      <LengthField label="Ceiling height" value={ceiling} min={2} max={6} onChange={setCeiling} />
      <span className="template-label">Start with a shape</span>
      <div className="room-templates">
        <button type="button" onClick={() => template('rectangle')}>Rectangle</button>
        <button type="button" onClick={() => template('wide')}>Wide</button>
        <button type="button" onClick={() => template('l-shape')}>L-shape</button>
      </div>
      <span className="template-label">House plans (buildable)</span>
      {housePlanName && <p className="muted house-plan-active">Loaded: {housePlanName}</p>}
      <div className="house-plan-list">
        {olsenHousePlans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            className={housePlanId === plan.id ? 'active' : ''}
            onClick={() => loadHouse(plan.id)}
            title={`${plan.beds} bed · ${plan.baths} bath · ${plan.livingSqFt.toLocaleString()} sf living · ${plan.stories} stor${plan.stories === 1 ? 'y' : 'ies'}`}
          >
            <strong>{plan.name}</strong>
            <span>
              {plan.beds}/{plan.baths} · {plan.livingSqFt.toLocaleString()} sf · {plan.stories === 1 ? '1 story' : '2 story'}
            </span>
          </button>
        ))}
      </div>
      <p className="muted house-plan-note">
        Original Mahnikka layouts sized from publicly listed room programs — not copied Olsen drawings. Switch floors in the project menu for two-story plans.
      </p>
    </div>
  );
}

function FurnitureProperties({ item }: { item: FurnitureItem }) {
  const update = usePlannerStore((s) => s.updateFurniture);
  const move = usePlannerStore((s) => s.moveSelected);
  const duplicate = usePlannerStore((s) => s.duplicateSelected);
  const remove = usePlannerStore((s) => s.deleteSelected);
  const unit = usePlannerStore((s) => s.unitSystem);
  return (
    <>
      <p className="muted">
        {item.category}
        {item.mountingType === 'wall' ? ' · Wall mount' : item.mountingType === 'ceiling' ? ' · Ceiling' : ' · Floor'}
      </p>
      <label>
        Mounting
        <select value={item.mountingType ?? 'floor'} onChange={(e) => update(item.id, { mountingType: e.target.value as FurnitureItem['mountingType'] })}>
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
      <p className="muted">
        Size {formatLength(item.width, unit)} × {formatLength(item.depth, unit)} × {formatLength(item.height, unit)}
      </p>
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
          {finishes.slice(0, 6).map(([name, color]) => (
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
      <LengthField label="Width" value={opening.width} min={0.3} onChange={(width) => update(opening.id, { width })} />
      {opening.type !== 'passage' && (
        <LengthField label="Height" value={opening.height} min={0.3} onChange={(height) => update(opening.id, { height })} />
      )}
      {opening.type === 'window' && (
        <LengthField label="Sill height" value={opening.sill} min={0} onChange={(sill) => update(opening.id, { sill })} />
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
  const unit = usePlannerStore((s) => s.unitSystem);
  return (
    <>
      <LengthField label="Exact length" value={wallLengthMeters(wall.start, wall.end)} min={0.25} onChange={(value) => setLength(wall.id, value)} autoFocus />
      <LengthField label="Thickness" value={wall.thickness} min={0.05} onChange={(value) => updateWall(wall.id, { thickness: value })} />
      <LengthField label="Height" value={wall.height} min={2} onChange={(value) => updateWall(wall.id, { height: value })} />
      <div className="wall-actions">
        <button onClick={() => offset(wall.id, -0.25)}>Move −{unit === 'metric' ? '25 cm' : '10 in'}</button>
        <button onClick={() => split(wall.id)}>Split wall</button>
        <button onClick={() => offset(wall.id, 0.25)}>Move +{unit === 'metric' ? '25 cm' : '10 in'}</button>
      </div>
      <Property label="Openings" value={String(openings.length)} />
      {openings.map((o) => (
        <div className="opening-editor" key={o.id}>
          <strong>{o.type}</strong>
          <label>
            Position
            <input type="range" min=".05" max=".95" step=".05" value={o.offset} onChange={(e) => updateOpening(o.id, { offset: +e.target.value })} />
          </label>
          <LengthField label="Width" value={o.width} min={0.3} onChange={(width) => updateOpening(o.id, { width })} />
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
  const unit = usePlannerStore((s) => s.unitSystem);
  return (
    <label>
      {label}
      <div className="number-input">
        <input type="number" step="0.25" value={value} onChange={(e) => onChange(+e.target.value)} />
        <span>{unit === 'metric' ? 'm' : 'm*'}</span>
      </div>
    </label>
  );
}

function LengthField({
  label,
  value,
  onChange,
  min = 0,
  max,
  autoFocus = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  autoFocus?: boolean;
}) {
  const unit = usePlannerStore((s) => s.unitSystem);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus, value, unit]);
  return (
    <label>
      {label}
      <div className="number-input">
        <input
          ref={inputRef}
          key={`${label}-${unit}-${value.toFixed(3)}`}
          type="text"
          inputMode="decimal"
          defaultValue={unit === 'metric' ? value.toFixed(2) : formatLength(value, unit)}
          onBlur={(e) => {
            const parsed = parseLength(e.target.value, unit);
            if (parsed == null) return;
            const next = Math.max(min, max == null ? parsed : Math.min(max, parsed));
            onChange(next);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <span>{unit === 'metric' ? 'm' : 'ft / in'}</span>
      </div>
    </label>
  );
}
