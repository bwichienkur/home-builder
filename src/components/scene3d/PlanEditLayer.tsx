import { Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import * as THREE from 'three';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import { detectRoomPolygons } from '../../lib/geometry/rooms';
import {
  defaultWallGrowSide,
  wallDimFieldLayout,
  wallExteriorSide,
  type WallGrowSide,
} from '../../lib/geometry/roomWalls';
import { proposedRoomOverlaps, shapedRoomPoints, snapRoomCenterToNeighbors } from '../../lib/housePlans/buildPlan';
import { PIXELS_PER_METER, wallLengthMeters } from '../../lib/geometry/snapping';
import { formatLength, parseLength } from '../../lib/measurements';
import { usePlannerStore } from '../../store/plannerStore';
import type { PlanRoomLabel } from '../../types';

const world = (x: number, y: number): [number, number] => [
  (x - WORLD_ORIGIN.x) / PIXELS_PER_METER,
  (y - WORLD_ORIGIN.y) / PIXELS_PER_METER,
];

const planFromWorld = (x: number, z: number) => ({
  x: x * PIXELS_PER_METER + WORLD_ORIGIN.x,
  y: z * PIXELS_PER_METER + WORLD_ORIGIN.y,
});

/**
 * Top-view plan tools: place rooms and edit wall length via an on-plan input.
 * Freehand wall drawing is disabled — rooms come from Add room shapes.
 */
export function PlanEditLayer() {
  const tool = usePlannerStore((s) => s.tool);
  const studioMode = usePlannerStore((s) => s.studioMode);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const walls = usePlannerStore((s) => s.walls);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const setDraftStart = usePlannerStore((s) => s.setDraftStart);
  const placePlanRoom = usePlannerStore((s) => s.placePlanRoom);
  const pendingRoomShape = usePlannerStore((s) => s.pendingRoomShape);
  const setPendingRoomShape = usePlannerStore((s) => s.setPendingRoomShape);
  const selectedWallId = usePlannerStore((s) => s.selectedWallId);
  const setWallLength = usePlannerStore((s) => s.setWallLength);
  const updateWall = usePlannerStore((s) => s.updateWall);
  const unit = usePlannerStore((s) => s.unitSystem);
  const { invalidate, gl } = useThree();
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [growSide, setGrowSide] = useState<WallGrowSide>('right');
  const roomPlace = useRef<{ pointerId: number; active: boolean } | null>(null);
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const active = studioMode === 'architect' && cameraMode === 'top';
  const wallEdit = active && tool === 'select';
  const placingRoom = active && (!!pendingRoomShape || tool === 'room');

  useEffect(() => {
    // Freehand wall drawing removed — clear any leftover draft.
    setDraftStart(null);
  }, [active, tool, setDraftStart]);

  const selected = walls.find((w) => w.id === selectedWallId);

  useEffect(() => {
    if (selected) setGrowSide(defaultWallGrowSide(selected));
  }, [selected?.id]);

  const shapeKind = pendingRoomShape ?? 'rectangle';
  const ghostOverlaps = useMemo(() => {
    if (!placingRoom || !cursor) return false;
    const snapped = snapRoomCenterToNeighbors(cursor, shapeKind, planRooms);
    return proposedRoomOverlaps(snapped, shapeKind, planRooms);
  }, [placingRoom, cursor, shapeKind, planRooms]);
  const ghostPoints = useMemo(() => {
    if (!placingRoom || !cursor) return null;
    const snapped = snapRoomCenterToNeighbors(cursor, shapeKind, planRooms);
    const pts = shapedRoomPoints(shapeKind, snapped);
    const loop = [...pts, pts[0]!];
    return loop.map((p) => [world(p.x, p.y)[0], 0.1, world(p.x, p.y)[1]] as [number, number, number]);
  }, [placingRoom, cursor, shapeKind, planRooms]);
  const roomsForExterior = useMemo((): PlanRoomLabel[] => {
    if (planRooms.length) return planRooms;
    return detectRoomPolygons(walls).map((points, i) => ({
      id: `detected-${i}`,
      name: `Room ${i + 1}`,
      roomType: 'Living room' as const,
      points,
    }));
  }, [planRooms, walls]);

  if (!active) return null;

  const hitPlan = (e: any) => {
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(floorPlane, hit)) return null;
    return planFromWorld(hit.x, hit.z);
  };

  const onFloorPointerMove = (e: any) => {
    if (!placingRoom) return;
    e.stopPropagation();
    const raw = hitPlan(e);
    if (!raw) return;
    const snapped = snapRoomCenterToNeighbors(raw, shapeKind, planRooms);
    setCursor(snapped);
    invalidate();
  };

  const onFloorPointerDown = (e: any) => {
    if (!placingRoom) return;
    e.stopPropagation();
    const raw = hitPlan(e);
    if (!raw) return;
    roomPlace.current = { pointerId: e.pointerId, active: true };
    const snapped = snapRoomCenterToNeighbors(raw, shapeKind, planRooms);
    setCursor(snapped);
    document.body.dataset.movingFurniture = 'true';
    window.dispatchEvent(new Event('roomcraft-drag-start'));
    try {
      gl.domElement.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onFloorPointerUp = (e: any) => {
    if (!roomPlace.current || roomPlace.current.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const raw = hitPlan(e) ?? cursor;
    roomPlace.current = null;
    delete document.body.dataset.movingFurniture;
    window.dispatchEvent(new Event('roomcraft-drag-end'));
    try {
      gl.domElement.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!raw) {
      setPendingRoomShape(null);
      return;
    }
    const snapped = snapRoomCenterToNeighbors(raw, shapeKind, planRooms);
    if (proposedRoomOverlaps(snapped, shapeKind, planRooms)) {
      setCursor(snapped);
      return;
    }
    placePlanRoom(snapped, shapeKind);
    setCursor(null);
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
    }, 40);
  };

  const selectedLen = selected ? wallLengthMeters(selected.start, selected.end) : 0;

  const selectedFrame = selected
    ? (() => {
        const [sx, sz] = world(selected.start.x, selected.start.y);
        const [ex, ez] = world(selected.end.x, selected.end.y);
        const len = Math.hypot(ex - sx, ez - sz) || 1;
        const midX = (sx + ex) / 2;
        const midZ = (sz + ez) / 2;
        const angle = -Math.atan2(ez - sz, ex - sx);
        const side = wallExteriorSide(selected, roomsForExterior);
        const layout = wallDimFieldLayout(selected, side);
        const { nx, ny: nz, cardOffsetM, placement, verticalOnPlan } = layout;
        const s = layout.side;
        // Card *center* in world meters fully past the exterior face (Html `center`).
        // CSS translate is a backup nudge in the same exterior direction.
        return {
          len,
          midX,
          midZ,
          angle,
          placement,
          verticalOnPlan,
          cardPos: [midX + nx * s * cardOffsetM, 0.12, midZ + nz * s * cardOffsetM] as [number, number, number],
        };
      })()
    : null;

  return (
    <group>
      {placingRoom && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.01, 0]}
          onPointerMove={onFloorPointerMove}
          onPointerDown={onFloorPointerDown}
          onPointerUp={onFloorPointerUp}
          onPointerCancel={onFloorPointerUp}
        >
          <planeGeometry args={[120, 120]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {ghostPoints && (
        <Line
          points={ghostPoints}
          color={ghostOverlaps ? '#b42318' : '#0058a3'}
          lineWidth={3}
          dashed
          dashSize={0.2}
          gapSize={0.12}
        />
      )}

      {wallEdit && selected && selectedFrame && (
        <group>
          <mesh position={[selectedFrame.midX, 0.04, selectedFrame.midZ]} rotation={[-Math.PI / 2, 0, selectedFrame.angle]} raycast={() => {}}>
            <planeGeometry args={[selectedFrame.len, Math.max(0.18, (selected.thickness || 0.15) + 0.08)]} />
            <meshBasicMaterial color="#0058a3" transparent opacity={0.2} depthWrite={false} />
          </mesh>

          <Html position={selectedFrame.cardPos} center zIndexRange={[120, 60]} style={{ pointerEvents: 'auto' }}>
            <div
              className={`wall-dim-card wall-dim-card--${selectedFrame.placement}`}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="wall-dim-card-grow" role="group" aria-label="Which side to resize">
                {selectedFrame.verticalOnPlan ? (
                  <>
                    <button
                      type="button"
                      className={growSide === 'up' ? 'is-active' : ''}
                      aria-pressed={growSide === 'up'}
                      title="Change the top end · keep bottom fixed"
                      onClick={() => setGrowSide('up')}
                    >
                      <ArrowUp size={14} />
                      <span>Up</span>
                    </button>
                    <button
                      type="button"
                      className={growSide === 'down' ? 'is-active' : ''}
                      aria-pressed={growSide === 'down'}
                      title="Change the bottom end · keep top fixed"
                      onClick={() => setGrowSide('down')}
                    >
                      <ArrowDown size={14} />
                      <span>Down</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={growSide === 'left' ? 'is-active' : ''}
                      aria-pressed={growSide === 'left'}
                      title="Change the left end · keep right fixed"
                      onClick={() => setGrowSide('left')}
                    >
                      <ArrowLeft size={14} />
                      <span>Left</span>
                    </button>
                    <button
                      type="button"
                      className={growSide === 'right' ? 'is-active' : ''}
                      aria-pressed={growSide === 'right'}
                      title="Change the right end · keep left fixed"
                      onClick={() => setGrowSide('right')}
                    >
                      <ArrowRight size={14} />
                      <span>Right</span>
                    </button>
                  </>
                )}
              </div>
              <div className="wall-dim-card-fields">
                <WallDimField
                  key={`L-${selected.id}-${unit}-${selectedLen.toFixed(3)}-${growSide}`}
                  label="L"
                  ariaLabel="Wall length"
                  valueM={selectedLen}
                  unit={unit}
                  min={0.25}
                  onChange={(meters) => setWallLength(selected.id, meters, growSide)}
                />
                <WallDimField
                  key={`W-${selected.id}-${unit}-${selected.thickness.toFixed(3)}`}
                  label="W"
                  ariaLabel="Wall width"
                  valueM={selected.thickness}
                  unit={unit}
                  min={0.05}
                  onChange={(meters) => updateWall(selected.id, { thickness: meters })}
                />
                <WallDimField
                  key={`H-${selected.id}-${unit}-${selected.height.toFixed(3)}`}
                  label="H"
                  ariaLabel="Wall height"
                  valueM={selected.height}
                  unit={unit}
                  min={2}
                  onChange={(meters) => updateWall(selected.id, { height: meters })}
                />
              </div>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

function WallDimField({
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
