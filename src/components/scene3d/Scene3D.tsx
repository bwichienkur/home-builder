import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bvh, Environment, Html, Line, PivotControls, Text, useTexture } from '@react-three/drei';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { usePlannerStore } from '../../store/plannerStore';
import { useCatalogById } from '../../store/catalogStore';
import type { FurnitureItem, PlanRoomLabel, Wall } from '../../types';
import {
  detectRoomPolygons,
  expandRoomPolygon,
  FLOOR_SEAL_EXPAND_M,
  FLOOR_UNDER_WALL_M,
  roomBoundsPolygon,
  roomShape,
  roomShapeWithHoles,
} from '../../lib/geometry/rooms';
import { alignmentGuides, clampWallMountY, constrainPlacement, pointOnWall, roomFloorCenter, wallFrame, WORLD_ORIGIN } from '../../lib/geometry/placement';
import { doorSwingZones, furnitureHitsDoorSwing } from '../../lib/geometry/doorClearance';
import { wouldOverlapFurniture } from '../../lib/collisions';
import { framingFromWalls } from '../../lib/geometry/planFraming';
import { pointInPlanRoom } from '../../lib/geometry/roomWalls';
import { preferInteriorPicks as filterInteriorPicks } from '../../lib/geometry/scenePicks';
import { stairsCuttingFloor } from '../../lib/geometry/stairCutouts';
import { orbitCeilingOpacity, orbitFloorOpacity } from '../../lib/geometry/plateFade';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';
import { collisionsAsync } from '../../lib/collisions';
import { formatLength } from '../../lib/measurements';
import { rafThrottle } from '../../lib/rafThrottle';
import { useInventoryStore } from '../../store/inventoryStore';
import { FurnitureVisual } from './CatalogModel';
import { FloorFillPieces } from './FloorFillPieces';
import { PlanEditLayer } from './PlanEditLayer';
import { CadPlanOverlay } from './CadPlanOverlay';
import { PlanRoomDashedOutlines } from './PlanRoomDashedOutlines';
import { CameraRig } from './CameraRig';
import { WallMeshes } from './WallMeshes';
import { isEyeOrbit, walkPerfActive } from './cameraModes';
import { isCoarsePointer, world } from './sceneWorld';


/** Prefer furniture inside the room over cutaway wall pick proxies that sit in front of the camera. */
function preferInteriorPicks(hits: THREE.Intersection[]) {
  const st = usePlannerStore.getState();
  return filterInteriorPicks(hits, {
    pendingPlacement: st.pendingPlacement,
    cameraMode: st.cameraMode,
    planWallTool: st.planWallTool,
    tool: st.tool,
  });
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


function SceneAtmosphere() {
  const mode = usePlannerStore((s) => s.cameraMode);
  const walls = usePlannerStore((s) => s.walls);
  const framing = useMemo(() => framingFromWalls(walls), [walls]);
  const { gl, scene } = useThree();
  // Any non-plan 3D view: floor-matched clear color so wall–floor micro-gaps never flash studio gray.
  const bg = mode === 'top' || mode === 'elevation' ? '#e8eaed' : '#c9b18f';
  useLayoutEffect(() => {
    const c = new THREE.Color(bg);
    scene.background = c;
    gl.setClearColor(c, 1);
  }, [bg, gl, scene]);
  // Re-assert every frame — some R3F/drei paths reset clear color on resize/HMR.
  useFrame(() => {
    const c = scene.background;
    if (c instanceof THREE.Color) gl.setClearColor(c, 1);
  });
  if (mode === 'top' || mode === 'elevation') return null;
  const near = Math.max(85, framing.span * 6.5);
  const far = Math.max(near + 100, framing.span * 16);
  return <fog attach="fog" args={[bg, near, far]} />;
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
  const catalogById = useCatalogById();
  const product = useMemo(() => {
    if (!catalogId) return undefined;
    return catalogById.get(catalogId);
  }, [catalogId, catalogById]);
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
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
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
      polygonOffsetFactor={1}
      polygonOffsetUnits={1}
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
      polygonOffsetFactor={1}
      polygonOffsetUnits={1}
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
      polygonOffsetFactor={1}
      polygonOffsetUnits={1}
    />
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
  const catalogById = useCatalogById();
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
      // Plan level: select the room so the black rail (Edit / Walls / Furnish) appears.
      if (workflowStage !== 'room') {
        const st = usePlannerStore.getState();
        if (st.planWallTool && st.selectedRoomId === roomId) {
          if (st.selectedWallId) st.selectWall(null);
          window.dispatchEvent(new Event('roomcraft-close-properties'));
          return;
        }
        selectRoom(roomId);
        window.dispatchEvent(new Event('roomcraft-close-properties'));
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
  // Plan stays exact for CAD registration; Walk/3D floors expand under walls so seams never show white.
  const sealFloors = cameraMode !== 'top' && cameraMode !== 'elevation';
  // In Walk/3D never drop neighboring room floors — isolating to one room left white voids at shared walls.
  const roomEntries = useMemo(() => {
    if (planRooms.length) {
      const labels =
        isolating && !sealFloors ? planRooms.filter((r) => r.id === selectedRoomId) : planRooms;
      return labels.map((label) => ({ points: label.points, label }));
    }
    return rooms.map((points, i) => ({ points, label: undefined as PlanRoomLabel | undefined, i }));
  }, [planRooms, rooms, isolating, selectedRoomId, sealFloors]);
  const houseSealPoints = useMemo(() => {
    if (!sealFloors) return null;
    const polys = planRooms.length
      ? planRooms.map((r) => r.points)
      : rooms;
    if (!polys.length) return null;
    return roomBoundsPolygon(polys, FLOOR_SEAL_EXPAND_M + 0.15);
  }, [sealFloors, planRooms, rooms]);

  return (
    <Bvh enabled={cameraMode !== 'top'}>
      <CadPlanOverlay />
      <PlanRoomDashedOutlines />
      {houseSealPoints && (
        <mesh
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, -0.002, 0]}
          raycast={() => {}}
          userData={{ houseFloorSeal: true }}
        >
          <extrudeGeometry args={[roomShape(houseSealPoints), { depth: 0.14, bevelEnabled: false, steps: 1 }]} />
          <meshBasicMaterial color={floor} toneMapped={false} depthWrite />
        </mesh>
      )}
      {roomEntries.length ? (
        roomEntries.map(({ points, label }, i) => {
          const selected = !!label && label.id === selectedRoomId;
          const floorColor = label?.floorColor || floor;
          const ceilingColor = label?.ceilingColor || ceiling;
          const floorPoints = sealFloors ? expandRoomPolygon(points, FLOOR_UNDER_WALL_M) : points;
          const sealPoints = sealFloors ? expandRoomPolygon(points, FLOOR_SEAL_EXPAND_M) : null;
          const span = (() => {
            const xs = points.map((p) => (p.x - WORLD_ORIGIN.x) / PIXELS_PER_METER);
            const zs = points.map((p) => (p.y - WORLD_ORIGIN.y) / PIXELS_PER_METER);
            return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1);
          })();
          const labelSize = Math.min(0.55, Math.max(0.22, span * 0.08));
          return (
            <group key={label?.id ?? i}>
              {sealPoints && (
                <mesh
                  rotation={[Math.PI / 2, 0, 0]}
                  position={[0, -0.002, 0]}
                  raycast={() => {}}
                  userData={{ floorSeal: true }}
                >
                  <extrudeGeometry args={[roomShape(sealPoints), { depth: 0.12, bevelEnabled: false, steps: 1 }]} />
                  <meshBasicMaterial color={floorColor} toneMapped={false} depthWrite />
                </mesh>
              )}
              {label?.floorCatalogId ? (
                <FloorFillPieces
                  points={floorPoints}
                  holes={stairs}
                  catalogId={label.floorCatalogId}
                  color={floorColor}
                  opacity={floorOpacity}
                  transparent={cameraMode === 'orbit' || floorOpacity < 0.999}
                  depthWrite={floorOpacity > 0.85}
                  userData={{ roomPick: true }}
                  onClick={(e) => chooseFloor(e, label?.id)}
                />
              ) : sealFloors ? (
              <mesh
                rotation={[Math.PI / 2, 0, 0]}
                receiveShadow
                position={[0, -0.002, 0]}
                userData={{ roomPick: true }}
                onClick={(e) => chooseFloor(e, label?.id)}
              >
                <extrudeGeometry
                  args={[roomShapeWithHoles(floorPoints, stairs), { depth: 0.1, bevelEnabled: false, steps: 1 }]}
                />
                <FloorMaterial
                  color={floorColor}
                  catalogId={label?.floorCatalogId}
                  opacity={floorOpacity}
                  transparent={cameraMode === 'orbit' || floorOpacity < 0.999}
                  depthWrite={floorOpacity > 0.85}
                  worldSpan={span}
                />
              </mesh>
              ) : (
              <mesh
                rotation={[Math.PI / 2, 0, 0]}
                receiveShadow={false}
                position={[0, -0.035, 0]}
                userData={{ roomPick: true }}
                onClick={(e) => chooseFloor(e, label?.id)}
              >
                <shapeGeometry args={[roomShapeWithHoles(floorPoints, stairs)]} />
                <FloorMaterial
                  color={floorColor}
                  catalogId={label?.floorCatalogId}
                  opacity={floorOpacity}
                  transparent={floorOpacity < 0.999}
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
                    color={selectedSurface === 'ceiling' ? '#0058a3' : ceilingColor}
                    roughness={0.92}
                    side={THREE.DoubleSide}
                    transparent
                    opacity={ceilingOpacity}
                    depthWrite={ceilingOpacity > 0.75 || isEyeOrbit(cameraMode) || cameraMode === 'firstPerson'}
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
                  userData={{ roomPick: true }}
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
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.035, 0]} userData={{ roomPick: true }} onClick={chooseFloor}>
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
                depthWrite={ceilingOpacity > 0.75 || isEyeOrbit(cameraMode) || cameraMode === 'firstPerson'}
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
  const pendingCorner = usePlannerStore((s) => s.pendingCorner);
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const select = usePlannerStore((s) => s.selectFurniture);
  const selectWall = usePlannerStore((s) => s.selectWall);
  const selectSurface = usePlannerStore((s) => s.selectSurface);
  const selectRoom = usePlannerStore((s) => s.selectRoom);
  const custom = useInventoryStore((s) => s.items);
  const catalogById = useCatalogById();
  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('catalogId');
    const item = catalogById.get(id);
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
  const walking = walkPerfActive(cameraMode);
  if (!supported) return <SceneFallback />;
  return (
    <div className="scene-host" onDragOver={(e) => e.preventDefault()} onDrop={drop}>
      <Canvas
        fallback={<SceneFallback />}
        shadows={!coarse && !walking}
        // Walk: cap DPR for fps. Edit modes keep sharper edges.
        dpr={walking ? [1, 1.25] : coarse ? [1, 1.75] : [1, 2]}
        frameloop={walking ? 'always' : 'demand'}
        performance={{ min: walking ? 0.4 : coarse ? 0.55 : 0.65, debounce: walking ? 0 : 200 }}
        gl={{
          antialias: !walking,
          powerPreference: 'high-performance',
          alpha: false,
          stencil: false,
          depth: true,
        }}
        onCreated={(state) => {
          state.events.filter = preferInteriorPicks;
        }}
        onPointerMissed={() => {
          if (pending || pendingCorner) return;
          select(null);
          selectWall(null);
          selectSurface(null);
          // Stay in room focus unless the user explicitly goes Back to house.
          if (usePlannerStore.getState().workflowStage !== 'room') selectRoom(null);
        }}
      >
        <SceneAtmosphere />
        <ambientLight intensity={walking ? 1.05 : coarse ? 0.9 : 0.78} />
        <directionalLight
          castShadow={!coarse && !walking && cameraMode !== 'top'}
          intensity={walking ? 0.95 : coarse ? 1.1 : 1.35}
          position={[5, 8, 4]}
          shadow-mapSize={coarse ? [256, 256] : [512, 512]}
        />
        <Suspense fallback={null}>
          <Room />
        </Suspense>
        {!coarse && !walking && (
          <Suspense fallback={null}>
            <Environment preset="apartment" environmentIntensity={0.35} />
          </Suspense>
        )}
        <CameraRig />
      </Canvas>
      {pending ? (
        <div className="scene-help">Move to place · Tap floor or Confirm to drop · Cancel to abort</div>
      ) : cameraMode === 'firstPerson' ? (
        <div className="scene-help">Click to look · WASD to walk · Esc releases pointer</div>
      ) : (
        <div className="scene-help">Drag furniture to move · Tap through open walls · Empty space pans/orbits</div>
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
