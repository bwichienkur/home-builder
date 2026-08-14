import { Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import { PIXELS_PER_METER, snapWallPoint } from '../../lib/geometry/snapping';
import { usePlannerStore } from '../../store/plannerStore';

const world = (x: number, y: number): [number, number] => [
  (x - WORLD_ORIGIN.x) / PIXELS_PER_METER,
  (y - WORLD_ORIGIN.y) / PIXELS_PER_METER,
];

const planFromWorld = (x: number, z: number) => ({
  x: x * PIXELS_PER_METER + WORLD_ORIGIN.x,
  y: z * PIXELS_PER_METER + WORLD_ORIGIN.y,
});

const openProperties = () => window.dispatchEvent(new Event('roomcraft-open-properties'));

/**
 * Top-view plan tools: draw walls (click–click with snap), drag endpoints,
 * and drop square rooms. Active in architect mode while camera is top.
 */
export function PlanEditLayer() {
  const tool = usePlannerStore((s) => s.tool);
  const studioMode = usePlannerStore((s) => s.studioMode);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const walls = usePlannerStore((s) => s.walls);
  const draftStart = usePlannerStore((s) => s.draftStart);
  const setDraftStart = usePlannerStore((s) => s.setDraftStart);
  const addWall = usePlannerStore((s) => s.addWall);
  const addSquareRoom = usePlannerStore((s) => s.addSquareRoom);
  const updateWallEndpoint = usePlannerStore((s) => s.updateWallEndpoint);
  const updateWallEndpointLive = usePlannerStore((s) => s.updateWallEndpointLive);
  const selectedWallId = usePlannerStore((s) => s.selectedWallId);
  const selectWall = usePlannerStore((s) => s.selectWall);
  const { invalidate } = useThree();
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ wallId: string; end: 'start' | 'end'; last: { x: number; y: number } } | null>(null);
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const active = studioMode === 'architect' && cameraMode === 'top';
  const drawing = active && (tool === 'wall' || tool === 'room');

  useEffect(() => {
    if (!active || tool !== 'wall') setDraftStart(null);
  }, [active, tool, setDraftStart]);

  if (!active) return null;

  const hitPlan = (e: any) => {
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(floorPlane, hit)) return null;
    return planFromWorld(hit.x, hit.z);
  };

  const onFloorPointerMove = (e: any) => {
    if (!drawing && !drag.current) return;
    e.stopPropagation();
    const raw = hitPlan(e);
    if (!raw) return;
    if (drag.current) {
      const snapped = snapWallPoint(raw, walls, drag.current.wallId);
      drag.current.last = snapped;
      updateWallEndpointLive(drag.current.wallId, drag.current.end, snapped);
      setCursor(snapped);
      invalidate();
      return;
    }
    const snapped = snapWallPoint(raw, walls);
    setCursor(snapped);
    invalidate();
  };

  const onFloorClick = (e: any) => {
    if (!drawing) return;
    e.stopPropagation();
    const raw = hitPlan(e);
    if (!raw) return;
    const snapped = snapWallPoint(raw, walls);
    if (tool === 'room') {
      const id = addSquareRoom(snapped, 12, 12);
      if (id) {
        const room = usePlannerStore.getState().planRooms.find((r) => r.id === id);
        if (room) {
          const xs = room.points.map((p) => (p.x - WORLD_ORIGIN.x) / PIXELS_PER_METER);
          const zs = room.points.map((p) => (p.y - WORLD_ORIGIN.y) / PIXELS_PER_METER);
          const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 2);
          window.dispatchEvent(
            new CustomEvent('roomcraft-focus-room', {
              detail: {
                x: xs.reduce((a, b) => a + b, 0) / xs.length,
                z: zs.reduce((a, b) => a + b, 0) / zs.length,
                span,
              },
            }),
          );
        }
        openProperties();
      }
      return;
    }
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
  const draftPts =
    draftStart && cursor
      ? ([
          [world(draftStart.x, draftStart.y)[0], 0.08, world(draftStart.x, draftStart.y)[1]],
          [world(cursor.x, cursor.y)[0], 0.08, world(cursor.x, cursor.y)[1]],
        ] as [number, number, number][])
      : null;

  return (
    <group>
      {/* Large pick plane so wall/room tools work outside existing floors */}
      {drawing && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.01, 0]}
          onPointerMove={onFloorPointerMove}
          onClick={onFloorClick}
          onPointerMissed={() => {
            if (tool === 'wall') setDraftStart(null);
          }}
        >
          <planeGeometry args={[120, 120]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {draftPts && <Line points={draftPts} color="#0058a3" lineWidth={3} dashed dashSize={0.18} gapSize={0.1} />}

      {tool === 'select' && selected && (
        <>
          {(['start', 'end'] as const).map((end) => {
            const p = selected[end];
            const [x, z] = world(p.x, p.y);
            return (
              <mesh
                key={end}
                position={[x, 0.12, z]}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  drag.current = { wallId: selected.id, end, last: { ...p } };
                  document.body.dataset.movingFurniture = 'true';
                  window.dispatchEvent(new Event('roomcraft-drag-start'));
                  (e.target as any).setPointerCapture?.(e.pointerId);
                }}
                onPointerMove={onFloorPointerMove}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  if (drag.current) {
                    updateWallEndpoint(drag.current.wallId, drag.current.end, drag.current.last);
                  }
                  drag.current = null;
                  delete document.body.dataset.movingFurniture;
                  window.dispatchEvent(new Event('roomcraft-drag-end'));
                  (e.target as any).releasePointerCapture?.(e.pointerId);
                  selectWall(selected.id);
                  openProperties();
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <sphereGeometry args={[0.14, 16, 16]} />
                <meshStandardMaterial color="#0058a3" emissive="#003d70" emissiveIntensity={0.25} />
              </mesh>
            );
          })}
        </>
      )}
    </group>
  );
}
