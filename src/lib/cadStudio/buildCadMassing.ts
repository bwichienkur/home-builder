import { extractRoofProfileFromElevation } from './buildCadElevation';
import type {
  CadBoundsFt,
  CadElevationSheet,
  CadMassing,
  CadPlanFace,
  CadPlate,
  CadRoofKind,
  CadRoofMassing,
  CadRoofOverrides,
  CadWallCenterlineFt,
} from './types';

const FT_TO_M = 0.3048;

export const DEFAULT_ROOF_OVERRIDES: CadRoofOverrides = {
  kind: 'auto',
  pitchRise12: 6,
  overhangFt: 1.15,
  forceProcedural: false,
};

function planSpan(bounds: CadBoundsFt): { widthFt: number; depthFt: number } {
  return {
    widthFt: Math.max(1, bounds.maxX - bounds.minX),
    depthFt: Math.max(1, bounds.maxY - bounds.minY),
  };
}

/** Prefer the main house when a plate has multiple buildings (e.g. detached garage). */
function primaryBuildingWalls(walls: CadWallCenterlineFt[], plate: CadPlate): CadWallCenterlineFt[] {
  const ids = [...new Set(walls.map((w) => w.buildingId).filter(Boolean))] as string[];
  if (ids.length <= 1) return walls;
  const preferred =
    plate.buildings?.find((b) => /main/i.test(b.id) || /main/i.test(b.name))?.id ?? ids[0]!;
  const filtered = walls.filter((w) => w.buildingId === preferred);
  return filtered.length ? filtered : walls;
}

/** Exterior wall AABB when available (Plan7-style roof from building contour). */
export function exteriorContourBounds(plate: CadPlate): CadBoundsFt {
  const exterior = plate.wallCenterlines.filter((w) => w.exterior);
  const walls: CadWallCenterlineFt[] = primaryBuildingWalls(
    exterior.length ? exterior : plate.wallCenterlines,
    plate,
  );
  if (!walls.length) return { ...plate.bounds };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.x1, w.x2);
    minY = Math.min(minY, w.y1, w.y2);
    maxX = Math.max(maxX, w.x1, w.x2);
    maxY = Math.max(maxY, w.y1, w.y2);
  }
  if (!Number.isFinite(minX)) return { ...plate.bounds };
  return { minX, minY, maxX, maxY };
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

function resolveKind(
  overrides: CadRoofOverrides | undefined,
  hasDxfProfile: boolean,
): 'gable' | 'flat' | 'shed' {
  const k: CadRoofKind = overrides?.kind ?? 'auto';
  if (k === 'flat' || k === 'shed' || k === 'gable') return k;
  // auto
  if (hasDxfProfile && !overrides?.forceProcedural) return 'gable';
  return 'gable';
}

function riseFromPitch(spanFt: number, pitchRise12: number): number {
  const halfSpanFt = spanFt / 2;
  const riseFt = (halfSpanFt * pitchRise12) / 12;
  return Math.max(0.25, riseFt * FT_TO_M);
}

function buildRoofMassing(
  plate: CadPlate,
  front: CadElevationSheet | null | undefined,
  storyHeightM: number,
  frontFace: CadPlanFace,
): CadRoofMassing {
  const contour = exteriorContourBounds(plate);
  const { widthFt, depthFt } = planSpan(contour);
  const overrides = plate.roof ?? undefined;
  const overhangM = (overrides?.overhangFt ?? DEFAULT_ROOF_OVERRIDES.overhangFt) * FT_TO_M;
  const pitchRise12 = overrides?.pitchRise12 ?? DEFAULT_ROOF_OVERRIDES.pitchRise12;
  const profile = front ? extractRoofProfileFromElevation(front) : [];
  const hasProfile = profile.length >= 3;
  const wallTopFt = wallTopFtFromElevation(front);
  const effectiveStoryM =
    wallTopFt != null ? Math.max(storyHeightM, wallTopFt * FT_TO_M) : storyHeightM;
  const facadeWidthFt = front
    ? Math.max(1, front.bounds.maxX - front.bounds.minX)
    : frontFace === 'south' || frontFace === 'north'
      ? widthFt
      : depthFt;
  const facadeDepthFt = frontFace === 'south' || frontFace === 'north' ? depthFt : widthFt;
  const ridgeAlongX =
    overrides?.ridgeAlongX != null ? overrides.ridgeAlongX : ridgeRunsAlongPlanX(frontFace);
  const kind = resolveKind(overrides, hasProfile);
  const useDxf =
    hasProfile &&
    kind === 'gable' &&
    !overrides?.forceProcedural &&
    (overrides?.kind === 'auto' || overrides?.kind == null);

  if (useDxf) {
    const maxY = Math.max(...profile.map((p) => p.yFt));
    return {
      style: 'dxf',
      kind: 'gable',
      ridgeHeightM: Math.max(effectiveStoryM + 0.35, maxY * FT_TO_M),
      ridgeAlongX,
      profile: profile.map((p) => ({ xFt: p.xFt, yFt: p.yFt })),
      overhangM,
      facadeWidthFt,
      facadeDepthFt,
      pitchRise12,
    };
  }

  if (kind === 'flat') {
    return {
      style: 'procedural',
      kind: 'flat',
      ridgeHeightM: effectiveStoryM + 0.18,
      ridgeAlongX,
      overhangM,
      facadeWidthFt: widthFt,
      facadeDepthFt: depthFt,
      pitchRise12: 0,
    };
  }

  const spanFt = ridgeAlongX ? depthFt : widthFt;
  const riseM =
    kind === 'shed'
      ? Math.max(0.35, (spanFt * pitchRise12) / 12 * FT_TO_M)
      : riseFromPitch(spanFt, pitchRise12);

  return {
    style: 'procedural',
    kind,
    ridgeHeightM: effectiveStoryM + riseM,
    ridgeAlongX,
    overhangM,
    facadeWidthFt: widthFt,
    facadeDepthFt: depthFt,
    pitchRise12,
  };
}

/** Align elevation sheets + roof profile with the floor plate for 3D massing. */
export function buildCadMassing(plate: CadPlate, storyHeightM: number): CadMassing {
  const front = plate.elevationFront ?? null;
  const side = plate.elevationSide ?? null;
  const contour = exteriorContourBounds(plate);
  const frontFace = front ? detectFrontFace(contour, front) : 'south';
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
    planBounds: { ...contour },
  };
}

export function setPlateRoof(plate: CadPlate, patch: Partial<CadRoofOverrides>): CadPlate {
  const base = plate.roof ?? { ...DEFAULT_ROOF_OVERRIDES };
  return { ...plate, roof: { ...base, ...patch } };
}
