import { Line, Text } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import { proposedRoomOverlaps, shapedRoomPoints, snapRoomCenterToNeighbors } from '../../lib/housePlans/buildPlan';
import { PIXELS_PER_METER, snapWallPoint, wallLengthMeters } from '../../lib/geometry/snapping';
import { formatLength } from '../../lib/measurements';
import { usePlannerStore } from '../../store/plannerStore';

const world = (x: number, y: number): [number, number] => [
  (x - WORLD_ORIGIN.x) / PIXELS_PER_METER,
  (y - WORLD_ORIGIN.y) / PIXELS_PER_METER,
];

const planFromWorld = (x: number, z: number) => ({
  x: x * PIXELS_PER_METER + WORLD_ORIGIN.x,
  y: z * PIXELS_PER_METER + WORLD_ORIGIN.y,
});

type DragKind = 'corner' | 'stretch';

type HandleDrag = {
  wallId: string;
  end: 'start' | 'end';
  kind: DragKind;
  last: { x: number; y: number };
  anchor: { x: number; y: number };
  dirX: number;
  dirY: number;
  pointerId: number;
};

/**
 * Top-view plan tools: draw walls, drag corners, and stretch ends along the wall axis.
 * Active in architect mode while camera is top.
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
  const updateWallEndpoint = usePlannerStore((s) => s.updateWallEndpoint);
  const updateWallEndpointLive = usePlannerStore((s) => s.updateWallEndpointLive);
  const selectedWallId = usePlannerStore((s) => s.selectedWallId);
  const selectWall = usePlannerStore((s) => s.selectWall);
  const unit = usePlannerStore((s) => s.unitSystem);
  const { invalidate, gl, camera } = useThree();
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [handleDragging, setHandleDragging] = useState(false);
  const drag = useRef<HandleDrag | null>(null);
  const roomPlace = useRef<{ pointerId: number; active: boolean } | null>(null);
  const dragListeners = useRef<{ move: (e: PointerEvent) => void; end: (e: PointerEvent) => void } | null>(null);
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const dragRaycaster = useMemo(() => new THREE.Raycaster(), []);
  const dragNdc = useMemo(() => new THREE.Vector2(), []);

  const active = studioMode === 'architect' && cameraMode === 'top';
  const wallEdit = active && tool === 'select';
  const placingRoom = active && (!!pendingRoomShape || tool === 'room');
  const drawing = active && (tool === 'wall' || placingRoom);

  useEffect(() => {
    if (!active || tool !== 'wall') setDraftStart(null);
  }, [active, tool, setDraftStart]);

  useEffect(
    () => () => {
      if (dragListeners.current) {
        window.removeEventListener('pointermove', dragListeners.current.move);
        window.removeEventListener('pointerup', dragListeners.current.end);
        window.removeEventListener('pointercancel', dragListeners.current.end);
        dragListeners.current = null;
      }
      if (document.body.dataset.movingFurniture) {
        delete document.body.dataset.movingFurniture;
        window.dispatchEvent(new Event('roomcraft-drag-end'));
      }
    },
    [],
  );

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

  const hitPlanFromClient = (clientX: number, clientY: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    dragNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    dragNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    dragRaycaster.setFromCamera(dragNdc, camera);
    const hit = new THREE.Vector3();
    if (!dragRaycaster.ray.intersectPlane(floorPlane, hit)) return null;
    return planFromWorld(hit.x, hit.z);
  };

  const projectStretch = (raw: { x: number; y: number }, d: HandleDrag) => {
    const vx = raw.x - d.anchor.x;
    const vy = raw.y - d.anchor.y;
    const along = vx * d.dirX + vy * d.dirY;
    const minPx = 0.25 * PIXELS_PER_METER;
    const clamped = Math.max(minPx, along);
    return {
      x: d.anchor.x + d.dirX * clamped,
      y: d.anchor.y + d.dirY * clamped,
    };
  };

  const applyHandleDrag = (raw: { x: number; y: number }) => {
    if (!drag.current) return;
    let next = raw;
    if (drag.current.kind === 'stretch') {
      next = projectStretch(raw, drag.current);
    } else {
      next = snapWallPoint(raw, usePlannerStore.getState().walls, drag.current.wallId);
    }
    drag.current.last = next;
    updateWallEndpointLive(drag.current.wallId, drag.current.end, next);
    setCursor(next);
    invalidate();
  };

  const onFloorPointerMove = (e: any) => {
    if (!drawing && !drag.current && !placingRoom) return;
    e.stopPropagation();
    const raw = hitPlan(e);
    if (!raw) return;
    if (drag.current) {
      applyHandleDrag(raw);
      return;
    }
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
      // Keep shape tool armed so the user can drag beside existing rooms.
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

  const clearDragListeners = () => {
    if (!dragListeners.current) return;
    window.removeEventListener('pointermove', dragListeners.current.move);
    window.removeEventListener('pointerup', dragListeners.current.end);
    window.removeEventListener('pointercancel', dragListeners.current.end);
    dragListeners.current = null;
  };

  const endHandleDrag = (e?: PointerEvent | { pointerId?: number; stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (!drag.current && !dragListeners.current) return;
    if (e && 'pointerId' in e && drag.current && e.pointerId != null && drag.current.pointerId !== e.pointerId) {
      return;
    }
    clearDragListeners();
    if (drag.current) {
      updateWallEndpoint(drag.current.wallId, drag.current.end, drag.current.last);
      selectWall(drag.current.wallId);
    }
    const pointerId = drag.current?.pointerId ?? e?.pointerId;
    drag.current = null;
    setHandleDragging(false);
    delete document.body.dataset.movingFurniture;
    window.dispatchEvent(new Event('roomcraft-drag-end'));
    if (pointerId != null) {
      try {
        gl.domElement.releasePointerCapture?.(pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  const beginHandleDrag = (
    e: any,
    wallId: string,
    end: 'start' | 'end',
    kind: DragKind,
    point: { x: number; y: number },
    anchor: { x: number; y: number },
    dirX: number,
    dirY: number,
  ) => {
    e.stopPropagation();
    // Finish any stuck drag so orbit/pan cannot stay locked.
    if (drag.current) endHandleDrag();
    drag.current = { wallId, end, kind, last: { ...point }, anchor, dirX, dirY, pointerId: e.pointerId };
    setHandleDragging(true);
    document.body.dataset.movingFurniture = 'true';
    window.dispatchEvent(new Event('roomcraft-drag-start'));

    const onMove = (ev: PointerEvent) => {
      if (!drag.current || ev.pointerId !== drag.current.pointerId) return;
      const raw = hitPlanFromClient(ev.clientX, ev.clientY);
      if (!raw) return;
      applyHandleDrag(raw);
    };
    const onEnd = (ev: PointerEvent) => endHandleDrag(ev);
    clearDragListeners();
    dragListeners.current = { move: onMove, end: onEnd };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);

    try {
      gl.domElement.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
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
        const dirX = (ex - sx) / len;
        const dirZ = (ez - sz) / len;
        const midX = (sx + ex) / 2;
        const midZ = (sz + ez) / 2;
        const angle = -Math.atan2(ez - sz, ex - sx);
        return { sx, sz, ex, ez, len, dirX, dirZ, midX, midZ, angle };
      })()
    : null;

  return (
    <group>
      {/* Pick plane only while drawing / placing / actively dragging handles — not while selecting walls. */}
      {(drawing || placingRoom || handleDragging) && (
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
          {/* Selected wall highlight stripe */}
          <mesh position={[selectedFrame.midX, 0.04, selectedFrame.midZ]} rotation={[-Math.PI / 2, 0, selectedFrame.angle]} raycast={() => {}}>
            <planeGeometry args={[selectedFrame.len, Math.max(0.18, (selected.thickness || 0.15) + 0.08)]} />
            <meshBasicMaterial color="#0058a3" transparent opacity={0.22} depthWrite={false} />
          </mesh>

          <Text
            position={[selectedFrame.midX, 0.28, selectedFrame.midZ]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.22}
            color="#0058a3"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#ffffff"
          >
            {formatLength(selectedLen, unit)}
          </Text>

          {(['start', 'end'] as const).map((end) => {
            const p = selected[end];
            const [x, z] = world(p.x, p.y);
            const other = end === 'start' ? selected.end : selected.start;
            const dx = p.x - other.x;
            const dy = p.y - other.y;
            const len = Math.hypot(dx, dy) || 1;
            const dirX = dx / len;
            const dirY = dy / len;
            // Stretch handle sits just beyond the end along the wall axis.
            const stretchPlan = {
              x: p.x + dirX * 0.35 * PIXELS_PER_METER,
              y: p.y + dirY * 0.35 * PIXELS_PER_METER,
            };
            const [stretchX, stretchZ] = world(stretchPlan.x, stretchPlan.y);
            const angle = -Math.atan2(dirY, dirX);
            return (
              <group key={end}>
                {/* Corner joint handle — free move with snap */}
                <mesh
                  position={[x, 0.14, z]}
                  onPointerDown={(e) => beginHandleDrag(e, selected.id, end, 'corner', p, other, dirX, dirY)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <sphereGeometry args={[0.18, 20, 20]} />
                  <meshStandardMaterial color="#0058a3" emissive="#003d70" emissiveIntensity={0.35} />
                </mesh>
                {/* Axis stretch handle — drag along wall to lengthen/shorten */}
                <mesh
                  position={[stretchX, 0.14, stretchZ]}
                  rotation={[0, angle, 0]}
                  onPointerDown={(e) => beginHandleDrag(e, selected.id, end, 'stretch', p, other, dirX, dirY)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <boxGeometry args={[0.32, 0.12, 0.18]} />
                  <meshStandardMaterial color="#111820" emissive="#0058a3" emissiveIntensity={0.25} />
                </mesh>
              </group>
            );
          })}
        </group>
      )}
    </group>
  );
}
