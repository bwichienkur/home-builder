import * as THREE from 'three';
import type { Opening, Wall } from '../../types';
import { world } from '../../components/scene3d/sceneWorld';
import {
  doorMaterial,
  interiorWallMaterial,
  openingFrameMaterial,
  wallPaintMaterial,
  windowGlassMaterial,
} from '../../lib/cadStudio/cadSceneMaterials';
import { storyZFromEntityId } from '../../lib/cadStudio/extrudeCadPlate';

function OpeningMesh({
  opening,
  wallLen,
  wallHeight,
  wallThickness,
  onSelect,
}: {
  opening: Opening;
  wallLen: number;
  wallHeight: number;
  wallThickness: number;
  onSelect?: (openingId: string) => void;
}) {
  const localX = (opening.offset - 0.5) * wallLen;
  const y = opening.sill + opening.height / 2 - wallHeight / 2;
  const frameW = 0.06;
  const isWindow = opening.type === 'window';
  const isPassage = opening.type === 'passage';
  const isGarage = opening.type === 'garage';

  const pickProps = onSelect
    ? {
        onClick: (e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          onSelect(opening.id);
        },
      }
    : {};

  if (isPassage) {
    return (
      <group position={[localX, y, 0]} {...pickProps}>
        <mesh>
          <boxGeometry args={[opening.width + frameW * 2, opening.height + frameW * 2, wallThickness + 0.02]} />
          <primitive object={openingFrameMaterial()} attach="material" />
        </mesh>
      </group>
    );
  }

  if (isGarage) {
    const panels = 4;
    const panelH = opening.height / panels;
    return (
      <group position={[localX, y, 0]} {...pickProps}>
        <mesh>
          <boxGeometry args={[opening.width + frameW * 2, opening.height + frameW * 2, wallThickness + 0.02]} />
          <primitive object={openingFrameMaterial()} attach="material" />
        </mesh>
        {Array.from({ length: panels }).map((_, i) => (
          <mesh
            key={i}
            position={[0, -opening.height / 2 + panelH * (i + 0.5), wallThickness * 0.2]}
            castShadow
          >
            <boxGeometry args={[opening.width * 0.96, panelH * 0.88, 0.04]} />
            <meshStandardMaterial color="#4b5563" roughness={0.55} metalness={0.25} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group position={[localX, y, 0]} {...pickProps}>
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
  onSelectOpening,
}: {
  wall: Wall;
  openings: Opening[];
  mode: 'extrude' | 'massing';
  onSelectOpening?: (openingId: string) => void;
}) {
  const [sx, sz] = world(wall.start.x, wall.start.y);
  const [ex, ez] = world(wall.end.x, wall.end.y);
  const dx = ex - sx;
  const dz = ez - sz;
  const len = Math.hypot(dx, dz) || 0.01;
  const angle = Math.atan2(dz, dx);
  const storyZ = storyZFromEntityId(wall.id);
  const mid: [number, number, number] = [(sx + ex) / 2, storyZ + wall.height / 2, (sz + ez) / 2];
  const wallOpenings = openings.filter((o) => o.wallId === wall.id);
  const isExterior = wall.assembly === 'exterior';
  const wallMat = wall.materialId
    ? wallPaintMaterial(wall.materialId, wall.assembly, mode === 'massing' && !isExterior ? 0.14 : 1)
    : isExterior
      ? wallPaintMaterial('stucco', 'exterior')
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
          onSelect={onSelectOpening}
        />
      ))}
    </group>
  );
}

export { WallMesh, OpeningMesh };
