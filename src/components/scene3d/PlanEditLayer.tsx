import { Html, Line, Text } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import * as THREE from 'three';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import { proposedRoomOverlaps, shapedRoomPoints, snapRoomCenterToNeighbors } from '../../lib/housePlans/buildPlan';
import { PIXELS_PER_METER, snapWallPoint, wallLengthMeters } from '../../lib/geometry/snapping';
import { formatLength, parseLength } from '../../lib/measurements';
import { usePlannerStore } from '../../store/plannerStore';

const world = (x: number, y: number): [number, number] => [
  (x - WORLD_ORIGIN.x) / PIXELS_PER_METER,
  (y - WORLD_ORIGIN.y) / PIXELS_PER_METER,
];

const planFromWorld = (x: number, z: number) => ({
  x: x * PIXELS_PER_METER + WORLD_ORIGIN.x,
  y: z * PIXELS_PER_METER + WORLD_ORIGIN.y,
});

/**
 * Top-view plan tools: draw walls / place rooms, and edit wall length via an on-plan input.
 * Wall end-handle dragging is intentionally disabled (unreliable on mobile).
 */
export function PlanEditLayer() {
  const tool = usePlannerStore((s) => s.tool);
  const studioMode = usePlannerStore((s) => s.studioMode);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const walls = usePlannerStore((s) => s.walls);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const draftStart = usePlannerStore((s) => s.draftStart);
  const setDraftStart = usePlannerStore((s) => s.setDraftStart);
  const addWall = usePlannerStore((s) => s.addWall);
  const placePlanRoom = usePlannerStore((s) => s.placePlanRoom);
  const pendingRoomShape = usePlannerStore((s) => s.pendingRoomShape);
  const setPendingRoomShape = usePlannerStore((s) => s.setPendingRoomShape);
  const selectedWallId = usePlannerStore((s) => s.selectedWallId);
  const selectWall = usePlannerStore((s) => s.selectWall);
  const setWallLength = usePlannerStore((s) => s.setWallLength);
  const updateWall = usePlannerStore((s) => s.updateWall);
  const unit = usePlannerStore((s) => s.unitSystem);
  const { invalidate, gl } = useThree();
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const roomPlace = useRef<{ pointerId: number; active: boolean } | null>(null);
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const active = studioMode === 'architect' && cameraMode === 'top';
  const wallEdit = active && tool === 'select';
  const placingRoom = active && (!!pendingRoomShape || tool === 'room');
  const drawing = active && (tool === 'wall' || placingRoom);

  useEffect(() => {
    if (!active || tool !== 'wall') setDraftStart(null);
  }, [active, tool, setDraftStart]);

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

  if (!active) return null;

  const hitPlan = (e: any) => {
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(floorPlane, hit)) return null;
    return planFromWorld(hit.x, hit.z);
  };

  const onFloorPointerMove = (e: any) => {
    if (!drawing && !placingRoom) return;
    e.stopPropagation();
    const raw = hitPlan(e);
    if (!raw) return;
    if (placingRoom) {
      const snapped = snapRoomCenterToNeighbors(raw, shapeKind, planRooms);
      setCursor(snapped);
      invalidate();
      return;
    }
    const snapped = snapWallPoint(raw, walls);
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

  const onFloorClick = (e: any) => {
    if (!drawing || placingRoom) return;
    e.stopPropagation();
    const raw = hitPlan(e);
    if (!raw) return;
    const snapped = snapWallPoint(raw, walls);
    if (!draftStart) {
      setDraftStart(snapped);
      setCursor(snapped);
    } else {
      addWall(draftStart, snapped);
      setDraftStart(null);
      setCursor(null);
    }
    invalidate();
  };

  const selected = walls.find((w) => w.id === selectedWallId);
  const draftLine =
    draftStart && cursor
      ? ([
          [world(draftStart.x, draftStart.y)[0], 0.08, world(draftStart.x, draftStart.y)[1]],
          [world(cursor.x, cursor.y)[0], 0.08, world(cursor.x, cursor.y)[1]],
        ] as [number, number, number][])
      : null;

  const selectedLen = selected ? wallLengthMeters(selected.start, selected.end) : 0;
  const selectedFrame = selected
    ? (() => {
        const [sx, sz] = world(selected.start.x, selected.start.y);
        const [ex, ez] = world(selected.end.x, selected.end.y);
        const len = Math.hypot(ex - sx, ez - sz) || 1;
        const midX = (sx + ex) / 2;
        const midZ = (sz + ez) / 2;
        const angle = -Math.atan2(ez - sz, ex - sx);
        return { sx, sz, ex, ez, len, midX, midZ, angle };
      })()
    : null;

  return (
    <group>
      {(drawing || placingRoom) && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.01, 0]}
          onPointerMove={onFloorPointerMove}
          onPointerDown={placingRoom ? onFloorPointerDown : undefined}
          onPointerUp={placingRoom ? onFloorPointerUp : undefined}
          onPointerCancel={placingRoom ? onFloorPointerUp : undefined}
          onClick={drawing && !placingRoom ? onFloorClick : undefined}
          onPointerMissed={() => {
            if (tool === 'wall') setDraftStart(null);
          }}
        >
          <planeGeometry args={[120, 120]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {draftLine && <Line points={draftLine} color="#0058a3" lineWidth={3} dashed dashSize={0.18} gapSize={0.1} />}
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
            <meshBasicMaterial color="#0058a3" transparent opacity={0.22} depthWrite={false} />
          </mesh>

          <Text
            position={[selectedFrame.midX, 0.22, selectedFrame.midZ]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.18}
            color="#0058a3"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.018}
            outlineColor="#ffffff"
          >
            {formatLength(selectedLen, unit)}
          </Text>

          <Html position={[selectedFrame.midX, 0.05, selectedFrame.midZ]} center zIndexRange={[40, 0]} style={{ pointerEvents: 'auto' }}>
            <WallDimChip
              key={`${selected.id}-${unit}-${selectedLen.toFixed(3)}-${selected.thickness.toFixed(3)}-${selected.height.toFixed(3)}`}
              lengthM={selectedLen}
              thicknessM={selected.thickness}
              heightM={selected.height}
              unit={unit}
              onLength={(meters) => setWallLength(selected.id, meters)}
              onThickness={(meters) => updateWall(selected.id, { thickness: meters })}
              onHeight={(meters) => updateWall(selected.id, { height: meters })}
              onClose={() => selectWall(null)}
            />
          </Html>
        </group>
      )}
    </group>
  );
}

function WallDimChip({
  lengthM,
  thicknessM,
  heightM,
  unit,
  onLength,
  onThickness,
  onHeight,
  onClose,
}: {
  lengthM: number;
  thicknessM: number;
  heightM: number;
  unit: 'metric' | 'imperial';
  onLength: (meters: number) => void;
  onThickness: (meters: number) => void;
  onHeight: (meters: number) => void;
  onClose: () => void;
}) {
  const lengthRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = window.setTimeout(() => lengthRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, []);

  const commit = (raw: string, min: number, apply: (m: number) => void) => {
    const parsed = parseLength(raw, unit);
    if (parsed == null) return;
    apply(Math.max(min, parsed));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (lengthRef.current) commit(lengthRef.current.value, 0.25, onLength);
  };

  return (
    <form className="wall-dim-chip" onSubmit={onSubmit} onPointerDown={(e) => e.stopPropagation()}>
      <div className="wall-dim-chip-head">
        <strong>Wall</strong>
        <button type="button" aria-label="Deselect wall" onClick={onClose}>
          ×
        </button>
      </div>
      <label className="wall-dim-chip-primary">
        <span>Length</span>
        <input
          ref={lengthRef}
          type="text"
          inputMode="decimal"
          defaultValue={unit === 'metric' ? lengthM.toFixed(2) : formatLength(lengthM, unit)}
          onBlur={(e) => commit(e.target.value, 0.25, onLength)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <em>{unit === 'metric' ? 'm' : 'ft/in'}</em>
      </label>
      <div className="wall-dim-chip-row">
        <label>
          <span>Width</span>
          <input
            type="text"
            inputMode="decimal"
            defaultValue={unit === 'metric' ? thicknessM.toFixed(2) : formatLength(thicknessM, unit)}
            onBlur={(e) => commit(e.target.value, 0.05, onThickness)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        </label>
        <label>
          <span>Height</span>
          <input
            type="text"
            inputMode="decimal"
            defaultValue={unit === 'metric' ? heightM.toFixed(2) : formatLength(heightM, unit)}
            onBlur={(e) => commit(e.target.value, 2, onHeight)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        </label>
      </div>
    </form>
  );
}
