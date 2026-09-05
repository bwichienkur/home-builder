import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type {
  CadExtrusion,
  CadFixtureInstance,
  CadFixtureKind,
  CadPlate,
  CadSlabFt,
  CadSlabKind,
  CadStairFt,
} from '../../lib/cadStudio';
import { buildTerrainMeshData, sunPositionFromHour } from '../../lib/cadStudio';
import { metalRoofMaterial } from '../../lib/cadStudio/cadSceneMaterials';
import { CadSceneEnvironment, CadGroundPlane } from './CadSceneEnvironment';
import { WallMesh } from './CadRealisticWalls';
import { CadProfileRoofMesh } from './CadProfileRoofMesh';
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
    case 'mirror':
      return '#cbd5e1';
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

  if (fixture.kind === 'mirror') {
    const glassH = Math.max(0.6, hM);
    const glassD = Math.max(0.02, dM);
    return (
      <group position={[wx, 0, wz]} rotation={[0, yaw, 0]}>
        <mesh castShadow receiveShadow position={[0, 4.5 * FT_TO_M, 0]}>
          <boxGeometry args={[wM, glassH, glassD]} />
          <meshStandardMaterial color={color} metalness={0.55} roughness={0.12} />
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
    // Filled lawn + boundary so the lot clearly contains the building (not a thin edge only).
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
        <mesh geometry={geometry} receiveShadow>
          <meshStandardMaterial color="#8fbc8f" roughness={0.95} metalness={0} />
        </mesh>
        {edges.map((e) => (
          <mesh key={e.key} position={[e.midX, 0.05, e.midZ]} rotation={[0, e.rot, 0]}>
            <boxGeometry args={[0.1, 0.08, e.len]} />
            <meshStandardMaterial color="#0f766e" roughness={0.65} />
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

function DormerMesh({
  dormer,
  centerFt,
  storyHeightM,
}: {
  dormer: NonNullable<CadPlate['dormers']>[number];
  centerFt: { cx: number; cy: number };
  storyHeightM: number;
}) {
  const planX = WORLD_ORIGIN.x + ftToPx(dormer.xFt - centerFt.cx);
  const planY = WORLD_ORIGIN.y + ftToPx(dormer.yFt - centerFt.cy);
  const [wx, wz] = world(planX, planY);
  const w = dormer.widthFt * FT_TO_M;
  const d = dormer.depthFt * FT_TO_M;
  const h = dormer.heightFt * FT_TO_M;
  const yaw = (-dormer.rotationDeg * Math.PI) / 180;
  const rise = (dormer.pitchRise12 / 12) * (w / 2);
  return (
    <group position={[wx, storyHeightM, wz]} rotation={[0, yaw, 0]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#e7e5e4" roughness={0.85} />
      </mesh>
      <mesh position={[0, h + rise / 2, 0]} castShadow material={metalRoofMaterial()}>
        <boxGeometry args={[w * 1.05, 0.08, Math.hypot(d, rise)]} />
      </mesh>
      <mesh position={[0, h * 0.55, d / 2 + 0.02]} castShadow>
        <boxGeometry args={[w * 0.45, h * 0.45, 0.06]} />
        <meshStandardMaterial color="#7dd3fc" transparent opacity={0.65} roughness={0.2} metalness={0.1} />
      </mesh>
    </group>
  );
}

function TerrainMesh({
  plate,
  centerFt,
}: {
  plate: CadPlate;
  centerFt: { cx: number; cy: number };
}) {
  const data = useMemo(() => buildTerrainMeshData(plate, centerFt), [plate, centerFt]);
  const geom = useMemo(() => {
    if (!data) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    g.setIndex(new THREE.BufferAttribute(data.indices, 1));
    g.computeVertexNormals();
    return g;
  }, [data]);
  if (!geom) return null;
  return (
    <mesh geometry={geom} receiveShadow>
      <meshStandardMaterial color="#6b8f71" roughness={0.95} />
    </mesh>
  );
}

function sectionClipPlanes(
  plate: CadPlate | undefined,
  centerFt: { cx: number; cy: number },
): THREE.Plane[] | null {
  const cut = plate?.sectionCuts?.[0];
  if (!cut || !plate) return null;
  const mx = ((cut.x1 + cut.x2) / 2 - centerFt.cx) * FT_TO_M;
  const mz = ((cut.y1 + cut.y2) / 2 - centerFt.cy) * FT_TO_M;
  const dx = cut.x2 - cut.x1;
  const dy = cut.y2 - cut.y1;
  // Normal in XZ (plan) perpendicular to cut direction
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const nz = dx / len;
  const depth = (cut.depthFt ?? 1.5) * FT_TO_M;
  const p0 = new THREE.Vector3(mx, 0, mz);
  return [
    new THREE.Plane(new THREE.Vector3(nx, 0, nz), -p0.dot(new THREE.Vector3(nx, 0, nz)) + depth),
    new THREE.Plane(new THREE.Vector3(-nx, 0, -nz), p0.dot(new THREE.Vector3(nx, 0, nz)) + depth),
  ];
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
  onSelectOpening,
  onPickOpening,
  onPickWall,
}: {
  walls: Wall[];
  openings: Opening[];
  fixtures: CadFixtureInstance[];
  slabs?: CadSlabFt[];
  stairs?: CadStairFt[];
  centerFt: { cx: number; cy: number };
  wallSegmentsFt?: Array<{ x1: number; y1: number; x2: number; y2: number; exterior?: boolean }>;
  mode?: 'extrude' | 'massing';
  onSelectOpening?: (openingId: string) => void;
  onPickOpening?: (openingIndex: number) => void;
  onPickWall?: (wallIndex: number) => void;
}) {
  return (
    <>
      {slabs.map((s) => (
        <SlabMesh key={s.id} slab={s} centerFt={centerFt} />
      ))}
      {stairs.map((s) => (
        <StairMesh key={s.id} stair={s} centerFt={centerFt} />
      ))}
      {walls.map((w, wi) => (
        <group
          key={w.id}
          onClick={(e) => {
            if (!onPickWall) return;
            e.stopPropagation();
            onPickWall(wi);
          }}
        >
          <WallMesh wall={w} openings={openings} mode={mode} onSelectOpening={onSelectOpening} />
        </group>
      ))}
      {openings.map((o) => {
        const m = /hint-(\d+)$/.exec(o.id);
        const openingIndex = m ? Number(m[1]) : -1;
        if (openingIndex < 0 || !onPickOpening) return null;
        const wall = walls.find((w) => w.id === o.wallId);
        if (!wall) return null;
        const [x1, z1] = world(wall.start.x, wall.start.y);
        const [x2, z2] = world(wall.end.x, wall.end.y);
        const mx = (x1 + x2) / 2;
        const mz = (z1 + z2) / 2;
        const wallLen = Math.hypot(x2 - x1, z2 - z1) || 1;
        const ang = Math.atan2(z2 - z1, x2 - x1);
        const localX = (o.offset - 0.5) * wallLen;
        const y = o.sill + o.height / 2;
        return (
          <mesh
            key={`pick-${o.id}`}
            position={[mx + Math.cos(ang) * localX, y, mz + Math.sin(ang) * localX]}
            rotation={[0, -ang, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onPickOpening(openingIndex);
            }}
          >
            <boxGeometry args={[o.width * 1.05, o.height * 1.05, (wall.thickness || 0.15) + 0.08]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        );
      })}
      {fixtures.map((f) => (
        <FixtureMesh key={f.id} fixture={f} centerFt={centerFt} />
      ))}
    </>
  );
}

function Scene({
  extrusion,
  plate,
  sunHour,
  shadows,
  sectionClip,
  onSelectOpening,
  onPickOpening,
  onPickWall,
}: {
  extrusion: CadExtrusion;
  plate?: CadPlate | null;
  sunHour: number;
  shadows: boolean;
  sectionClip?: boolean;
  onSelectOpening?: (openingId: string) => void;
  onPickOpening?: (openingIndex: number) => void;
  onPickWall?: (wallIndex: number) => void;
}) {
  const { walls, openings, fixtures, slabs, stairs, centerFt, heightM } = extrusion;
  const floorSize = useMemo(() => {
    const plot = plate?.slabs?.find((s) => s.kind === 'plot');
    if (plot && plot.points.length >= 3) {
      let max = 10;
      for (const p of plot.points) {
        const [x, z] = world(
          WORLD_ORIGIN.x + ftToPx(p.x - centerFt.cx),
          WORLD_ORIGIN.y + ftToPx(p.y - centerFt.cy),
        );
        max = Math.max(max, Math.abs(x), Math.abs(z));
      }
      return max * 2.15;
    }
    if (!walls.length) return 20;
    let max = 10;
    for (const w of walls) {
      const [x1, z1] = world(w.start.x, w.start.y);
      const [x2, z2] = world(w.end.x, w.end.y);
      max = Math.max(max, Math.abs(x1), Math.abs(z1), Math.abs(x2), Math.abs(z2));
    }
    return max * 2.8;
  }, [walls, plate, centerFt]);
  const sunPosition = useMemo(() => sunPositionFromHour(sunHour), [sunHour]);
  const clipPlanes = useMemo(
    () => (sectionClip ? sectionClipPlanes(plate ?? undefined, centerFt) : null),
    [sectionClip, plate, centerFt],
  );

  return (
    <>
      <CadSceneEnvironment targetY={1.2} sunPosition={sunPosition} shadows={shadows} />
      {plate?.terrain?.enabled ? (
        <TerrainMesh plate={plate} centerFt={centerFt} />
      ) : (
        <CadGroundPlane size={floorSize} />
      )}
      <group>
        {clipPlanes && <primitive object={new THREE.Object3D()} />}
        <CadExtrudeSceneParts
          onSelectOpening={onSelectOpening}
          onPickOpening={onPickOpening}
          onPickWall={onPickWall}
          walls={walls}
          openings={openings}
          fixtures={fixtures}
          slabs={slabs}
          stairs={stairs}
          centerFt={centerFt}
        />
        {(plate?.dormers ?? [])
          .filter((d) => {
            if (!plate) return true;
            const info = plate.layers.find((l) => l.name === d.layer);
            return !info || info.visible;
          })
          .map((d) => (
            <DormerMesh key={d.id} dormer={d} centerFt={centerFt} storyHeightM={heightM} />
          ))}
      </group>
      <OrbitControls makeDefault target={[0, 1.2, 0]} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}

export function CadExtrudeView({
  extrusion,
  plate,
  sunHour = 14,
  shadows = true,
  sectionClip = false,
  onSelectOpening,
  onPickOpening,
  onPickWall,
}: {
  extrusion: CadExtrusion;
  plate?: CadPlate | null;
  sunHour?: number;
  shadows?: boolean;
  sectionClip?: boolean;
  onSelectOpening?: (openingId: string) => void;
  onPickOpening?: (openingIndex: number) => void;
  onPickWall?: (wallIndex: number) => void;
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
          gl.localClippingEnabled = sectionClip;
        }}
      >
        <Scene
          onSelectOpening={onSelectOpening}
          onPickOpening={onPickOpening}
          onPickWall={onPickWall}
          extrusion={extrusion}
          plate={plate}
          sunHour={sunHour}
          shadows={shadows}
          sectionClip={sectionClip}
        />
      </Canvas>
    </div>
  );
}
