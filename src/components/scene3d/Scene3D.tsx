import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bvh, Environment, Html, Line, OrbitControls, OrthographicCamera, PerspectiveCamera, PivotControls, RoundedBox, Text, useTexture } from '@react-three/drei';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { usePlannerStore } from '../../store/plannerStore';
import { catalog } from '../catalog/catalogData';
import type { FurnitureItem, Opening } from '../../types';
import { detectRoomPolygons, roomShape, roomShapeWithHoles } from '../../lib/geometry/rooms';
import { alignmentGuides, clampWallMountY, constrainPlacement, pointOnWall, roomFloorCenter, wallFrame, WORLD_ORIGIN } from '../../lib/geometry/placement';
import { doorSwingZones, furnitureHitsDoorSwing } from '../../lib/geometry/doorClearance';
import { wouldOverlapFurniture } from '../../lib/collisions';
import { framingFromPoints, framingFromWall, framingFromWalls, planChromeFit, worldShiftForFreeArea } from '../../lib/geometry/planFraming';
import { pointInPlanRoom, enclosureWallsForRoom } from '../../lib/geometry/roomWalls';
import { pickFacingWall, elevationFaceBasis, wallWorldFrame, elevationOrthoZoom } from '../../lib/geometry/elevationFace';
import { planWallDimAnchor, elevationDimPillAnchors, DIM_FONT_M } from '../../lib/geometry/wallDimPills';
import { stairsCuttingFloor } from '../../lib/geometry/stairCutouts';
import { wallExteriorSide } from '../../lib/geometry/roomWalls';
import { clampOpeningOffset, openingCenterOnWall, wallOffsetFromWorldPoint, wallSolidBoxes } from '../../lib/geometry/wallOpenings';
import { wallCutawayOpacity } from '../../lib/geometry/wallCutaway';
import { orbitCeilingOpacity, orbitFloorOpacity } from '../../lib/geometry/plateFade';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';
import { collisionsAsync } from '../../lib/collisions';
import { formatLength } from '../../lib/measurements';
import { rafThrottle } from '../../lib/rafThrottle';
import { useInventoryStore } from '../../store/inventoryStore';
import { FurnitureVisual } from './CatalogModel';
import { FloorFillPieces } from './FloorFillPieces';
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
  // While ghost-placing, keep furniture from stealing floor/wall placement hits.
  if (usePlannerStore.getState().pendingPlacement) {
    const plane = hits.filter((h) => hasUserDataFlag(h.object, 'placementPlane'));
    if (plane.length) return plane;
    return hits.filter((h) => !hasUserDataFlag(h.object, 'furniturePick'));
  }
  // Plan: wall strips win only while tagging openings or dragging walls.
  if (usePlannerStore.getState().cameraMode === 'top') {
    const st = usePlannerStore.getState();
    const wallPriority =
      st.planWallTool || st.tool === 'door' || st.tool === 'window' || st.tool === 'passage';
    if (wallPriority) {
      const wallPlan = hits.filter((h) => hasUserDataFlag(h.object, 'wallPlanPick'));
      if (wallPlan.length) return wallPlan;
    }
  }
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
  const elevationFace = usePlannerStore((s) => s.elevationFace);
  const viewYawDeg = usePlannerStore((s) => s.viewYawDeg);
  const walls = usePlannerStore((s) => s.walls);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const workflowStage = usePlannerStore((s) => s.workflowStage);
  const placing = usePlannerStore((s) => !!s.pendingPlacement);
  const [moving, setMoving] = useState(false);
  const controls = useRef<any>(null);
  const { invalidate, get, size } = useThree();
  const focusRoom = workflowStage === 'room' ? planRooms.find((r) => r.id === selectedRoomId) : null;
  const planSelectedRoom =
    workflowStage !== 'room' && selectedRoomId ? planRooms.find((r) => r.id === selectedRoomId) : null;
  const frameRoom = focusRoom ?? planSelectedRoom ?? null;
  const elevationRoom = planRooms.find((r) => r.id === selectedRoomId) ?? planRooms[0] ?? null;
  const facingWall = useMemo(
    () => (mode === 'elevation' ? pickFacingWall(walls, elevationRoom, elevationFace) : null),
    [mode, walls, elevationRoom, elevationFace],
  );
  // Keep full-plate framing while tagging walls — no single-wall zoom.
  // Keep full-plate framing while tagging walls — no single-wall zoom.
  const focusWall = null as Wall | null;
  const coarse = useMemo(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, []);
  const [menuOpen, setMenuOpen] = useState(() => document.body.dataset.menuOpen === '1');
  const [inspectorTick, setInspectorTick] = useState(0);
  const savedView = useRef<{ pose: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const inspectorOpenRef = useRef(document.body.dataset.inspectorOpen === '1');
  const inspectorAnimUntil = useRef(0);
  const animGen = useRef(0);
  useEffect(() => {
    const sync = () => setMenuOpen(document.body.dataset.menuOpen === '1');
    const syncInspector = () => {
      const opening = document.body.dataset.inspectorOpen === '1';
      // Rising edge: capture the pre-panel view before chrome reframes into the free area.
      if (opening && !inspectorOpenRef.current) {
        const camera = get().camera;
        if (controls.current) {
          savedView.current = {
            pose: camera.position.clone(),
            target: controls.current.target.clone(),
          };
        }
      }
      inspectorOpenRef.current = opening;
      setInspectorTick((n) => n + 1);
    };
    window.addEventListener('roomcraft-menu-changed', sync);
    window.addEventListener('roomcraft-inspector-changed', syncInspector);
    return () => {
      window.removeEventListener('roomcraft-menu-changed', sync);
      window.removeEventListener('roomcraft-inspector-changed', syncInspector);
    };
  }, [get]);
  const inspectorOpen = typeof document !== 'undefined' && document.body.dataset.inspectorOpen === '1';
  const [railTick, setRailTick] = useState(0);
  useEffect(() => {
    const sync = () => setRailTick((n) => n + 1);
    window.addEventListener('roomcraft-rail-changed', sync);
    return () => window.removeEventListener('roomcraft-rail-changed', sync);
  }, []);
  const showRightRail =
    inspectorOpen ||
    (typeof document !== 'undefined' && document.body.dataset.rightRail === '1') ||
    // Fallback before chrome mounts its dataset.
    !!focusRoom ||
    !!planSelectedRoom;
  void railTick;
  const canvasW = size?.width || (typeof window !== 'undefined' ? window.innerWidth : 390);
  const canvasH = size?.height || (typeof window !== 'undefined' ? window.innerHeight : 844);

  // Rail: stay page-centered and zoom so the plate + dims clear the slim rail.
  // Wide overlays (inspector / wall dim card) still use free-area shift.
  const chromeFit = useMemo(
    () =>
      planChromeFit({
        width: canvasW,
        height: canvasH,
        coarse,
        inspectorOpen,
        showRightRail,
        mode,
        frameRoom: !!frameRoom,
        focusWall: !!focusWall,
      }),
    [canvasW, canvasH, inspectorOpen, showRightRail, coarse, inspectorTick, focusWall, frameRoom, mode],
  );

  const framing = useMemo(() => {
    // Keep orbit as tight as chromeFit allows — padScale already clears the rail.
    const basePad = (coarse ? 2.9 : 2.55) * (menuOpen ? 1.45 : 1);
    const baseOrbit = (coarse ? 1.38 : 1.24) * (menuOpen ? 1.25 : 1);
    const pad = basePad * chromeFit.padScale;
    const orbitPad = baseOrbit * Math.max(1, chromeFit.padScale * 0.9);
    if (focusWall) {
      const roomsForExterior =
        planRooms.length > 0
          ? planRooms
          : detectRoomPolygons(walls).map((points, i) => ({
              id: `detected-${i}`,
              name: `Room ${i + 1}`,
              roomType: 'Living room' as const,
              points,
            }));
      // Full wall + exterior L/W/H chips with spare screen margin.
      return framingFromWall(focusWall, {
        pad: coarse ? 2.65 : 2.45,
        orbitPad: 1.15,
        minHeight: 7.2,
        exteriorSide: wallExteriorSide(focusWall, roomsForExterior),
      });
    }
    if (frameRoom?.points.length) {
      // Extra pad so exterior dim pills + handles stay in the free plate.
      const roomPad = pad * (frameRoom ? 1.12 : 1);
      return framingFromPoints(frameRoom.points, { pad: roomPad, orbitPad, minSpan: 2.5, minHeight: 9 });
    }
    return framingFromWalls(walls, { pad, orbitPad, minHeight: 12 });
  }, [walls, planRooms, frameRoom, focusWall, coarse, menuOpen, chromeFit.padScale]);
  const framingRef = useRef(framing);
  if (!moving) framingRef.current = framing;
  const viewFraming = moving ? framingRef.current : framing;
  const center = viewFraming.center;
  const viewYawRad = ((viewYawDeg % 360) + 360) % 360 * (Math.PI / 180);
  const yawCos = Math.cos(viewYawRad);
  const yawSin = Math.sin(viewYawRad);
  /** Rotate an XZ offset around Y by the current view yaw (90° steps). */
  const yawOffset = (x: number, z: number): [number, number] => [
    x * yawCos - z * yawSin,
    x * yawSin + z * yawCos,
  ];
  const fovDeg = mode === 'walk' ? 58 : mode === 'top' || mode === 'elevation' ? 42 : 48;
  const aspect = Math.max(0.35, canvasW / Math.max(1, canvasH));

  // Page center by default; shift into the free band left of a wide inspector only.
  const shiftX = useMemo(() => {
    const menuShiftX = menuOpen ? viewFraming.span * 0.28 : 0;
    if (chromeFit.shiftFraction <= 0) return menuShiftX;
    const dist =
      mode === 'top'
        ? viewFraming.topHeight
        : mode === 'walk'
          ? Math.max(4.2, viewFraming.span * 0.55)
          : Math.hypot(viewFraming.orbitPose[0] - center[0], viewFraming.orbitPose[1], viewFraming.orbitPose[2] - center[2]) ||
            viewFraming.topHeight;
    return menuShiftX + worldShiftForFreeArea(chromeFit.shiftFraction, dist, fovDeg, aspect);
  }, [menuOpen, viewFraming, chromeFit.shiftFraction, mode, center, fovDeg, aspect]);
  const [shiftWorldX, shiftWorldZ] = yawOffset(shiftX, 0);
  const targetTuple = useMemo<[number, number, number]>(() => {
    if (mode === 'elevation') {
      const wallH = facingWall?.height ?? walls[0]?.height ?? 2.7;
      const frame = facingWall ? wallWorldFrame(facingWall) : null;
      return [frame?.x ?? center[0], wallH * 0.5, frame?.z ?? center[2]];
    }
    return [center[0] + shiftWorldX, 0, center[2] + shiftWorldZ];
  }, [mode, center, shiftWorldX, shiftWorldZ, walls, facingWall]);
  const elevationAzimuth = useMemo(() => {
    switch (elevationFace) {
      case 'front':
        return Math.PI;
      case 'back':
        return 0;
      case 'left':
        return Math.PI / 2;
      case 'right':
        return -Math.PI / 2;
      default:
        return Math.PI;
    }
  }, [elevationFace]);

  const poseTuple = useMemo<[number, number, number]>(() => {
    if (mode === 'elevation') {
      const wallH = facingWall?.height ?? walls[0]?.height ?? 2.7;
      const frame = facingWall ? wallWorldFrame(facingWall) : null;
      const cy = wallH * 0.5;
      const dist = Math.max((frame?.len ?? viewFraming.span) * 1.7, 9);
      const cx = frame?.x ?? center[0];
      const cz = frame?.z ?? center[2];
      switch (elevationFace) {
        case 'front':
          return [cx, cy, cz - dist];
        case 'back':
          return [cx, cy, cz + dist];
        case 'left':
          return [cx + dist, cy, cz];
        case 'right':
          return [cx - dist, cy, cz];
        default:
          return [cx, cy, cz - dist];
      }
    }
    if (mode === 'top') {
      const zBias = viewFraming.topPose[2] - center[2];
      const [ox, oz] = yawOffset(0, zBias);
      return [center[0] + shiftWorldX + ox, viewFraming.topPose[1], center[2] + shiftWorldZ + oz];
    }
    if (mode === 'walk') {
      const back = Math.max(4.2, viewFraming.span * 0.55);
      const [ox, oz] = yawOffset(0, back);
      return [center[0] + shiftWorldX + ox, 1.55, center[2] + shiftWorldZ + oz];
    }
    const ox0 = viewFraming.orbitPose[0] - center[0];
    const oz0 = viewFraming.orbitPose[2] - center[2];
    const [ox, oz] = yawOffset(ox0, oz0);
      return [center[0] + shiftWorldX + ox, viewFraming.orbitPose[1], center[2] + shiftWorldZ + oz];
  }, [mode, center, viewFraming, shiftWorldX, shiftWorldZ, viewYawRad, elevationFace, walls, facingWall]);

  // Clear any leftover viewOffset from earlier experiments.
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
      ? Math.max(viewFraming.topHeight * 2.4, viewFraming.span * 7, 100)
      : mode === 'walk'
        ? Math.max(14, viewFraming.span * 1.4)
        : Math.max(viewFraming.orbitPose[1] * 2.6, viewFraming.span * 5.5, 52);
  const minDistance = mode === 'walk' ? 1.2 : mode === 'top' ? Math.max(3, viewFraming.span * 0.08) : Math.max(2.5, viewFraming.span * 0.12);

  // Orthographic plan zoom — true top-down (no perspective tilt).
  const orthoZoom = useMemo(() => {
    const spanPad = 0.54 * chromeFit.padScale * (frameRoom ? 1.14 : 1);
    const half = Math.max(viewFraming.span * spanPad, 5);
    const px = Math.min(size.width, size.height) || 800;
    if (mode === 'elevation') {
      const wallH = facingWall?.height ?? walls[0]?.height ?? 2.7;
      const wallLen = facingWall ? wallWorldFrame(facingWall).len : viewFraming.span;
      return elevationOrthoZoom({
        canvasW: size.width || px,
        canvasH: size.height || px,
        wallLen,
        wallH,
        padScale: chromeFit.padScale,
      });
    }
    return Math.max(8, px / (2 * half));
  }, [viewFraming.span, size.width, size.height, mode, elevationFace, walls, facingWall, chromeFit.padScale, frameRoom]);

  const animating = useRef(false);
  const modeAnimUntil = useRef(0);
  const applyPose = (to: THREE.Vector3, target: THREE.Vector3, duration = 0) => {
    const camera = get().camera;
    const gen = ++animGen.current;
    const finish = () => {
      if (gen !== animGen.current) return;
      camera.position.copy(to);
      if (controls.current) {
        controls.current.target.copy(target);
        if (mode === 'top') {
          // Lock plan orientation to the chosen 90° view yaw.
          controls.current.minAzimuthAngle = viewYawRad;
          controls.current.maxAzimuthAngle = viewYawRad;
          if (typeof controls.current.setAzimuthalAngle === 'function') controls.current.setAzimuthalAngle(viewYawRad);
        } else if (mode === 'elevation') {
          controls.current.minAzimuthAngle = elevationAzimuth;
          controls.current.maxAzimuthAngle = elevationAzimuth;
          if (typeof controls.current.setAzimuthalAngle === 'function') {
            controls.current.setAzimuthalAngle(elevationAzimuth);
          }
          if (typeof controls.current.setPolarAngle === 'function') {
            controls.current.setPolarAngle(Math.PI / 2);
          }
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
      if (gen !== animGen.current) return;
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

  // Plan ↔ 3D / 90° yaw: ease into orbit/walk; top snaps. Ignore pose churn so we don't restart mid-ease.
  useEffect(() => {
    if (mode === 'top' || mode === 'elevation') {
      snapToPose();
      return;
    }
    modeAnimUntil.current = performance.now() + 620;
    animateToPose(560);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, menuOpen, viewYawDeg, elevationFace]);

  // Room enter / chrome pad / wall focus — skip while the edit card owns framing.
  useEffect(() => {
    if (inspectorOpen) return;
    if (performance.now() < modeAnimUntil.current) return;
    if (performance.now() < inspectorAnimUntil.current) return;
    animateToPose(mode === 'top' ? 360 : 480);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRoom?.id, selectedRoomId, workflowStage, chromeFit.padScale, chromeFit.shiftFraction, inspectorOpen, focusWall?.id]);

  // Keep the selected wall centered as length / width / height change (not during plan wall resize).
  useEffect(() => {
    if (!focusWall || inspectorOpen) return;
    if (document.body.dataset.movingFurniture === '1') return;
    if (performance.now() < modeAnimUntil.current) return;
    if (mode !== 'top') return;
    animateToPose(280);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    focusWall?.id,
    focusWall?.start.x,
    focusWall?.start.y,
    focusWall?.end.x,
    focusWall?.end.y,
    focusWall?.thickness,
    focusWall?.height,
    framing.topHeight,
    shiftWorldX,
    shiftWorldZ,
  ]);

  // Edit card open/close — ease into free area / restore the pre-panel view.
  useEffect(() => {
    const open = document.body.dataset.inspectorOpen === '1';
    inspectorAnimUntil.current = performance.now() + 520;
    if (open) {
      applyPose(new THREE.Vector3(...poseTuple), new THREE.Vector3(...targetTuple), 420);
      return;
    }
    // Closing: put the plate back where it was before the panel opened.
    if (savedView.current) {
      const { pose, target } = savedView.current;
      savedView.current = null;
      applyPose(pose, target, 420);
      return;
    }
    // Fallback if we never captured a pre-panel view.
    if (performance.now() >= modeAnimUntil.current) {
      animateToPose(420);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectorTick]);

  useEffect(() => {
    const fit = () => {
      // choose3d/chooseTop fire fit immediately — don't cancel the Plan↔3D ease with a snap.
      if (performance.now() < modeAnimUntil.current) return;
      if (performance.now() < inspectorAnimUntil.current) return;
      if (document.body.dataset.inspectorOpen === '1') return;
      if (document.body.dataset.movingFurniture === 'true') return;
      if (mode === 'top' || mode === 'elevation') snapToPose();
      else animateToPose(420);
    };
    const refocus = () => {
      if (performance.now() < modeAnimUntil.current) return;
      if (performance.now() < inspectorAnimUntil.current) return;
      if (document.body.dataset.inspectorOpen === '1') return;
      if (document.body.dataset.movingFurniture === 'true') return;
      if (mode === 'top' || mode === 'elevation') snapToPose();
      else animateToPose(420);
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
        controls.current.enableRotate = mode !== 'top' && mode !== 'elevation';
        controls.current.enableZoom = true;
      }
    };
    const focusRoomEvt = () => {
      if (performance.now() < modeAnimUntil.current) return;
      if (performance.now() < inspectorAnimUntil.current) return;
      animateToPose(mode === 'top' ? 360 : 480);
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

  // Sync ortho zoom when framing changes — avoid fighting pinch-zoom every frame.
  useEffect(() => {
    if (mode !== 'top' && mode !== 'elevation') return;
    const cam = get().camera as THREE.OrthographicCamera;
    if (cam?.isOrthographicCamera) {
      cam.zoom = orthoZoom;
      cam.updateProjectionMatrix();
      invalidate();
    }
  }, [mode, orthoZoom, get, invalidate]);

  return (
    <>
      {mode === 'top' || mode === 'elevation' ? (
        <OrthographicCamera
          key={mode === 'elevation' ? 'elev-ortho' : 'plan-ortho'}
          makeDefault
          position={poseTuple}
          near={0.1}
          far={2000}
        />
      ) : (
        <PerspectiveCamera
          key="persp"
          makeDefault
          position={poseTuple}
          fov={mode === 'walk' ? 58 : 48}
        />
      )}
      <OrbitControls
        ref={controls}
        enabled={!moving && !placing}
        target={[targetTuple[0], mode === 'walk' ? 1.1 : targetTuple[1], targetTuple[2]]}
        minPolarAngle={mode === 'top' ? 1e-4 : mode === 'elevation' ? Math.PI / 2 - 1e-4 : mode === 'walk' ? 0.7 : 0}
        maxPolarAngle={mode === 'top' ? 1e-3 : mode === 'elevation' ? Math.PI / 2 + 1e-4 : mode === 'walk' ? Math.PI / 2.05 : Math.PI - 0.06}
        minAzimuthAngle={mode === 'top' ? viewYawRad : mode === 'elevation' ? elevationAzimuth : -Infinity}
        maxAzimuthAngle={mode === 'top' ? viewYawRad : mode === 'elevation' ? elevationAzimuth : Infinity}
        minDistance={minDistance}
        maxDistance={maxDistance}
        enableZoom
        enablePan={!moving}
        enableRotate={mode !== 'top' && mode !== 'elevation' && !moving}
        mouseButtons={{
          LEFT: mode === 'top' || mode === 'elevation' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
        touches={{
          ONE: mode === 'top' || mode === 'elevation' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
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
  // Top: no fog (overhead plates sat past the old far plane).
  if (mode === 'top' || mode === 'elevation') return <color attach="background" args={['#e8eaed']} />;
  // Orbit/walk: keep a soft depth cue, but start fog well beyond normal dollhouse distances
  // so zooming out never dissolves the room (old near ≈ 18m blanked the plate).
  const near = Math.max(85, framing.span * 6.5);
  const far = Math.max(near + 100, framing.span * 16);
  return (
    <>
      <color attach="background" args={['#e8eaed']} />
      <fog attach="fog" args={['#e8eaed', near, far]} />
    </>
  );
}

function FloorMaterial({
  color,
  catalogId,
  opacity,
  transparent,
  depthWrite,
  worldSpan = 4,
}: {
  color: string;
  catalogId?: string;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  worldSpan?: number;
}) {
  const inventory = useInventoryStore((s) => s.items);
  const product = useMemo(() => {
    if (!catalogId) return undefined;
    return inventory.find((i) => i.id === catalogId) || catalog.find((i) => i.id === catalogId);
  }, [catalogId, inventory]);
  const textureUrl = product?.textureUrl;
  if (!textureUrl) {
    return (
      <meshStandardMaterial
        color={color}
        roughness={product?.roughness ?? 0.95}
        side={THREE.DoubleSide}
        transparent={transparent}
        opacity={opacity}
        depthWrite={depthWrite}
        polygonOffset
        polygonOffsetFactor={4}
        polygonOffsetUnits={4}
      />
    );
  }
  return (
    <Suspense
      fallback={
        <meshStandardMaterial
          color={color}
          roughness={0.95}
          side={THREE.DoubleSide}
          transparent={transparent}
          opacity={opacity}
          depthWrite={depthWrite}
          polygonOffset
          polygonOffsetFactor={4}
          polygonOffsetUnits={4}
        />
      }
    >
      <TexturedFloorMaterial
        url={textureUrl}
        roughnessMapUrl={product?.roughnessMapUrl}
        normalMapUrl={product?.normalMapUrl}
        repeatM={product?.textureRepeat ?? 0.4}
        worldSpan={worldSpan}
        roughness={product?.roughness ?? 0.88}
        opacity={opacity}
        transparent={transparent}
        depthWrite={depthWrite}
      />
    </Suspense>
  );
}

function configureFloorMap(texture: THREE.Texture, tiles: number, srgb: boolean) {
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(tiles, tiles);
  texture.anisotropy = 8;
  texture.needsUpdate = true;
}

function TexturedFloorMaterial({
  url,
  roughnessMapUrl,
  normalMapUrl,
  repeatM,
  worldSpan,
  roughness,
  opacity,
  transparent,
  depthWrite,
}: {
  url: string;
  roughnessMapUrl?: string;
  normalMapUrl?: string;
  repeatM: number;
  worldSpan: number;
  roughness: number;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}) {
  // Hooks cannot be conditional — pick a loader branch with fixed URL arity.
  if (roughnessMapUrl && normalMapUrl) {
    return (
      <TexturedFloorMaterialPBR
        colorUrl={url}
        roughUrl={roughnessMapUrl}
        normalUrl={normalMapUrl}
        repeatM={repeatM}
        worldSpan={worldSpan}
        roughness={roughness}
        opacity={opacity}
        transparent={transparent}
        depthWrite={depthWrite}
      />
    );
  }
  if (roughnessMapUrl) {
    return (
      <TexturedFloorMaterialColorRough
        colorUrl={url}
        roughUrl={roughnessMapUrl}
        repeatM={repeatM}
        worldSpan={worldSpan}
        roughness={roughness}
        opacity={opacity}
        transparent={transparent}
        depthWrite={depthWrite}
      />
    );
  }
  return (
    <TexturedFloorMaterialColorOnly
      url={url}
      repeatM={repeatM}
      worldSpan={worldSpan}
      roughness={roughness}
      opacity={opacity}
      transparent={transparent}
      depthWrite={depthWrite}
    />
  );
}

function TexturedFloorMaterialColorOnly({
  url,
  repeatM,
  worldSpan,
  roughness,
  opacity,
  transparent,
  depthWrite,
}: {
  url: string;
  repeatM: number;
  worldSpan: number;
  roughness: number;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}) {
  const texture = useTexture(url);
  useLayoutEffect(() => {
    const tiles = Math.max(1, worldSpan / Math.max(0.08, repeatM));
    configureFloorMap(texture, tiles, true);
  }, [texture, repeatM, worldSpan]);
  return (
    <meshStandardMaterial
      map={texture}
      color="#ffffff"
      roughness={roughness}
      metalness={0.02}
      side={THREE.DoubleSide}
      transparent={transparent}
      opacity={opacity}
      depthWrite={depthWrite}
      polygonOffset
      polygonOffsetFactor={4}
      polygonOffsetUnits={4}
    />
  );
}

function TexturedFloorMaterialColorRough({
  colorUrl,
  roughUrl,
  repeatM,
  worldSpan,
  roughness,
  opacity,
  transparent,
  depthWrite,
}: {
  colorUrl: string;
  roughUrl: string;
  repeatM: number;
  worldSpan: number;
  roughness: number;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}) {
  const [map, roughnessMap] = useTexture([colorUrl, roughUrl]);
  useLayoutEffect(() => {
    const tiles = Math.max(1, worldSpan / Math.max(0.08, repeatM));
    configureFloorMap(map, tiles, true);
    configureFloorMap(roughnessMap, tiles, false);
  }, [map, roughnessMap, repeatM, worldSpan]);
  return (
    <meshStandardMaterial
      map={map}
      roughnessMap={roughnessMap}
      color="#ffffff"
      roughness={roughness}
      metalness={0.02}
      side={THREE.DoubleSide}
      transparent={transparent}
      opacity={opacity}
      depthWrite={depthWrite}
      polygonOffset
      polygonOffsetFactor={4}
      polygonOffsetUnits={4}
    />
  );
}

function TexturedFloorMaterialPBR({
  colorUrl,
  roughUrl,
  normalUrl,
  repeatM,
  worldSpan,
  roughness,
  opacity,
  transparent,
  depthWrite,
}: {
  colorUrl: string;
  roughUrl: string;
  normalUrl: string;
  repeatM: number;
  worldSpan: number;
  roughness: number;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}) {
  const [map, roughnessMap, normalMap] = useTexture([colorUrl, roughUrl, normalUrl]);
  useLayoutEffect(() => {
    const tiles = Math.max(1, worldSpan / Math.max(0.08, repeatM));
    configureFloorMap(map, tiles, true);
    configureFloorMap(roughnessMap, tiles, false);
    configureFloorMap(normalMap, tiles, false);
  }, [map, roughnessMap, normalMap, repeatM, worldSpan]);
  return (
    <meshStandardMaterial
      map={map}
      roughnessMap={roughnessMap}
      normalMap={normalMap}
      normalScale={new THREE.Vector2(0.55, 0.55)}
      color="#ffffff"
      roughness={roughness}
      metalness={0.02}
      side={THREE.DoubleSide}
      transparent={transparent}
      opacity={opacity}
      depthWrite={depthWrite}
      polygonOffset
      polygonOffsetFactor={4}
      polygonOffsetUnits={4}
    />
  );
}

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
        <RoundedBox args={[size.w + 0.02, size.h + 0.02, 0.008]} radius={radius} smoothness={4} position={[0, 0, 0]}>
          <meshBasicMaterial color={stroke} depthTest={false} toneMapped={false} />
        </RoundedBox>
        <RoundedBox args={[size.w, size.h, 0.01]} radius={Math.max(0.01, radius - 0.008)} smoothness={4} position={[0, 0, 0.004]}>
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

function WallMeshes() {
  const walls = useVisibleWalls();
  const openings = usePlannerStore((s) => s.openings);
  const color = usePlannerStore((s) => s.wallColor);
  const selectedId = usePlannerStore((s) => s.selectedWallId);
  const selectedOpeningId = usePlannerStore((s) => s.selectedOpeningId);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const unitSystem = usePlannerStore((s) => s.unitSystem);
  const select = usePlannerStore((s) => s.selectWall);
  const placeOpeningAtWorld = usePlannerStore((s) => s.placeOpeningAtWorld);
  const layers = usePlannerStore((s) => s.layerVisibility);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const elevationFace = usePlannerStore((s) => s.elevationFace);
  const tool = usePlannerStore((s) => s.tool);
  const opacityByWall = useDollhouseCutaway(walls);
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
  const planWallTool = usePlannerStore((s) => s.planWallTool);
  // Openings can be dragged in top plan and 3D orbit (not walk).
  const openingDragEnabled = tool === 'select' && (cameraMode === 'top' || cameraMode === 'orbit');
  const placingOpening = tool === 'door' || tool === 'window' || tool === 'passage';
  const { invalidate } = useThree();

  const onWallClick = (id: string, point?: { x: number; z: number }) => {
    if (placingOpening && point && (tool === 'door' || tool === 'window' || tool === 'passage')) {
      placeOpeningAtWorld(id, tool, point.x, point.z);
      window.dispatchEvent(new Event('roomcraft-open-properties'));
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
        const pickProxy = (
          <mesh
            key={w.id + 'pick'}
            userData={{ wallCutawayPick: true }}
            position={[midX, w.height / 2, midZ]}
            rotation={[0, angle, 0]}
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
              castShadow={!fading}
              receiveShadow={!fading}
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
          ...(cameraMode === 'top' && layers.dims && dimWallIds?.has(w.id)
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
  const guides = useMemo(() => {
    if (selected.placementKind === 'perimeter-trim' || selected.placementKind === 'stair') return [];
    return alignmentGuides(
      selected,
      others.filter((o) => o.placementKind !== 'perimeter-trim' && o.placementKind !== 'stair'),
    );
  }, [selected, others]);
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
  const layers = usePlannerStore((s) => s.layerVisibility);
  const walls = usePlannerStore((s) => s.walls);
  const openings = usePlannerStore((s) => s.openings);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const workflowStage = usePlannerStore((s) => s.workflowStage);
  const placing = usePlannerStore((s) => !!s.pendingPlacement);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const items = useMemo(() => {
    if (cameraMode === 'elevation') return [];
    const source = layers.furniture
      ? allItems
      : allItems.filter((f) => f.placementKind === 'stair' || f.placementKind === 'perimeter-trim');
    if (workflowStage !== 'room' || !selectedRoomId) return source;
    const room = planRooms.find((r) => r.id === selectedRoomId);
    if (!room) return source;
    return source.filter((item) => {
      const planX = item.x * PIXELS_PER_METER + WORLD_ORIGIN.x;
      const planY = item.z * PIXELS_PER_METER + WORLD_ORIGIN.y;
      return pointInPlanRoom(planX, planY, room);
    });
  }, [allItems, planRooms, selectedRoomId, workflowStage, layers.furniture, cameraMode]);
  const selectedId = usePlannerStore((s) => s.selectedFurnitureId);
  const select = usePlannerStore((s) => s.selectFurniture);
  const update = usePlannerStore((s) => s.updateFurniture);
  const updateLive = usePlannerStore((s) => s.updateFurnitureLive);
  const custom = useInventoryStore((s) => s.items);
  const catalogById = useMemo(() => new Map([...catalog, ...custom].map((c) => [c.id, c])), [custom]);
  const selected = items.find((i) => i.id === selectedId);
  const pending = useRef<Partial<FurnitureItem> | null>(null);
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
      collisionsAsync(items.filter((i) => i.placementKind !== 'perimeter-trim' && i.placementKind !== 'stair')).then((pairs) => {
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
    const next = {
      x: placed.x,
      z: placed.z,
      rotation: placed.rotation ?? rotation ?? item.rotation,
      wallId: placed.wallId,
      wallOffset: placed.wallOffset,
      ...(item.mountingType === 'wall' || item.mountingType === 'ceiling' ? { y: nextY } : {}),
    };
    // Block door clearance + stacking on other products.
    if (
      furnitureHitsDoorSwing(
        { x: next.x, z: next.z, width: item.width, depth: item.depth, rotation: next.rotation },
        doorSwingZones(openings, walls),
      ) ||
      wouldOverlapFurniture(
        {
          id: item.id,
          x: next.x,
          y: nextY,
          z: next.z,
          width: item.width,
          depth: item.depth,
          height: item.height,
          rotation: next.rotation,
          mountingType: item.mountingType,
          placementKind: item.placementKind,
        },
        usePlannerStore.getState().furniture.filter((f) => f.id !== item.id),
      )
    ) {
      return {
        x: item.x,
        z: item.z,
        rotation: item.rotation,
        wallId: item.wallId,
        wallOffset: item.wallOffset,
        ...(item.mountingType === 'wall' || item.mountingType === 'ceiling' ? { y: item.y } : {}),
      };
    }
    return next;
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
    if (item.placementKind === 'perimeter-trim') {
      e.stopPropagation();
      select(item.id);
      return;
    }
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
    const isWallArt =
      item.mountingType === 'wall' ||
      /picture|mirror|art/i.test(item.name) ||
      product?.placementMode === 'wall-art';
    return {
      lowUrl: product?.lowPolyModelUrl || product?.modelUrl,
      fullUrl: product?.modelUrl || product?.lowPolyModelUrl,
      // Wall art still uses thumbnail / face images; millwork uses PBR textureUrl.
      textureUrl: isWallArt ? product?.thumbnailUrl || product?.textureUrl : undefined,
      surfaceMaps: product?.textureUrl
        ? {
            textureUrl: product.textureUrl,
            roughnessMapUrl: product.roughnessMapUrl,
            normalMapUrl: product.normalMapUrl,
            metalnessMapUrl: product.metalnessMapUrl,
            textureRepeat: product.textureRepeat,
            roughness: product.roughness,
          }
        : undefined,
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
              <group rotation={[0, 0, i.mountingType === 'wall' ? i.roll ?? 0 : 0]}>
              <FurnitureVisual
                item={i}
                lowUrl={urls.lowUrl}
                fullUrl={urls.fullUrl}
                textureUrl={urls.textureUrl}
                surfaceMaps={urls.surfaceMaps}
                colliding={collisions.has(i.id)}
                onSelect={(e) => {
                  e.stopPropagation();
                  if (placing) return;
                  // Plane-drag path selects on pointer-down; tap opens nothing else.
                  if (usePlaneDrag) return;
                  select(i.id);
                }}
                onPointerDown={!placing && usePlaneDrag ? (e) => beginItemDrag(e, i) : undefined}
              />
              {i.showClearance && <ClearanceVolume item={i} />}
              </group>
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
            enabled={!placing && !usePlaneDrag && selected.placementKind !== 'perimeter-trim'}
            onDragStart={() => {
              if (selected.placementKind === 'perimeter-trim') return;
              document.body.dataset.movingFurniture = 'true';
              setDragging(true);
              window.dispatchEvent(new Event('roomcraft-drag-start'));
            }}
            onDrag={(m) => {
              if (selected.placementKind === 'perimeter-trim') return;
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
              if (selected.placementKind === 'perimeter-trim') return;
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
              <group rotation={[0, 0, selected.mountingType === 'wall' ? selected.roll ?? 0 : 0]}>
              <FurnitureVisual
                item={selected}
                {...urlsFor(selected)}
                selected
                colliding={collisions.has(selected.id)}
                onPointerDown={!placing && usePlaneDrag ? (e) => beginItemDrag(e, selected) : undefined}
              />
              {selected.showClearance && <ClearanceVolume item={selected} />}
              </group>
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
  const furniture = usePlannerStore((s) => s.furniture);
  const floors = usePlannerStore((s) => s.floors);
  const activeFloorId = usePlannerStore((s) => s.activeFloorId);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const enterRoom = usePlannerStore((s) => s.enterRoom);
  const selectRoom = usePlannerStore((s) => s.selectRoom);
  const workflowStage = usePlannerStore((s) => s.workflowStage);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const studioMode = usePlannerStore((s) => s.studioMode);
  const tool = usePlannerStore((s) => s.tool);
  const selectedSurface = usePlannerStore((s) => s.selectedSurface);
  const selectSurface = usePlannerStore((s) => s.selectSurface);
  const layers = usePlannerStore((s) => s.layerVisibility);
  const detected = useMemo(() => detectRoomPolygons(walls), [walls]);
  const rooms = planRooms.length ? planRooms.map((r) => r.points) : detected;
  const ceilingHeight = walls[0]?.height ?? 2.7;
  const stairs = useMemo(
    () => stairsCuttingFloor(activeFloorId, floors, activeFloorId, furniture),
    [activeFloorId, floors, furniture],
  );
  const { camera, invalidate } = useThree();
  const ceilingSmooth = useRef(0.22);
  const floorSmooth = useRef(1);
  const plateKey = useRef('');
  const [ceilingOpacity, setCeilingOpacity] = useState(0.22);
  const [floorOpacity, setFloorOpacity] = useState(1);
  // Top / bird’s-eye must see the floor — a solid ceiling makes the room unusable to edit.
  const showCeiling = (cameraMode !== 'top' && cameraMode !== 'elevation') || selectedSurface === 'ceiling';

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
    const fill = usePlannerStore.getState().pendingFloorFill;
    if (fill) {
      usePlannerStore.getState().applyFloorFillToRoom(roomId ?? null);
      return;
    }
    if (roomId) {
      // Already editing this room in 3D — selecting the floor must NOT reset camera to top.
      if (workflowStage === 'room' && selectedRoomId === roomId) {
        selectSurface('floor');
        return;
      }
      // Plan level: select the room — Edit / Furnish / Remove live on the plan rail.
      if (workflowStage !== 'room') {
        selectRoom(roomId);
        window.setTimeout(() => {
          window.dispatchEvent(new Event('roomcraft-fit-plan'));
          window.dispatchEvent(new Event('roomcraft-refocus'));
        }, 40);
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
              {label?.floorCatalogId ? (
                <FloorFillPieces
                  points={points}
                  holes={stairs}
                  catalogId={label.floorCatalogId}
                  color={floorColor}
                  opacity={floorOpacity}
                  transparent={cameraMode === 'orbit' || floorOpacity < 0.999}
                  depthWrite={floorOpacity > 0.85}
                  onClick={(e) => chooseFloor(e, label?.id)}
                />
              ) : (
              <mesh
                rotation={[Math.PI / 2, 0, 0]}
                receiveShadow
                position={[0, -0.035, 0]}
                onClick={(e) => chooseFloor(e, label?.id)}
              >
                <shapeGeometry args={[roomShapeWithHoles(points, stairs)]} />
                <FloorMaterial
                  color={floorColor}
                  catalogId={label?.floorCatalogId}
                  opacity={floorOpacity}
                  transparent={cameraMode === 'orbit' || floorOpacity < 0.999}
                  depthWrite={floorOpacity > 0.85}
                  worldSpan={span}
                />
              </mesh>
              )}
              {selected && cameraMode === 'top' && (
                <>
                  <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.016, 0]} raycast={() => {}} renderOrder={2}>
                    <shapeGeometry args={[roomShapeWithHoles(points, stairs)]} />
                    <meshBasicMaterial
                      color="#0058a3"
                      transparent
                      opacity={0.14}
                      depthWrite={false}
                      toneMapped={false}
                      side={THREE.DoubleSide}
                    />
                  </mesh>
                  <Line
                    points={[
                      ...points.map((p) => {
                        const [x, z] = world(p.x, p.y);
                        return [x, 0.07, z] as [number, number, number];
                      }),
                      (() => {
                        const [x, z] = world(points[0]!.x, points[0]!.y);
                        return [x, 0.07, z] as [number, number, number];
                      })(),
                    ]}
                    color="#0058a3"
                    lineWidth={2.5}
                  />
                </>
              )}
              {selected && cameraMode !== 'top' && (
                <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.018, 0]} raycast={() => {}} renderOrder={2}>
                  <shapeGeometry args={[roomShapeWithHoles(points, stairs)]} />
                  <meshBasicMaterial
                    color="#111820"
                    transparent
                    opacity={0.08}
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
                  raycast={() => {}}
                >
                  <shapeGeometry args={[roomShapeWithHoles(points, stairs)]} />
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
              {label && cameraMode === 'top' && layers.labels && (
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
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ceilingHeight, 0]} raycast={() => {}}>
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
      <AnnotationLayer />
      <GhostPlacement />
      <PlanEditLayer />
      <RoofAndSite />
      <StackedInactiveFloors />
    </Bvh>
  );
}

function AnnotationLayer() {
  const layers = usePlannerStore((s) => s.layerVisibility);
  const annotations = usePlannerStore((s) => s.annotations);
  const activeFloorId = usePlannerStore((s) => s.activeFloorId);
  const selectedId = usePlannerStore((s) => s.selectedAnnotationId);
  const select = usePlannerStore((s) => s.selectAnnotation);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  if (!layers.annotations || cameraMode !== 'top') return null;
  const rows = annotations.filter((a) => a.floorId === activeFloorId);
  return (
    <group>
      {rows.map((a) => (
        <Html key={a.id} position={[a.x, 0.25, a.z]} center style={{ pointerEvents: 'auto' }} zIndexRange={[60, 40]}>
          <button
            type="button"
            className={`plan-annotation is-${a.kind}${selectedId === a.id ? ' is-selected' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              select(a.id);
              window.dispatchEvent(new Event('roomcraft-open-properties'));
            }}
            title={a.text}
          >
            {a.kind === 'cloud' ? '☁' : a.kind === 'arrow' ? '➤' : '✎'} {a.text}
          </button>
        </Html>
      ))}
    </group>
  );
}

/** Optional roof + outdoor patio + site setback guides (roof off by default). */
function RoofAndSite() {
  const walls = usePlannerStore((s) => s.walls);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const roofStyle = usePlannerStore((s) => s.roofStyle);
  const siteSetback = usePlannerStore((s) => s.siteSetback);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const studioMode = usePlannerStore((s) => s.studioMode);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const layers = usePlannerStore((s) => s.layerVisibility);
  const height = walls[0]?.height ?? 2.7;

  const envelope = useMemo(() => {
    const pts = [
      ...walls.flatMap((w) => [w.start, w.end]),
      ...planRooms.flatMap((r) => r.points),
    ];
    if (!pts.length) return null;
    const xs = pts.map((p) => (p.x - WORLD_ORIGIN.x) / PIXELS_PER_METER);
    const zs = pts.map((p) => (p.y - WORLD_ORIGIN.y) / PIXELS_PER_METER);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    };
  }, [walls, planRooms]);

  if (!envelope) return null;
  const w = Math.max(0.5, envelope.maxX - envelope.minX);
  const d = Math.max(0.5, envelope.maxZ - envelope.minZ);
  const cx = (envelope.minX + envelope.maxX) / 2;
  const cz = (envelope.minZ + envelope.maxZ) / 2;

  const outdoorRooms = planRooms.filter((r) => r.roomType === 'Outdoor');
  // Only show roofs in exterior orbit — never while walking inside or on top plan.
  const showRoof = layers.roof && roofStyle !== 'none' && cameraMode === 'orbit';
  const showSetback =
    layers.setbacks && cameraMode === 'top' && studioMode === 'architect' && !selectedRoomId && !isCoarsePointer();
  const rise = Math.min(1.1, Math.max(0.4, Math.min(w, d) * 0.2));
  const ridgeAlongZ = w >= d;
  const halfSpan = (ridgeAlongZ ? w : d) / 2;
  const slopeLen = Math.hypot(halfSpan, rise);
  const pitch = Math.atan2(rise, halfSpan);

  return (
    <group>
      {outdoorRooms.map((room) => {
        const shape = roomShape(room.points);
        return (
          <mesh key={`patio-${room.id}`} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
            <shapeGeometry args={[shape]} />
            <meshStandardMaterial color="#9aa3ad" roughness={0.95} />
          </mesh>
        );
      })}
      {showRoof && (
        <group position={[cx, height + 0.02, cz]}>
          {roofStyle === 'flat' ? (
            <mesh position={[0, 0.06, 0]} castShadow>
              <boxGeometry args={[w + 0.35, 0.1, d + 0.35]} />
              <meshStandardMaterial color="#6b7280" roughness={0.85} />
            </mesh>
          ) : ridgeAlongZ ? (
            <>
              <mesh position={[-halfSpan / 2, rise / 2, 0]} rotation={[0, 0, pitch]} castShadow>
                <boxGeometry args={[slopeLen, 0.05, d + 0.3]} />
                <meshStandardMaterial color="#7c8491" roughness={0.82} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[halfSpan / 2, rise / 2, 0]} rotation={[0, 0, -pitch]} castShadow>
                <boxGeometry args={[slopeLen, 0.05, d + 0.3]} />
                <meshStandardMaterial color="#7c8491" roughness={0.82} side={THREE.DoubleSide} />
              </mesh>
            </>
          ) : (
            <>
              <mesh position={[0, rise / 2, -halfSpan / 2]} rotation={[-pitch, 0, 0]} castShadow>
                <boxGeometry args={[w + 0.3, 0.05, slopeLen]} />
                <meshStandardMaterial color="#7c8491" roughness={0.82} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[0, rise / 2, halfSpan / 2]} rotation={[pitch, 0, 0]} castShadow>
                <boxGeometry args={[w + 0.3, 0.05, slopeLen]} />
                <meshStandardMaterial color="#7c8491" roughness={0.82} side={THREE.DoubleSide} />
              </mesh>
            </>
          )}
        </group>
      )}
      {showSetback && (
        <Line
          points={[
            [envelope.minX - siteSetback.sideM, 0.02, envelope.minZ - siteSetback.frontM],
            [envelope.maxX + siteSetback.sideM, 0.02, envelope.minZ - siteSetback.frontM],
            [envelope.maxX + siteSetback.sideM, 0.02, envelope.maxZ + siteSetback.rearM],
            [envelope.minX - siteSetback.sideM, 0.02, envelope.maxZ + siteSetback.rearM],
            [envelope.minX - siteSetback.sideM, 0.02, envelope.minZ - siteSetback.frontM],
          ]}
          color="#9aa3ad"
          dashed
          dashSize={0.25}
          gapSize={0.15}
          lineWidth={1}
        />
      )}
    </group>
  );
}

/** When stackView is on, draw inactive floors as solid plates with stair openings. */
function StackedInactiveFloors() {
  const stackView = usePlannerStore((s) => s.stackView);
  const floors = usePlannerStore((s) => s.floors);
  const activeFloorId = usePlannerStore((s) => s.activeFloorId);
  const activeFurniture = usePlannerStore((s) => s.furniture);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  if (!stackView || cameraMode === 'top' || floors.length < 2) return null;

  const activeIdx = Math.max(0, floors.findIndex((f) => f.id === activeFloorId));
  const storyHeightAt = (floor: (typeof floors)[number]) =>
    floor.storyHeightM ??
    floor.scene.walls?.[0]?.height ??
    activeFurniture.find((f) => f.placementKind === 'stair')?.stair?.riseM ??
    3.0;

  return (
    <group>
      {floors.map((floor, i) => {
        if (floor.id === activeFloorId) return null;
        let y = 0;
        if (i > activeIdx) {
          for (let k = activeIdx; k < i; k++) y += storyHeightAt(floors[k]!);
        } else {
          for (let k = i; k < activeIdx; k++) y -= storyHeightAt(floors[k]!);
        }
        const rooms = floor.planRooms ?? floor.scene.planRooms ?? [];
        const walls = floor.scene.walls ?? [];
        const holes = stairsCuttingFloor(floor.id, floors, activeFloorId, activeFurniture);
        const storyH = storyHeightAt(floor);
        return (
          <group key={floor.id} position={[0, y, 0]}>
            {rooms.map((room) => (
              <mesh key={room.id} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
                <shapeGeometry args={[roomShapeWithHoles(room.points, holes)]} />
                <meshStandardMaterial color="#d7dde5" roughness={0.92} transparent opacity={0.88} />
              </mesh>
            ))}
            {walls.map((wall) => {
              const ax = (wall.start.x - WORLD_ORIGIN.x) / PIXELS_PER_METER;
              const az = (wall.start.y - WORLD_ORIGIN.y) / PIXELS_PER_METER;
              const bx = (wall.end.x - WORLD_ORIGIN.x) / PIXELS_PER_METER;
              const bz = (wall.end.y - WORLD_ORIGIN.y) / PIXELS_PER_METER;
              const len = Math.hypot(bx - ax, bz - az) || 0.01;
              const midX = (ax + bx) / 2;
              const midZ = (az + bz) / 2;
              const angle = -Math.atan2(bz - az, bx - ax);
              const exterior = (wall.assembly ?? 'interior') === 'exterior';
              return (
                <mesh
                  key={wall.id}
                  position={[midX, storyH / 2, midZ]}
                  rotation={[0, angle, 0]}
                >
                  <boxGeometry args={[len, storyH, Math.max(wall.thickness, 0.08)]} />
                  <meshStandardMaterial
                    color={exterior ? '#c9c4bb' : '#e4e0d8'}
                    transparent
                    opacity={0.55}
                    depthWrite={false}
                  />
                </mesh>
              );
            })}
            <Html position={[0, storyH + 0.2, 0]} center style={{ pointerEvents: 'none' }}>
              <div className="stack-floor-chip">{floor.name}</div>
            </Html>
          </group>
        );
      })}
    </group>
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
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0]}
        userData={{ placementPlane: true }}
        onPointerMove={onMove}
        onClick={onPlace}
      >
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
      </mesh>
      {pending.mountingType === 'wall' && pending.wallId && (
        <mesh
          position={[pending.x, (walls.find((w) => w.id === pending.wallId)?.height ?? 2.7) / 2, pending.z]}
          rotation={[0, pending.rotation, 0]}
          userData={{ placementPlane: true }}
          onPointerMove={onMove}
          onClick={onPlace}
        >
          <planeGeometry args={[12, 4]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      <group position={[pending.x, pending.y, pending.z]} rotation={[0, pending.rotation, 0]} userData={{ placementPlane: true }}>
        <mesh position={[0, pending.height / 2, 0]} onPointerMove={onMove} onClick={onPlace}>
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
  const tool = usePlannerStore((s) => s.tool);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const select = usePlannerStore((s) => s.selectFurniture);
  const selectWall = usePlannerStore((s) => s.selectWall);
  const selectSurface = usePlannerStore((s) => s.selectSurface);
  const selectRoom = usePlannerStore((s) => s.selectRoom);
  const custom = useInventoryStore((s) => s.items);
  const placingOpening = tool === 'door' || tool === 'window' || tool === 'passage';
  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('catalogId');
    const item = [...catalog, ...custom].find((i) => i.id === id);
    if (!item) return;
    if (item.placementMode === 'ceiling-perimeter' || item.placementMode === 'floor-perimeter') {
      usePlannerStore.getState().applyPerimeterTrim(
        item.id,
        item.name,
        item.category,
        item.dims,
        item.color,
        item.placementMode === 'ceiling-perimeter' ? 'ceiling' : 'floor',
      );
      return;
    }
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
        </Suspense>
        {!coarse && (
          <Suspense fallback={null}>
            <Environment preset="apartment" environmentIntensity={0.35} />
          </Suspense>
        )}
        <CameraRig />
      </Canvas>
      {pending ? (
        <div className="scene-help">Move to place · Tap floor or Confirm to drop · Cancel to abort</div>
      ) : (
        <div className="scene-help">Drag furniture to move · Tap through open walls · Empty space pans/orbits</div>
      )}
      {placingOpening && cameraMode === 'top' && (
        <div className="opening-place-hint opening-place-hint--chrome" role="status">
          Tap a wall to place {tool}
        </div>
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
