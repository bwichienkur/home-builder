import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { CadElevationSegmentFt, CadExtrusion, CadMassing, CadRoofMassing } from '../../lib/cadStudio';
import { world } from '../../components/scene3d/sceneWorld';
import type { Wall } from '../../types';
import { CadExtrudeSceneParts } from './CadExtrudeView';

const FT_TO_M = 0.3048;

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
  const ridgeAlongX = roof.ridgeAlongX;
  const riseM = Math.max(0.35, roof.ridgeHeightM - storyHeightM);
  const halfSpan = (ridgeAlongX ? w : d) / 2;
  const slopeLen = Math.hypot(halfSpan, riseM);
  const pitch = Math.atan2(riseM, halfSpan);

  return (
    <group position={[cx, storyHeightM + 0.02, cz]}>
      {ridgeAlongX ? (
        <>
          <mesh position={[-halfSpan / 2, riseM / 2, 0]} rotation={[0, 0, pitch]} castShadow>
            <boxGeometry args={[slopeLen, 0.05, d + overhang * 2]} />
            <meshStandardMaterial color="#7c8491" roughness={0.82} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[halfSpan / 2, riseM / 2, 0]} rotation={[0, 0, -pitch]} castShadow>
            <boxGeometry args={[slopeLen, 0.05, d + overhang * 2]} />
            <meshStandardMaterial color="#7c8491" roughness={0.82} side={THREE.DoubleSide} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, riseM / 2, -halfSpan / 2]} rotation={[pitch, 0, 0]} castShadow>
            <boxGeometry args={[w + overhang * 2, 0.05, slopeLen]} />
            <meshStandardMaterial color="#7c8491" roughness={0.82} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, riseM / 2, halfSpan / 2]} rotation={[-pitch, 0, 0]} castShadow>
            <boxGeometry args={[w + overhang * 2, 0.05, slopeLen]} />
            <meshStandardMaterial color="#7c8491" roughness={0.82} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
      {roof.style === 'dxf' && roof.profile && roof.profile.length >= 3 && (
        <mesh position={[0, riseM * 0.5, 0]}>
          <boxGeometry args={[0.08, riseM, 0.08]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
      )}
    </group>
  );
}

function FacadeLinework({
  segments,
  massing,
  envelope,
}: {
  segments: CadElevationSegmentFt[];
  massing: CadMassing;
  envelope: { minX: number; maxX: number; minZ: number; maxZ: number };
}) {
  const facadeSegs = segments.filter((s) => /WALL|ROOF|WINDOW|DOOR|OPEN|EXT|HATCH|PORCH|COLUMN/i.test(s.layer));
  if (!facadeSegs.length) return null;

  const widthM = massing.facadeWidthFt * FT_TO_M;
  const cx = (envelope.minX + envelope.maxX) / 2;
  const cz = (envelope.minZ + envelope.maxZ) / 2;
  const offset = 0.12;
  let position: [number, number, number];
  let yaw = 0;

  switch (massing.frontFace) {
    case 'north':
      position = [cx, 0, envelope.maxZ + offset];
      yaw = Math.PI;
      break;
    case 'east':
      position = [envelope.maxX + offset, 0, cz];
      yaw = -Math.PI / 2;
      break;
    case 'west':
      position = [envelope.minX - offset, 0, cz];
      yaw = Math.PI / 2;
      break;
    default:
      position = [cx, 0, envelope.minZ - offset];
      yaw = 0;
  }

  return (
    <group position={position} rotation={[0, yaw, 0]}>
      {facadeSegs.slice(0, 600).map((s, i) => {
        const x1 = s.x1Ft * FT_TO_M - widthM / 2;
        const x2 = s.x2Ft * FT_TO_M - widthM / 2;
        const y1 = s.y1Ft * FT_TO_M;
        const y2 = s.y2Ft * FT_TO_M;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const len = Math.hypot(x2 - x1, y2 - y1) || 0.01;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const color = /ROOF/i.test(s.layer)
          ? '#64748b'
          : /WINDOW|DOOR|OPEN/i.test(s.layer)
            ? '#7dd3fc'
            : '#334155';
        return (
          <mesh key={`fac-${i}`} position={[mx, my, 0]} rotation={[0, 0, angle]}>
            <boxGeometry args={[len, 0.035, 0.015]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      })}
    </group>
  );
}

function MassingScene({ extrusion }: { extrusion: CadExtrusion }) {
  const { walls, openings, fixtures, centerFt, heightM, massing } = extrusion;
  const envelope = useMemo(() => wallEnvelopeM(walls), [walls]);
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
      <CadExtrudeSceneParts walls={walls} openings={openings} fixtures={fixtures} centerFt={centerFt} />
      <RoofMesh roof={massing.roof} storyHeightM={heightM} envelope={envelope} />
      {massing.frontElevation && (
        <FacadeLinework segments={massing.frontElevation.segments} massing={massing} envelope={envelope} />
      )}
      <OrbitControls makeDefault target={[0, heightM * 0.65, 0]} />
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
