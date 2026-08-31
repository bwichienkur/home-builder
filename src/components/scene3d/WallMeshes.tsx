import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox, Text } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import * as THREE from 'three';
import { usePlannerStore } from '../../store/plannerStore';
import type { Opening, Wall } from '../../types';
import { roomFloorCenter, wallFrame, WORLD_ORIGIN } from '../../lib/geometry/placement';
import { enclosureWallsForRoom, planRoomEdgeIndexForWall } from '../../lib/geometry/roomWalls';
import { pickFacingWall, elevationFaceBasis, wallWorldFrame } from '../../lib/geometry/elevationFace';
import { planWallDimAnchor, elevationDimPillAnchors, DIM_FONT_M } from '../../lib/geometry/wallDimPills';
import { splitEdgeEndpoints } from '../../lib/geometry/planCornerGhost';
import { clampOpeningOffset, openingCenterOnWall, wallOffsetFromWorldPoint, wallSolidBoxes } from '../../lib/geometry/wallOpenings';
import { wallCutawayOpacity } from '../../lib/geometry/wallCutaway';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';
import { formatLength } from '../../lib/measurements';
import { world } from './sceneWorld';

function DoorLeaf({
  x,
  z,
  angle,
  width,
  height,
  swing,
  face = 'in',
  shape = 'rect',
}: {
  x: number;
  z: number;
  angle: number;
  width: number;
  height: number;
  swing: 'left' | 'right' | 'none';
  face?: 'in' | 'out';
  shape?: 'rect' | 'arch' | 'wide';
}) {
  // Doors stay closed in the opening; clearance rectangle blocks furniture in front.
  const leafH = shape === 'arch' ? height * 0.92 : height;
  const leafW = width * (shape === 'wide' ? 0.98 : 0.96);
  // Hinge on the swing side of the leaf (local +X = along wall toward end).
  const hingeX = swing === 'left' ? -leafW / 2 : leafW / 2;
  // Face flips which side of the wall the arc / clear box sits on (local +Z ↔ −Z).
  const faceFlip = face === 'out' ? Math.PI : 0;
  const swingStart = swing === 'left' ? 0 : Math.PI / 2;
  const clearDepth = leafW;
  const clearZ = face === 'out' ? -clearDepth / 2 : clearDepth / 2;
  const handleX = swing === 'left' ? leafW * 0.38 : -leafW * 0.38;
  return (
    <group position={[x, 0, z]} rotation={[0, angle, 0]}>
      {/* Plan silhouette — thin 3D leaf is nearly invisible from above; this fills the hole. */}
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
        <planeGeometry args={[leafW, 0.22]} />
        <meshBasicMaterial color="#b8956a" transparent opacity={0.92} depthWrite={false} />
      </mesh>
      {/* Door slab */}
      <mesh position={[0, leafH / 2, 0]} castShadow>
        <boxGeometry args={[leafW, leafH, 0.04]} />
        <meshStandardMaterial color="#c4a574" roughness={0.72} />
      </mesh>
      {/* Raised panel */}
      <mesh position={[0, leafH * 0.55, 0.022]} castShadow>
        <boxGeometry args={[leafW * 0.62, leafH * 0.42, 0.012]} />
        <meshStandardMaterial color="#d2b48a" roughness={0.65} />
      </mesh>
      <mesh position={[0, leafH * 0.22, 0.022]} castShadow>
        <boxGeometry args={[leafW * 0.62, leafH * 0.22, 0.012]} />
        <meshStandardMaterial color="#d2b48a" roughness={0.65} />
      </mesh>
      {/* Handle */}
      <mesh position={[handleX, leafH * 0.45, 0.03]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.09, 12]} />
        <meshStandardMaterial color="#c0c4c6" metalness={0.75} roughness={0.28} />
      </mesh>
      <mesh position={[handleX, leafH * 0.45, 0.055]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.01, 0.01, 0.07, 12]} />
        <meshStandardMaterial color="#c0c4c6" metalness={0.75} roughness={0.28} />
      </mesh>
      {shape === 'arch' && (
        <mesh position={[0, leafH * 0.92, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[width * 0.48, width * 0.48, 0.045, 16, 1, false, 0, Math.PI]} />
          <meshStandardMaterial color="#c4a574" roughness={0.7} />
        </mesh>
      )}
      {swing !== 'none' && (
        <>
          {/* Blocked clear space: door-width × door-width into the room (hinge-independent). */}
          <mesh position={[0, 0.014, clearZ]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
            <planeGeometry args={[leafW, clearDepth]} />
            <meshBasicMaterial color="#0058a3" transparent opacity={0.14} depthWrite={false} />
          </mesh>
          <mesh position={[hingeX, 0.012, 0]} rotation={[-Math.PI / 2, faceFlip, 0]} raycast={() => {}}>
            <ringGeometry args={[0.02, leafW, 28, 1, swingStart, Math.PI / 2]} />
            <meshBasicMaterial color="#0058a3" transparent opacity={0.12} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
    </group>
  );
}

/** Drag openings along their host wall in top + 3D views. */
function OpeningDragHandle({
  opening,
  wall,
  x,
  z,
  angle,
  selected,
}: {
  opening: Opening;
  wall: Wall;
  x: number;
  z: number;
  angle: number;
  selected: boolean;
}) {
  const selectOpening = usePlannerStore((s) => s.selectOpening);
  const updateLive = usePlannerStore((s) => s.updateOpeningLive);
  const updateOpening = usePlannerStore((s) => s.updateOpening);
  const openings = usePlannerStore((s) => s.openings);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const { camera, gl } = useThree();
  const drag = useRef<{ pointerId: number; moved: boolean } | null>(null);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const wallLen = wallFrame(wall).length;
  const boxW = Math.max(opening.width + 0.04, 0.4);
  const boxH = Math.max(opening.height + 0.04, 0.4);
  const boxY = opening.sill + opening.height / 2;
  const boxD = Math.max(wall.thickness + 0.22, 0.32);
  const idleOpacity = cameraMode === 'top' ? 0.1 : 0.05;

  const project = (clientX: number, clientY: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x, z: hit.z };
  };

  const applyAt = (clientX: number, clientY: number) => {
    const p = project(clientX, clientY);
    if (!p) return;
    const raw = wallOffsetFromWorldPoint(wall, p.x, p.z, WORLD_ORIGIN, PIXELS_PER_METER);
    const offset = clampOpeningOffset({ ...opening, offset: raw }, openings, wallLen);
    updateLive(opening.id, { offset });
  };

  const onPointerDown = (e: any) => {
    e.stopPropagation();
    try {
      gl.domElement.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    selectOpening(opening.id);
    drag.current = { pointerId: e.pointerId, moved: false };
    document.body.dataset.movingFurniture = 'true';
    window.dispatchEvent(new Event('roomcraft-drag-start'));
    const move = (ev: PointerEvent) => {
      if (!drag.current || drag.current.pointerId !== ev.pointerId) return;
      drag.current.moved = true;
      applyAt(ev.clientX, ev.clientY);
    };
    const end = (ev: PointerEvent) => {
      if (!drag.current || drag.current.pointerId !== ev.pointerId) return;
      const moved = drag.current.moved;
      drag.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      try {
        gl.domElement.releasePointerCapture?.(ev.pointerId);
      } catch {
        /* ignore */
      }
      delete document.body.dataset.movingFurniture;
      window.dispatchEvent(new Event('roomcraft-drag-end'));
      if (moved) {
        const current = usePlannerStore.getState().openings.find((o) => o.id === opening.id);
        if (current) updateOpening(opening.id, { offset: current.offset });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  return (
    <mesh
      position={[x, boxY, z]}
      rotation={[0, angle, 0]}
      userData={{ openingPick: true, openingId: opening.id }}
      onPointerDown={onPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        selectOpening(opening.id);
      }}
      renderOrder={8}
    >
      <boxGeometry args={[boxW, boxH, boxD]} />
      <meshBasicMaterial
        color={selected ? '#0058a3' : '#64748b'}
        transparent
        opacity={selected ? 0.34 : idleOpacity}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

function useDollhouseCutaway(walls: ReturnType<typeof usePlannerStore.getState>['walls']) {
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const { camera, invalidate } = useThree();
  const center = useMemo(() => roomFloorCenter(walls), [walls]);
  const [opacityByWall, setOpacityByWall] = useState<Record<string, number>>({});
  const smoothed = useRef<Record<string, number>>({});
  const lastKey = useRef('');
  const enabled = cameraMode === 'orbit';
  const wasEnabled = useRef(enabled);

  useEffect(() => {
    // Demand frameloop: kick a redraw whenever cutaway mode or walls change.
    invalidate();
  }, [walls, enabled, center, invalidate]);

  useFrame((_, delta) => {
    // Walk/plan/elevation: skip per-wall cutaway work (keeps Walk fps smooth).
    if (cameraMode === 'firstPerson' || cameraMode === 'top' || cameraMode === 'elevation') {
      wasEnabled.current = false;
      if (lastKey.current !== 'walk-opaque') {
        lastKey.current = 'walk-opaque';
        smoothed.current = {};
        setOpacityByWall({});
      }
      return;
    }
    const next: Record<string, number> = {};
    const justEnabled = enabled && !wasEnabled.current;
    const justDisabled = !enabled && wasEnabled.current;
    wasEnabled.current = enabled;
    // Creamy temporal ease — slower while dissolving open, never a hard snap on mode switch.
    let settling = false;
    for (const wall of walls) {
      const target = wallCutawayOpacity(wall, camera.position.x, camera.position.z, center, enabled);
      const prev = smoothed.current[wall.id] ?? 1;
      const opening = target < prev - 0.001; // becoming more transparent
      const speed = justDisabled
        ? 3.4
        : justEnabled
          ? 1.85
          : !enabled
            ? 3.8
            : opening
              ? 1.55
              : 2.15;
      const rate = 1 - Math.exp(-Math.min(delta, 0.05) * speed);
      const value = prev + (target - prev) * rate;
      // Snap residual once we're visually done — avoids endless micro-invalidates.
      const settled = Math.abs(value - target) < 0.0015 ? target : value;
      smoothed.current[wall.id] = settled;
      next[wall.id] = settled;
      if (Math.abs(settled - target) > 0.0015) settling = true;
    }
    for (const id of Object.keys(smoothed.current)) {
      if (!(id in next)) delete smoothed.current[id];
    }
    // Finer quantization so React materials track the ease without stair-steps.
    const key = walls.map((w) => `${w.id}:${(next[w.id] ?? 1).toFixed(4)}`).join('|');
    if (key !== lastKey.current) {
      lastKey.current = key;
      setOpacityByWall(next);
    }
    // Keep the demand loop alive while orbiting / settling so fades stay smooth.
    if (enabled || settling) invalidate();
  });

  return opacityByWall;
}

function useVisibleWalls(): Wall[] {
  const walls = usePlannerStore((s) => s.walls);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const workflowStage = usePlannerStore((s) => s.workflowStage);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const elevationFace = usePlannerStore((s) => s.elevationFace);
  return useMemo(() => {
    const room = planRooms.find((r) => r.id === selectedRoomId) ?? (planRooms.length === 1 ? planRooms[0] : null);
    if (cameraMode === 'elevation') {
      const facing = pickFacingWall(walls, room, elevationFace);
      return facing ? [facing] : walls;
    }
    if (workflowStage !== 'room' || !selectedRoomId) return walls;
    if (!room) return walls;
    const height = walls[0]?.height ?? 2.7;
    return enclosureWallsForRoom(room, walls, height);
  }, [walls, planRooms, selectedRoomId, workflowStage, cameraMode, elevationFace]);
}

function elevationPlaneYaw(face: import('../../types').ElevationFace): number {
  switch (face) {
    case 'front':
      return Math.PI;
    case 'back':
      return 0;
    case 'left':
      return -Math.PI / 2;
    case 'right':
      return Math.PI / 2;
  }
}

function WallDimWorld({
  position,
  yaw,
  faceUp,
  text,
  selected,
  size,
}: {
  position: [number, number, number];
  yaw: number;
  faceUp?: boolean;
  text: string;
  selected?: boolean;
  size: { w: number; h: number };
}) {
  const bg = selected ? '#0058a3' : '#f7f9fb';
  const fg = selected ? '#ffffff' : '#111820';
  const stroke = selected ? '#004e91' : '#c5ccd3';
  const radius = Math.min(size.w, size.h) * 0.48;
  return (
    <group position={position} rotation={[0, yaw, 0]} raycast={() => {}}>
      <group rotation={faceUp ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
        <RoundedBox args={[size.w + 0.02, size.h + 0.02, 0.008]} radius={radius} smoothness={4} position={[0, 0, 0]} raycast={() => {}}>
          <meshBasicMaterial color={stroke} depthTest={false} toneMapped={false} />
        </RoundedBox>
        <RoundedBox args={[size.w, size.h, 0.01]} radius={Math.max(0.01, radius - 0.008)} smoothness={4} position={[0, 0, 0.004]} raycast={() => {}}>
          <meshBasicMaterial color={bg} depthTest={false} toneMapped={false} />
        </RoundedBox>
        <Suspense fallback={null}>
          <Text
            renderOrder={25}
            position={[0, 0, 0.012]}
            fontSize={DIM_FONT_M}
            color={fg}
            anchorX="center"
            anchorY="middle"
            outlineWidth={selected ? 0.004 : 0.01}
            outlineColor={bg}
            letterSpacing={-0.02}
            depthOffset={-2}
            raycast={() => {}}
          >
            {text}
          </Text>
        </Suspense>
      </group>
    </group>
  );
}

function PlanWallDim({
  wallId,
  midX,
  midZ,
  sx,
  sz,
  ex,
  ez,
  roomPoints,
  text,
  selected,
  thickness,
}: {
  wallId: string;
  midX: number;
  midZ: number;
  sx: number;
  sz: number;
  ex: number;
  ez: number;
  roomPoints?: { x: number; y: number }[];
  text: string;
  selected: boolean;
  thickness: number;
}) {
  const viewYawDeg = usePlannerStore((s) => s.viewYawDeg);
  const a = planWallDimAnchor({ midX, midZ, sx, sz, ex, ez, thickness, text, roomPoints });
  const yaw = (((viewYawDeg % 360) + 360) % 360) * (Math.PI / 180);
  return (
    <WallDimWorld
      key={wallId + 'len'}
      position={[a.x, a.y, a.z]}
      yaw={yaw}
      faceUp
      text={text}
      selected={selected}
      size={{ w: a.w, h: a.h }}
    />
  );
}

function ElevationWallDims({
  wall,
  face,
  unit,
}: {
  wall: Wall;
  face: import('../../types').ElevationFace;
  unit: 'metric' | 'imperial';
}) {
  const frame = wallWorldFrame(wall);
  const widthText = formatLength(frame.len, unit);
  const heightText = formatLength(wall.height, unit);
  const a = elevationDimPillAnchors(wall, face, { widthText, heightText });
  return (
    <>
      <WallDimWorld position={[a.width.x, a.width.y, a.width.z]} yaw={a.width.yaw} text={widthText} size={{ w: a.width.w, h: a.width.h }} />
      <WallDimWorld position={[a.height.x, a.height.y, a.height.z]} yaw={a.height.yaw} text={heightText} size={{ w: a.height.w, h: a.height.h }} />
    </>
  );
}

export function WallMeshes() {
  const walls = useVisibleWalls();
  const openings = usePlannerStore((s) => s.openings);
  const sceneWallColor = usePlannerStore((s) => s.wallColor);
  const selectedId = usePlannerStore((s) => s.selectedWallId);
  const selectedOpeningId = usePlannerStore((s) => s.selectedOpeningId);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const workflowStage = usePlannerStore((s) => s.workflowStage);
  const unitSystem = usePlannerStore((s) => s.unitSystem);
  const select = usePlannerStore((s) => s.selectWall);
  const placeOpeningAtWorld = usePlannerStore((s) => s.placeOpeningAtWorld);
  const layers = usePlannerStore((s) => s.layerVisibility);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const elevationFace = usePlannerStore((s) => s.elevationFace);
  const tool = usePlannerStore((s) => s.tool);
  const opacityByWall = useDollhouseCutaway(walls);
  const focusRoom = workflowStage === 'room' ? planRooms.find((r) => r.id === selectedRoomId) : null;
  const color = focusRoom?.wallColor || sceneWallColor;
  const wallIds = useMemo(() => new Set(walls.map((w) => w.id)), [walls]);
  const visibleOpenings = useMemo(
    () => (layers.openings ? openings.filter((o) => wallIds.has(o.wallId)) : []),
    [openings, wallIds, layers.openings],
  );
  const orbiting = cameraMode === 'orbit';
  const elevating = cameraMode === 'elevation';
  const dimRoom =
    planRooms.find((r) => r.id === selectedRoomId) ?? (planRooms.length === 1 ? planRooms[0] : null);
  const dimWallIds = useMemo(() => {
    if (!dimRoom) return null;
    const height = walls[0]?.height ?? 2.7;
    return new Set(enclosureWallsForRoom(dimRoom, walls, height).map((w) => w.id));
  }, [dimRoom, walls]);
  const pendingCorner = usePlannerStore((s) => s.pendingCorner);
  const ghostSplit =
    pendingCorner && dimRoom?.id === pendingCorner.roomId
      ? splitEdgeEndpoints(dimRoom.points, pendingCorner.edgeIndex, pendingCorner.t)
      : null;
  const ghostEdgeIndex = ghostSplit && pendingCorner ? pendingCorner.edgeIndex : null;
  const planWallTool = usePlannerStore((s) => s.planWallTool);
  // Openings can be dragged in top plan and 3D orbit (not walk).
  const openingDragEnabled = tool === 'select' && (cameraMode === 'top' || cameraMode === 'orbit');
  const placingOpening = tool === 'door' || tool === 'window' || tool === 'passage';
  const { invalidate } = useThree();

  const onWallClick = (id: string, point?: { x: number; z: number }) => {
    if (placingOpening && point && (tool === 'door' || tool === 'window' || tool === 'passage')) {
      placeOpeningAtWorld(id, tool, point.x, point.z);
      return;
    }
    if (planWallTool) {
      select(id);
      window.dispatchEvent(new Event('roomcraft-close-properties'));
      return;
    }
    select(id);
    // Open wall inspector (type, openings, length) — house plan included.
    window.dispatchEvent(new Event('roomcraft-open-properties'));
  };

  return (
    <>
      {walls.flatMap((w) => {
        const opacity = elevating ? 1 : (opacityByWall[w.id] ?? 1);
        const selected = selectedId === w.id;
        const drawOpacity = opacity;
        // Never unmount while orbiting — remounting at ~0 opacity popped the dissolve.
        const hidden = !orbiting && !elevating && drawOpacity < 0.02;
        const [sx0, sz0] = world(w.start.x, w.start.y);
        const [ex0, ez0] = world(w.end.x, w.end.y);
        const origLen = Math.hypot(ex0 - sx0, ez0 - sz0) || 0.01;
        // Openings / doors use the true wall run only — corner posts seal joints.
        const sx = sx0;
        const sz = sz0;
        const ex = ex0;
        const ez = ez0;
        const length = origLen;
        const angle = -Math.atan2(ez0 - sz0, ex0 - sx0);
        const midX = (sx0 + ex0) / 2;
        const midZ = (sz0 + ez0) / 2;

        // Invisible pick target so cut-away walls remain selectable in 3D (clicks won't fall through to the floor).
        // Plan view uses the floor (and topPick while Walls/openings are armed) — tall proxies steal room clicks.
        const pickProxy = (
          <mesh
            key={w.id + 'pick'}
            userData={{ wallCutawayPick: true }}
            position={[midX, w.height / 2, midZ]}
            rotation={[0, angle, 0]}
            raycast={cameraMode === 'top' ? () => {} : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onWallClick(w.id, { x: e.point.x, z: e.point.z });
            }}
          >
            <boxGeometry args={[origLen || 0.2, w.height, Math.max(w.thickness, 0.12)]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        );

        // Plan: thin pick strip while tagging openings or dragging walls.
        const topPick =
          cameraMode === 'top' && (placingOpening || planWallTool) ? (
            <mesh
              key={w.id + 'toppick'}
              userData={{ wallPlanPick: true }}
              position={[midX, 0.04, midZ]}
              rotation={[-Math.PI / 2, 0, angle]}
              onClick={(e) => {
                e.stopPropagation();
                onWallClick(w.id, { x: e.point.x, z: e.point.z });
              }}
            >
              <planeGeometry args={[origLen || 0.2, Math.max(w.thickness * 4.5, 0.45)]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
          ) : null;

        if (hidden) {
          return [
            ...(topPick ? [topPick] : []),
            pickProxy,
            ...(selected
              ? [
                  <mesh
                    key={w.id + 'sel-only'}
                    position={[midX, w.height / 2, midZ]}
                    rotation={[0, angle, 0]}
                    raycast={() => {}}
                    renderOrder={3}
                  >
                    <boxGeometry args={[origLen + 0.02, w.height + 0.04, w.thickness + 0.05]} />
                    <meshBasicMaterial color="#0058a3" transparent opacity={0.22} depthWrite={false} toneMapped={false} />
                  </mesh>,
                ]
              : []),
          ];
        }

        // In orbit, keep soft materials even at opacity 1 so we never flip opaque↔transparent mid-orbit.
        const soft = orbiting || drawOpacity < 0.999;
        const fading = drawOpacity < 0.97;
        const related = visibleOpenings.filter((o) => o.wallId === w.id);
        // Orbit keeps continuous lintels/sills; top plan cuts full-height so the gap
        // lines up with the door/window leaf (lintels hid the opening from above).
        const planOpenings =
          cameraMode === 'top'
            ? related.map((o) => ({ ...o, sill: 0, height: Math.max(w.height, o.height) }))
            : related;
        const solids = wallSolidBoxes(w.height, origLen, origLen, 0, planOpenings);
        // Top plan walls stay pickable via topPick; fade still skips solid raycasts.
        const skipRay = fading ? () => {} : cameraMode === 'top' ? () => {} : undefined;
        const tinted = new THREE.Color(color);
        const role = w.assembly ?? 'interior';
        if (role === 'exterior') tinted.lerp(new THREE.Color('#7a746c'), 0.16);
        else if (role === 'party') tinted.lerp(new THREE.Color('#5c5348'), 0.12);
        const wallMat = {
          color: `#${tinted.getHexString()}`,
          roughness: 0.86,
          transparent: soft,
          opacity: drawOpacity,
          // Stable depth policy while soft — flipping depthWrite mid-fade caused dissolve pops.
          depthWrite: orbiting ? drawOpacity > 0.96 : !soft || drawOpacity > 0.9,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        } as const;
        const base = solids.map((box, i) => {
          const c = (box.along0 + box.along1) / 2;
          const t = c / length;
          const x = sx + (ex - sx) * t;
          const z = sz + (ez - sz) * t;
          const segLen = box.along1 - box.along0;
          const segH = box.y1 - box.y0;
          const y = (box.y0 + box.y1) / 2;
          return (
            <mesh
              key={w.id + 'b' + i}
              position={[x, y, z]}
              rotation={[0, angle, 0]}
              castShadow={!fading && cameraMode !== 'top'}
              receiveShadow={!fading && cameraMode !== 'top'}
              raycast={skipRay}
              userData={fading ? { wallCutawayPick: true } : undefined}
              onClick={(e) => {
                e.stopPropagation();
                onWallClick(w.id, { x: e.point.x, z: e.point.z });
              }}
            >
              <boxGeometry args={[segLen, segH, w.thickness]} />
              <meshStandardMaterial {...wallMat} />
            </mesh>
          );
        });
        const selectionHalo = selected
          ? cameraMode === 'top'
            ? [
                <mesh
                  key={w.id + 'sel-plan'}
                  position={[midX, 0.06, midZ]}
                  rotation={[-Math.PI / 2, 0, angle]}
                  raycast={() => {}}
                  renderOrder={3}
                >
                  <planeGeometry args={[origLen + 0.04, Math.max(w.thickness + 0.1, 0.22)]} />
                  <meshBasicMaterial
                    color="#0058a3"
                    transparent
                    opacity={0.32}
                    depthWrite={false}
                    toneMapped={false}
                  />
                </mesh>,
              ]
            : solids.map((box, i) => {
              // Halo each solid segment so openings stay visible as gaps (not a full-run slab).
              const c = (box.along0 + box.along1) / 2;
              const t = c / length;
              const x = sx + (ex - sx) * t;
              const z = sz + (ez - sz) * t;
              const segLen = box.along1 - box.along0;
              const segH = box.y1 - box.y0;
              const y = (box.y0 + box.y1) / 2;
              return (
                <mesh
                  key={w.id + 'sel' + i}
                  position={[x, y, z]}
                  rotation={[0, angle, 0]}
                  raycast={() => {}}
                  renderOrder={3}
                >
                  <boxGeometry args={[segLen + 0.02, segH + 0.04, w.thickness + 0.05]} />
                  <meshBasicMaterial
                    color="#0058a3"
                    transparent
                    opacity={0.28 * Math.max(drawOpacity, 0.35)}
                    depthWrite={false}
                    depthTest
                    toneMapped={false}
                    polygonOffset
                    polygonOffsetFactor={-2}
                    polygonOffsetUnits={-2}
                  />
                </mesh>
              );
            })
          : [];
        const fixtures = related.flatMap((o) => {
          // Shared helper — identical center for hole, leaf, swing, and drag handle.
          const placed = openingCenterOnWall(w, o.offset, WORLD_ORIGIN, PIXELS_PER_METER);
          const x = placed.x;
          const z = placed.z;
          const openAngle = placed.angle;
          const parts: ReactElement[] = [];
          // Plan: floor plate marks the opening so the gap is obvious under the leaf.
          if (cameraMode === 'top' && (o.type === 'door' || o.type === 'passage')) {
            parts.push(
              <mesh key={o.id + 'plate'} position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, openAngle]} raycast={() => {}}>
                <planeGeometry args={[o.width, Math.max(w.thickness + 0.16, 0.28)]} />
                <meshBasicMaterial color="#0058a3" transparent opacity={0.2} depthWrite={false} />
              </mesh>,
            );
          }
          if (o.type === 'window')
            parts.push(
              <mesh key={o.id + 'glass'} position={[x, o.sill + o.height / 2, z]} rotation={[0, openAngle, 0]} raycast={skipRay}>
                <boxGeometry args={[o.width, o.height, 0.04]} />
                <meshPhysicalMaterial
                  color="#bce4ec"
                  transparent
                  opacity={elevating ? 0.55 : 0.32 * drawOpacity}
                  transmission={elevating ? 0.35 : 0.65}
                  roughness={0.05}
                  depthWrite={false}
                />
              </mesh>,
            );
          if (o.type === 'door' && !fading)
            parts.push(
              <DoorLeaf
                key={o.id + 'door'}
                x={x}
                z={z}
                angle={openAngle}
                width={o.width}
                height={o.height}
                swing={o.swing ?? 'left'}
                face={o.face ?? 'in'}
                shape={o.shape ?? 'rect'}
              />,
            );
          if (elevating && (o.type === 'door' || o.type === 'passage' || o.type === 'window')) {
            const b = elevationFaceBasis(elevationFace);
            parts.push(
              <mesh
                key={o.id + 'elev-void'}
                position={[x - b.camX * 0.04, o.sill + o.height / 2, z - b.camZ * 0.04]}
                rotation={[0, elevationPlaneYaw(elevationFace), 0]}
                raycast={() => {}}
              >
                <planeGeometry args={[o.width, o.height]} />
                <meshBasicMaterial color={o.type === 'window' ? '#9fd0ea' : '#c4b29a'} />
              </mesh>,
            );
          }
          if (o.type === 'passage')
            parts.push(
              <mesh key={o.id + 'passage'} position={[x, 0.015, z]} rotation={[-Math.PI / 2, 0, openAngle]} raycast={skipRay}>
                <planeGeometry args={[o.width, w.thickness + 0.08]} />
                <meshBasicMaterial color="#0058a3" transparent opacity={0.28 * drawOpacity} />
              </mesh>,
            );
          if (openingDragEnabled && !fading)
            parts.push(
              <OpeningDragHandle
                key={o.id + 'drag'}
                opening={o}
                wall={w}
                x={x}
                z={z}
                angle={openAngle}
                selected={o.id === selectedOpeningId}
              />,
            );
          return parts;
        });
        // 3D pick proxy while fading so cut-away walls remain selectable.
        return [
          ...(topPick ? [topPick] : []),
          ...(fading && cameraMode !== 'top' ? [pickProxy] : []),
          ...(elevating
            ? [
                <mesh
                  key={w.id + 'interior'}
                  position={[
                    midX - elevationFaceBasis(elevationFace).camX * 0.1,
                    w.height / 2,
                    midZ - elevationFaceBasis(elevationFace).camZ * 0.1,
                  ]}
                  rotation={[0, elevationPlaneYaw(elevationFace), 0]}
                  raycast={() => {}}
                >
                  <planeGeometry args={[origLen, w.height]} />
                  <meshBasicMaterial color="#d2c0aa" />
                </mesh>,
              ]
            : []),
          ...base,
          ...selectionHalo,
          ...fixtures,
          ...(cameraMode === 'top' &&
          layers.dims &&
          dimWallIds?.has(w.id) &&
          !(ghostEdgeIndex != null && dimRoom && planRoomEdgeIndexForWall(dimRoom, w) === ghostEdgeIndex)
            ? [
                <PlanWallDim
                  key={w.id + 'len'}
                  wallId={w.id}
                  midX={midX}
                  midZ={midZ}
                  sx={sx}
                  sz={sz}
                  ex={ex}
                  ez={ez}
                  roomPoints={dimRoom?.points}
                  text={formatLength(origLen, unitSystem)}
                  selected={selected}
                  thickness={w.thickness}
                />,
              ]
            : []),
          ...(elevating && layers.dims
            ? [
                <ElevationWallDims key={w.id + 'elev-dims'} wall={w} face={elevationFace} unit={unitSystem} />,
              ]
            : []),
        ];
      })}
      {cameraMode === 'top' && layers.dims && ghostSplit && dimRoom
        ? (() => {
            const thickness = walls[0]?.thickness ?? 0.15;
            const segs = [
              { id: 'ghost-a', a: ghostSplit.a, b: ghostSplit.ghost },
              { id: 'ghost-b', a: ghostSplit.ghost, b: ghostSplit.b },
            ];
            return segs.map(({ id, a, b }) => {
              const [sx, sz] = world(a.x, a.y);
              const [ex, ez] = world(b.x, b.y);
              const len = Math.hypot(ex - sx, ez - sz);
              return (
                <PlanWallDim
                  key={id}
                  wallId={id}
                  midX={(sx + ex) / 2}
                  midZ={(sz + ez) / 2}
                  sx={sx}
                  sz={sz}
                  ex={ex}
                  ez={ez}
                  roomPoints={dimRoom.points}
                  text={formatLength(len, unitSystem)}
                  selected
                  thickness={thickness}
                />
              );
            });
          })()
        : null}
      {layers.framing &&
        walls.map((w) => {
          const [sx, sz] = world(w.start.x, w.start.y);
          const [ex, ez] = world(w.end.x, w.end.y);
          const len = Math.hypot(ex - sx, ez - sz) || 0.01;
          const ang = -Math.atan2(ez - sz, ex - sx);
          const mx = (sx + ex) / 2;
          const mz = (sz + ez) / 2;
          const studs = Math.max(2, Math.round(len / 0.4064) + 1);
          return (
            <group key={`frame-${w.id}`} position={[mx, 0.02, mz]} rotation={[0, ang, 0]}>
              {Array.from({ length: studs }, (_, i) => {
                const t = studs === 1 ? 0.5 : i / (studs - 1);
                const along = (t - 0.5) * len;
                return (
                  <mesh key={i} position={[along, w.height / 2, 0]} raycast={() => {}}>
                    <boxGeometry args={[0.04, w.height * 0.98, 0.09]} />
                    <meshBasicMaterial color="#c4a574" transparent opacity={0.55} depthWrite={false} />
                  </mesh>
                );
              })}
            </group>
          );
        })}
      {(() => {
        // Corner posts seal joints where wall boxes meet at shared plan endpoints.
        const seen = new Set<string>();
        const posts: ReactElement[] = [];
        for (const w of walls) {
          for (const p of [w.start, w.end]) {
            const key = `${Math.round(p.x)}:${Math.round(p.y)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const [x, z] = world(p.x, p.y);
            const touching = walls.filter((ww) => {
              const same = (q: { x: number; y: number }) => Math.hypot(q.x - p.x, q.y - p.y) < 1;
              return same(ww.start) || same(ww.end);
            });
            const t = Math.max(...touching.map((ww) => ww.thickness));
            const h = Math.max(...touching.map((ww) => ww.height));
            const opacity = Math.min(...touching.map((ww) => opacityByWall[ww.id] ?? 1));
            const selectedTouch = touching.some((ww) => ww.id === selectedId);
            // Keep corner posts while orbiting so they dissolve with the walls (no remount pop).
            if (!orbiting && opacity < 0.02 && !selectedTouch) continue;
            const drawOpacity = opacity;
            const fading = drawOpacity < 0.97;
            const soft = orbiting || drawOpacity < 0.999;
            posts.push(
              <mesh
                key={`corner-${key}`}
                position={[x, h / 2, z]}
                castShadow={!fading && cameraMode !== 'top'}
                receiveShadow={!fading && cameraMode !== 'top'}
                renderOrder={selectedTouch ? 2 : 0}
                raycast={fading ? () => {} : undefined}
                userData={fading ? { wallCutawayPick: true } : undefined}
              >
                <boxGeometry args={[t * 0.98, h, t * 0.98]} />
                <meshStandardMaterial
                  color={color}
                  roughness={0.86}
                  transparent={soft}
                  opacity={drawOpacity}
                  depthWrite={orbiting ? drawOpacity > 0.96 : !soft || drawOpacity > 0.9}
                  polygonOffset
                  polygonOffsetFactor={2}
                  polygonOffsetUnits={2}
                />
              </mesh>,
            );
            if (selectedTouch && cameraMode !== 'top') {
              posts.push(
                <mesh key={`corner-sel-${key}`} position={[x, h / 2, z]} raycast={() => {}} renderOrder={4}>
                  <boxGeometry args={[t * 1.08, h + 0.04, t * 1.08]} />
                  <meshBasicMaterial
                    color="#0058a3"
                    transparent
                    opacity={0.28 * Math.max(drawOpacity, 0.35)}
                    depthWrite={false}
                    depthTest
                    toneMapped={false}
                    polygonOffset
                    polygonOffsetFactor={-2}
                    polygonOffsetUnits={-2}
                  />
                </mesh>,
              );
            }
          }
        }
        return posts;
      })()}
    </>
  );
}
