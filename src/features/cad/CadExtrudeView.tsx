import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type {
  CadExtrusion,
  CadFixtureInstance,
  CadFixtureKind,
  CadSlabFt,
  CadSlabKind,
  CadStairFt,
} from '../../lib/cadStudio';
import { sunPositionFromHour } from '../../lib/cadStudio/cadSun';
import { CadGroundPlane, CadSceneEnvironment } from './CadSceneEnvironment';
import { WallMesh } from './CadRealisticWalls';
import { world } from '../../components/scene3d/sceneWorld';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import type { Opening, Wall } from '../../types';

const FT_TO_M = 0.3048;

function slabColor(kind: CadSlabKind): string {
  switch (kind) {
    case 'terrace':
      return '#c4a574';
    case 'driveway':
      return '#8a8f98';
    case 'garden':
      return '#6b8f71';
    case 'balcony':
      return '#b7a99a';
    case 'foundation':
      return '#a8a29e';
    case 'footing':
      return '#78716c';
    case 'plot':
      return '#0f766e';
    default:
      return '#a8a29e';
  }
}

function ftToPx(ft: number) {
  return ft * FT_TO_M * PIXELS_PER_METER;
}

function fixtureColor(kind: CadFixtureKind): string {
  switch (kind) {
    case 'counter':
    case 'island':
      return '#b8956c';
    case 'sink':
      return '#7dd3fc';
    case 'toilet':
      return '#f8fafc';
    case 'tub':
      return '#e2e8f0';
    case 'appliance':
      return '#475569';
    default:
      return '#78716c';
  }
}

function FixtureMesh({
  fixture,
  centerFt,
}: {
  fixture: CadFixtureInstance;
  centerFt: { cx: number; cy: number };
}) {
  const planX = WORLD_ORIGIN.x + ftToPx(fixture.xFt - centerFt.cx);
  const planY = WORLD_ORIGIN.y + ftToPx(fixture.yFt - centerFt.cy);
  const [wx, wz] = world(planX, planY);
  const wM = fixture.widthFt * FT_TO_M;
  const dM = fixture.depthFt * FT_TO_M;
  const hM = fixture.heightM;
  const color = fixtureColor(fixture.kind);
  const yaw = -fixture.rotationRad;

  if (fixture.kind === 'sink' || fixture.kind === 'toilet') {
    const r = Math.max(wM, dM) / 2;
    return (
      <group position={[wx, 0, wz]} rotation={[0, yaw, 0]}>
        <mesh castShadow receiveShadow position={[0, hM / 2, 0]}>
          <cylinderGeometry args={[r * 0.85, r, hM, 16]} />
          <meshStandardMaterial color={color} metalness={0.15} roughness={0.45} />
        </mesh>
      </group>
    );
  }

  if (fixture.kind === 'tub') {
    return (
      <group position={[wx, 0, wz]} rotation={[0, yaw, 0]}>
        <mesh castShadow receiveShadow position={[0, hM / 2, 0]}>
          <boxGeometry args={[wM, hM, dM]} />
          <meshStandardMaterial color={color} roughness={0.55} />
        </mesh>
      </group>
    );
  }

  return (
    <group position={[wx, 0, wz]} rotation={[0, yaw, 0]}>
      <mesh castShadow receiveShadow position={[0, hM / 2, 0]}>
        <boxGeometry args={[wM, hM, dM]} />
        <meshStandardMaterial
          color={color}
          roughness={fixture.kind === 'appliance' ? 0.35 : 0.6}
          metalness={fixture.kind === 'appliance' ? 0.25 : 0.05}
        />
      </mesh>
      {(fixture.kind === 'counter' || fixture.kind === 'island') && (
        <mesh castShadow position={[0, hM + 0.015, 0]}>
          <boxGeometry args={[wM + 0.02, 0.03, dM + 0.02]} />
          <meshStandardMaterial color="#d6d3d1" roughness={0.4} />
        </mesh>
      )}
    </group>
  );
}

function SlabMesh({
  slab,
  centerFt,
}: {
  slab: CadSlabFt;
  centerFt: { cx: number; cy: number };
}) {
  const geometry = useMemo(() => {
    if (slab.points.length < 3) return null;
    const shape = new THREE.Shape();
    const worldPts = slab.points.map((p) => {
      const planX = WORLD_ORIGIN.x + ftToPx(p.x - centerFt.cx);
      const planY = WORLD_ORIGIN.y + ftToPx(p.y - centerFt.cy);
      const [wx, wz] = world(planX, planY);
      return { x: wx, z: wz };
    });
    shape.moveTo(worldPts[0]!.x, worldPts[0]!.z);
    for (let i = 1; i < worldPts.length; i++) {
      shape.lineTo(worldPts[i]!.x, worldPts[i]!.z);
    }
    shape.closePath();
    const thickness = Math.max(0.04, slab.thicknessFt * FT_TO_M);
    const geom = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    geom.rotateX(-Math.PI / 2);
    geom.translate(0, slab.elevationFt * FT_TO_M, 0);
    return geom;
  }, [slab, centerFt]);

  const railings = useMemo(() => {
    if (!slab.railing || slab.points.length < 3) return [];
    const topY = (slab.elevationFt + slab.thicknessFt) * FT_TO_M + 0.02;
    const railH = 1.05;
    const pts = slab.points.map((p) => {
      const planX = WORLD_ORIGIN.x + ftToPx(p.x - centerFt.cx);
      const planY = WORLD_ORIGIN.y + ftToPx(p.y - centerFt.cy);
      const [wx, wz] = world(planX, planY);
      return { x: wx, z: wz };
    });
    const items: Array<{ key: string; x: number; z: number; rot: number; len: number }> = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.4) continue;
      items.push({
        key: `${slab.id}-rail-${i}`,
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
        rot: Math.atan2(dx, dz),
        len,
      });
    }
    return items.map((it) => ({ ...it, topY, railH }));
  }, [slab, centerFt]);

  if (!geometry) return null;
  if (slab.kind === 'plot') {
    // Thin ribbon outline for lot boundary
    const edges = slab.points.map((p, i) => {
      const a = p;
      const b = slab.points[(i + 1) % slab.points.length]!;
      const planAx = WORLD_ORIGIN.x + ftToPx(a.x - centerFt.cx);
      const planAy = WORLD_ORIGIN.y + ftToPx(a.y - centerFt.cy);
      const planBx = WORLD_ORIGIN.x + ftToPx(b.x - centerFt.cx);
      const planBy = WORLD_ORIGIN.y + ftToPx(b.y - centerFt.cy);
      const [ax, az] = world(planAx, planAy);
      const [bx, bz] = world(planBx, planBy);
      const len = Math.hypot(bx - ax, bz - az);
      const midX = (ax + bx) / 2;
      const midZ = (az + bz) / 2;
      const rot = Math.atan2(bx - ax, bz - az);
      return { key: `${slab.id}-e-${i}`, midX, midZ, rot, len };
    });
    return (
      <group>
        {edges.map((e) => (
          <mesh key={e.key} position={[e.midX, 0.03, e.midZ]} rotation={[0, e.rot, 0]}>
            <boxGeometry args={[0.08, 0.06, e.len]} />
            <meshStandardMaterial color="#0f766e" roughness={0.7} />
          </mesh>
        ))}
      </group>
    );
  }
  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={slabColor(slab.kind)} roughness={0.85} metalness={0.02} />
      </mesh>
      {railings.map((r) => (
        <group key={r.key} position={[r.x, r.topY, r.z]} rotation={[0, r.rot, 0]}>
          <mesh position={[-r.len / 2, r.railH / 2, 0]} castShadow>
            <boxGeometry args={[0.05, r.railH, 0.05]} />
            <meshStandardMaterial color="#64748b" metalness={0.35} roughness={0.4} />
          </mesh>
          <mesh position={[r.len / 2, r.railH / 2, 0]} castShadow>
            <boxGeometry args={[0.05, r.railH, 0.05]} />
            <meshStandardMaterial color="#64748b" metalness={0.35} roughness={0.4} />
          </mesh>
          <mesh position={[0, r.railH, 0]} castShadow>
            <boxGeometry args={[r.len, 0.04, 0.04]} />
            <meshStandardMaterial color="#64748b" metalness={0.35} roughness={0.4} />
          </mesh>
          <mesh position={[0, r.railH * 0.55, 0]} castShadow>
            <boxGeometry args={[r.len, 0.03, 0.03]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.25} roughness={0.45} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function StairMesh({
  stair,
  centerFt,
}: {
  stair: CadStairFt;
  centerFt: { cx: number; cy: number };
}) {
  const runM = stair.runFt * FT_TO_M;
  const widthM = stair.widthFt * FT_TO_M;
  const riseM = stair.riseFt * FT_TO_M;
  const steps = Math.max(3, stair.steps);
  const tread = runM / steps;
  const riser = riseM / steps;
  const planX = WORLD_ORIGIN.x + ftToPx(stair.xFt + stair.runFt / 2 - centerFt.cx);
  const planY = WORLD_ORIGIN.y + ftToPx(stair.yFt + stair.widthFt / 2 - centerFt.cy);
  const [wx, wz] = world(planX, planY);
  const yaw = (-stair.rotationDeg * Math.PI) / 180;

  return (
    <group position={[wx, 0, wz]} rotation={[0, yaw, 0]}>
      {Array.from({ length: steps }).map((_, i) => (
        <mesh
          key={i}
          castShadow
          receiveShadow
          position={[
            -runM / 2 + tread * (i + 0.5),
            riser * (i + 0.5),
            0,
          ]}
        >
          <boxGeometry args={[tread * 0.92, riser * 0.92, widthM]} />
          <meshStandardMaterial color="#d6d3d1" roughness={0.75} />
        </mesh>
      ))}
      {stair.railing && (
        <>
          <mesh position={[0, riseM * 0.55, widthM / 2 + 0.04]} castShadow>
            <boxGeometry args={[runM, 0.04, 0.04]} />
            <meshStandardMaterial color="#64748b" metalness={0.3} roughness={0.4} />
          </mesh>
          <mesh position={[0, riseM * 0.55, -widthM / 2 - 0.04]} castShadow>
            <boxGeometry args={[runM, 0.04, 0.04]} />
            <meshStandardMaterial color="#64748b" metalness={0.3} roughness={0.4} />
          </mesh>
        </>
      )}
    </group>
  );
}

/** Shared walls + fixtures for Extrude and Massing views. */
export function CadExtrudeSceneParts({
  walls,
  openings,
  fixtures,
  slabs = [],
  stairs = [],
  centerFt,
  mode = 'extrude',
}: {
  walls: Wall[];
  openings: Opening[];
  fixtures: CadFixtureInstance[];
  slabs?: CadSlabFt[];
  stairs?: CadStairFt[];
  centerFt: { cx: number; cy: number };
  wallSegmentsFt?: Array<{ x1: number; y1: number; x2: number; y2: number; exterior?: boolean }>;
  mode?: 'extrude' | 'massing';
}) {
  return (
    <>
      {slabs.map((s) => (
        <SlabMesh key={s.id} slab={s} centerFt={centerFt} />
      ))}
      {stairs.map((s) => (
        <StairMesh key={s.id} stair={s} centerFt={centerFt} />
      ))}
      {walls.map((w) => (
        <WallMesh key={w.id} wall={w} openings={openings} mode={mode} />
      ))}
      {fixtures.map((f) => (
        <FixtureMesh key={f.id} fixture={f} centerFt={centerFt} />
      ))}
    </>
  );
}

function Scene({
  extrusion,
  sunHour,
  shadows,
}: {
  extrusion: CadExtrusion;
  sunHour: number;
  shadows: boolean;
}) {
  const { walls, openings, fixtures, slabs, stairs, centerFt } = extrusion;
  const floorSize = useMemo(() => {
    if (!walls.length) return 20;
    let max = 10;
    for (const w of walls) {
      const [x1, z1] = world(w.start.x, w.start.y);
      const [x2, z2] = world(w.end.x, w.end.y);
      max = Math.max(max, Math.abs(x1), Math.abs(z1), Math.abs(x2), Math.abs(z2));
    }
    return max * 2.4;
  }, [walls]);
  const sunPosition = useMemo(() => sunPositionFromHour(sunHour), [sunHour]);

  return (
    <>
      <CadSceneEnvironment targetY={1.2} sunPosition={sunPosition} shadows={shadows} />
      <CadGroundPlane size={floorSize} />
      <CadExtrudeSceneParts
        walls={walls}
        openings={openings}
        fixtures={fixtures}
        slabs={slabs}
        stairs={stairs}
        centerFt={centerFt}
      />
      <OrbitControls makeDefault target={[0, 1.2, 0]} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}

export function CadExtrudeView({
  extrusion,
  sunHour = 14,
  shadows = true,
}: {
  extrusion: CadExtrusion;
  sunHour?: number;
  shadows?: boolean;
}) {
  if (!extrusion.walls.length) {
    return (
      <div className="cad-empty">No wall centerlines to extrude yet. Import a DXF with wall layers.</div>
    );
  }
  return (
    <div className="cad-extrude-host">
      <Canvas
        shadows={shadows}
        camera={{ position: [18, 14, 18], fov: 42, near: 0.1, far: 500 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.shadowMap.enabled = shadows;
        }}
      >
        <Scene extrusion={extrusion} sunHour={sunHour} shadows={shadows} />
      </Canvas>
    </div>
  );
}
