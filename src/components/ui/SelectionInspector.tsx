import { useEffect, useMemo, useRef } from 'react';
import { ChevronRight, Grid2X2, X } from 'lucide-react';
import { usePlannerStore } from '../../store/plannerStore';
import { wallLengthMeters } from '../../lib/geometry/snapping';
import { formatLength, parseLength } from '../../lib/measurements';
import { olsenHousePlans } from '../../lib/housePlans/olsenPlans';
import { planRoomSizeFeet } from '../../lib/housePlans/buildPlan';
import type { Opening, PlanRoomLabel, RoomType, Wall } from '../../types';

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
  const planRooms = usePlannerStore((s) => s.planRooms);
  const selectedWallId = usePlannerStore((s) => s.selectedWallId);
  const selectedOpeningId = usePlannerStore((s) => s.selectedOpeningId);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const selectedSurface = usePlannerStore((s) => s.selectedSurface);
  const selectedWall = walls.find((w) => w.id === selectedWallId);
  const selectedOpening = openings.find((o) => o.id === selectedOpeningId);
  const selectedRoom = planRooms.find((r) => r.id === selectedRoomId);

  if (!open) return null;

  const title = selectedOpening
    ? 'Opening'
    : selectedWall
      ? 'Wall'
      : selectedRoom
        ? selectedRoom.name
        : selectedSurface === 'ceiling'
          ? 'Ceiling'
          : selectedSurface === 'floor'
            ? 'Floor'
            : 'Room';

  return (
    <aside className="selection-inspector" aria-label="Selection properties">
      <button type="button" className="selection-inspector-collapse" onClick={onClose} aria-label="Collapse editor">
        <ChevronRight size={18} />
      </button>
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
      <div className="empty-state compact">
        <div className="select-icon">
          <Grid2X2 size={22} />
        </div>
        <h3>{surface === 'ceiling' ? 'Ceiling finish' : surface === 'floor' ? 'Floor finish' : 'Room'}</h3>
        <p>
          {surface === 'ceiling'
            ? 'Choose a ceiling color below.'
            : surface === 'floor'
              ? 'Choose a floor finish below.'
              : 'Use Edit on the right rail to change room size and type.'}
        </p>
      </div>
      {(surface === 'ceiling' || surface === 'floor') && (
        <FinishSwatches highlight={surface === 'ceiling' ? 'ceiling' : 'floor'} />
      )}
    </>
  );
}

function PlanRoomProperties({ room }: { room: PlanRoomLabel }) {
  const update = usePlannerStore((s) => s.updatePlanRoom);
  const resize = usePlannerStore((s) => s.resizePlanRoom);
  const remove = usePlannerStore((s) => s.deletePlanRoom);
  const split = usePlannerStore((s) => s.splitPlanRoom);
  const setCeiling = usePlannerStore((s) => s.setCeilingHeight);
  const unit = usePlannerStore((s) => s.unitSystem);
  const setUnit = usePlannerStore((s) => s.setUnitSystem);
  const walls = usePlannerStore((s) => s.walls);
  const ceiling = walls[0]?.height ?? 2.7;
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
      <label>
        Measurements
        <select value={unit} onChange={(e) => setUnit(e.target.value as 'metric' | 'imperial')}>
          <option value="metric">Metric (m / cm)</option>
          <option value="imperial">Imperial (ft / in)</option>
        </select>
      </label>
      <p className="muted room-size-line">
        About {Math.round(areaSqFt).toLocaleString()} sf
      </p>
      <p className="muted room-size-line">
        {unit === 'metric'
          ? `${formatLength(size.widthFt * 0.3048, unit)} × ${formatLength(size.depthFt * 0.3048, unit)}`
          : `${size.widthFt.toFixed(1)}′ × ${size.depthFt.toFixed(1)}′`}
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
      <LengthField label="Ceiling height" value={ceiling} min={2} max={6} onChange={setCeiling} />
      <div className="wall-actions">
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

function FinishSwatches({ highlight = null }: { highlight?: 'floor' | 'ceiling' | null }) {
  const set = usePlannerStore((s) => s.setFinish);
  return (
    <>
      {(highlight === null || highlight === 'floor') && (
        <label className={highlight === 'floor' ? 'finish-highlight' : ''}>
          Floor material
          <div className="swatches">
            {finishes.slice(0, 6).map(([n, c]) => (
              <button title={n} key={c} style={{ background: c }} onClick={() => set('floor', c)} />
            ))}
          </div>
        </label>
      )}
      {(highlight === null || highlight === 'ceiling') && (
        <label className={highlight === 'ceiling' ? 'finish-highlight' : ''}>
          Ceiling color
          <div className="swatches">
            {finishes.slice(5).map(([n, c]) => (
              <button title={n} key={`ceil-${c}`} style={{ background: c }} onClick={() => set('ceiling', c)} />
            ))}
          </div>
        </label>
      )}
    </>
  );
}

export function RoomDesigner({ compact = false, hidePlans = false }: { compact?: boolean; hidePlans?: boolean }) {
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
      {!hidePlans && (
        <>
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
        </>
      )}
    </div>
  );
}

function OpeningProperties({ opening }: { opening: Opening }) {
  const update = usePlannerStore((s) => s.updateOpening);
  const remove = usePlannerStore((s) => s.deleteOpening);
  return (
    <>
      <h2>{opening.type[0].toUpperCase() + opening.type.slice(1)}</h2>
      <label>
        Shape
        <select
          value={opening.shape ?? 'rect'}
          onChange={(e) => update(opening.id, { shape: e.target.value as Opening['shape'] })}
        >
          <option value="rect">Rectangle</option>
          <option value="arch">Arch</option>
          <option value="wide">Wide</option>
        </select>
      </label>
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
      {(opening.type === 'door' || opening.type === 'passage') && (
        <p className="muted">Attached to the floor (grounded).</p>
      )}
      {opening.type === 'door' && (
        <>
          <label>
            Door swing
            <select value={opening.swing ?? 'left'} onChange={(e) => update(opening.id, { swing: e.target.value as 'left' | 'right' | 'none' })}>
              <option value="left">Hinge left</option>
              <option value="right">Hinge right</option>
              <option value="none">No swing</option>
            </select>
          </label>
          <label>
            Swing into
            <select value={opening.face ?? 'in'} onChange={(e) => update(opening.id, { face: e.target.value as 'in' | 'out' })}>
              <option value="in">This side of wall</option>
              <option value="out">Opposite side</option>
            </select>
          </label>
        </>
      )}
      {opening.type === 'passage' && (
        <label>
          Opening face
          <select value={opening.face ?? 'in'} onChange={(e) => update(opening.id, { face: e.target.value as 'in' | 'out' })}>
            <option value="in">Primary side</option>
            <option value="out">Opposite side</option>
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
  const addOpening = usePlannerStore((s) => s.addOpening);
  const remove = usePlannerStore((s) => s.deleteOpening);
  const selectOpening = usePlannerStore((s) => s.selectOpening);
  const updateWall = usePlannerStore((s) => s.updateWall);
  const setLength = usePlannerStore((s) => s.setWallLength);
  const split = usePlannerStore((s) => s.splitWall);
  const offset = usePlannerStore((s) => s.offsetWall);
  const deleteSelected = usePlannerStore((s) => s.deleteSelected);
  const unit = usePlannerStore((s) => s.unitSystem);
  return (
    <>
      <LengthField label="Exact length" value={wallLengthMeters(wall.start, wall.end)} min={0.25} onChange={(value) => setLength(wall.id, value)} autoFocus />
      <LengthField label="Thickness" value={wall.thickness} min={0.05} onChange={(value) => updateWall(wall.id, { thickness: value })} />
      <LengthField label="Height" value={wall.height} min={2} onChange={(value) => updateWall(wall.id, { height: value })} />
      <div className="wall-actions">
        <button type="button" onClick={() => offset(wall.id, -0.25)}>Move −{unit === 'metric' ? '25 cm' : '10 in'}</button>
        <button type="button" onClick={() => split(wall.id)}>Split wall</button>
        <button type="button" onClick={() => offset(wall.id, 0.25)}>Move +{unit === 'metric' ? '25 cm' : '10 in'}</button>
      </div>
      <p className="muted">Edit L / W / H in the fields around the wall on the plan.</p>
      <span className="template-label">Connect rooms</span>
      <div className="wall-actions">
        <button type="button" onClick={() => addOpening(wall.id, 'door')}>
          Add door
        </button>
        <button type="button" onClick={() => addOpening(wall.id, 'passage')}>
          Add opening
        </button>
        <button type="button" onClick={() => addOpening(wall.id, 'window')}>
          Add window
        </button>
      </div>
      <Property label="Openings" value={String(openings.length)} />
      {openings.map((o) => (
        <div className="opening-editor" key={o.id}>
          <strong>
            <button type="button" className="linkish" onClick={() => selectOpening(o.id)}>
              {o.type}
            </button>
          </strong>
          <label>
            Position
            <input type="range" min=".05" max=".95" step=".05" value={o.offset} onChange={(e) => updateOpening(o.id, { offset: +e.target.value })} />
          </label>
          <LengthField label="Width" value={o.width} min={0.3} onChange={(width) => updateOpening(o.id, { width })} />
          <button type="button" onClick={() => remove(o.id)}>Remove</button>
        </div>
      ))}
      <button
        type="button"
        className="wall-delete-btn"
        onClick={() => {
          if (!window.confirm('Delete this wall? Openings on it will be removed.')) return;
          deleteSelected();
        }}
      >
        Delete wall
      </button>
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
        <span>{unit === 'metric' ? 'm' : 'ft/in'}</span>
      </div>
    </label>
  );
}
