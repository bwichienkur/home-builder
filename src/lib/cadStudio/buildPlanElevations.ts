import type {
  CadBoundsFt,
  CadElevationFace,
  CadElevationSegmentFt,
  CadElevationSheet,
  CadOpeningHintFt,
  CadPlate,
  CadWallCenterlineFt,
} from './types';
import { defaultWallThicknessFt } from './cadDrawSnap';
import { storyHeightFt } from './cadModelKernel';

export type PlanElevationFace = CadElevationFace;

type FaceAxis = {
  station: (x: number, y: number, b: CadBoundsFt) => number;
  isParallel: (w: CadWallCenterlineFt) => boolean;
  depth: (x: number, y: number, b: CadBoundsFt) => number;
  label: string;
};

const FACES: Record<PlanElevationFace, FaceAxis> = {
  front: {
    station: (x) => x,
    isParallel: (w) => Math.abs(w.y2 - w.y1) <= Math.abs(w.x2 - w.x1) * 0.35,
    depth: (_x, y, b) => y - b.minY,
    label: 'FRONT ELEVATION',
  },
  rear: {
    station: (x, _y, b) => b.maxX - (x - b.minX),
    isParallel: (w) => Math.abs(w.y2 - w.y1) <= Math.abs(w.x2 - w.x1) * 0.35,
    depth: (_x, y, b) => b.maxY - y,
    label: 'REAR ELEVATION',
  },
  side: {
    station: (_x, y) => y,
    isParallel: (w) => Math.abs(w.x2 - w.x1) <= Math.abs(w.y2 - w.y1) * 0.35,
    depth: (x, _y, b) => x - b.minX,
    label: 'LEFT ELEVATION',
  },
  right: {
    station: (_x, y, b) => b.maxY - (y - b.minY),
    isParallel: (w) => Math.abs(w.x2 - w.x1) <= Math.abs(w.y2 - w.y1) * 0.35,
    depth: (x, _y, b) => b.maxX - x,
    label: 'RIGHT ELEVATION',
  },
};

function wallMid(w: CadWallCenterlineFt): { x: number; y: number } {
  return { x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 };
}

function openingMid(o: CadOpeningHintFt): { x: number; y: number } {
  return { x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2 };
}

function boundsOfSegments(segs: CadElevationSegmentFt[]): CadBoundsFt {
  if (!segs.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of segs) {
    minX = Math.min(minX, s.x1Ft, s.x2Ft);
    minY = Math.min(minY, s.y1Ft, s.y2Ft);
    maxX = Math.max(maxX, s.x1Ft, s.x2Ft);
    maxY = Math.max(maxY, s.y1Ft, s.y2Ft);
  }
  return { minX, minY, maxX, maxY };
}

function defaultStoryHeight(plate: CadPlate): number {
  try {
    if (plate.stories?.length) {
      const active = plate.stories.find((s) => s.id === plate.activeStoryId) ?? plate.stories[0]!;
      return storyHeightFt(plate, active.id, 9);
    }
  } catch {
    /* fall through */
  }
  return 9;
}

/** Orthographic massing elevations from plan walls/openings. */
export function buildPlanElevation(
  plate: CadPlate,
  face: PlanElevationFace,
  opts?: { storyHeightFt?: number; eaveHeightFt?: number },
): CadElevationSheet {
  const axis = FACES[face];
  const b = plate.bounds;
  const wallTop = opts?.storyHeightFt ?? defaultStoryHeight(plate);
  const ridge = opts?.eaveHeightFt ?? wallTop + Math.max(3, wallTop * 0.35);
  const faceTol = Math.max(2.5, Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.08);

  const exterior = plate.wallCenterlines.filter((w) => w.exterior);
  const pool = exterior.length ? exterior : plate.wallCenterlines;

  const faceWalls = pool
    .map((w) => {
      const m = wallMid(w);
      return { w, depth: axis.depth(m.x, m.y, b), parallel: axis.isParallel(w) };
    })
    .filter((x) => x.parallel && x.depth <= faceTol)
    .sort((a, b2) => a.depth - b2.depth);

  const segs: CadElevationSegmentFt[] = [];
  const pushRect = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    layer: string,
    role: CadElevationSegmentFt['role'],
  ) => {
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    segs.push(
      { x1Ft: lo, y1Ft: y0, x2Ft: hi, y2Ft: y0, layer, role },
      { x1Ft: hi, y1Ft: y0, x2Ft: hi, y2Ft: y1, layer, role },
      { x1Ft: hi, y1Ft: y1, x2Ft: lo, y2Ft: y1, layer, role },
      { x1Ft: lo, y1Ft: y1, x2Ft: lo, y2Ft: y0, layer, role },
    );
  };

  let minS = Infinity;
  let maxS = -Infinity;
  for (const { w } of faceWalls) {
    const s1 = axis.station(w.x1, w.y1, b);
    const s2 = axis.station(w.x2, w.y2, b);
    minS = Math.min(minS, s1, s2);
    maxS = Math.max(maxS, s1, s2);
    void defaultWallThicknessFt(w);
    pushRect(Math.min(s1, s2), Math.max(s1, s2), 0, wallTop, w.layer || 'WALLS EXT', 'wall');
  }

  if (!Number.isFinite(minS) || !Number.isFinite(maxS) || maxS - minS < 1) {
    if (face === 'front' || face === 'rear') {
      minS = b.minX;
      maxS = b.maxX;
    } else {
      minS = b.minY;
      maxS = b.maxY;
    }
    pushRect(minS, maxS, 0, wallTop, 'WALLS EXT', 'wall');
  }

  for (const o of plate.openingHints) {
    const m = openingMid(o);
    const depth = axis.depth(m.x, m.y, b);
    if (depth > faceTol * 1.35) continue;
    const along = Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
    if (along < 0.5) continue;
    const s1 = axis.station(o.x1, o.y1, b);
    const s2 = axis.station(o.x2, o.y2, b);
    const sill = o.kind === 'window' ? (o.sillFt ?? 3) : 0;
    const height = o.heightFt ?? (o.kind === 'window' ? 4 : o.kind === 'garage' ? 7 : 6.667);
    pushRect(Math.min(s1, s2), Math.max(s1, s2), sill, sill + height, o.layer || 'OPENINGS', 'opening');
  }

  const mid = (minS + maxS) / 2;
  segs.push(
    { x1Ft: minS, y1Ft: wallTop, x2Ft: mid, y2Ft: ridge, layer: 'ROOF', role: 'elevation' },
    { x1Ft: mid, y1Ft: ridge, x2Ft: maxS, y2Ft: wallTop, layer: 'ROOF', role: 'elevation' },
    { x1Ft: minS, y1Ft: wallTop, x2Ft: maxS, y2Ft: wallTop, layer: 'ROOF', role: 'elevation' },
  );

  segs.push({
    x1Ft: minS - 1,
    y1Ft: 0,
    x2Ft: maxS + 1,
    y2Ft: 0,
    layer: 'GRADE',
    role: 'soft',
  });

  const origin = minS;
  const normalized = segs.map((s) => ({
    ...s,
    x1Ft: s.x1Ft - origin,
    x2Ft: s.x2Ft - origin,
  }));

  return {
    face,
    name: axis.label,
    segments: normalized,
    bounds: boundsOfSegments(normalized),
    labels: [{ x: (maxS - origin) / 2, y: ridge + 0.8, text: axis.label, layer: 'A-ELEV-TEXT' }],
    gradeFt: 0,
  };
}

/** Ensure plate has all four elevation faces (keep DXF sheets; synthesize missing ones). */
export function ensureFourElevations(plate: CadPlate): CadPlate {
  const next = { ...plate };
  if (!next.elevationFront?.segments.length) {
    next.elevationFront = buildPlanElevation(plate, 'front');
  }
  if (!next.elevationSide?.segments.length) {
    next.elevationSide = buildPlanElevation(plate, 'side');
  }
  if (!next.elevationRear?.segments.length) {
    next.elevationRear = buildPlanElevation(plate, 'rear');
  }
  if (!next.elevationRight?.segments.length) {
    next.elevationRight = buildPlanElevation(plate, 'right');
  }
  return next;
}
