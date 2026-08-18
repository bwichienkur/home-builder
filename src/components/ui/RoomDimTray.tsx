import { useRef, type FormEvent } from 'react';
import { planRoomSizeFeet } from '../../lib/housePlans/buildPlan';
import { formatLength, parseLength } from '../../lib/measurements';
import { usePlannerStore } from '../../store/plannerStore';

function DimField({
  label,
  ariaLabel,
  valueM,
  unit,
  min,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  valueM: number;
  unit: 'metric' | 'imperial';
  min: number;
  onChange: (meters: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const commit = (raw: string) => {
    const parsed = parseLength(raw, unit);
    if (parsed == null) return;
    onChange(Math.max(min, parsed));
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (inputRef.current) commit(inputRef.current.value);
  };
  return (
    <form className="wall-length-field" onSubmit={onSubmit}>
      <strong>{label}</strong>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        defaultValue={unit === 'metric' ? valueM.toFixed(2) : formatLength(valueM, unit)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <span>{unit === 'metric' ? 'm' : 'ft/in'}</span>
    </form>
  );
}

/** Quick W/D/H while the Walls tool is armed — not on every room click (that covers Edit). */
export function shouldShowRoomDimTray(opts: {
  workflowStage: string;
  cameraMode: string;
  planWallTool: boolean;
  hasRoom: boolean;
}) {
  return opts.workflowStage === 'house' && opts.cameraMode === 'top' && opts.planWallTool && opts.hasRoom;
}

export function RoomDimTray() {
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const walls = usePlannerStore((s) => s.walls);
  const unit = usePlannerStore((s) => s.unitSystem);
  const workflowStage = usePlannerStore((s) => s.workflowStage);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const planWallTool = usePlannerStore((s) => s.planWallTool);
  const resizePlanRoom = usePlannerStore((s) => s.resizePlanRoom);
  const setCeilingHeight = usePlannerStore((s) => s.setCeilingHeight);
  const room = planRooms.find((r) => r.id === selectedRoomId);
  if (
    !shouldShowRoomDimTray({
      workflowStage,
      cameraMode,
      planWallTool,
      hasRoom: !!room && room.points.length >= 3,
    })
  ) {
    return null;
  }
  if (!room) return null;
  const size = planRoomSizeFeet(room.points);
  const widthM = size.widthFt * 0.3048;
  const depthM = size.depthFt * 0.3048;
  const ceiling = walls[0]?.height ?? 2.7;
  return (
    <div className="studio-dim-tray studio-dim-tray--dock" role="group" aria-label="Room dimensions">
      <DimField
        key={`W-${room.id}-${unit}-${widthM.toFixed(3)}`}
        label="W"
        ariaLabel="Room width"
        valueM={widthM}
        unit={unit}
        min={1}
        onChange={(meters) => {
          resizePlanRoom(room.id, meters / 0.3048, size.depthFt);
          window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-fit-plan')), 40);
        }}
      />
      <DimField
        key={`D-${room.id}-${unit}-${depthM.toFixed(3)}`}
        label="D"
        ariaLabel="Room depth"
        valueM={depthM}
        unit={unit}
        min={1}
        onChange={(meters) => {
          resizePlanRoom(room.id, size.widthFt, meters / 0.3048);
          window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-fit-plan')), 40);
        }}
      />
      <DimField
        key={`H-${room.id}-${unit}-${ceiling.toFixed(3)}`}
        label="H"
        ariaLabel="Ceiling height"
        valueM={ceiling}
        unit={unit}
        min={2}
        onChange={(meters) => {
          setCeilingHeight(meters);
          window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-fit-plan')), 40);
        }}
      />
    </div>
  );
}
