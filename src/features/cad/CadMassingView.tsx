import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { CadExtrusion } from '../../lib/cadStudio';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';
import { world } from '../../components/scene3d/sceneWorld';
import { CadExtrudeSceneParts } from './CadExtrudeView';
import { CadElevationFacadeShell } from './CadElevationFacadeShell';
import { CadProfileRoofMesh } from './CadProfileRoofMesh';
import { CadGroundPlane, CadSceneEnvironment } from './CadSceneEnvironment';

const FT_TO_M = 0.3048;

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

function MassingScene({ extrusion }: { extrusion: CadExtrusion }) {
  const { walls, openings, fixtures, slabs, centerFt, massing } = extrusion;
  const storyHeightM = massing.storyHeightM;
  const envelope = useMemo(
    () => planBoundsEnvelopeM(massing.planBounds, centerFt),
    [massing.planBounds, centerFt],
  );
  const floorSize = useMemo(() => {
    const span = Math.max(envelope.maxX - envelope.minX, envelope.maxZ - envelope.minZ);
    return span * 2.8;
  }, [envelope]);

  return (
    <>
      <CadSceneEnvironment targetY={storyHeightM * 0.55} sunPosition={[50, 32, 24]} />
      <CadGroundPlane size={floorSize} />
      <CadExtrudeSceneParts
        walls={walls}
        openings={openings}
        fixtures={fixtures}
        slabs={slabs}
        centerFt={centerFt}
        mode="massing"
      />
      {massing.frontElevation && (
        <CadElevationFacadeShell
          sheet={massing.frontElevation}
          massing={massing}
          centerFt={centerFt}
        />
      )}
      <CadProfileRoofMesh roof={massing.roof} storyHeightM={storyHeightM} envelope={envelope} />
      <OrbitControls makeDefault target={[0, storyHeightM * 0.5, 0]} maxPolarAngle={Math.PI / 2.08} />
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
        camera={{ position: [28, 20, 28], fov: 40, near: 0.1, far: 500 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
          gl.shadowMap.enabled = true;
        }}
      >
        <MassingScene extrusion={extrusion} />
      </Canvas>
    </div>
  );
}
