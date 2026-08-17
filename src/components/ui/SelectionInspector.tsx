import { useEffect, useMemo, useRef } from 'react';
import { ChevronDown, Grid2X2, X } from 'lucide-react';
import { usePlannerStore } from '../../store/plannerStore';
import { formatLength, parseLength } from '../../lib/measurements';
import { listBuiltinHousePlans } from '../../lib/housePlans/planRegistry';
import { planRoomSizeFeet } from '../../lib/housePlans/buildPlan';
import { openingMetersFromOffset, openingOffsetFromMeters, wallLengthM } from '../../lib/planExport/drawFloorPlan';
import type { Opening, PlanRoomLabel, RoomType, Wall, WallAssembly } from '../../types';
import { WALL_ASSEMBLY_PRESETS } from '../../lib/buildingChecks';

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
  const furniture = usePlannerStore((s) => s.furniture);
  const selectedWallId = usePlannerStore((s) => s.selectedWallId);
  const selectedOpeningId = usePlannerStore((s) => s.selectedOpeningId);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const selectedFurnitureId = usePlannerStore((s) => s.selectedFurnitureId);
  const selectedSurface = usePlannerStore((s) => s.selectedSurface);
  const selectedWall = walls.find((w) => w.id === selectedWallId);
  const selectedOpening = openings.find((o) => o.id === selectedOpeningId);
  const selectedRoom = planRooms.find((r) => r.id === selectedRoomId);
  const selectedTrim = furniture.find((f) => f.id === selectedFurnitureId && f.placementKind === 'perimeter-trim');
  const selectedFurniture = furniture.find((f) => f.id === selectedFurnitureId && f.placementKind !== 'perimeter-trim');
  const selectedAnnotationId = usePlannerStore((s) => s.selectedAnnotationId);
  const annotations = usePlannerStore((s) => s.annotations);
  const selectedAnnotation = annotations.find((a) => a.id === selectedAnnotationId);

  if (!open) return null;

  const title = selectedTrim
    ? selectedTrim.trimEdge === 'ceiling'
      ? 'Crown molding'
      : 'Baseboard'
    : selectedFurniture
      ? selectedFurniture.name
      : selectedAnnotation
        ? 'Annotation'
        : selectedOpening
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
        <ChevronDown size={18} aria-hidden />
      </button>
      <header>
        <strong>{title}</strong>
        <button onClick={onClose} aria-label="Close inspector">
          <X size={18} />
        </button>
      </header>
      <div className="selection-inspector-body">
        {selectedTrim ? (
          <TrimProperties item={selectedTrim} />
        ) : selectedFurniture ? (
          <FurnitureProperties item={selectedFurniture} />
        ) : selectedAnnotation ? (
          <AnnotationProperties annotation={selectedAnnotation} />
        ) : selectedOpening ? (
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

function AnnotationProperties({ annotation }: { annotation: import('../../types').PlanAnnotation }) {
  const update = usePlannerStore((s) => s.updateAnnotation);
  const remove = usePlannerStore((s) => s.deleteAnnotation);
  return (
    <>
      <label>
        Type
        <select
          value={annotation.kind}
          onChange={(e) => update(annotation.id, { kind: e.target.value as typeof annotation.kind })}
        >
          <option value="note">Note</option>
          <option value="cloud">Cloud</option>
          <option value="arrow">Arrow</option>
        </select>
      </label>
      <label>
        Text
        <input
          type="text"
          value={annotation.text}
          onChange={(e) => update(annotation.id, { text: e.target.value })}
        />
      </label>
      {annotation.kind === 'arrow' && (
        <label>
          Rotation
          <input
            type="number"
            value={annotation.rotation ?? 0}
            onChange={(e) => update(annotation.id, { rotation: +e.target.value || 0 })}
          />
        </label>
      )}
      <button className="delete-item" type="button" onClick={() => remove(annotation.id)}>
        Remove annotation
      </button>
    </>
  );
}

function FurnitureProperties({ item }: { item: import('../../types').FurnitureItem }) {
  const remove = usePlannerStore((s) => s.deleteSelected);
  const update = usePlannerStore((s) => s.updateFurniture);
  const unit = usePlannerStore((s) => s.unitSystem);
  const floors = usePlannerStore((s) => s.floors);
  const fromFloor = item.stair ? floors.find((f) => f.id === item.stair!.fromFloorId) : null;
  const toFloor = item.stair ? floors.find((f) => f.id === item.stair!.toFloorId) : null;
  return (
    <>
      <p className="muted">{item.category}</p>
      <Property label="Name" value={item.name} />
      {item.placementKind === 'stair' && (
        <>
          <p className="muted">
            Links {fromFloor?.name ?? 'lower'} → {toFloor?.name ?? 'upper'}. Floor plates cut out around the run.
          </p>
          <LengthField
            label="Width"
            value={item.width}
            min={0.7}
            onChange={(width) => update(item.id, { width })}
          />
          <LengthField
            label="Run"
            value={item.stair?.runM ?? item.depth}
            min={1}
            onChange={(runM) => {
              const landingM = item.stair?.landingM ?? 0.9;
              update(item.id, {
                depth: runM + landingM,
                stair: { ...item.stair!, runM },
              });
            }}
          />
          <LengthField
            label="Rise"
            value={item.stair?.riseM ?? item.height}
            min={2}
            onChange={(riseM) => update(item.id, { height: riseM, stair: { ...item.stair!, riseM } })}
          />
          <LengthField
            label="Landing"
            value={item.stair?.landingM ?? 0.9}
            min={0}
            onChange={(landingM) => {
              const runM = item.stair?.runM ?? Math.max(0.5, item.depth - landingM);
              update(item.id, {
                depth: runM + landingM,
                stair: { ...item.stair!, landingM },
              });
            }}
          />
          <label>
            Steps
            <input
              type="number"
              min={3}
              max={30}
              value={item.stair?.steps ?? 12}
              onChange={(e) => update(item.id, { stair: { ...item.stair!, steps: Math.max(3, +e.target.value || 12) } })}
            />
          </label>
          {(() => {
            const steps = Math.max(1, item.stair?.steps ?? 12);
            const rise = item.stair?.riseM ?? item.height;
            const run = item.stair?.runM ?? Math.max(0.5, item.depth - (item.stair?.landingM ?? 0));
            const riserIn = (rise / steps) / 0.0254;
            const treadIn = (run / steps) / 0.0254;
            return (
              <p className="muted">
                Avg riser {riserIn.toFixed(1)}″ · tread {treadIn.toFixed(1)}″
                {riserIn > 7.75 ? ' · riser tall vs common caps' : ''}
                {treadIn < 10 ? ' · tread short vs common mins' : ''}
              </p>
            );
          })()}
        </>
      )}
      <Property
        label="Size"
        value={
          unit === 'metric'
            ? `${item.width.toFixed(2)} × ${item.depth.toFixed(2)} × ${item.height.toFixed(2)} m`
            : `${(item.width / 0.3048).toFixed(1)} × ${(item.depth / 0.3048).toFixed(1)} × ${(item.height / 0.3048).toFixed(1)} ft`
        }
      />
      <Property label="Mount" value={item.mountingType ?? 'floor'} />
      <label>
        Finish color
        <input type="color" value={item.color} readOnly />
      </label>
      <button className="delete-item" onClick={() => remove()}>
        Remove from room
      </button>
    </>
  );
}

function TrimProperties({ item }: { item: import('../../types').FurnitureItem }) {
  const update = usePlannerStore((s) => s.updateFurniture);
  const remove = usePlannerStore((s) => s.deleteSelected);
  const run = usePlannerStore((s) => s.furniture.filter((f) => f.runId === item.runId));
  const lengthM = run.reduce((sum, f) => sum + f.width, 0);
  const lengthFt = lengthM / 0.3048;
  return (
    <>
      <h2>{item.trimEdge === 'ceiling' ? 'Crown molding' : 'Baseboard'}</h2>
      <p className="muted">
        Priced by linear foot. Profile height changes the take-off height used in the shopping list; length follows the room perimeter
        {item.trimEdge === 'floor' ? ' (baseboard skips walls blocked by counters/cabinets)' : ''}.
      </p>
      <label>
        Length (auto)
        <input type="text" readOnly value={`${lengthM.toFixed(2)} m · ${lengthFt.toFixed(1)} ft`} />
      </label>
      <LengthField
        label="Profile height"
        value={item.height}
        min={0.03}
        onChange={(height) => update(item.id, { height })}
      />
      <label>
        Finish color
        <input type="color" value={item.color} onChange={(e) => update(item.id, { color: e.target.value })} />
      </label>
      <p className="muted">Shape is fixed — trim is on or off for this room.</p>
      <button className="delete-item" onClick={() => remove()}>
        Remove {item.trimEdge === 'ceiling' ? 'crown molding' : 'baseboard'}
      </button>
    </>
  );
}

function RoomPanel({ surface }: { surface: 'floor' | 'wall' | 'ceiling' | null }) {
  const roofStyle = usePlannerStore((s) => s.roofStyle);
  const setRoofStyle = usePlannerStore((s) => s.setRoofStyle);
  const siteSetback = usePlannerStore((s) => s.siteSetback);
  const setSiteSetback = usePlannerStore((s) => s.setSiteSetback);
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
      <label>
        Roof
        <select value={roofStyle} onChange={(e) => setRoofStyle(e.target.value as typeof roofStyle)}>
          <option value="none">None</option>
          <option value="flat">Flat</option>
          <option value="gable">Gable</option>
        </select>
      </label>
      <p className="muted">Site setbacks (m) — dashed guide on the plan</p>
      <label>
        Front
        <input
          type="number"
          step="0.5"
          min="0"
          value={siteSetback.frontM}
          onChange={(e) => setSiteSetback({ ...siteSetback, frontM: Math.max(0, +e.target.value || 0) })}
        />
      </label>
      <label>
        Side
        <input
          type="number"
          step="0.5"
          min="0"
          value={siteSetback.sideM}
          onChange={(e) => setSiteSetback({ ...siteSetback, sideM: Math.max(0, +e.target.value || 0) })}
        />
      </label>
      <label>
        Rear
        <input
          type="number"
          step="0.5"
          min="0"
          value={siteSetback.rearM}
          onChange={(e) => setSiteSetback({ ...siteSetback, rearM: Math.max(0, +e.target.value || 0) })}
        />
      </label>
    </>
  );
}

function PlanRoomProperties({ room }: { room: PlanRoomLabel }) {
  const update = usePlannerStore((s) => s.updatePlanRoom);
  const resize = usePlannerStore((s) => s.resizePlanRoom);
  const remove = usePlannerStore((s) => s.deletePlanRoom);
  const split = usePlannerStore((s) => s.splitPlanRoom);
  const insertVertex = usePlannerStore((s) => s.insertPlanRoomVertex);
  const removeVertex = usePlannerStore((s) => s.removePlanRoomVertex);
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
        About {Math.round(areaSqFt).toLocaleString()} sf · {room.points.length} corners
      </p>
      <p className="muted room-size-line">
        {unit === 'metric'
          ? `${formatLength(size.widthFt * 0.3048, unit)} × ${formatLength(size.depthFt * 0.3048, unit)}`
          : `${size.widthFt.toFixed(1)}′ × ${size.depthFt.toFixed(1)}′`}
      </p>
      <p className="muted">Drag blue corners on the plan to angle walls. Tap a mid-edge square to add a corner. Width/Depth scale the polygon (shape preserved).</p>
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
      <p className="muted">Width/Depth scale from center — L-shapes and angled rooms keep their outline.</p>
      <LengthField label="Ceiling height" value={ceiling} min={2} max={6} onChange={setCeiling} />
      <div className="wall-actions">
        <button type="button" onClick={() => insertVertex(room.id, 0)}>
          Add corner
        </button>
        <button
          type="button"
          disabled={room.points.length <= 3}
          onClick={() => removeVertex(room.id, room.points.length - 1)}
        >
          Remove corner
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
          <span className="template-label">Sample house plans</span>
          {housePlanName && <p className="muted house-plan-active">Loaded: {housePlanName}</p>}
          <div className="house-plan-list">
            {listBuiltinHousePlans().map((plan) => (
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
            Open sample layouts with measured footprints. Import DXF/JSON from House plans. Not proprietary brochure tracings.
          </p>
        </>
      )}
    </div>
  );
}

function OpeningProperties({ opening }: { opening: Opening }) {
  const update = usePlannerStore((s) => s.updateOpening);
  const remove = usePlannerStore((s) => s.deleteOpening);
  const walls = usePlannerStore((s) => s.walls);
  const wall = walls.find((w) => w.id === opening.wallId);
  const distanceM = wall ? openingMetersFromOffset(opening.offset, wall) : 0;
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
      {wall && (
        <LengthField
          label="Distance from start"
          value={distanceM}
          min={0.05}
          max={Math.max(0.1, wallLengthM(wall) - 0.05)}
          onChange={(meters) => update(opening.id, { offset: openingOffsetFromMeters(meters, wall) })}
        />
      )}
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
            Opens
            <select value={opening.face ?? 'in'} onChange={(e) => update(opening.id, { face: e.target.value as 'in' | 'out' })}>
              <option value="in">Into the room</option>
              <option value="out">Out of the room</option>
            </select>
          </label>
          <p className="muted">Clear space in front of the door is always a square the door’s width — hinge side only changes the leaf graphic.</p>
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
  const setWallLength = usePlannerStore((s) => s.setWallLength);
  const split = usePlannerStore((s) => s.splitWall);
  const offset = usePlannerStore((s) => s.offsetWall);
  const deleteSelected = usePlannerStore((s) => s.deleteSelected);
  const unit = usePlannerStore((s) => s.unitSystem);
  const assembly = wall.assembly ?? 'interior';
  const lengthM = wallLengthM(wall);

  const applyAssembly = (next: WallAssembly) => {
    const preset = WALL_ASSEMBLY_PRESETS[next];
    updateWall(wall.id, { assembly: next, thickness: preset.thicknessM });
  };

  return (
    <>
      <span className="template-label">Wall type</span>
      <div className="wall-assembly-pills" role="group" aria-label="Wall assembly">
        {(Object.keys(WALL_ASSEMBLY_PRESETS) as WallAssembly[]).map((key) => (
          <button
            key={key}
            type="button"
            className={assembly === key ? 'is-active' : undefined}
            onClick={() => applyAssembly(key)}
            title={WALL_ASSEMBLY_PRESETS[key].hint}
          >
            {WALL_ASSEMBLY_PRESETS[key].label}
          </button>
        ))}
      </div>
      <p className="muted">{WALL_ASSEMBLY_PRESETS[assembly].hint}</p>
      <LengthField label="Length" value={lengthM} min={0.5} onChange={(value) => setWallLength(wall.id, value)} />
      <LengthField label="Thickness" value={wall.thickness} min={0.05} onChange={(value) => updateWall(wall.id, { thickness: value })} />
      <LengthField label="Height" value={wall.height} min={2} onChange={(value) => updateWall(wall.id, { height: value })} />
      <div className="wall-actions">
        <button type="button" onClick={() => offset(wall.id, -0.25)}>Move −{unit === 'metric' ? '25 cm' : '10 in'}</button>
        <button type="button" onClick={() => split(wall.id)}>Split wall</button>
        <button type="button" onClick={() => offset(wall.id, 0.25)}>Move +{unit === 'metric' ? '25 cm' : '10 in'}</button>
      </div>
      <p className="muted">
        With the Walls tool on, drag an edge handle on the plan to push/pull that wall — or type an exact length above /
        use Move ±.
      </p>
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
          <button type="button" className="is-danger" onClick={() => remove(o.id)}>Remove</button>
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
