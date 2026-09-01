import * as THREE from 'three';
import type { Opening, Wall } from '../../types';
import { world } from '../../components/scene3d/sceneWorld';
import {
  doorMaterial,
  exteriorWallMaterialTextured,
  interiorWallMaterial,
  openingFrameMaterial,
  windowGlassMaterial,
} from '../../lib/cadStudio/cadSceneMaterials';

function OpeningMesh({
  opening,
  wallLen,
  wallHeight,
  wallThickness,
}: {
  opening: Opening;
  wallLen: number;
  wallHeight: number;
  wallThickness: number;
}) {
  const localX = (opening.offset - 0.5) * wallLen;
  const y = opening.sill + opening.height / 2 - wallHeight / 2;
  const frameW = 0.06;
  const isWindow = opening.type === 'window';

  return (
    <group position={[localX, y, 0]}>
      <mesh>
        <boxGeometry args={[opening.width + frameW * 2, opening.height + frameW * 2, wallThickness + 0.02]} />
        <primitive object={openingFrameMaterial()} attach="material" />
      </mesh>
      <mesh position={[0, 0, 0.008]}>
        <boxGeometry args={[opening.width, opening.height, wallThickness * 0.35]} />
        <primitive object={isWindow ? windowGlassMaterial() : doorMaterial()} attach="material" />
      </mesh>
    </group>
  );
}

function WallMesh({
  wall,
  openings,
  mode,
}: {
  wall: Wall;
  openings: Opening[];
  mode: 'extrude' | 'massing';
}) {
  const [sx, sz] = world(wall.start.x, wall.start.y);
  const [ex, ez] = world(wall.end.x, wall.end.y);
  const dx = ex - sx;
  const dz = ez - sz;
  const len = Math.hypot(dx, dz) || 0.01;
  const angle = Math.atan2(dz, dx);
  const mid: [number, number, number] = [(sx + ex) / 2, wall.height / 2, (sz + ez) / 2];
  const wallOpenings = openings.filter((o) => o.wallId === wall.id);
  const isExterior = wall.assembly === 'exterior';
  const wallMat = isExterior
    ? exteriorWallMaterialTextured()
    : interiorWallMaterial(mode === 'massing' ? 0.14 : 1);

  if (mode === 'massing' && !isExterior) {
    return null;
  }

  return (
    <group position={mid} rotation={[0, -angle, 0]}>
      <mesh castShadow receiveShadow material={wallMat}>
        <boxGeometry args={[len, wall.height, wall.thickness]} />
      </mesh>
      {wallOpenings.map((o) => (
        <OpeningMesh
          key={o.id}
          opening={o}
          wallLen={len}
          wallHeight={wall.height}
          wallThickness={wall.thickness}
        />
      ))}
    </group>
  );
}

export { WallMesh, OpeningMesh };
