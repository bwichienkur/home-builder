import { useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { usePlannerStore } from '../../store/plannerStore';
import { detectRoomPolygons } from '../../lib/geometry/rooms';
import { framingFromPoints, framingFromWall, framingFromWalls, planChromeFit, worldShiftForFreeArea } from '../../lib/geometry/planFraming';
import { wallExteriorSide } from '../../lib/geometry/roomWalls';
import { pickFacingWall, wallWorldFrame, elevationOrthoZoom } from '../../lib/geometry/elevationFace';
import { FirstPersonControls } from './FirstPersonControls';
import { isEyeOrbit } from './cameraModes';
import type { Wall } from '../../types';

export function CameraRig() {
  const mode = usePlannerStore((s) => s.cameraMode);
  const elevationFace = usePlannerStore((s) => s.elevationFace);
  const viewYawDeg = usePlannerStore((s) => s.viewYawDeg);
  const walls = usePlannerStore((s) => s.walls);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const workflowStage = usePlannerStore((s) => s.workflowStage);
  const placing = usePlannerStore((s) => !!s.pendingPlacement);
  const planWallTool = usePlannerStore((s) => s.planWallTool);
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
  const dimTray =
    mode === 'top' && workflowStage === 'house' && planWallTool && !!planSelectedRoom && planSelectedRoom.points.length >= 3;

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
        dimTray,
      }),
    [canvasW, canvasH, inspectorOpen, showRightRail, coarse, inspectorTick, focusWall, frameRoom, mode, dimTray],
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
  const fovDeg = isEyeOrbit(mode) ? 58 : mode === 'top' || mode === 'elevation' ? 42 : 48;
  const aspect = Math.max(0.35, canvasW / Math.max(1, canvasH));

  // Page center by default; shift into the free band left of a wide inspector only.
  const shiftX = useMemo(() => {
    const menuShiftX = menuOpen ? viewFraming.span * 0.28 : 0;
    if (chromeFit.shiftFraction <= 0) return menuShiftX;
    const dist =
      mode === 'top'
        ? viewFraming.topHeight
        : isEyeOrbit(mode)
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
    if (isEyeOrbit(mode)) {
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
      : isEyeOrbit(mode)
        ? Math.max(14, viewFraming.span * 1.4)
        : Math.max(viewFraming.orbitPose[1] * 2.6, viewFraming.span * 5.5, 52);
  const minDistance = isEyeOrbit(mode) ? 1.2 : mode === 'top' ? Math.max(3, viewFraming.span * 0.08) : Math.max(2.5, viewFraming.span * 0.12);

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
          key={mode === 'firstPerson' ? 'fp-persp' : 'persp'}
          makeDefault
          position={poseTuple}
          fov={isEyeOrbit(mode) || mode === 'firstPerson' ? 58 : 48}
        />
      )}
      {mode === 'firstPerson' ? (
        <FirstPersonControls />
      ) : (
        <OrbitControls
          ref={controls}
          enabled={!moving && !placing}
          target={[targetTuple[0], isEyeOrbit(mode) ? 1.1 : targetTuple[1], targetTuple[2]]}
          minPolarAngle={mode === 'top' ? 1e-4 : mode === 'elevation' ? Math.PI / 2 - 1e-4 : isEyeOrbit(mode) ? 0.7 : 0}
          maxPolarAngle={mode === 'top' ? 1e-3 : mode === 'elevation' ? Math.PI / 2 + 1e-4 : isEyeOrbit(mode) ? Math.PI / 2.05 : Math.PI - 0.06}
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
      )}
    </>
  );
}
