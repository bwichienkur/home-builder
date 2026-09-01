import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { CadExtrusion, CadFixtureInstance, CadFixtureKind } from '../../lib/cadStudio';
import { CadGroundPlane, CadSceneEnvironment } from './CadSceneEnvironment';
import { WallMesh } from './CadRealisticWalls';
import { world } from '../../components/scene3d/sceneWorld';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import type { Opening, Wall } from '../../types';

const FT_TO_M = 0.3048;

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

/** Shared walls + fixtures for Extrude and Massing views. */
export function CadExtrudeSceneParts({
  walls,
  openings,
  fixtures,
  centerFt,
  mode = 'extrude',
}: {
  walls: Wall[];
  openings: Opening[];
  fixtures: CadFixtureInstance[];
  centerFt: { cx: number; cy: number };
  wallSegmentsFt?: Array<{ x1: number; y1: number; x2: number; y2: number; exterior?: boolean }>;
  mode?: 'extrude' | 'massing';
}) {
  return (
    <>
      {walls.map((w) => (
        <WallMesh key={w.id} wall={w} openings={openings} mode={mode} />
      ))}
      {fixtures.map((f) => (
        <FixtureMesh key={f.id} fixture={f} centerFt={centerFt} />
      ))}
    </>
  );
}

function Scene({ extrusion }: { extrusion: CadExtrusion }) {
  const { walls, openings, fixtures, centerFt } = extrusion;
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

  return (
    <>
      <CadSceneEnvironment targetY={1.2} />
      <CadGroundPlane size={floorSize} />
      <CadExtrudeSceneParts walls={walls} openings={openings} fixtures={fixtures} centerFt={centerFt} />
      <OrbitControls makeDefault target={[0, 1.2, 0]} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}

export function CadExtrudeView({ extrusion }: { extrusion: CadExtrusion }) {
  if (!extrusion.walls.length) {
    return (
      <div className="cad-empty">No wall centerlines to extrude yet. Import a DXF with wall layers.</div>
    );
  }
  return (
    <div className="cad-extrude-host">
      <Canvas
        shadows
        camera={{ position: [18, 14, 18], fov: 42, near: 0.1, far: 500 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.shadowMap.enabled = true;
        }}
      >
        <Scene extrusion={extrusion} />
      </Canvas>
    </div>
  );
}
