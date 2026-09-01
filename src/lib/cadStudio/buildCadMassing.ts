import { extractRoofProfileFromElevation } from './buildCadElevation';
import type {
  CadBoundsFt,
  CadElevationSheet,
  CadMassing,
  CadPlanFace,
  CadPlate,
  CadRoofMassing,
} from './types';

const FT_TO_M = 0.3048;

function planSpan(bounds: CadBoundsFt): { widthFt: number; depthFt: number } {
  return {
    widthFt: Math.max(1, bounds.maxX - bounds.minX),
    depthFt: Math.max(1, bounds.maxY - bounds.minY),
  };
}

/** Pick which plan edge the front elevation width aligns with. */
export function detectFrontFace(planBounds: CadBoundsFt, front: CadElevationSheet): CadPlanFace {
  const { widthFt, depthFt } = planSpan(planBounds);
  const elevW = Math.max(1, front.bounds.maxX - front.bounds.minX);
  const errAlongWidth = Math.abs(elevW - widthFt);
  const errAlongDepth = Math.abs(elevW - depthFt);
  if (errAlongWidth <= errAlongDepth + 2) return 'south';
  return 'east';
}

/** Ridge runs along plan depth when front/south gable faces the viewer; along width for side faces. */
function ridgeRunsAlongPlanX(frontFace: CadPlanFace): boolean {
  return frontFace === 'east' || frontFace === 'west';
}

function wallTopFtFromElevation(front: CadElevationSheet | null | undefined): number | null {
  if (!front) return null;
  const wallSegs = front.segments.filter((s) => s.role === 'wall' || /WALL|EXT|BRG/i.test(s.layer));
  if (!wallSegs.length) return null;
  let maxY = 0;
  for (const s of wallSegs) {
    maxY = Math.max(maxY, s.y1Ft, s.y2Ft);
  }
  return maxY > 1 ? maxY : null;
}

function buildRoofMassing(
  plate: CadPlate,
  front: CadElevationSheet | null | undefined,
  storyHeightM: number,
  frontFace: CadPlanFace,
): CadRoofMassing {
  const { widthFt, depthFt } = planSpan(plate.bounds);
  const profile = front ? extractRoofProfileFromElevation(front) : [];
  const wallTopFt = wallTopFtFromElevation(front);
  const effectiveStoryM =
    wallTopFt != null ? Math.max(storyHeightM, wallTopFt * FT_TO_M) : storyHeightM;
  const ridgeFt = profile.length ? Math.max(...profile.map((p) => p.yFt)) : effectiveStoryM / FT_TO_M + 4;
  const facadeWidthFt = front
    ? Math.max(1, front.bounds.maxX - front.bounds.minX)
    : frontFace === 'south' || frontFace === 'north'
      ? widthFt
      : depthFt;
  const facadeDepthFt = frontFace === 'south' || frontFace === 'north' ? depthFt : widthFt;
  const ridgeAlongX = ridgeRunsAlongPlanX(frontFace);

  if (profile.length >= 3) {
    const maxY = Math.max(...profile.map((p) => p.yFt));
    return {
      style: 'dxf',
      ridgeHeightM: Math.max(effectiveStoryM + 0.35, maxY * FT_TO_M),
      ridgeAlongX,
      profile: profile.map((p) => ({ xFt: p.xFt, yFt: p.yFt })),
      overhangM: 0.35,
      facadeWidthFt,
      facadeDepthFt,
    };
  }

  const riseM = Math.min(1.1, Math.max(0.4, Math.min(facadeWidthFt, facadeDepthFt) * FT_TO_M * 0.2));
  return {
    style: 'procedural',
    ridgeHeightM: effectiveStoryM + riseM,
    ridgeAlongX,
    overhangM: 0.35,
    facadeWidthFt,
    facadeDepthFt,
  };
}

/** Align elevation sheets + roof profile with the floor plate for 3D massing. */
export function buildCadMassing(plate: CadPlate, storyHeightM: number): CadMassing {
  const front = plate.elevationFront ?? null;
  const side = plate.elevationSide ?? null;
  const frontFace = front ? detectFrontFace(plate.bounds, front) : 'south';
  const roof = buildRoofMassing(plate, front, storyHeightM, frontFace);
  const facadeHeightFt = front
    ? Math.max(1, front.bounds.maxY - front.bounds.minY)
    : roof.ridgeHeightM / FT_TO_M;

  return {
    frontFace,
    storyHeightM:
      wallTopFtFromElevation(front) != null
        ? Math.max(storyHeightM, wallTopFtFromElevation(front)! * FT_TO_M)
        : storyHeightM,
    roof,
    frontElevation: front ?? undefined,
    sideElevation: side ?? undefined,
    facadeWidthFt: roof.facadeWidthFt,
    facadeDepthFt: roof.facadeDepthFt,
    facadeHeightFt,
    planBounds: { ...plate.bounds },
  };
}
