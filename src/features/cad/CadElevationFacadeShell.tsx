import { useMemo } from 'react';
import * as THREE from 'three';
import type { CadElevationSheet, CadMassing, CadPlanFace } from '../../lib/cadStudio/types';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';
import { world } from '../../components/scene3d/sceneWorld';

const FT_TO_M = 0.3048;
const FACADE_DEPTH = 0.1;

function ftToPx(ft: number) {
  return ft * FT_TO_M * PIXELS_PER_METER;
}

function planFtToWorld(xFt: number, yFt: number, centerFt: { cx: number; cy: number }): [number, number] {
  const planX = WORLD_ORIGIN.x + ftToPx(xFt - centerFt.cx);
  const planY = WORLD_ORIGIN.y + ftToPx(yFt - centerFt.cy);
  return world(planX, planY);
}

function facadeOutward(frontFace: CadPlanFace): [number, number] {
  switch (frontFace) {
    case 'north':
      return [0, 1];
    case 'east':
      return [1, 0];
    case 'west':
      return [-1, 0];
    default:
      return [0, -1];
  }
}

function materialForLayer(role: string, layer: string): THREE.MeshStandardMaterial {
  const u = layer.toUpperCase();
  if (/ROOF|TRUSS|RAFTER|GABLE|SOFFIT|TILE|METAL/i.test(u)) {
    return new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.72, metalness: 0.08 });
  }
  if (role === 'opening' || /WINDOW|GLAZ/i.test(u)) {
    return new THREE.MeshStandardMaterial({
      color: '#93c5fd',
      roughness: 0.2,
      metalness: 0.15,
      transparent: true,
      opacity: 0.55,
    });
  }
  if (/DOOR|GARAGE|OPEN/i.test(u)) {
    return new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.55 });
  }
  if (/STONE|BRG|COLUMN|PORCH/i.test(u)) {
    return new THREE.MeshStandardMaterial({ color: '#a8a29e', roughness: 0.85 });
  }
  return new THREE.MeshStandardMaterial({ color: '#e7e5e4', roughness: 0.78 });
}

/**
 * Extrude front-elevation DWG linework as thin 3D boxes on the exterior face plane.
 */
export function CadElevationFacadeShell({
  sheet,
  massing,
  centerFt,
}: {
  sheet: CadElevationSheet;
  massing: CadMassing;
  centerFt: { cx: number; cy: number };
}) {
  const meshes = useMemo(() => {
    const b = massing.planBounds;
    const widthFt = Math.max(1, sheet.bounds.maxX - sheet.bounds.minX);
    const planWidthFt = Math.max(1, b.maxX - b.minX);
    const planDepthFt = Math.max(1, b.maxY - b.minY);
    const xOffset =
      massing.frontFace === 'south' || massing.frontFace === 'north'
        ? b.minX + (planWidthFt - widthFt) / 2
        : 0;
    const yOffset =
      massing.frontFace === 'east' || massing.frontFace === 'west'
        ? b.minY + (planDepthFt - widthFt) / 2
        : 0;
    const [ox, oz] = facadeOutward(massing.frontFace);

    const elevToWorld = (xFt: number, yFt: number): [number, number, number] => {
      let px = xOffset + xFt;
      let py = b.minY;
      if (massing.frontFace === 'north') py = b.maxY;
      else if (massing.frontFace === 'east') {
        px = b.maxX;
        py = yOffset + xFt;
      } else if (massing.frontFace === 'west') {
        px = b.minX;
        py = yOffset + xFt;
      }
      const [wx, wz] = planFtToWorld(px, py, centerFt);
      return [wx + ox * (FACADE_DEPTH / 2), yFt * FT_TO_M, wz + oz * (FACADE_DEPTH / 2)];
    };

    const segs = sheet.segments.filter((s) => {
      const u = s.layer.toUpperCase();
      if (/DIM|TEXT|NOTE|TITLE|BORDER|A-ELEV|DRY\s*WALL/i.test(u)) return false;
      return /WALL|ROOF|WINDOW|DOOR|OPEN|GARAGE|BRG|HATCH|STONE|COLUMN|PORCH|TRUSS|RAFTER|GABLE|SOFFIT|EXT/i.test(u);
    });

    const out: JSX.Element[] = [];
    let idx = 0;

    for (const s of segs) {
      const lenFt = Math.hypot(s.x2Ft - s.x1Ft, s.y2Ft - s.y1Ft);
      if (lenFt < 0.12) continue;

      const [x1, y1, z1] = elevToWorld(s.x1Ft, s.y1Ft);
      const [x2, y2, z2] = elevToWorld(s.x2Ft, s.y2Ft);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dy, dz) || 0.01;
      const angleY = Math.atan2(dz, dx);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));

      out.push(
        <mesh
          key={`facade-${idx++}`}
          position={[(x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2]}
          rotation={[0, -angleY, pitch]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[len, Math.max(0.06, lenFt * FT_TO_M * 0.04 + 0.04), FACADE_DEPTH]} />
          <primitive object={materialForLayer(s.role, s.layer)} attach="material" />
        </mesh>,
      );
    }
    return out;
  }, [sheet, massing, centerFt]);

  return <group>{meshes}</group>;
}
