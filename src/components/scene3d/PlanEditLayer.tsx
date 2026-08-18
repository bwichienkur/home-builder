import { Html, Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import { enclosureWallsForRoom } from '../../lib/geometry/roomWalls';
import {
  samePlanPoint,
  screenHandleMeters,
  snapVertexDrag,
  vertexDragArmed,
} from '../../lib/geometry/planVertexDrag';
import {
  attachSideBlocked,
  attachSquareRoomPoints,
  proposedRoomOverlaps,
  shapedRoomPoints,
  snapRoomCenterToNeighbors,
  type AttachSide,
} from '../../lib/housePlans/buildPlan';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';
import { usePlannerStore } from '../../store/plannerStore';

const world = (x: number, y: number): [number, number] => [
  (x - WORLD_ORIGIN.x) / PIXELS_PER_METER,
  (y - WORLD_ORIGIN.y) / PIXELS_PER_METER,
];

const planFromWorld = (x: number, z: number) => ({
  x: x * PIXELS_PER_METER + WORLD_ORIGIN.x,
  y: z * PIXELS_PER_METER + WORLD_ORIGIN.y,
});

function cameraZoom(camera: THREE.Camera): number {
  return 'zoom' in camera && typeof (camera as THREE.OrthographicCamera).zoom === 'number'
    ? Math.max((camera as THREE.OrthographicCamera).zoom, 1)
    : 40;
}

function PlanCornerHandle({
  position,
  ...events
}: {
  position: [number, number, number];
  onPointerDown?: (e: any) => void;
  onPointerMove?: (e: any) => void;
  onPointerUp?: (e: any) => void;
  onPointerCancel?: (e: any) => void;
  onDoubleClick?: (e: any) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const world = screenHandleMeters(cameraZoom(camera), 22);
    group.scale.setScalar(world / 0.1);
  });
  return (
    <group ref={ref} position={position}>
      <mesh {...events} renderOrder={12}>
        <ringGeometry args={[0.46, 0.56, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.98} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh {...events} renderOrder={13}>
        <circleGeometry args={[0.36, 32]} />
        <meshBasicMaterial color="#111820" depthTest={false} toneMapped={false} />
      </mesh>
      <mesh {...events} renderOrder={14}>
        <ringGeometry args={[0.3, 0.36, 32]} />
        <meshBasicMaterial color="#0058a3" depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function PlanEdgeHandle({
  position,
  ...events
}: {
  position: [number, number, number];
  onPointerDown?: (e: any) => void;
  onClick?: (e: any) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const world = screenHandleMeters(cameraZoom(camera), 10);
    group.scale.setScalar(world / 0.1);
  });
  return (
    <group ref={ref} position={position}>
      <mesh {...events} renderOrder={12}>
        <boxGeometry args={[0.72, 0.1, 0.16]} />
        <meshBasicMaterial color="#0058a3" transparent opacity={0.92} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

const ATTACH_SIDES: { side: AttachSide; label: string; Icon: typeof ArrowLeft }[] = [
  { side: 'left', label: 'Left', Icon: ArrowLeft },
  { side: 'right', label: 'Right', Icon: ArrowRight },
  { side: 'top', label: 'Above', Icon: ArrowUp },
  { side: 'bottom', label: 'Below', Icon: ArrowDown },
];

/**
 * Top-view plan tools: attach rooms beside a host, drag polygon corners for
 * angled rooms, push/pull walls via edge handles when Walls tool is armed.
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
  const movePlanRoomVertex = usePlannerStore((s) => s.movePlanRoomVertex);
  const commitPlanRoomVertex = usePlannerStore((s) => s.commitPlanRoomVertex);
  const nudgeWall = usePlannerStore((s) => s.nudgeWall);
  const commitWallNudge = usePlannerStore((s) => s.commitWallNudge);
  const selectWall = usePlannerStore((s) => s.selectWall);
  const pendingRoomShape = usePlannerStore((s) => s.pendingRoomShape);
  const pendingAttachMode = usePlannerStore((s) => s.pendingAttachMode);
  const planWallTool = usePlannerStore((s) => s.planWallTool);
  const setPendingRoomShape = usePlannerStore((s) => s.setPendingRoomShape);
  const walls = usePlannerStore((s) => s.walls);
  const { camera, invalidate } = useThree();
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const roomPlace = useRef<{ pointerId: number; active: boolean } | null>(null);
  const vertexDrag = useRef<{
    roomId: string;
    index: number;
    pointerId: number;
    anchor: { x: number; y: number };
    startPointer: { x: number; y: number };
    armed: boolean;
  } | null>(null);
  const wallDrag = useRef<{ wallId: string; pointerId: number; lastX: number; lastZ: number } | null>(null);
  const [vertexDragging, setVertexDragging] = useState(false);
  const [wallDragging, setWallDragging] = useState(false);
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const active = studioMode === 'architect' && cameraMode === 'top';
  const placingRoom = active && (!!pendingRoomShape || tool === 'room');
  const hostRoom = planRooms.find((r) => r.id === selectedRoomId) ?? null;
  const showAttachSides = active && pendingAttachMode && !!hostRoom;
  const showVertices = active && !!hostRoom && !placingRoom && !pendingAttachMode && !planWallTool;
  const showWallHandles = active && !!hostRoom && !placingRoom && !pendingAttachMode && planWallTool;
  const ceiling = walls[0]?.height ?? 2.7;

  const wallHandles = useMemo(() => {
    if (!hostRoom || !showWallHandles) return [];
    const enclosure = enclosureWallsForRoom(hostRoom, walls, ceiling);
    const liveIds = new Set(walls.map((w) => w.id));
    return enclosure
      .map((edge, i) => {
        if (!liveIds.has(edge.id)) return null;
        const mid = {
          x: (edge.start.x + edge.end.x) / 2,
          y: (edge.start.y + edge.end.y) / 2,
        };
        const pos = world(mid.x, mid.y);
        return { wallId: edge.id, edgeIndex: i, pos };
      })
      .filter(Boolean) as { wallId: string; edgeIndex: number; pos: [number, number] }[];
  }, [hostRoom, showWallHandles, walls, ceiling]);

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

  if (!active) return null;

  const hitPlan = (e: any) => {
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(floorPlane, hit)) return null;
    return planFromWorld(hit.x, hit.z);
  };

  const hitWorld = (e: any) => {
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(floorPlane, hit)) return null;
    return { x: hit.x, z: hit.z };
  };

  const endWallDrag = () => {
    if (!wallDrag.current) return;
    wallDrag.current = null;
    setWallDragging(false);
    commitWallNudge();
    delete document.body.dataset.movingFurniture;
    window.dispatchEvent(new Event('roomcraft-drag-end'));
    window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-fit-plan')), 40);
  };

  const onWallPointerDown = (e: any, wallId: string) => {
    e.stopPropagation();
    const w = hitWorld(e);
    if (!w) return;
    wallDrag.current = { wallId, pointerId: e.pointerId, lastX: w.x, lastZ: w.z };
    setWallDragging(true);
    selectWall(wallId);
    document.body.dataset.movingFurniture = 'true';
    window.dispatchEvent(new Event('roomcraft-drag-start'));
    try {
      (e.target as any).setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onWallPointerMove = (e: any) => {
    const drag = wallDrag.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const w = hitWorld(e);
    if (!w) return;
    const dxM = w.x - drag.lastX;
    const dzM = w.z - drag.lastZ;
    drag.lastX = w.x;
    drag.lastZ = w.z;
    if (Math.abs(dxM) < 1e-5 && Math.abs(dzM) < 1e-5) return;
    nudgeWall(drag.wallId, dxM, dzM, { live: true });
    invalidate();
  };

  const onWallPointerUp = (e: any) => {
    const drag = wallDrag.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    onWallPointerMove(e);
    endWallDrag();
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
  };

  const onVertexPointerDown = (e: any, roomId: string, index: number) => {
    e.stopPropagation();
    const room = planRooms.find((r) => r.id === roomId);
    const anchor = room?.points[index] ?? { x: 0, y: 0 };
    const startPointer = hitPlan(e) ?? anchor;
    vertexDrag.current = { roomId, index, pointerId: e.pointerId, anchor, startPointer, armed: false };
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
    const raw = hitPlan(e);
    if (!raw) return;
    const zoom = cameraZoom(camera);
    if (!drag.armed) {
      if (!vertexDragArmed(drag.startPointer, raw, zoom)) return;
      drag.armed = true;
    }
    const room = planRooms.find((r) => r.id === drag.roomId);
    const others = room?.points.filter((_, i) => i !== drag.index) ?? [];
    const pt = snapVertexDrag(
      {
        x: drag.anchor.x + (raw.x - drag.startPointer.x),
        y: drag.anchor.y + (raw.y - drag.startPointer.y),
      },
      others,
      zoom,
    );
    const current = room?.points[drag.index];
    if (current && samePlanPoint(current, pt)) return;
    movePlanRoomVertex(drag.roomId, drag.index, pt, { live: true });
    invalidate();
  };

  const onVertexPointerUp = (e: any) => {
    const drag = vertexDrag.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    if (drag.armed) {
      const raw = hitPlan(e);
      if (raw) {
        const room = planRooms.find((r) => r.id === drag.roomId);
        const others = room?.points.filter((_, i) => i !== drag.index) ?? [];
        const pt = snapVertexDrag(
          {
            x: drag.anchor.x + (raw.x - drag.startPointer.x),
            y: drag.anchor.y + (raw.y - drag.startPointer.y),
          },
          others,
          cameraZoom(camera),
        );
        movePlanRoomVertex(drag.roomId, drag.index, pt, { live: false });
      }
    }
    endVertexDrag();
  };

  return (
    <group>
      {(placingRoom || vertexDragging || wallDragging) && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.01, 0]}
          onPointerMove={
            placingRoom ? onFloorPointerMove : wallDragging ? onWallPointerMove : onVertexPointerMove
          }
          onPointerDown={placingRoom ? onFloorPointerDown : undefined}
          onPointerUp={
            placingRoom ? onFloorPointerUp : wallDragging ? onWallPointerUp : onVertexPointerUp
          }
          onPointerCancel={
            placingRoom ? onFloorPointerUp : wallDragging ? onWallPointerUp : onVertexPointerUp
          }
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
            <PlanCornerHandle
              key={`v-${hostRoom!.id}-${i}`}
              position={[pos[0], 0.16, pos[1]]}
              onPointerDown={(e: any) => onVertexPointerDown(e, hostRoom!.id, i)}
              onPointerMove={onVertexPointerMove}
              onPointerUp={onVertexPointerUp}
              onPointerCancel={onVertexPointerUp}
              onDoubleClick={(e: any) => {
                e.stopPropagation();
                usePlannerStore.getState().removePlanRoomVertex(hostRoom!.id, i);
              }}
            />
          );
        })}

      {showWallHandles &&
        wallHandles.map(({ wallId, edgeIndex, pos }) => (
          <PlanEdgeHandle
            key={`wh-${wallId}-${edgeIndex}`}
            position={[pos[0], 0.15, pos[1]]}
            onPointerDown={(e: any) => onWallPointerDown(e, wallId)}
          />
        ))}
    </group>
  );
}
