import { useEffect, useMemo, useState } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { CadExtrusion, CadMassing, CadPlanFace, CadRoofMassing } from '../../lib/cadStudio';
import type { CadElevationSheet } from '../../lib/cadStudio/types';
import { elevationSvgDataUrl } from '../../lib/cadStudio/renderCadElevationSvg';
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

function facadeFacePlanCoords(
  frontFace: CadPlanFace,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): { xFt: number; yFt: number; yaw: number; outward: [number, number] } {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  switch (frontFace) {
    case 'north':
      return { xFt: cx, yFt: bounds.maxY, yaw: Math.PI, outward: [0, 1] };
    case 'east':
      return { xFt: bounds.maxX, yFt: cy, yaw: -Math.PI / 2, outward: [1, 0] };
    case 'west':
      return { xFt: bounds.minX, yFt: cy, yaw: Math.PI / 2, outward: [-1, 0] };
    default:
      return { xFt: cx, yFt: bounds.minY, yaw: 0, outward: [0, -1] };
  }
}

/** Front facade = same SVG as Plate → Front elevation tab, mapped onto a plane at the wall face. */
function ElevationFacadePlane({
  sheet,
  massing,
  centerFt,
}: {
  sheet: CadElevationSheet;
  massing: CadMassing;
  centerFt: { cx: number; cy: number };
}) {
  const dataUrl = useMemo(() => elevationSvgDataUrl(sheet, { padFt: 0.25 }), [sheet]);
  const texture = useLoader(THREE.TextureLoader, dataUrl);
  texture.colorSpace = THREE.SRGBColorSpace;

  const wM = massing.facadeWidthFt * FT_TO_M;
  const hM = massing.facadeHeightFt * FT_TO_M;
  const face = facadeFacePlanCoords(massing.frontFace, massing.planBounds);
  const [wx, wz] = planFtToWorld(face.xFt, face.yFt, centerFt);
  const offset = 0.18;

  return (
    <mesh
      position={[wx + face.outward[0]! * offset, hM / 2, wz + face.outward[1]! * offset]}
      rotation={[0, face.yaw, 0]}
      renderOrder={2}
    >
      <planeGeometry args={[wM, hM]} />
      <meshBasicMaterial map={texture} toneMapped={false} side={THREE.FrontSide} />
    </mesh>
  );
}

function MassingScene({ extrusion }: { extrusion: CadExtrusion }) {
  const { walls, openings, fixtures, centerFt, massing } = extrusion;
  const storyHeightM = massing.storyHeightM;
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
      <RoofMesh roof={massing.roof} storyHeightM={storyHeightM} envelope={envelope} />
      {massing.frontElevation && (
        <ElevationFacadePlane sheet={massing.frontElevation} massing={massing} centerFt={centerFt} />
      )}
      <OrbitControls makeDefault target={[0, storyHeightM * 0.55, 0]} />
    </>
  );
}

export function CadMassingView({ extrusion }: { extrusion: CadExtrusion }) {
  const [canvasKey, setCanvasKey] = useState(0);
  const sheetId = extrusion.massing.frontElevation?.name ?? 'none';

  useEffect(() => {
    setCanvasKey((k) => k + 1);
  }, [sheetId, extrusion.massing.facadeWidthFt, extrusion.massing.facadeHeightFt]);

  if (!extrusion.walls.length) {
    return <div className="cad-empty">No wall centerlines to mass yet. Import a DXF with wall layers.</div>;
  }
  return (
    <div className="cad-extrude-host">
      <Canvas
        key={canvasKey}
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
