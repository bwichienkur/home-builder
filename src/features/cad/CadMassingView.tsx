import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { CadExtrusion, CadMassing, CadPlanFace, CadRoofMassing } from '../../lib/cadStudio';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';
import { world } from '../../components/scene3d/sceneWorld';
import type { Wall } from '../../types';
import { CadExtrudeSceneParts } from './CadExtrudeView';

const FT_TO_M = 0.3048;
const ROOF_THICKNESS = 0.14;

function ftToPx(ft: number) {
  return ft * FT_TO_M * PIXELS_PER_METER;
}

function planFtToWorld(xFt: number, yFt: number, centerFt: { cx: number; cy: number }): [number, number] {
  const planX = WORLD_ORIGIN.x + ftToPx(xFt - centerFt.cx);
  const planY = WORLD_ORIGIN.y + ftToPx(yFt - centerFt.cy);
  return world(planX, planY);
}

function planBoundsEnvelopeM(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  centerFt: { cx: number; cy: number },
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const corners: [number, number][] = [
    planFtToWorld(bounds.minX, bounds.minY, centerFt),
    planFtToWorld(bounds.maxX, bounds.minY, centerFt),
    planFtToWorld(bounds.maxX, bounds.maxY, centerFt),
    planFtToWorld(bounds.minX, bounds.maxY, centerFt),
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of corners) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

function wallEnvelopeM(walls: Wall[]): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  if (!walls.length) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const w of walls) {
    for (const p of [w.start, w.end]) {
      const [x, z] = world(p.x, p.y);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  return { minX, maxX, minZ, maxZ };
}

function RoofMesh({
  roof,
  storyHeightM,
  envelope,
}: {
  roof: CadRoofMassing;
  storyHeightM: number;
  envelope: { minX: number; maxX: number; minZ: number; maxZ: number };
}) {
  const w = Math.max(0.5, envelope.maxX - envelope.minX);
  const d = Math.max(0.5, envelope.maxZ - envelope.minZ);
  const cx = (envelope.minX + envelope.maxX) / 2;
  const cz = (envelope.minZ + envelope.maxZ) / 2;
  const overhang = roof.overhangM;
  const riseM = Math.max(0.35, roof.ridgeHeightM - storyHeightM);
  const ridgeAlongX = roof.ridgeAlongX;
  const halfSpan = (ridgeAlongX ? w : d) / 2;
  const slopeLen = Math.hypot(halfSpan, riseM);
  const pitch = Math.atan2(riseM, halfSpan);

  return (
    <group position={[cx, storyHeightM, cz]}>
      {ridgeAlongX ? (
        <>
          <mesh position={[-halfSpan / 2, riseM / 2, 0]} rotation={[0, 0, pitch]} castShadow receiveShadow>
            <boxGeometry args={[slopeLen, ROOF_THICKNESS, d + overhang * 2]} />
            <meshStandardMaterial color="#6b7280" roughness={0.78} metalness={0.05} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[halfSpan / 2, riseM / 2, 0]} rotation={[0, 0, -pitch]} castShadow receiveShadow>
            <boxGeometry args={[slopeLen, ROOF_THICKNESS, d + overhang * 2]} />
            <meshStandardMaterial color="#6b7280" roughness={0.78} metalness={0.05} side={THREE.DoubleSide} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, riseM / 2, -halfSpan / 2]} rotation={[pitch, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[w + overhang * 2, ROOF_THICKNESS, slopeLen]} />
            <meshStandardMaterial color="#6b7280" roughness={0.78} metalness={0.05} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, riseM / 2, halfSpan / 2]} rotation={[-pitch, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[w + overhang * 2, ROOF_THICKNESS, slopeLen]} />
            <meshStandardMaterial color="#6b7280" roughness={0.78} metalness={0.05} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
    </group>
  );
}

/** Render ROOF-layer elevation linework as 3D segments on the front face (structural reference). */
function ElevationRoofLinework({
  massing,
  centerFt,
}: {
  massing: CadMassing;
  centerFt: { cx: number; cy: number };
}) {
  const sheet = massing.frontElevation;
  const geom = useMemo(() => {
    if (!sheet) return null;
    const roofSegs = sheet.segments.filter((s) => /ROOF|TRUSS|RAFTER|GABLE|SOFFIT/i.test(s.layer));
    if (!roofSegs.length) return null;

    const b = massing.planBounds;
    const widthFt = Math.max(1, sheet.bounds.maxX - sheet.bounds.minX);
    const planWidthFt = Math.max(1, b.maxX - b.minX);
    const xOffset = b.minX + (planWidthFt - widthFt) / 2;
    const positions: number[] = [];

    const mapPlan = (xFt: number, yFt: number): [number, number, number] => {
      let px = xFt;
      let py = b.minY;
      switch (massing.frontFace as CadPlanFace) {
        case 'north':
          py = b.maxY;
          px = xOffset + xFt;
          break;
        case 'east':
          return [...planFtToWorld(b.maxX, b.minY + (xFt / widthFt) * (b.maxY - b.minY), centerFt), yFt * FT_TO_M];
        case 'west':
          return [...planFtToWorld(b.minX, b.minY + (xFt / widthFt) * (b.maxY - b.minY), centerFt), yFt * FT_TO_M];
        default:
          px = xOffset + xFt;
          py = b.minY;
      }
      const [wx, wz] = planFtToWorld(px, py, centerFt);
      return [wx, yFt * FT_TO_M, wz];
    };

    for (const s of roofSegs) {
      const [x1, y1, z1] = mapPlan(s.x1Ft, s.y1Ft);
      const [x2, y2, z2] = mapPlan(s.x2Ft, s.y2Ft);
      positions.push(x1, y1, z1, x2, y2, z2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [sheet, massing, centerFt]);

  if (!geom) return null;
  return (
    <lineSegments geometry={geom} renderOrder={5}>
      <lineBasicMaterial color="#374151" linewidth={1} />
    </lineSegments>
  );
}

function MassingScene({ extrusion }: { extrusion: CadExtrusion }) {
  const { walls, openings, fixtures, centerFt, massing, wallSegmentsFt } = extrusion;
  const storyHeightM = massing.storyHeightM;
  const planEnvelope = useMemo(
    () => planBoundsEnvelopeM(massing.planBounds, centerFt),
    [massing.planBounds, centerFt],
  );
  const wallEnv = useMemo(() => wallEnvelopeM(walls), [walls]);
  const envelope = planEnvelope ?? wallEnv;
  const floorSize = useMemo(() => {
    if (!envelope) return 24;
    const span = Math.max(envelope.maxX - envelope.minX, envelope.maxZ - envelope.minZ);
    return span * 2.6;
  }, [envelope]);

  if (!envelope) return null;

  return (
    <>
      <color attach="background" args={['#dfe5ec']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[8, 16, 6]} intensity={1.15} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[floorSize, floorSize]} />
        <meshStandardMaterial color="#c9b18f" />
      </mesh>
      <gridHelper
        args={[floorSize, Math.max(10, Math.round(floorSize)), '#94a3b8', '#cbd5e1']}
        position={[0, 0.001, 0]}
      />
      <CadExtrudeSceneParts
        walls={walls}
        openings={openings}
        fixtures={fixtures}
        centerFt={centerFt}
        wallSegmentsFt={wallSegmentsFt}
      />
      <RoofMesh roof={massing.roof} storyHeightM={storyHeightM} envelope={envelope} />
      <ElevationRoofLinework massing={massing} centerFt={centerFt} />
      <OrbitControls makeDefault target={[0, storyHeightM * 0.55, 0]} />
    </>
  );
}

export function CadMassingView({ extrusion }: { extrusion: CadExtrusion }) {
  if (!extrusion.walls.length) {
    return <div className="cad-empty">No wall centerlines to mass yet. Import a DXF with wall layers.</div>;
  }
  return (
    <div className="cad-extrude-host">
      <Canvas
        shadows
        camera={{ position: [22, 18, 22], fov: 42, near: 0.1, far: 500 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.shadowMap.enabled = true;
        }}
      >
        <MassingScene extrusion={extrusion} />
      </Canvas>
    </div>
  );
}
