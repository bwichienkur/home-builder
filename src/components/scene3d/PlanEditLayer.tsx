import { Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
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

const ATTACH_SIDES: { side: AttachSide; label: string; Icon: typeof ArrowLeft }[] = [
  { side: 'left', label: 'Left', Icon: ArrowLeft },
  { side: 'right', label: 'Right', Icon: ArrowRight },
  { side: 'top', label: 'Above', Icon: ArrowUp },
  { side: 'bottom', label: 'Below', Icon: ArrowDown },
];

/**
 * Top-view plan tools: attach rooms beside a host.
 * Per-wall L/W/H dim editing is disabled for now (clashes with wall drag-resize).
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
  const pendingRoomShape = usePlannerStore((s) => s.pendingRoomShape);
  const pendingAttachMode = usePlannerStore((s) => s.pendingAttachMode);
  const setPendingRoomShape = usePlannerStore((s) => s.setPendingRoomShape);
  const { invalidate } = useThree();
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const roomPlace = useRef<{ pointerId: number; active: boolean } | null>(null);
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const active = studioMode === 'architect' && cameraMode === 'top';
  const placingRoom = active && (!!pendingRoomShape || tool === 'room');
  const hostRoom = planRooms.find((r) => r.id === selectedRoomId) ?? null;
  const showAttachSides = active && pendingAttachMode && !!hostRoom;

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
    </group>
  );
}
