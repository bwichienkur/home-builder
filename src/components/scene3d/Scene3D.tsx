import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bvh, Environment, Line, OrbitControls, PerspectiveCamera, PivotControls, Text } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { usePlannerStore } from '../../store/plannerStore';
import { catalog } from '../catalog/catalogData';
import type { FurnitureItem } from '../../types';
import { detectRoomPolygons, roomShape } from '../../lib/geometry/rooms';
import { alignmentGuides, clampWallMountY, constrainPlacement, pointOnWall, roomFloorCenter, wallFrame, WORLD_ORIGIN } from '../../lib/geometry/placement';
import { framingFromPoints, framingFromWalls, freeAreaFit, worldShiftForFreeArea } from '../../lib/geometry/planFraming';
import { pointInPlanRoom, wallsBelongingToRoom } from '../../lib/geometry/roomWalls';
import { wallCutawayOpacity } from '../../lib/geometry/wallCutaway';
import { orbitCeilingOpacity, orbitFloorOpacity } from '../../lib/geometry/plateFade';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';
import { collisionsAsync } from '../../lib/collisions';
import { formatLength } from '../../lib/measurements';
import { rafThrottle } from '../../lib/rafThrottle';
import { useInventoryStore } from '../../store/inventoryStore';
import { FurnitureVisual } from './CatalogModel';
import { PlanEditLayer } from './PlanEditLayer';
import type { ReactElement } from 'react';
import type { PlanRoomLabel, Wall } from '../../types';

const isCoarsePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

const world = (x: number, y: number): [number, number] => [
  (x - WORLD_ORIGIN.x) / PIXELS_PER_METER,
  (y - WORLD_ORIGIN.y) / PIXELS_PER_METER,
];

function hasUserDataFlag(object: THREE.Object3D, key: string) {
  let o: THREE.Object3D | null = object;
  while (o) {
    if (o.userData?.[key]) return true;
    o = o.parent;
  }
  return false;
}

/** Prefer furniture inside the room over cutaway wall pick proxies that sit in front of the camera. */
function preferInteriorPicks(hits: THREE.Intersection[]) {
  if (!hits.length) return hits;
  const furniture = hits.filter((h) => hasUserDataFlag(h.object, 'furniturePick'));
  if (!furniture.length) return hits;
  // If any cutaway proxy/soft wall is closer than furniture, keep the furniture hits so
  // you can click and drag pieces through the open section facing the camera.
  const firstFurniture = hits.findIndex((h) => hasUserDataFlag(h.object, 'furniturePick'));
  const firstCutaway = hits.findIndex((h) => hasUserDataFlag(h.object, 'wallCutawayPick'));
  if (firstCutaway >= 0 && (firstFurniture < 0 || firstCutaway < firstFurniture)) {
    return furniture;
  }
  return hits;
}

function wallDragPlane(wall: Wall, item: FurnitureItem) {
  const mid = pointOnWall(wall, item.wallOffset ?? 0.5, 0);
  let nx = item.x - mid.x;
  let nz = item.z - mid.z;
  const len = Math.hypot(nx, nz);
  if (len < 0.01) {
    const frame = wallFrame(wall);
    nx = frame.normalX;
    nz = frame.normalZ;
  } else {
    nx /= len;
    nz /= len;
  }
  return new THREE.Plane().setFromNormalAndCoplanarPoint(
    new THREE.Vector3(nx, 0, nz),
    new THREE.Vector3(item.x, (item.y ?? 0) + item.height / 2, item.z),
  );
}

function CameraRig() {
  const mode = usePlannerStore((s) => s.cameraMode);
  const walls = usePlannerStore((s) => s.walls);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const workflowStage = usePlannerStore((s) => s.workflowStage);
  const placing = usePlannerStore((s) => !!s.pendingPlacement);
  const [moving, setMoving] = useState(false);
  const controls = useRef<any>(null);
  const { invalidate, get, size } = useThree();
  const focusRoom = workflowStage === 'room' ? planRooms.find((r) => r.id === selectedRoomId) : null;
  const coarse = useMemo(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, []);
  const [menuOpen, setMenuOpen] = useState(() => document.body.dataset.menuOpen === '1');
  const [inspectorTick, setInspectorTick] = useState(0);
  const savedView = useRef<{ pose: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  useEffect(() => {
    const sync = () => setMenuOpen(document.body.dataset.menuOpen === '1');
    const syncInspector = () => setInspectorTick((n) => n + 1);
    window.addEventListener('roomcraft-menu-changed', sync);
    window.addEventListener('roomcraft-inspector-changed', syncInspector);
    return () => {
      window.removeEventListener('roomcraft-menu-changed', sync);
      window.removeEventListener('roomcraft-inspector-changed', syncInspector);
    };
  }, []);
  const inspectorOpen = typeof document !== 'undefined' && document.body.dataset.inspectorOpen === '1';
  const showRightRail = inspectorOpen || !!focusRoom || workflowStage === 'house';
  const canvasW = size?.width || (typeof window !== 'undefined' ? window.innerWidth : 390);
  const canvasH = size?.height || (typeof window !== 'undefined' ? window.innerHeight : 844);

  // Reserve rail/inspector + a clear gutter so the plate never sits under the black bar.
  const freeFit = useMemo(() => {
    const rightChromePx = inspectorOpen
      ? Math.min(260, Math.round(canvasW * 0.44))
      : showRightRail
        ? 72
        : 0;
    // Mobile needs a wide gap between the plate and the rail; desktop a bit less.
    const gutterPx = !rightChromePx ? 0 : inspectorOpen ? (coarse ? 28 : 20) : coarse ? 64 : 40;
    const topChromePx = coarse ? 72 : 64;
    const bottomChromePx = coarse ? 150 : 110;
    return freeAreaFit({
      width: canvasW,
      height: canvasH,
      rightChromePx,
      gutterPx,
      topChromePx,
      bottomChromePx,
    });
  }, [canvasW, canvasH, inspectorOpen, showRightRail, coarse, inspectorTick]);

  const framing = useMemo(() => {
    // Base pad, then scale so the plate fits the free rectangle (not the full screen).
    const basePad = (coarse ? 3.6 : 3.2) * (menuOpen ? 1.45 : 1);
    const baseOrbit = (coarse ? 1.85 : 1.6) * (menuOpen ? 1.25 : 1);
    const pad = basePad * freeFit.padScale;
    const orbitPad = baseOrbit * Math.max(1, freeFit.padScale * 0.92);
    if (focusRoom?.points.length) {
      return framingFromPoints(focusRoom.points, { pad, orbitPad, minSpan: 2.5, minHeight: 11 });
    }
    return framingFromWalls(walls, { pad, orbitPad, minHeight: 15 });
  }, [walls, focusRoom, coarse, menuOpen, freeFit.padScale]);
  const center = framing.center;
  const fovDeg = mode === 'walk' ? 58 : mode === 'top' ? 42 : 48;
  const aspect = Math.max(0.35, canvasW / Math.max(1, canvasH));

  // Shift look-target into the free left region so the rail/inspector never covers the plate.
  const shiftX = useMemo(() => {
    const menuShiftX = menuOpen ? framing.span * 0.28 : 0;
    if (freeFit.rightReserve <= 0) return menuShiftX;
    const dist =
      mode === 'top'
        ? framing.topHeight
        : mode === 'walk'
          ? Math.max(4.2, framing.span * 0.55)
          : Math.hypot(framing.orbitPose[0] - center[0], framing.orbitPose[1], framing.orbitPose[2] - center[2]) ||
            framing.topHeight;
    return menuShiftX + worldShiftForFreeArea(freeFit.shiftFraction, dist, fovDeg, aspect);
  }, [menuOpen, framing, freeFit.rightReserve, freeFit.shiftFraction, mode, center, fovDeg, aspect]);
  const targetTuple = useMemo<[number, number, number]>(
    () => [center[0] + shiftX, 0, center[2]],
    [center, shiftX],
  );
  const poseTuple = useMemo<[number, number, number]>(() => {
    if (mode === 'top') return [framing.topPose[0] + shiftX, framing.topPose[1], framing.topPose[2]];
    if (mode === 'walk') {
      const back = Math.max(4.2, framing.span * 0.55);
      return [center[0] + shiftX, 1.55, center[2] + back];
    }
    return [framing.orbitPose[0] + shiftX, framing.orbitPose[1], framing.orbitPose[2]];
  }, [mode, center, framing, shiftX]);

  // Clear any leftover viewOffset from earlier experiments — we frame via shiftX instead.
  useEffect(() => {
    const camera = get().camera as THREE.PerspectiveCamera;
    if (camera?.isPerspectiveCamera && typeof camera.clearViewOffset === 'function' && camera.view?.enabled) {
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
      invalidate();
    }
  }, [get, invalidate]);

  const maxDistance =
    mode === 'top'
      ? Math.max(framing.topHeight * 2.4, framing.span * 7, 100)
      : mode === 'walk'
        ? Math.max(14, framing.span * 1.4)
        : Math.max(framing.orbitPose[1] * 2.6, framing.span * 5.5, 52);
  const minDistance = mode === 'walk' ? 1.2 : mode === 'top' ? Math.max(3, framing.span * 0.08) : Math.max(2.5, framing.span * 0.12);

  const animating = useRef(false);
  const applyPose = (to: THREE.Vector3, target: THREE.Vector3, duration = 0) => {
    const camera = get().camera;
    const finish = () => {
      camera.position.copy(to);
      if (controls.current) {
        controls.current.target.copy(target);
        if (mode === 'top') {
          // Lock north-up plan orientation so floor switches never land crooked.
          controls.current.minAzimuthAngle = 0;
          controls.current.maxAzimuthAngle = 0;
          if (typeof controls.current.setAzimuthalAngle === 'function') controls.current.setAzimuthalAngle(0);
        } else {
          controls.current.minAzimuthAngle = -Infinity;
          controls.current.maxAzimuthAngle = Infinity;
        }
        controls.current.update();
      } else {
        camera.lookAt(target);
      }
      invalidate();
      animating.current = false;
    };
    if (duration <= 0 || !controls.current) {
      finish();
      return;
    }
    const from = camera.position.clone();
    const fromTarget = controls.current.target.clone();
    const start = performance.now();
    animating.current = true;
    const tick = (now: number) => {
      if (!animating.current) return;
      const t = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(from, to, ease);
      controls.current?.target.lerpVectors(fromTarget, target, ease);
      camera.lookAt(controls.current?.target ?? target);
      controls.current?.update();
      invalidate();
      if (t < 1) requestAnimationFrame(tick);
      else finish();
    };
    requestAnimationFrame(tick);
  };

  const animateToPose = (duration = 520) => {
    applyPose(new THREE.Vector3(...poseTuple), new THREE.Vector3(...targetTuple), duration);
  };

  const snapToPose = () => {
    applyPose(new THREE.Vector3(...poseTuple), new THREE.Vector3(...targetTuple), 0);
  };

  // Animate into orbit/walk so the whole plate eases into view (avoid corner snap).
  useEffect(() => {
    if (mode === 'top') snapToPose();
    else animateToPose(560);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, menuOpen, poseTuple[0], poseTuple[1], poseTuple[2], targetTuple[0]]);

  // Entering a room / returning to plan must reframe for the free canvas immediately.
  useEffect(() => {
    snapToPose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRoom?.id, workflowStage, freeFit.padScale, freeFit.shiftFraction]);

  // When the edit card opens/closes, reframe into the free left canvas (or restore).
  useEffect(() => {
    const open = document.body.dataset.inspectorOpen === '1';
    const camera = get().camera;
    if (open) {
      if (!savedView.current && controls.current) {
        savedView.current = {
          pose: camera.position.clone(),
          target: controls.current.target.clone(),
        };
      }
      applyPose(new THREE.Vector3(...poseTuple), new THREE.Vector3(...targetTuple), 420);
      return;
    }
    if (savedView.current) {
      const { pose, target } = savedView.current;
      savedView.current = null;
      applyPose(pose, target, 420);
    } else {
      snapToPose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectorTick, poseTuple[0], poseTuple[1], poseTuple[2], targetTuple[0]]);

  useEffect(() => {
    const fit = () => snapToPose();
    const refocus = () => {
      // Fit-plan prefers an instant snap; refocus animates only for small nudges.
      snapToPose();
    };
    const start = () => {
      // Disable immediately so top-view pan / orbit can't steal this pointer gesture.
      if (controls.current) {
        controls.current.enabled = false;
        controls.current.enablePan = false;
        controls.current.enableRotate = false;
      }
      setMoving(true);
    };
    const stop = () => {
      // Always restore controls — do not rely on React `moving` alone (stale lock after remount).
      setMoving(false);
      if (controls.current) {
        controls.current.enabled = !placing;
        controls.current.enablePan = true;
        controls.current.enableRotate = mode !== 'top';
        controls.current.enableZoom = true;
      }
    };
    const focusRoomEvt = () => {
      // Prefer the shared free-area pose (shift + zoom) over a bare geometric focus.
      snapToPose();
    };
    window.addEventListener('roomcraft-fit-plan', fit);
    window.addEventListener('roomcraft-refocus', refocus);
    window.addEventListener('roomcraft-drag-start', start);
    window.addEventListener('roomcraft-drag-end', stop);
    window.addEventListener('roomcraft-focus-room', focusRoomEvt);
    return () => {
      window.removeEventListener('roomcraft-fit-plan', fit);
      window.removeEventListener('roomcraft-refocus', refocus);
      window.removeEventListener('roomcraft-drag-start', start);
      window.removeEventListener('roomcraft-drag-end', stop);
      window.removeEventListener('roomcraft-focus-room', focusRoomEvt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get, invalidate, poseTuple, targetTuple, mode, coarse, placing]);

  return (
    <>
      <PerspectiveCamera makeDefault position={poseTuple} fov={mode === 'walk' ? 58 : mode === 'top' ? 42 : 48} />
      <OrbitControls
        ref={controls}
        enabled={!moving && !placing}
        target={[targetTuple[0], mode === 'walk' ? 1.1 : targetTuple[1], targetTuple[2]]}
        // Near-vertical top view (~3–5°) — head-on plan without lookAt singularity at polar 0.
        minPolarAngle={mode === 'top' ? 0.04 : mode === 'walk' ? 0.7 : 0}
        // Orbit may go under the plate so you can inspect underside / open dollhouse from below.
        maxPolarAngle={mode === 'top' ? 0.09 : mode === 'walk' ? Math.PI / 2.05 : Math.PI - 0.06}
        minAzimuthAngle={mode === 'top' ? 0 : -Infinity}
        maxAzimuthAngle={mode === 'top' ? 0 : Infinity}
        minDistance={minDistance}
        maxDistance={maxDistance}
        enableZoom
        enablePan={!moving}
        enableRotate={mode !== 'top' && !moving}
        // Top: one-finger / left-drag pans the plate. Orbit keeps rotate on one finger.
        mouseButtons={{
          LEFT: mode === 'top' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
        touches={{
          ONE: mode === 'top' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
        onChange={() => invalidate()}
      />
    </>
  );
}

function SceneAtmosphere() {
  const mode = usePlannerStore((s) => s.cameraMode);
  const walls = usePlannerStore((s) => s.walls);
  const framing = useMemo(() => framingFromWalls(walls), [walls]);
  // Top plan view: no fog (old far=70 blanked house plates when the camera sat above it).
  if (mode === 'top') return <color attach="background" args={['#e8eaed']} />;
  const near = Math.max(18, framing.span * 1.1);
  const far = Math.max(near + 20, framing.span * 3.2, framing.topHeight * 1.4);
  return (
    <>
      <color attach="background" args={['#e8eaed']} />
      <fog attach="fog" args={['#e8eaed', near, far]} />
    </>
  );
}

function DoorLeaf({
  x,
  z,
  angle,
  width,
  height,
  swing,
}: {
  x: number;
  z: number;
  angle: number;
  width: number;
  height: number;
  swing: 'left' | 'right' | 'none';
}) {
  if (swing === 'none') return null;
  const open = swing === 'left' ? Math.PI / 2.4 : -Math.PI / 2.4;
  return (
    <group position={[x, 0, z]} rotation={[0, angle, 0]}>
      <group position={[swing === 'left' ? -width / 2 : width / 2, 0, 0]} rotation={[0, open, 0]}>
        <mesh position={[swing === 'left' ? width / 2 : -width / 2, height / 2, 0]} castShadow>
          <boxGeometry args={[width, height, 0.04]} />
          <meshStandardMaterial color="#c4a574" roughness={0.7} />
        </mesh>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.02, width, 24, 1, swing === 'left' ? 0 : -Math.PI / 2, Math.PI / 2]} />
        <meshBasicMaterial color="#0058a3" transparent opacity={0.22} side={THREE.DoubleSide} />
      </mesh>
    </group>
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
    const next: Record<string, number> = {};
    const justEnabled = enabled && !wasEnabled.current;
    wasEnabled.current = enabled;
    // IKEA-like cream: slow ease while orbiting; a bit quicker when entering/leaving 3D.
    // Never snap — instant target jumps are what made the dissolve feel harsh.
    const speed = justEnabled ? 4.0 : enabled ? 2.6 : 7.0;
    const rate = 1 - Math.exp(-Math.min(delta, 0.08) * speed);
    let settling = false;
    for (const wall of walls) {
      const target = wallCutawayOpacity(wall, camera.position.x, camera.position.z, center, enabled);
      const prev = smoothed.current[wall.id] ?? 1;
      const value = prev + (target - prev) * rate;
      // Snap residual once we're visually done — avoids endless micro-invalidates.
      const settled = Math.abs(value - target) < 0.002 ? target : value;
      smoothed.current[wall.id] = settled;
      next[wall.id] = settled;
      if (Math.abs(settled - target) > 0.002) settling = true;
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
  return useMemo(() => {
    if (workflowStage !== 'room' || !selectedRoomId) return walls;
    const room = planRooms.find((r) => r.id === selectedRoomId);
    if (!room) return walls;
    return wallsBelongingToRoom(room, walls);
  }, [walls, planRooms, selectedRoomId, workflowStage]);
}

function WallMeshes() {
  const walls = useVisibleWalls();
  const openings = usePlannerStore((s) => s.openings);
  const color = usePlannerStore((s) => s.wallColor);
  const selectedId = usePlannerStore((s) => s.selectedWallId);
  const select = usePlannerStore((s) => s.selectWall);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const studioMode = usePlannerStore((s) => s.studioMode);
  const tool = usePlannerStore((s) => s.tool);
  const opacityByWall = useDollhouseCutaway(walls);
  const wallIds = useMemo(() => new Set(walls.map((w) => w.id)), [walls]);
  const visibleOpenings = useMemo(() => openings.filter((o) => wallIds.has(o.wallId)), [openings, wallIds]);
  const orbiting = cameraMode === 'orbit';
  // Walls are only selectable in top-view Walls edit mode — not while furnishing or orbiting.
  const wallEditMode = studioMode === 'architect' && cameraMode === 'top' && tool === 'select';
  const onWallClick = (id: string) => {
    if (!wallEditMode) return;
    select(id);
    // Properties open from the Edit fab — don't cover the plan on every wall tap.
  };

  return (
    <>
      {walls.flatMap((w) => {
        const opacity = opacityByWall[w.id] ?? 1;
        const selected = selectedId === w.id;
        const drawOpacity = opacity;
        // Hide only after the fade is visually done — avoids a mid-dissolve pop.
        const hidden = drawOpacity < 0.02;
        const [sx0, sz0] = world(w.start.x, w.start.y);
        const [ex0, ez0] = world(w.end.x, w.end.y);
        const origLen = Math.hypot(ex0 - sx0, ez0 - sz0) || 0.01;
        const ux = (ex0 - sx0) / origLen;
        const uz = (ez0 - sz0) / origLen;
        // Modest overlap + corner posts seal joints without huge coplanar fighting.
        const extend = w.thickness * 0.28;
        const sx = sx0 - ux * extend;
        const sz = sz0 - uz * extend;
        const ex = ex0 + ux * extend;
        const ez = ez0 + uz * extend;
        const length = origLen + extend * 2;
        const angle = -Math.atan2(ez - sz, ex - sx);
        const midX = (sx0 + ex0) / 2;
        const midZ = (sz0 + ez0) / 2;

        // Invisible pick target so cut-away walls remain selectable in 3D (clicks won't fall through to the floor).
        const pickProxy = (
          <mesh
            key={w.id + 'pick'}
            userData={{ wallCutawayPick: true }}
            position={[midX, w.height / 2, midZ]}
            rotation={[0, angle, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onWallClick(w.id);
            }}
          >
            <boxGeometry args={[origLen || 0.2, w.height, Math.max(w.thickness, 0.12)]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        );

        // Wide, shallow top-view strip — walls are hard to hit from plan otherwise (thin edges).
        const topPick =
          wallEditMode ? (
            <mesh
              key={w.id + 'top-pick'}
              userData={{ planWallPick: true, wallId: w.id }}
              position={[midX, 0.14, midZ]}
              rotation={[0, angle, 0]}
              renderOrder={6}
              onClick={(e) => {
                e.stopPropagation();
                onWallClick(w.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <boxGeometry args={[Math.max(origLen, 0.35), 0.1, Math.max(w.thickness * 5, 0.48)]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
            </mesh>
          ) : null;

        if (hidden) {
          return [
            pickProxy,
            ...(topPick ? [topPick] : []),
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
        let ranges: [number, number][] = [[0, length]];
        related.forEach((o) => {
          const center = extend + o.offset * origLen;
          const a = Math.max(0, center - o.width / 2);
          const b = Math.min(length, center + o.width / 2);
          ranges = ranges.flatMap(([r1, r2]) =>
            b <= r1 || a >= r2 ? [[r1, r2]] : ([[r1, Math.max(r1, a)], [Math.min(r2, b), r2]].filter((r) => r[1] - r[0] > 0.02) as [number, number][]),
          );
        });
        // Cutaway + top (non-edit) must not steal furniture picks; solid orbit walls still block.
        const skipRay = fading || (cameraMode === 'top' && !wallEditMode) ? () => {} : undefined;
        const wallMat = {
          color,
          roughness: 0.86,
          transparent: soft,
          opacity: drawOpacity,
          // Keep depth while nearly solid; drop it only once the dissolve is underway.
          depthWrite: !soft || drawOpacity > 0.9,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        } as const;
        const base = ranges.flatMap(([a, b], i) => {
          const c = (a + b) / 2;
          const t = c / length;
          const x = sx + (ex - sx) * t;
          const z = sz + (ez - sz) * t;
          const segLen = b - a;
          const meshes: ReactElement[] = [
            <mesh
              key={w.id + 'b' + i}
              position={[x, w.height / 2, z]}
              rotation={[0, angle, 0]}
              castShadow={!fading}
              receiveShadow={!fading}
              raycast={skipRay}
              userData={fading ? { wallCutawayPick: true } : undefined}
              onClick={(e) => {
                e.stopPropagation();
                onWallClick(w.id);
              }}
            >
              <boxGeometry args={[segLen, w.height, w.thickness]} />
              <meshStandardMaterial {...wallMat} />
            </mesh>,
          ];
          if (selected) {
            // Inflated halo above coplanar wall/post overlaps — stable while orbiting.
            meshes.push(
              <mesh key={w.id + 'sel' + i} position={[x, w.height / 2, z]} rotation={[0, angle, 0]} raycast={() => {}} renderOrder={3}>
                <boxGeometry args={[segLen + 0.02, w.height + 0.04, w.thickness + 0.05]} />
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
          return meshes;
        });
        const fills = related.flatMap((o) => {
          const c = extend + o.offset * origLen;
          const t = c / length;
          const x = sx + (ex - sx) * t;
          const z = sz + (ez - sz) * t;
          const parts: ReactElement[] = [];
          if (o.sill > 0)
            parts.push(
              <mesh key={o.id + 'sill'} position={[x, o.sill / 2, z]} rotation={[0, angle, 0]} raycast={skipRay}>
                <boxGeometry args={[o.width, o.sill, w.thickness]} />
                <meshStandardMaterial {...wallMat} />
              </mesh>,
            );
          const top = w.height - (o.sill + o.height);
          if (top > 0)
            parts.push(
              <mesh key={o.id + 'top'} position={[x, o.sill + o.height + top / 2, z]} rotation={[0, angle, 0]} raycast={skipRay}>
                <boxGeometry args={[o.width, top, w.thickness]} />
                <meshStandardMaterial {...wallMat} />
              </mesh>,
            );
          if (o.type === 'window')
            parts.push(
              <mesh key={o.id + 'glass'} position={[x, o.sill + o.height / 2, z]} rotation={[0, angle, 0]} raycast={skipRay}>
                <boxGeometry args={[o.width, o.height, 0.025]} />
                <meshPhysicalMaterial
                  color="#bce4ec"
                  transparent
                  opacity={0.32 * drawOpacity}
                  transmission={0.65}
                  roughness={0.05}
                  depthWrite={false}
                />
              </mesh>,
            );
          if (o.type === 'door' && !fading)
            parts.push(
              <DoorLeaf key={o.id + 'door'} x={x} z={z} angle={angle} width={o.width} height={o.height} swing={o.swing ?? 'left'} />,
            );
          if (o.type === 'passage')
            parts.push(
              <mesh key={o.id + 'passage'} position={[x, 0.015, z]} rotation={[-Math.PI / 2, 0, angle]} raycast={skipRay}>
                <planeGeometry args={[o.width, w.thickness + 0.08]} />
                <meshBasicMaterial color="#0058a3" transparent opacity={0.28 * drawOpacity} />
              </mesh>,
            );
          return parts;
        });
        // Top-plan pick strip always available in Walls mode; 3D pick proxy while fading.
        return [
          ...(topPick ? [topPick] : []),
          ...(fading && wallEditMode ? [pickProxy] : []),
          ...base,
          ...fills,
        ];
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
            if (opacity < 0.02 && !selectedTouch) continue;
            const drawOpacity = opacity;
            const fading = drawOpacity < 0.97;
            const soft = orbiting || drawOpacity < 0.999;
            posts.push(
              <mesh
                key={`corner-${key}`}
                position={[x, h / 2, z]}
                castShadow={!fading}
                receiveShadow={!fading}
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
                  depthWrite={!soft || drawOpacity > 0.9}
                  polygonOffset
                  polygonOffsetFactor={2}
                  polygonOffsetUnits={2}
                />
              </mesh>,
            );
            if (selectedTouch) {
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

function DimensionLabels({ item }: { item: FurnitureItem }) {
  const unit = usePlannerStore((s) => s.unitSystem);
  // Dense labels hurt readability and GPU cost on phones.
  if (isCoarsePointer()) return null;
  const y = (item.y ?? 0) + item.height + 0.12;
  return (
    <group position={[item.x, y, item.z]} rotation={[0, item.rotation, 0]}>
      <Text position={[0, 0, item.depth / 2 + 0.05]} fontSize={0.11} color="#111820" anchorX="center" anchorY="middle" outlineWidth={0.008} outlineColor="#ffffff">
        {formatLength(item.width, unit)}
      </Text>
      <Text position={[item.width / 2 + 0.05, 0, 0]} fontSize={0.11} color="#111820" anchorX="center" anchorY="middle" outlineWidth={0.008} outlineColor="#ffffff">
        {formatLength(item.depth, unit)}
      </Text>
      <Text position={[0, item.height / 2, 0]} fontSize={0.11} color="#0058a3" anchorX="center" anchorY="middle" outlineWidth={0.008} outlineColor="#ffffff">
        {formatLength(item.height, unit)}
      </Text>
    </group>
  );
}

function ClearanceVolume({ item }: { item: FurnitureItem }) {
  const c = item.clearance ?? { front: 0.6, back: 0.05, left: 0.1, right: 0.1 };
  const front = c.front ?? 0;
  const back = c.back ?? 0;
  const left = c.left ?? 0;
  const right = c.right ?? 0;
  const width = item.width + left + right;
  const depth = item.depth + front + back;
  return (
    <mesh position={[(right - left) / 2, 0.02, (front - back) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial color="#0058a3" transparent opacity={0.14} depthWrite={false} />
    </mesh>
  );
}

function Guides({ selected, others }: { selected: FurnitureItem; others: FurnitureItem[] }) {
  const guides = useMemo(() => alignmentGuides(selected, others), [selected, others]);
  return (
    <>
      {guides.map((g, i) => (
        <group key={i}>
          <Line points={[g.a, g.b]} color={g.kind === 'gap' ? '#0b7a3e' : '#0058a3'} lineWidth={2} dashed dashSize={0.08} gapSize={0.06} />
          {g.label && (
            <Text position={[(g.a[0] + g.b[0]) / 2, 0.12, (g.a[2] + g.b[2]) / 2]} fontSize={0.12} color="#0b7a3e" anchorX="center" anchorY="middle">
              {g.label}
            </Text>
          )}
        </group>
      ))}
    </>
  );
}

function Furniture() {
  const allItems = usePlannerStore((s) => s.furniture);
  const walls = usePlannerStore((s) => s.walls);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const workflowStage = usePlannerStore((s) => s.workflowStage);
  const items = useMemo(() => {
    if (workflowStage !== 'room' || !selectedRoomId) return allItems;
    const room = planRooms.find((r) => r.id === selectedRoomId);
    if (!room) return allItems;
    return allItems.filter((item) => {
      const planX = item.x * PIXELS_PER_METER + WORLD_ORIGIN.x;
      const planY = item.z * PIXELS_PER_METER + WORLD_ORIGIN.y;
      return pointInPlanRoom(planX, planY, room);
    });
  }, [allItems, planRooms, selectedRoomId, workflowStage]);
  const selectedId = usePlannerStore((s) => s.selectedFurnitureId);
  const select = usePlannerStore((s) => s.selectFurniture);
  const update = usePlannerStore((s) => s.updateFurniture);
  const updateLive = usePlannerStore((s) => s.updateFurnitureLive);
  const custom = useInventoryStore((s) => s.items);
  const catalogById = useMemo(() => new Map([...catalog, ...custom].map((c) => [c.id, c])), [custom]);
  const selected = items.find((i) => i.id === selectedId);
  const pending = useRef<Partial<FurnitureItem> | null>(null);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const { gl, camera } = useThree();
  // Top + orbit: drag on the piece itself (incl. through facing cutaway). Walk keeps free-look.
  const usePlaneDrag = cameraMode === 'top' || cameraMode === 'orbit';
  const touchDrag = useRef<{
    pointerId: number;
    itemId: string;
    offsetX: number;
    offsetZ: number;
    offsetY: number;
    wallMount: boolean;
    moved: boolean;
    orbitLocked: boolean;
    startClientX: number;
    startClientY: number;
  } | null>(null);
  const dragListeners = useRef<{ move: (e: PointerEvent) => void; end: (e: PointerEvent) => void } | null>(null);
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const dragRaycaster = useMemo(() => new THREE.Raycaster(), []);
  const dragNdc = useMemo(() => new THREE.Vector2(), []);
  const [collisions, setCollisions] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const liveThrottle = useRef(
    rafThrottle((id: string, patch: Partial<FurnitureItem>) => {
      updateLive(id, patch);
    }),
  );

  useEffect(() => {
    if (dragging) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      collisionsAsync(items).then((pairs) => {
        if (!alive) return;
        const ids = new Set<string>();
        pairs.forEach(([a, b]) => {
          ids.add(a);
          ids.add(b);
        });
        setCollisions(ids);
      });
    }, dragging ? 0 : 120);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [items, dragging]);

  useEffect(() => () => {
    liveThrottle.current.cancel();
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
  }, []);

  const hitDragPlane = (clientX: number, clientY: number, plane: THREE.Plane) => {
    const rect = gl.domElement.getBoundingClientRect();
    dragNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    dragNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    dragRaycaster.setFromCamera(dragNdc, camera);
    const hit = new THREE.Vector3();
    if (!dragRaycaster.ray.intersectPlane(plane, hit)) return null;
    return hit;
  };

  const clearDragListeners = () => {
    if (!dragListeners.current) return;
    window.removeEventListener('pointermove', dragListeners.current.move);
    window.removeEventListener('pointerup', dragListeners.current.end);
    window.removeEventListener('pointercancel', dragListeners.current.end);
    dragListeners.current = null;
  };

  const constrainDrag = (item: FurnitureItem, x: number, z: number, rotation?: number, y?: number) => {
    const placed = constrainPlacement(x, z, walls, item.depth, {
      mountingType: item.mountingType,
      category: item.category,
      name: item.name,
      rotation: rotation ?? item.rotation,
      live: true,
      width: item.width,
    });
    const host = walls.find((w) => w.id === placed.wallId) ?? walls[0];
    const nextY =
      item.mountingType === 'wall'
        ? clampWallMountY(y ?? item.y ?? 1.4, item.height, host?.height ?? 2.7)
        : item.mountingType === 'ceiling'
          ? Math.max(0.1, (host?.height ?? 2.7) - item.height)
          : 0;
    return {
      x: placed.x,
      z: placed.z,
      rotation: placed.rotation ?? rotation ?? item.rotation,
      wallId: placed.wallId,
      wallOffset: placed.wallOffset,
      ...(item.mountingType === 'wall' || item.mountingType === 'ceiling' ? { y: nextY } : {}),
    };
  };

  const endItemDrag = (e?: PointerEvent) => {
    if (!touchDrag.current) return;
    if (e && touchDrag.current.pointerId !== e.pointerId) return;
    const itemId = touchDrag.current.itemId;
    const moved = touchDrag.current.moved;
    const pointerId = touchDrag.current.pointerId;
    clearDragListeners();
    try {
      gl.domElement.releasePointerCapture?.(pointerId);
    } catch {
      /* ignore */
    }
    touchDrag.current = null;
    liveThrottle.current.cancel();
    delete document.body.dataset.movingFurniture;
    setDragging(false);
    // Always unlock orbit/zoom after any pointer gesture on furniture.
    window.dispatchEvent(new Event('roomcraft-drag-end'));
    if (pending.current) {
      update(itemId, pending.current);
      pending.current = null;
    }
    if (!moved) window.dispatchEvent(new Event('roomcraft-open-product-card'));
  };

  const moveItemDrag = (e: PointerEvent) => {
    if (!touchDrag.current || touchDrag.current.pointerId !== e.pointerId) return;
    const drag = touchDrag.current;
    const item = usePlannerStore.getState().furniture.find((f) => f.id === drag.itemId);
    if (!item) return;

    const pixelDist = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
    // Keep orbit free until the pointer actually moves — tap-select must not lock the camera.
    if (!drag.orbitLocked && pixelDist < 8) return;

    if (!drag.orbitLocked) {
      drag.orbitLocked = true;
      document.body.dataset.movingFurniture = 'true';
      setDragging(true);
      window.dispatchEvent(new Event('roomcraft-dismiss-product-card'));
      window.dispatchEvent(new Event('roomcraft-drag-start'));
    }

    const wall = item.wallId ? walls.find((w) => w.id === item.wallId) : null;
    const plane = drag.wallMount && wall ? wallDragPlane(wall, item) : floorPlane;
    const hit = hitDragPlane(e.clientX, e.clientY, plane);
    if (!hit) return;
    const patch = constrainDrag(
      item,
      hit.x + drag.offsetX,
      hit.z + drag.offsetZ,
      undefined,
      drag.wallMount ? hit.y + drag.offsetY : undefined,
    );
    if (Math.hypot(patch.x - item.x, patch.z - item.z) > 0.002) drag.moved = true;
    pending.current = patch;
    liveThrottle.current(item.id, patch);
  };

  const beginItemDrag = (e: any, item: FurnitureItem) => {
    if (!usePlaneDrag) return;
    if (typeof e.nativeEvent?.isPrimary === 'boolean' && !e.nativeEvent.isPrimary) return;
    e.stopPropagation();
    // Finish any stuck drag so orbit cannot stay locked.
    if (touchDrag.current) endItemDrag();
    select(item.id);
    const wall = item.wallId ? walls.find((w) => w.id === item.wallId) : null;
    const wallMount = item.mountingType === 'wall' && !!wall && cameraMode !== 'top';
    const plane = wallMount && wall ? wallDragPlane(wall, item) : floorPlane;
    const fromEvent = hitDragPlane(e.clientX, e.clientY, plane);
    const hit =
      fromEvent ??
      (() => {
        const v = new THREE.Vector3();
        return e.ray?.intersectPlane?.(plane, v) ? v : null;
      })();
    if (!hit) return;

    touchDrag.current = {
      pointerId: e.pointerId,
      itemId: item.id,
      offsetX: item.x - hit.x,
      offsetZ: item.z - hit.z,
      offsetY: (item.y ?? 0) - hit.y,
      wallMount,
      moved: false,
      orbitLocked: false,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
    pending.current = { x: item.x, z: item.z, y: item.y };

    // Window listeners survive React remount when selection moves the mesh into PivotControls.
    const onMove = (ev: PointerEvent) => moveItemDrag(ev);
    const onEnd = (ev: PointerEvent) => endItemDrag(ev);
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

  const urlsFor = (item: FurnitureItem) => {
    const product = catalogById.get(item.catalogId);
    return {
      lowUrl: product?.lowPolyModelUrl || product?.modelUrl,
      fullUrl: product?.modelUrl || product?.lowPolyModelUrl,
      textureUrl: product?.thumbnailUrl,
    };
  };

  const itemY = (item: FurnitureItem) => item.y ?? 0;

  return (
    <>
      {items
        .filter((i) => i.id !== selectedId)
        .map((i) => {
          const urls = urlsFor(i);
          return (
            <group key={i.id} position={[i.x, itemY(i), i.z]} rotation={[0, i.rotation, 0]} userData={{ furniturePick: true }}>
              <FurnitureVisual
                item={i}
                lowUrl={urls.lowUrl}
                fullUrl={urls.fullUrl}
                textureUrl={urls.textureUrl}
                colliding={collisions.has(i.id)}
                onSelect={(e) => {
                  e.stopPropagation();
                  // Plane-drag path opens the card on pointer-up if it was a tap.
                  if (usePlaneDrag) return;
                  select(i.id);
                  window.dispatchEvent(new Event('roomcraft-open-product-card'));
                }}
                onPointerDown={usePlaneDrag ? (e) => beginItemDrag(e, i) : undefined}
              />
              {i.showClearance && <ClearanceVolume item={i} />}
            </group>
          );
        })}
      {selected && (
        <>
          {!dragging && (
            <>
              <Guides selected={selected} others={items} />
              <DimensionLabels item={selected} />
            </>
          )}
          <PivotControls
            depthTest={false}
            scale={1.15}
            lineWidth={2}
            enabled={!usePlaneDrag}
            onDragStart={() => {
              document.body.dataset.movingFurniture = 'true';
              setDragging(true);
              window.dispatchEvent(new Event('roomcraft-dismiss-product-card'));
              window.dispatchEvent(new Event('roomcraft-drag-start'));
            }}
            onDrag={(m) => {
              const p = new THREE.Vector3();
              const q = new THREE.Quaternion();
              const s = new THREE.Vector3();
              m.decompose(p, q, s);
              const rotation = new THREE.Euler().setFromQuaternion(q).y;
              const patch = constrainDrag(selected, p.x, p.z, rotation, p.y);
              pending.current = patch;
              liveThrottle.current(selected.id, patch);
            }}
            onDragEnd={() => {
              liveThrottle.current.cancel();
              delete document.body.dataset.movingFurniture;
              setDragging(false);
              window.dispatchEvent(new Event('roomcraft-drag-end'));
              if (pending.current) {
                update(selected.id, pending.current);
                pending.current = null;
              }
            }}
            matrix={new THREE.Matrix4().compose(
              new THREE.Vector3(selected.x, itemY(selected), selected.z),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(0, selected.rotation, 0)),
              new THREE.Vector3(1, 1, 1),
            )}
          >
            <group userData={{ furniturePick: true }}>
              <FurnitureVisual
                item={selected}
                {...urlsFor(selected)}
                selected
                colliding={collisions.has(selected.id)}
                onPointerDown={usePlaneDrag ? (e) => beginItemDrag(e, selected) : undefined}
              />
              {selected.showClearance && <ClearanceVolume item={selected} />}
            </group>
          </PivotControls>
        </>
      )}
    </>
  );
}

function Room() {
  const floor = usePlannerStore((s) => s.floorColor);
  const ceiling = usePlannerStore((s) => s.ceilingColor);
  const walls = usePlannerStore((s) => s.walls);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const enterRoom = usePlannerStore((s) => s.enterRoom);
  const selectRoom = usePlannerStore((s) => s.selectRoom);
  const selectWall = usePlannerStore((s) => s.selectWall);
  const workflowStage = usePlannerStore((s) => s.workflowStage);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const studioMode = usePlannerStore((s) => s.studioMode);
  const tool = usePlannerStore((s) => s.tool);
  const selectedSurface = usePlannerStore((s) => s.selectedSurface);
  const selectSurface = usePlannerStore((s) => s.selectSurface);
  const detected = useMemo(() => detectRoomPolygons(walls), [walls]);
  const rooms = planRooms.length ? planRooms.map((r) => r.points) : detected;
  const ceilingHeight = walls[0]?.height ?? 2.7;
  const { camera, invalidate } = useThree();
  const ceilingSmooth = useRef(0.22);
  const floorSmooth = useRef(1);
  const plateKey = useRef('');
  const [ceilingOpacity, setCeilingOpacity] = useState(0.22);
  const [floorOpacity, setFloorOpacity] = useState(1);
  // Top / bird’s-eye must see the floor — a solid ceiling makes the room unusable to edit.
  const showCeiling = cameraMode !== 'top' || selectedSurface === 'ceiling';
  const wallEditMode = studioMode === 'architect' && cameraMode === 'top' && tool === 'select';

  useFrame((_, delta) => {
    const targetCeiling = orbitCeilingOpacity(camera.position.y, ceilingHeight, {
      mode: cameraMode,
      selected: selectedSurface === 'ceiling',
    });
    const targetFloor = orbitFloorOpacity(camera.position.y, cameraMode);
    // Match wall cutaway cream — no boolean pop when crossing mid-height / under-floor.
    const speed = cameraMode === 'orbit' ? 2.8 : 7;
    const rate = 1 - Math.exp(-Math.min(delta, 0.08) * speed);
    ceilingSmooth.current += (targetCeiling - ceilingSmooth.current) * rate;
    floorSmooth.current += (targetFloor - floorSmooth.current) * rate;
    if (Math.abs(ceilingSmooth.current - targetCeiling) < 0.002) ceilingSmooth.current = targetCeiling;
    if (Math.abs(floorSmooth.current - targetFloor) < 0.002) floorSmooth.current = targetFloor;

    const key = `${ceilingSmooth.current.toFixed(4)}|${floorSmooth.current.toFixed(4)}`;
    if (key !== plateKey.current) {
      plateKey.current = key;
      setCeilingOpacity(ceilingSmooth.current);
      setFloorOpacity(floorSmooth.current);
    }
    const settling =
      Math.abs(ceilingSmooth.current - targetCeiling) > 0.002 || Math.abs(floorSmooth.current - targetFloor) > 0.002;
    if (cameraMode === 'orbit' || settling) invalidate();
  });

  const chooseFloor = (e: any, roomId?: string) => {
    e.stopPropagation();
    // Plan Walls mode: prefer wall pick strips even when the room floor is closer.
    if (wallEditMode && workflowStage !== 'room') {
      const wallHit = (e.intersections as THREE.Intersection[] | undefined)?.find((h) => h.object.userData?.planWallPick);
      if (wallHit?.object.userData?.wallId) {
        selectWall(String(wallHit.object.userData.wallId));
        return;
      }
    }
    if (roomId) {
      // Already editing this room in 3D — selecting the floor must NOT reset camera to top.
      if (workflowStage === 'room' && selectedRoomId === roomId) {
        selectSurface('floor');
        return;
      }
      // Plan level: select the room only — Edit / Remove live on the right rail.
      if (workflowStage !== 'room') {
        selectRoom(roomId);
        return;
      }
      // Switching rooms while already in room focus.
      enterRoom(roomId);
      const room = planRooms.find((r) => r.id === roomId);
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
      return;
    }
    selectSurface('floor');
  };
  const chooseCeiling = (e: any) => {
    e.stopPropagation();
    selectSurface('ceiling');
  };
  const isolating = workflowStage === 'room' && !!selectedRoomId;
  const roomEntries = useMemo(() => {
    if (planRooms.length) {
      const labels = isolating ? planRooms.filter((r) => r.id === selectedRoomId) : planRooms;
      return labels.map((label) => ({ points: label.points, label }));
    }
    return rooms.map((points, i) => ({ points, label: undefined as PlanRoomLabel | undefined, i }));
  }, [planRooms, rooms, isolating, selectedRoomId]);
  return (
    <Bvh>
      {roomEntries.length ? (
        roomEntries.map(({ points, label }, i) => {
          const selected = !!label && label.id === selectedRoomId;
          const floorColor = label?.floorColor || floor;
          const span = (() => {
            const xs = points.map((p) => (p.x - WORLD_ORIGIN.x) / PIXELS_PER_METER);
            const zs = points.map((p) => (p.y - WORLD_ORIGIN.y) / PIXELS_PER_METER);
            return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1);
          })();
          const labelSize = Math.min(0.55, Math.max(0.22, span * 0.08));
          return (
            <group key={label?.id ?? i}>
              <mesh
                rotation={[Math.PI / 2, 0, 0]}
                receiveShadow
                position={[0, -0.035, 0]}
                onClick={(e) => chooseFloor(e, label?.id)}
              >
                <shapeGeometry args={[roomShape(points)]} />
                <meshStandardMaterial
                  color={floorColor}
                  roughness={0.95}
                  side={THREE.DoubleSide}
                  transparent={cameraMode === 'orbit' || floorOpacity < 0.999}
                  opacity={floorOpacity}
                  depthWrite={floorOpacity > 0.85}
                  polygonOffset
                  polygonOffsetFactor={4}
                  polygonOffsetUnits={4}
                />
              </mesh>
              {selected && (
                <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.018, 0]} raycast={() => {}} renderOrder={2}>
                  <shapeGeometry args={[roomShape(points)]} />
                  <meshBasicMaterial
                    color="#0058a3"
                    transparent
                    opacity={0.22}
                    depthWrite={false}
                    toneMapped={false}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              )}
              {showCeiling && (
                <mesh
                  rotation={[Math.PI / 2, 0, 0]}
                  position={[0, ceilingHeight, 0]}
                  onClick={chooseCeiling}
                  raycast={cameraMode === 'top' ? () => {} : undefined}
                >
                  <shapeGeometry args={[roomShape(points)]} />
                  <meshStandardMaterial
                    color={selectedSurface === 'ceiling' ? '#0058a3' : ceiling}
                    roughness={0.92}
                    side={THREE.DoubleSide}
                    transparent
                    opacity={ceilingOpacity}
                    depthWrite={ceilingOpacity > 0.75 || cameraMode === 'walk'}
                    emissive={selectedSurface === 'ceiling' ? '#003d70' : '#000000'}
                    emissiveIntensity={selectedSurface === 'ceiling' ? 0.1 : 0}
                  />
                </mesh>
              )}
              {label && cameraMode === 'top' && (
                <Text
                  position={[
                    points.reduce((s, p) => s + (p.x - WORLD_ORIGIN.x) / PIXELS_PER_METER, 0) / points.length,
                    0.05,
                    points.reduce((s, p) => s + (p.y - WORLD_ORIGIN.y) / PIXELS_PER_METER, 0) / points.length,
                  ]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  fontSize={labelSize}
                  color={selected ? '#ffffff' : '#1a2330'}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.02}
                  outlineColor={selected ? '#003d70' : '#ffffff'}
                  onClick={(e) => chooseFloor(e, label.id)}
                >
                  {label.name}
                </Text>
              )}
            </group>
          );
        })
      ) : (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.035, 0]} onClick={chooseFloor}>
            <planeGeometry args={[14, 12]} />
            <meshStandardMaterial color={floor} roughness={0.95} />
          </mesh>
          {showCeiling && (
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ceilingHeight, 0]} onClick={chooseCeiling}>
              <planeGeometry args={[14, 12]} />
              <meshStandardMaterial
                color={ceiling}
                roughness={0.92}
                transparent
                opacity={ceilingOpacity}
                depthWrite={ceilingOpacity > 0.75 || cameraMode === 'walk'}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}
        </>
      )}
      <WallMeshes />
      <Furniture />
      <GhostPlacement />
      <PlanEditLayer />
    </Bvh>
  );
}

function GhostPlacement() {
  const pending = usePlannerStore((s) => s.pendingPlacement);
  const walls = usePlannerStore((s) => s.walls);
  const movePending = usePlannerStore((s) => s.movePendingPlacement);
  const commit = usePlannerStore((s) => s.commitPendingPlacement);
  const { invalidate } = useThree();
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const moveThrottle = useRef(
    rafThrottle((x: number, z: number, y?: number) => {
      movePending(x, z, undefined, y);
      invalidate();
    }),
  );

  useEffect(() => {
    if (pending) invalidate();
  }, [pending, invalidate]);

  useEffect(() => () => moveThrottle.current.cancel(), []);

  if (!pending) return null;

  const resolveHit = (e: any) => {
    const hit = new THREE.Vector3();
    const wall = pending.wallId ? walls.find((w) => w.id === pending.wallId) : null;
    if (pending.mountingType === 'wall' && wall) {
      const ghostItem = {
        ...pending,
        id: 'pending',
        catalogId: pending.catalogId,
        color: pending.color,
      } as FurnitureItem;
      const plane = wallDragPlane(wall, ghostItem);
      if (e.ray.intersectPlane(plane, hit)) {
        return { x: hit.x, z: hit.z, y: hit.y - pending.height / 2 };
      }
    }
    if (!e.ray.intersectPlane(floorPlane, hit)) return null;
    return { x: hit.x, z: hit.z, y: undefined as number | undefined };
  };

  const onMove = (e: any) => {
    const at = resolveHit(e);
    if (!at) return;
    moveThrottle.current(at.x, at.z, at.y);
  };
  const onPlace = (e: any) => {
    e.stopPropagation();
    moveThrottle.current.cancel();
    const at = resolveHit(e);
    if (at) movePending(at.x, at.z, undefined, at.y);
    commit();
    invalidate();
  };

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} onPointerMove={onMove} onClick={onPlace}>
        <planeGeometry args={[40, 40]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {pending.mountingType === 'wall' && pending.wallId && (
        <mesh
          position={[pending.x, (walls.find((w) => w.id === pending.wallId)?.height ?? 2.7) / 2, pending.z]}
          rotation={[0, pending.rotation, 0]}
          onPointerMove={onMove}
          onClick={onPlace}
        >
          <planeGeometry args={[12, 4]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      <group position={[pending.x, pending.y, pending.z]} rotation={[0, pending.rotation, 0]}>
        <mesh position={[0, pending.height / 2, 0]}>
          <boxGeometry args={[pending.width, pending.height, pending.depth]} />
          <meshStandardMaterial color={pending.color} transparent opacity={0.55} depthWrite={false} />
        </mesh>
        <lineSegments position={[0, pending.height / 2, 0]}>
          <edgesGeometry args={[new THREE.BoxGeometry(pending.width, pending.height, pending.depth)]} />
          <lineBasicMaterial color="#0058a3" linewidth={2} />
        </lineSegments>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[Math.max(pending.width, pending.depth) * 0.38, Math.max(pending.width, pending.depth) * 0.5, 48]} />
          <meshBasicMaterial color="#0058a3" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

export function Scene3D() {
  const begin = usePlannerStore((s) => s.beginPlacement);
  const pending = usePlannerStore((s) => s.pendingPlacement);
  const select = usePlannerStore((s) => s.selectFurniture);
  const selectWall = usePlannerStore((s) => s.selectWall);
  const selectSurface = usePlannerStore((s) => s.selectSurface);
  const selectRoom = usePlannerStore((s) => s.selectRoom);
  const custom = useInventoryStore((s) => s.items);
  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('catalogId');
    const item = [...catalog, ...custom].find((i) => i.id === id);
    if (!item) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 7;
    const z = ((e.clientY - r.top) / r.height - 0.5) * 5;
    begin(item.id, item.name, item.category, item.dims, item.color, x, z, {
      mountingType: item.mountingType,
      clearance:
        item.category === 'Bedroom'
          ? { front: 0.7, back: 0.05, left: 0.3, right: 0.3 }
          : item.mountingType === 'wall'
            ? { front: 0.05, back: 0, left: 0.05, right: 0.05 }
            : { front: 0.45, back: 0.05, left: 0.1, right: 0.1 },
    });
  };
  const supported = useMemo(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) (gl.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null)?.loseContext?.();
      return !!gl;
    } catch {
      return false;
    }
  }, []);
  const coarse = useMemo(() => isCoarsePointer(), []);
  if (!supported) return <SceneFallback />;
  return (
    <div className="scene-host" onDragOver={(e) => e.preventDefault()} onDrop={drop}>
      <Canvas
        fallback={<SceneFallback />}
        shadows={!coarse}
        // Higher DPR + MSAA on phones — low caps were causing jagged wall/floor edges.
        dpr={coarse ? [1, 1.75] : [1, 2]}
        frameloop="demand"
        performance={{ min: coarse ? 0.55 : 0.65, debounce: 200 }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          alpha: false,
          stencil: false,
          depth: true,
        }}
        onCreated={(state) => {
          state.events.filter = preferInteriorPicks;
        }}
        onPointerMissed={() => {
          if (pending) return;
          select(null);
          selectWall(null);
          selectSurface(null);
          // Stay in room focus unless the user explicitly goes Back to house.
          if (usePlannerStore.getState().workflowStage !== 'room') selectRoom(null);
        }}
      >
        <SceneAtmosphere />
        <ambientLight intensity={coarse ? 0.9 : 0.78} />
        <directionalLight
          castShadow={!coarse}
          intensity={coarse ? 1.1 : 1.35}
          position={[5, 8, 4]}
          shadow-mapSize={coarse ? [256, 256] : [512, 512]}
        />
        <Suspense fallback={null}>
          <Room />
          {!coarse && <Environment preset="apartment" environmentIntensity={0.35} />}
        </Suspense>
        <CameraRig />
      </Canvas>
      {!pending && (
        <div className="scene-help">Drag furniture to move · Click through open walls · Empty space pans/orbits</div>
      )}
    </div>
  );
}

function SceneFallback() {
  return (
    <div className="scene-fallback" role="status">
      <span aria-hidden="true">▱</span>
      <h2>3D view is unavailable</h2>
      <p>This browser could not start WebGL. Your project is still autosaved; try reloading or using a WebGL-capable browser.</p>
      <button onClick={() => location.reload()}>Reload studio</button>
    </div>
  );
}
