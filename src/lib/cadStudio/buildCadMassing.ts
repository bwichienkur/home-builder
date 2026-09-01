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
  // Default south (min plan Y after flip) when elevation width matches plan width.
  if (errAlongWidth <= errAlongDepth + 2) return 'south';
  return 'east';
}

function buildRoofMassing(
  plate: CadPlate,
  front: CadElevationSheet | null | undefined,
  storyHeightM: number,
  frontFace: CadPlanFace,
): CadRoofMassing {
  const { widthFt, depthFt } = planSpan(plate.bounds);
  const profile = front ? extractRoofProfileFromElevation(front) : [];
  const ridgeFt = profile.length ? Math.max(...profile.map((p) => p.yFt)) : storyHeightM / FT_TO_M + 4;
  const ridgeHeightM = Math.max(storyHeightM + 0.35, ridgeFt * FT_TO_M);
  const facadeWidthFt = front
    ? Math.max(1, front.bounds.maxX - front.bounds.minX)
    : frontFace === 'south' || frontFace === 'north'
      ? widthFt
      : depthFt;
  const facadeDepthFt = frontFace === 'south' || frontFace === 'north' ? depthFt : widthFt;
  const ridgeAlongX = facadeWidthFt >= facadeDepthFt;

  if (profile.length >= 3) {
    const maxY = Math.max(...profile.map((p) => p.yFt));
    const normalized = profile.map((p) => ({
      xFt: p.xFt,
      yFt: p.yFt,
    }));
    return {
      style: 'dxf',
      ridgeHeightM: Math.max(storyHeightM + 0.35, maxY * FT_TO_M),
      ridgeAlongX,
      profile: normalized,
      overhangM: 0.35,
      facadeWidthFt,
      facadeDepthFt,
    };
  }

  const riseM = Math.min(1.1, Math.max(0.4, Math.min(facadeWidthFt, facadeDepthFt) * FT_TO_M * 0.2));
  return {
    style: 'procedural',
    ridgeHeightM: storyHeightM + riseM,
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

  return {
    frontFace,
    storyHeightM,
    roof,
    frontElevation: front ?? undefined,
    sideElevation: side ?? undefined,
    facadeWidthFt: roof.facadeWidthFt,
    facadeDepthFt: roof.facadeDepthFt,
  };
}
