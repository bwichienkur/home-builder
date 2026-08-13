import { Canvas, useThree } from '@react-three/fiber';
import { Bvh, Environment, Grid, OrbitControls, OrthographicCamera, PerspectiveCamera, PivotControls } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { usePlannerStore } from '../../store/plannerStore';
import { catalog } from '../catalog/catalogData';
import type { FurnitureItem } from '../../types';
import { detectRoomPolygons, roomShape } from '../../lib/geometry/rooms';
import { useInventoryStore } from '../../store/inventoryStore';
import { FurnitureVisual } from './CatalogModel';

const PX = 80;
const ORIGIN = { x: 420, y: 330 };
const world = (x: number, y: number): [number, number] => [(x - ORIGIN.x) / PX, (y - ORIGIN.y) / PX];
const openSurfaceProperties = () => window.dispatchEvent(new Event('roomcraft-open-properties'));

function CameraRig() {
  const mode = usePlannerStore((s) => s.cameraMode);
  const walls = usePlannerStore((s) => s.walls);
  const [moving, setMoving] = useState(false);
  const controls = useRef<any>(null);
  const { invalidate, get } = useThree();
  const center = useMemo<[number, number, number]>(() => {
    if (!walls.length) return [0, 0.65, 0];
    const points = walls.flatMap((w) => [world(w.start.x, w.start.y), world(w.end.x, w.end.y)]);
    const xs = points.map((p) => p[0]);
    const zs = points.map((p) => p[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, 0.65, (Math.min(...zs) + Math.max(...zs)) / 2];
  }, [walls]);

  useEffect(() => {
    const camera = get().camera;
    const target = new THREE.Vector3(...center);
    controls.current?.target.copy(target);
    if (mode === 'top' && camera instanceof THREE.OrthographicCamera) {
      camera.position.set(center[0], 10, center[2]);
      camera.zoom = 90;
      camera.lookAt(target);
      camera.updateProjectionMatrix();
    }
    controls.current?.update();
    invalidate();
  }, [mode, center, get, invalidate]);

  useEffect(() => {
    const refocus = () => {
      const camera = get().camera;
      const from = camera.position.clone();
      const target = new THREE.Vector3(...center);
      const to =
        camera instanceof THREE.OrthographicCamera
          ? new THREE.Vector3(center[0], 10, center[2])
          : mode === 'walk'
            ? new THREE.Vector3(center[0], 1.6, center[2] + 3.5)
            : new THREE.Vector3(center[0] + 6, 5, center[2] + 7);
      const start = performance.now();
      const duration = 420;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const ease = 1 - Math.pow(1 - t, 3);
        camera.position.lerpVectors(from, to, ease);
        controls.current?.target.lerp(target, ease);
        if (camera instanceof THREE.OrthographicCamera) {
          camera.zoom = 90;
          camera.updateProjectionMatrix();
        }
        camera.lookAt(controls.current?.target ?? target);
        controls.current?.update();
        invalidate();
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const start = () => setMoving(document.body.dataset.movingFurniture === 'true');
    const stop = () => setMoving(false);
    window.addEventListener('roomcraft-refocus', refocus);
    window.addEventListener('roomcraft-drag-start', start);
    window.addEventListener('roomcraft-drag-end', stop);
    return () => {
      window.removeEventListener('roomcraft-refocus', refocus);
      window.removeEventListener('roomcraft-drag-start', start);
      window.removeEventListener('roomcraft-drag-end', stop);
    };
  }, [get, invalidate, center, mode]);

  return (
    <>
      {mode === 'top' ? (
        <>
          <OrthographicCamera makeDefault position={[center[0], 10, center[2]]} rotation={[-Math.PI / 2, 0, 0]} zoom={90} />
          <OrbitControls ref={controls} enabled={!moving} enableRotate={false} onChange={() => invalidate()} />
        </>
      ) : (
        <>
          <PerspectiveCamera
            makeDefault
            position={mode === 'walk' ? [center[0], 1.6, center[2] + 3.5] : [center[0] + 6, 5, center[2] + 7]}
            fov={mode === 'walk' ? 72 : 48}
          />
          <OrbitControls
            ref={controls}
            enabled={!moving}
            target={center}
            maxPolarAngle={mode === 'walk' ? Math.PI / 2 : Math.PI / 2.05}
            minDistance={mode === 'walk' ? 0.5 : 2}
            maxDistance={18}
            enableZoom
            enablePan
            onChange={() => invalidate()}
          />
        </>
      )}
    </>
  );
}

function WallMeshes() {
  const walls = usePlannerStore((s) => s.walls);
  const openings = usePlannerStore((s) => s.openings);
  const color = usePlannerStore((s) => s.wallColor);
  const selectedId = usePlannerStore((s) => s.selectedWallId);
  const select = usePlannerStore((s) => s.selectWall);
  return (
    <>
      {walls.flatMap((w) => {
        const [sx, sz] = world(w.start.x, w.start.y);
        const [ex, ez] = world(w.end.x, w.end.y);
        const length = Math.hypot(ex - sx, ez - sz);
        const angle = -Math.atan2(ez - sz, ex - sx);
        const related = openings.filter((o) => o.wallId === w.id);
        let ranges: [number, number][] = [[0, length]];
        related.forEach((o) => {
          const center = o.offset * length;
          const a = Math.max(0, center - o.width / 2);
          const b = Math.min(length, center + o.width / 2);
          ranges = ranges.flatMap(([r1, r2]) =>
            b <= r1 || a >= r2 ? [[r1, r2]] : ([[r1, Math.max(r1, a)], [Math.min(r2, b), r2]].filter((r) => r[1] - r[0] > 0.02) as [number, number][]),
          );
        });
        const base = ranges.map(([a, b], i) => {
          const c = (a + b) / 2;
          const t = c / length;
          const x = sx + (ex - sx) * t;
          const z = sz + (ez - sz) * t;
          return (
            <mesh
              key={w.id + 'b' + i}
              position={[x, w.height / 2, z]}
              rotation={[0, angle, 0]}
              castShadow
              receiveShadow
              onClick={(e) => {
                e.stopPropagation();
                select(w.id);
                openSurfaceProperties();
              }}
            >
              <boxGeometry args={[b - a, w.height, w.thickness]} />
              <meshStandardMaterial
                color={selectedId === w.id ? '#0058a3' : color}
                emissive={selectedId === w.id ? '#003d70' : '#000000'}
                emissiveIntensity={selectedId === w.id ? 0.16 : 0}
                roughness={0.86}
              />
            </mesh>
          );
        });
        const fills = related.flatMap((o) => {
          const c = o.offset * length;
          const t = c / length;
          const x = sx + (ex - sx) * t;
          const z = sz + (ez - sz) * t;
          const parts = [];
          if (o.sill > 0)
            parts.push(
              <mesh key={o.id + 'sill'} position={[x, o.sill / 2, z]} rotation={[0, angle, 0]}>
                <boxGeometry args={[o.width, o.sill, w.thickness]} />
                <meshStandardMaterial color={color} />
              </mesh>,
            );
          const top = w.height - (o.sill + o.height);
          if (top > 0)
            parts.push(
              <mesh key={o.id + 'top'} position={[x, o.sill + o.height + top / 2, z]} rotation={[0, angle, 0]}>
                <boxGeometry args={[o.width, top, w.thickness]} />
                <meshStandardMaterial color={color} />
              </mesh>,
            );
          if (o.type === 'window')
            parts.push(
              <mesh key={o.id + 'glass'} position={[x, o.sill + o.height / 2, z]} rotation={[0, angle, 0]}>
                <boxGeometry args={[o.width, o.height, 0.025]} />
                <meshPhysicalMaterial color="#bce4ec" transparent opacity={0.32} transmission={0.65} roughness={0.05} />
              </mesh>,
            );
          return parts;
        });
        return [...base, ...fills];
      })}
    </>
  );
}

function Furniture() {
  const items = usePlannerStore((s) => s.furniture);
  const selectedId = usePlannerStore((s) => s.selectedFurnitureId);
  const select = usePlannerStore((s) => s.selectFurniture);
  const update = usePlannerStore((s) => s.updateFurniture);
  const updateLive = usePlannerStore((s) => s.updateFurnitureLive);
  const custom = useInventoryStore((s) => s.items);
  const catalogById = useMemo(() => {
    const map = new Map([...catalog, ...custom].map((c) => [c.id, c]));
    return map;
  }, [custom]);
  const selected = items.find((i) => i.id === selectedId);
  const pending = useRef<Partial<FurnitureItem> | null>(null);
  const touchDrag = useRef<{ pointerId: number; offsetX: number; offsetZ: number } | null>(null);
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const collisions = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2) {
          ids.add(a.id);
          ids.add(b.id);
        }
      }
    return ids;
  }, [items]);

  const beginTouchDrag = (e: any) => {
    if (!selected || e.nativeEvent?.pointerType !== 'touch') return;
    e.stopPropagation();
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(floorPlane, hit)) return;
    touchDrag.current = { pointerId: e.pointerId, offsetX: selected.x - hit.x, offsetZ: selected.z - hit.z };
    pending.current = { x: selected.x, z: selected.z };
    e.target.setPointerCapture?.(e.pointerId);
    document.body.dataset.movingFurniture = 'true';
    window.dispatchEvent(new Event('roomcraft-drag-start'));
  };
  const moveTouchDrag = (e: any) => {
    if (!selected || !touchDrag.current || touchDrag.current.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(floorPlane, hit)) return;
    const patch = { x: hit.x + touchDrag.current.offsetX, z: hit.z + touchDrag.current.offsetZ };
    pending.current = patch;
    updateLive(selected.id, patch);
  };
  const endTouchDrag = (e: any) => {
    if (!selected || !touchDrag.current) return;
    e.stopPropagation();
    e.target.releasePointerCapture?.(touchDrag.current.pointerId);
    touchDrag.current = null;
    delete document.body.dataset.movingFurniture;
    window.dispatchEvent(new Event('roomcraft-drag-end'));
    if (pending.current) {
      update(selected.id, pending.current);
      pending.current = null;
    }
  };

  const urlsFor = (item: FurnitureItem) => {
    const product = catalogById.get(item.catalogId);
    return {
      lowUrl: product?.lowPolyModelUrl || product?.modelUrl,
      fullUrl: product?.modelUrl || product?.lowPolyModelUrl,
    };
  };

  return (
    <>
      {items
        .filter((i) => i.id !== selectedId)
        .map((i) => {
          const urls = urlsFor(i);
          return (
            <group key={i.id} position={[i.x, 0, i.z]} rotation={[0, i.rotation, 0]}>
              <FurnitureVisual
                item={i}
                lowUrl={urls.lowUrl}
                fullUrl={urls.fullUrl}
                colliding={collisions.has(i.id)}
                onSelect={(e) => {
                  e.stopPropagation();
                  select(i.id);
                  openSurfaceProperties();
                }}
              />
            </group>
          );
        })}
      {selected && (
        <PivotControls
          depthTest={false}
          scale={1.15}
          lineWidth={2}
          enabled={!matchMedia('(pointer: coarse)').matches}
          onDrag={(m) => {
            const p = new THREE.Vector3();
            const q = new THREE.Quaternion();
            const s = new THREE.Vector3();
            m.decompose(p, q, s);
            pending.current = { x: p.x, z: p.z, rotation: new THREE.Euler().setFromQuaternion(q).y };
          }}
          onDragEnd={() => {
            if (pending.current) {
              update(selected.id, pending.current);
              pending.current = null;
            }
          }}
          matrix={new THREE.Matrix4().compose(
            new THREE.Vector3(selected.x, 0, selected.z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, selected.rotation, 0)),
            new THREE.Vector3(1, 1, 1),
          )}
        >
          <FurnitureVisual
            item={selected}
            {...urlsFor(selected)}
            colliding={collisions.has(selected.id)}
            onPointerDown={beginTouchDrag}
            onPointerMove={moveTouchDrag}
            onPointerUp={endTouchDrag}
            onPointerCancel={endTouchDrag}
          />
        </PivotControls>
      )}
    </>
  );
}

function Room() {
  const floor = usePlannerStore((s) => s.floorColor);
  const walls = usePlannerStore((s) => s.walls);
  const selectWall = usePlannerStore((s) => s.selectWall);
  const selectFurniture = usePlannerStore((s) => s.selectFurniture);
  const rooms = useMemo(() => detectRoomPolygons(walls), [walls]);
  const chooseFloor = (e: any) => {
    e.stopPropagation();
    selectWall(null);
    selectFurniture(null);
    openSurfaceProperties();
  };
  return (
    <Bvh firstHitOnly>
      {rooms.length ? (
        rooms.map((points, i) => (
          <mesh key={i} rotation={[Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.035, 0]} onClick={chooseFloor}>
            <shapeGeometry args={[roomShape(points)]} />
            <meshStandardMaterial color={floor} roughness={0.95} side={THREE.DoubleSide} />
          </mesh>
        ))
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.035, 0]} onClick={chooseFloor}>
          <planeGeometry args={[14, 12]} />
          <meshStandardMaterial color={floor} roughness={0.95} />
        </mesh>
      )}
      <Grid
        position={[0, 0.002, 0]}
        args={[14, 12]}
        cellSize={0.25}
        cellThickness={0.35}
        cellColor="#b7bcc2"
        sectionSize={1}
        sectionColor="#8a929a"
        fadeDistance={15}
        infiniteGrid={false}
      />
      <WallMeshes />
      <Furniture />
    </Bvh>
  );
}

export function Scene3D() {
  const add = usePlannerStore((s) => s.addFurniture);
  const select = usePlannerStore((s) => s.selectFurniture);
  const selectWall = usePlannerStore((s) => s.selectWall);
  const custom = useInventoryStore((s) => s.items);
  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('catalogId');
    const item = [...catalog, ...custom].find((i) => i.id === id);
    if (!item) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 7;
    const z = ((e.clientY - r.top) / r.height - 0.5) * 5;
    add(item.id, item.name, item.category, item.dims, item.color, x, z);
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
  if (!supported) return <SceneFallback />;
  return (
    <div className="scene-host" onDragOver={(e) => e.preventDefault()} onDrop={drop}>
      <Canvas
        fallback={<SceneFallback />}
        shadows
        dpr={[1, 1.35]}
        frameloop="demand"
        performance={{ min: 0.65, debounce: 200 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onPointerMissed={() => {
          select(null);
          selectWall(null);
        }}
      >
        <color attach="background" args={['#e8eaed']} />
        <fog attach="fog" args={['#e8eaed', 12, 24]} />
        <ambientLight intensity={0.78} />
        <directionalLight castShadow intensity={1.35} position={[5, 8, 4]} shadow-mapSize={[512, 512]} />
        <Suspense fallback={null}>
          <Room />
          <Environment preset="apartment" environmentIntensity={0.35} />
        </Suspense>
        <CameraRig />
      </Canvas>
      <div className="scene-help">Tap a wall to edit · Drag products to move · Pinch or scroll to zoom</div>
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
