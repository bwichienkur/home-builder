import { Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import * as THREE from 'three';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import {
  attachSideBlocked,
  attachSquareRoomPoints,
  planRoomSizeFeet,
  proposedRoomOverlaps,
  shapedRoomPoints,
  snapRoomCenterToNeighbors,
  type AttachSide,
} from '../../lib/housePlans/buildPlan';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';
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

const ATTACH_SIDES: { side: AttachSide; label: string; Icon: typeof ArrowLeft }[] = [
  { side: 'left', label: 'Left', Icon: ArrowLeft },
  { side: 'right', label: 'Right', Icon: ArrowRight },
  { side: 'top', label: 'Above', Icon: ArrowUp },
  { side: 'bottom', label: 'Below', Icon: ArrowDown },
];

/**
 * Top-view plan tools: attach rooms beside a host, drag polygon corners for
 * angled rooms, and room width/depth card when the Walls tool is armed.
 */
export function PlanEditLayer() {
  const tool = usePlannerStore((s) => s.tool);
  const studioMode = usePlannerStore((s) => s.studioMode);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const setDraftStart = usePlannerStore((s) => s.setDraftStart);
  const placePlanRoom = usePlannerStore((s) => s.placePlanRoom);
  const attachPlanRoom = usePlannerStore((s) => s.attachPlanRoom);
  const resizePlanRoom = usePlannerStore((s) => s.resizePlanRoom);
  const setCeilingHeight = usePlannerStore((s) => s.setCeilingHeight);
  const movePlanRoomVertex = usePlannerStore((s) => s.movePlanRoomVertex);
  const commitPlanRoomVertex = usePlannerStore((s) => s.commitPlanRoomVertex);
  const insertPlanRoomVertex = usePlannerStore((s) => s.insertPlanRoomVertex);
  const pendingRoomShape = usePlannerStore((s) => s.pendingRoomShape);
  const pendingAttachMode = usePlannerStore((s) => s.pendingAttachMode);
  const planWallTool = usePlannerStore((s) => s.planWallTool);
  const setPendingRoomShape = usePlannerStore((s) => s.setPendingRoomShape);
  const unit = usePlannerStore((s) => s.unitSystem);
  const walls = usePlannerStore((s) => s.walls);
  const { invalidate } = useThree();
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const roomPlace = useRef<{ pointerId: number; active: boolean } | null>(null);
  const vertexDrag = useRef<{ roomId: string; index: number; pointerId: number } | null>(null);
  const [vertexDragging, setVertexDragging] = useState(false);
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const active = studioMode === 'architect' && cameraMode === 'top';
  const placingRoom = active && (!!pendingRoomShape || tool === 'room');
  const hostRoom = planRooms.find((r) => r.id === selectedRoomId) ?? null;
  const showAttachSides = active && pendingAttachMode && !!hostRoom;
  const showVertices = active && !!hostRoom && !placingRoom && !pendingAttachMode;
  const dimRoom = active && planWallTool && !pendingAttachMode ? hostRoom : null;
  const ceiling = walls[0]?.height ?? 2.7;

  useEffect(() => {
    setDraftStart(null);
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

  const attachPreviews = useMemo(() => {
    if (!hostRoom) return [];
    return ATTACH_SIDES.map(({ side, label, Icon }) => {
      const blocked = attachSideBlocked(hostRoom.id, side, planRooms);
      const pts = attachSquareRoomPoints(hostRoom.points, side);
      const loop = [...pts, pts[0]!];
      const line = loop.map((p) => [world(p.x, p.y)[0], 0.12, world(p.x, p.y)[1]] as [number, number, number]);
      const xs = pts.map((p) => world(p.x, p.y)[0]);
      const zs = pts.map((p) => world(p.x, p.y)[1]);
      const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
      const midZ = (Math.min(...zs) + Math.max(...zs)) / 2;
      return { side, label, Icon, blocked, line, midX, midZ };
    });
  }, [hostRoom, planRooms]);

  const dimCard = useMemo(() => {
    if (!dimRoom || dimRoom.points.length < 3) return null;
    const xs = dimRoom.points.map((p) => world(p.x, p.y)[0]);
    const zs = dimRoom.points.map((p) => world(p.x, p.y)[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const midZ = (minZ + maxZ) / 2;
    const size = planRoomSizeFeet(dimRoom.points);
    // Park the card in free space to the right of the room.
    return {
      pos: [maxX + 1.85, 0.14, midZ] as [number, number, number],
      placement: 'right' as const,
      widthM: size.widthFt * 0.3048,
      depthM: size.depthFt * 0.3048,
      widthFt: size.widthFt,
      depthFt: size.depthFt,
    };
  }, [dimRoom]);

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
      (e.target as any).setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onFloorPointerUp = (e: any) => {
    if (!placingRoom || !roomPlace.current?.active) return;
    e.stopPropagation();
    const raw = hitPlan(e) ?? cursor;
    roomPlace.current = null;
    delete document.body.dataset.movingFurniture;
    window.dispatchEvent(new Event('roomcraft-drag-end'));
    if (!raw) return;
    const snapped = snapRoomCenterToNeighbors(raw, shapeKind, planRooms);
    if (proposedRoomOverlaps(snapped, shapeKind, planRooms)) return;
    placePlanRoom(snapped, shapeKind);
    setPendingRoomShape(null);
    setCursor(null);
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
    }, 40);
  };

  const endVertexDrag = () => {
    if (!vertexDrag.current) return;
    vertexDrag.current = null;
    setVertexDragging(false);
    commitPlanRoomVertex();
    delete document.body.dataset.movingFurniture;
    window.dispatchEvent(new Event('roomcraft-drag-end'));
    window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-fit-plan')), 40);
  };

  const onVertexPointerDown = (e: any, roomId: string, index: number) => {
    e.stopPropagation();
    vertexDrag.current = { roomId, index, pointerId: e.pointerId };
    setVertexDragging(true);
    document.body.dataset.movingFurniture = 'true';
    window.dispatchEvent(new Event('roomcraft-drag-start'));
    try {
      (e.target as any).setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onVertexPointerMove = (e: any) => {
    const drag = vertexDrag.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const pt = hitPlan(e);
    if (!pt) return;
    movePlanRoomVertex(drag.roomId, drag.index, pt, { live: true });
    invalidate();
  };

  const onVertexPointerUp = (e: any) => {
    const drag = vertexDrag.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const pt = hitPlan(e);
    if (pt) movePlanRoomVertex(drag.roomId, drag.index, pt, { live: false });
    endVertexDrag();
  };

  return (
    <group>
      {(placingRoom || vertexDragging) && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.01, 0]}
          onPointerMove={placingRoom ? onFloorPointerMove : onVertexPointerMove}
          onPointerDown={placingRoom ? onFloorPointerDown : undefined}
          onPointerUp={placingRoom ? onFloorPointerUp : onVertexPointerUp}
          onPointerCancel={placingRoom ? onFloorPointerUp : onVertexPointerUp}
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

      {showAttachSides &&
        attachPreviews.map(({ side, label, Icon, blocked, line, midX, midZ }) => (
          <group key={side}>
            <Line
              points={line}
              color={blocked ? '#9aa3ad' : '#0058a3'}
              lineWidth={2}
              dashed
              dashSize={0.16}
              gapSize={0.1}
            />
            <Html position={[midX, 0.2, midZ]} center zIndexRange={[130, 80]} style={{ pointerEvents: 'auto' }}>
              <button
                type="button"
                className={`plan-attach-side${blocked ? ' is-blocked' : ''}`}
                disabled={blocked}
                aria-label={`Add room ${label.toLowerCase()}`}
                title={blocked ? 'Blocked' : `Add square room ${label.toLowerCase()}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (blocked || !hostRoom) return;
                  attachPlanRoom(hostRoom.id, side);
                }}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            </Html>
          </group>
        ))}

      {showVertices &&
        hostRoom!.points.map((p, i) => {
          const pos = world(p.x, p.y);
          return (
            <mesh
              key={`v-${hostRoom!.id}-${i}`}
              position={[pos[0], 0.16, pos[1]]}
              onPointerDown={(e) => onVertexPointerDown(e, hostRoom!.id, i)}
              onPointerMove={onVertexPointerMove}
              onPointerUp={onVertexPointerUp}
              onPointerCancel={onVertexPointerUp}
              onDoubleClick={(e) => {
                e.stopPropagation();
                usePlannerStore.getState().removePlanRoomVertex(hostRoom!.id, i);
              }}
            >
              <sphereGeometry args={[0.12, 16, 16]} />
              <meshBasicMaterial color="#0058a3" />
            </mesh>
          );
        })}

      {showVertices &&
        hostRoom!.points.map((p, i) => {
          const next = hostRoom!.points[(i + 1) % hostRoom!.points.length]!;
          const mid = { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 };
          const pos = world(mid.x, mid.y);
          return (
            <mesh
              key={`e-${hostRoom!.id}-${i}`}
              position={[pos[0], 0.14, pos[1]]}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                insertPlanRoomVertex(hostRoom!.id, i);
              }}
            >
              <boxGeometry args={[0.14, 0.04, 0.14]} />
              <meshBasicMaterial color="#7eb6e8" />
            </mesh>
          );
        })}

      {dimRoom && dimCard && (
        <Html position={dimCard.pos} center zIndexRange={[120, 60]} style={{ pointerEvents: 'auto' }}>
          <div
            className={`wall-dim-card wall-dim-card--${dimCard.placement}`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="wall-dim-card-fields">
              <RoomDimField
                key={`W-${dimRoom.id}-${unit}-${dimCard.widthM.toFixed(3)}`}
                label="W"
                ariaLabel="Room width"
                valueM={dimCard.widthM}
                unit={unit}
                min={1}
                onChange={(meters) => {
                  resizePlanRoom(dimRoom.id, meters / 0.3048, dimCard.depthFt);
                  window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-fit-plan')), 40);
                }}
              />
              <RoomDimField
                key={`D-${dimRoom.id}-${unit}-${dimCard.depthM.toFixed(3)}`}
                label="D"
                ariaLabel="Room depth"
                valueM={dimCard.depthM}
                unit={unit}
                min={1}
                onChange={(meters) => {
                  resizePlanRoom(dimRoom.id, dimCard.widthFt, meters / 0.3048);
                  window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-fit-plan')), 40);
                }}
              />
              <RoomDimField
                key={`H-${dimRoom.id}-${unit}-${ceiling.toFixed(3)}`}
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
          </div>
        </Html>
      )}
    </group>
  );
}

function RoomDimField({
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
