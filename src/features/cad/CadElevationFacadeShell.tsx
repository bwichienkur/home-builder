import { useEffect, useMemo, useState, type ReactElement } from 'react';
import * as THREE from 'three';
import type { CadElevationSheet, CadMassing, CadPlanFace } from '../../lib/cadStudio/types';
import { elevationSvgDataUrl } from '../../lib/cadStudio/renderCadElevationSvg';
import { facadeMaterialForLayer } from '../../lib/cadStudio/cadSceneMaterials';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';
import { world } from '../../components/scene3d/sceneWorld';

const FT_TO_M = 0.3048;
const LINework_DEPTH = 0.06;

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

function facadeFaceCoords(
  frontFace: CadPlanFace,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): { xFt: number; yFt: number; yaw: number; outward: [number, number] } {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  switch (frontFace) {
    case 'north':
      return { xFt: cx, yFt: bounds.maxY, yaw: 0, outward: [0, 1] };
    case 'east':
      return { xFt: bounds.maxX, yFt: cy, yaw: -Math.PI / 2, outward: [1, 0] };
    case 'west':
      return { xFt: bounds.minX, yFt: cy, yaw: Math.PI / 2, outward: [-1, 0] };
    default:
      return { xFt: cx, yFt: bounds.minY, yaw: Math.PI, outward: [0, -1] };
  }
}

/** Flush elevation texture plane (stucco, stone, windows, roof fills from DWG). */
function ElevationTexturePlane({
  sheet,
  massing,
  centerFt,
}: {
  sheet: CadElevationSheet;
  massing: CadMassing;
  centerFt: { cx: number; cy: number };
}) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const sheetKey = `${sheet.name}-${sheet.segments.length}`;

  useEffect(() => {
    let cancelled = false;
    let tex: THREE.Texture | null = null;
    const url = elevationSvgDataUrl(sheet, { padFt: 0.15, richFills: true });
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      setTexture(tex);
    };
    img.src = url;
    return () => {
      cancelled = true;
      tex?.dispose();
    };
  }, [sheetKey, sheet]);

  const wM = massing.facadeWidthFt * FT_TO_M;
  const hM = massing.facadeHeightFt * FT_TO_M;
  const face = facadeFaceCoords(massing.frontFace, massing.planBounds);
  const [wx, wz] = planFtToWorld(face.xFt, face.yFt, centerFt);
  const [ox, oz] = face.outward;

  if (!texture) return null;

  return (
    <mesh
      position={[wx + ox * 0.02, hM / 2, wz + oz * 0.02]}
      rotation={[0, face.yaw, 0]}
      receiveShadow
    >
      <planeGeometry args={[wM, hM]} />
      <meshStandardMaterial map={texture} roughness={0.88} metalness={0.02} />
    </mesh>
  );
}

/**
 * Front elevation: rich SVG texture plane + extruded linework for depth (trim, roof edges).
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
  const linework = useMemo(() => {
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
      return [wx + ox * (LINework_DEPTH / 2 + 0.04), yFt * FT_TO_M, wz + oz * (LINework_DEPTH / 2 + 0.04)];
    };

    const segs = sheet.segments.filter((s) => {
      const u = s.layer.toUpperCase();
      if (/DIM|TEXT|NOTE|TITLE|BORDER|A-ELEV|DRY\s*WALL/i.test(u)) return false;
      return /ROOF|TRUSS|RAFTER|GABLE|SOFFIT|STONE|BRG|COLUMN|PORCH|TRIM|BAND/i.test(u);
    });

    const out: ReactElement[] = [];
    let idx = 0;

    for (const s of segs) {
      const lenFt = Math.hypot(s.x2Ft - s.x1Ft, s.y2Ft - s.y1Ft);
      if (lenFt < 0.15) continue;

      const [x1, y1, z1] = elevToWorld(s.x1Ft, s.y1Ft);
      const [x2, y2, z2] = elevToWorld(s.x2Ft, s.y2Ft);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dy, dz) || 0.01;
      const angleY = Math.atan2(dz, dx);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const mat = facadeMaterialForLayer(s.role, s.layer);
      const depth = /ROOF|GABLE/i.test(s.layer) ? LINework_DEPTH * 1.4 : LINework_DEPTH;

      out.push(
        <mesh
          key={`facade-lw-${idx++}`}
          position={[(x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2]}
          rotation={[0, -angleY, pitch]}
          castShadow
        >
          <boxGeometry args={[len, Math.max(0.05, lenFt * FT_TO_M * 0.025 + 0.03), depth]} />
          <primitive object={mat} attach="material" />
        </mesh>,
      );
    }
    return out;
  }, [sheet, massing, centerFt]);

  return (
    <group>
      <ElevationTexturePlane sheet={sheet} massing={massing} centerFt={centerFt} />
      {linework}
    </group>
  );
}
