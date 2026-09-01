import {
  cropSegmentsToViewport,
  pickElevationViewports,
} from '../housePlans/dxfDrawingImport';
import { readInsUnits, scaleSegmentsToFeet } from '../housePlans/dxfRooms';
import { classifySegmentRole, isElevationLayer } from './classifyLayers';
import type {
  CadBoundsFt,
  CadElevationSegmentFt,
  CadElevationSheet,
  CadSegmentRole,
} from './types';

type RawSeg = { x1: number; y1: number; x2: number; y2: number; layer: string; linetype?: string };
type RawLabel = { x: number; y: number; text: string; layer: string };

const ELEVATION_LAYERS = /WALL|ROOF|WINDOW|DOOR|HATCH|FIXTURE|COUNTER|ELEV|FACADE|RAIL|TRIM|PORCH|COLUMN|BRG|EXT|OPEN|GARAGE|DORMER/i;
const SKIP_LAYERS = /DIM|TEXT|NOTE|TITLE|BORDER|VIEWPORT|GRID|REF|MEASURE|TICK|DRY\s*WALL|A-ELEV/i;

function boundsOfXY(segs: { x1: number; y1: number; x2: number; y2: number }[]): CadBoundsFt {
  if (!segs.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of segs) {
    minX = Math.min(minX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxX = Math.max(maxX, s.x1, s.x2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }
  return { minX, minY, maxX, maxY };
}

function boundsOfElev(segs: CadElevationSegmentFt[]): CadBoundsFt {
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

function asRawSegs(
  segs: Array<{ x1: number; y1: number; x2: number; y2: number; layer?: string; linetype?: string }>,
): RawSeg[] {
  return segs.map((s) => ({ ...s, layer: s.layer ?? '0' }));
}

function segmentRole(layer: string): CadSegmentRole {
  if (isElevationLayer(layer)) return 'elevation';
  const role = classifySegmentRole(layer);
  if (role === 'wall' || role === 'opening' || role === 'fixture') return role;
  if (/ROOF|TRUSS|RAFTER|GABLE|SOFFIT|FASCIA/i.test(layer)) return 'elevation';
  if (/WALL|EXT|OPEN|GARAGE|BRG/i.test(layer)) return 'wall';
  if (/WINDOW|DOOR|GLAZ/i.test(layer)) return 'opening';
  return 'other';
}

function keepElevationSeg(layer: string): boolean {
  const u = layer.trim().toUpperCase();
  if (SKIP_LAYERS.test(u)) return false;
  return ELEVATION_LAYERS.test(u) || isElevationLayer(layer);
}

/** Normalize elevation segments so X = width from left, Y = height above grade. */
function normalizeElevationSegments(
  scaled: RawSeg[],
  gradeY: number,
  originX: number,
): CadElevationSegmentFt[] {
  return scaled
    .filter((s) => keepElevationSeg(s.layer))
    .map((s) => ({
      x1Ft: s.x1 - originX,
      y1Ft: s.y1 - gradeY,
      x2Ft: s.x2 - originX,
      y2Ft: s.y2 - gradeY,
      layer: s.layer,
      role: segmentRole(s.layer),
      linetype: s.linetype,
    }));
}

/** Estimate grade line from lowest wall-foot segments in the elevation crop. */
function detectGradeY(segs: RawSeg[]): number {
  const wallSegs = segs.filter((s) => /WALL|EXT|BRG|FOUND|SLAB|CONC/i.test(s.layer));
  const pool = wallSegs.length >= 4 ? wallSegs : segs;
  let minY = Infinity;
  for (const s of pool) {
    minY = Math.min(minY, s.y1, s.y2);
  }
  return Number.isFinite(minY) ? minY : 0;
}

function buildOneElevationSheet(
  segs: RawSeg[],
  labels: RawLabel[],
  vp: NonNullable<ReturnType<typeof pickElevationViewports>['front']>,
  insUnits: number,
  name: string,
  face: CadElevationSheet['face'],
): CadElevationSheet | null {
  const cropped = cropSegmentsToViewport(segs, vp, 0.08);
  if (cropped.length < 12) return null;

  const { segments: scaledRaw } = scaleSegmentsToFeet(cropped.slice(0, 8000), insUnits);
  const scaled = asRawSegs(scaledRaw);
  if (!scaled.length) return null;

  const rawBounds = boundsOfXY(scaled);
  const gradeY = detectGradeY(scaled);
  const originX = rawBounds.minX;
  const segments = normalizeElevationSegments(scaled, gradeY, originX);
  if (segments.length < 8) return null;

  const elevBounds = boundsOfElev(segments);
  const croppedLabels = cropSegmentsToViewport(
    labels.map((l) => ({ ...l, x1: l.x, y1: l.y, x2: l.x, y2: l.y })),
    vp,
    0.1,
  )
    .map(({ x1, y1, text, layer }) => ({
      x: x1 - originX,
      y: y1 - gradeY,
      text,
      layer,
    }))
    .filter((l) => l.text.length < 80);

  return {
    face,
    name,
    segments,
    bounds: elevBounds,
    labels: croppedLabels,
    gradeFt: 0,
  };
}

/** Build front/side elevation sheets from full model-space geometry + paper viewports. */
export function buildCadElevationSheets(
  dxfText: string,
  segs: Array<{ x1: number; y1: number; x2: number; y2: number; layer?: string; linetype?: string }>,
  labels: RawLabel[],
  viewports: ReturnType<typeof pickElevationViewports>,
): { front: CadElevationSheet | null; side: CadElevationSheet | null; warnings: string[] } {
  const warnings: string[] = [];
  const insUnits = readInsUnits(dxfText) ?? 1;
  const rawSegs = asRawSegs(segs);
  const front = viewports.front
    ? buildOneElevationSheet(rawSegs, labels, viewports.front, insUnits, 'SHT. 2 FRONT ELEVATION', 'front')
    : null;
  const side = viewports.side
    ? buildOneElevationSheet(rawSegs, labels, viewports.side, insUnits, 'SHT. 3 SIDE ELEVATIONS', 'side')
    : null;
  if (front) {
    warnings.push(
      `Front elevation: ${front.segments.length} segment(s), ${(front.bounds.maxX - front.bounds.minX).toFixed(1)}×${(front.bounds.maxY - front.bounds.minY).toFixed(1)} ft.`,
    );
  }
  if (side) {
    warnings.push(
      `Side elevation: ${side.segments.length} segment(s), ${(side.bounds.maxX - side.bounds.minX).toFixed(1)}×${(side.bounds.maxY - side.bounds.minY).toFixed(1)} ft.`,
    );
  }
  return { front, side, warnings };
}

/** Upper envelope of ROOF layer — ridge profile for 3D massing (x along width, y height ft). */
export function extractRoofProfileFromElevation(sheet: CadElevationSheet): { xFt: number; yFt: number }[] {
  const roofSegs = sheet.segments.filter((s) => /ROOF|TRUSS|RAFTER|GABLE|SOFFIT/i.test(s.layer));
  const pts = roofSegs.flatMap((s) => [
    { x: s.x1Ft, y: s.y1Ft },
    { x: s.x2Ft, y: s.y2Ft },
  ]);
  if (pts.length < 4) {
    // Fall back to top of wall segments
    const wallPts = sheet.segments
      .filter((s) => s.role === 'wall')
      .flatMap((s) => [
        { x: s.x1Ft, y: s.y1Ft },
        { x: s.x2Ft, y: s.y2Ft },
      ]);
    pts.push(...wallPts);
  }
  if (!pts.length) return [];

  const width = Math.max(1, sheet.bounds.maxX - sheet.bounds.minX);
  const binFt = Math.max(0.75, width / 48);
  const bins = new Map<number, number>();
  for (const p of pts) {
    if (p.x < -1 || p.x > width + 1 || p.y < 0) continue;
    const key = Math.round(p.x / binFt);
    bins.set(key, Math.max(bins.get(key) ?? 0, p.y));
  }
  const profile = [...bins.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, y]) => ({ xFt: k * binFt, yFt: y }))
    .filter((p) => p.yFt > 0.5);

  // Smooth spikes
  if (profile.length >= 3) {
    for (let i = 1; i < profile.length - 1; i++) {
      const prev = profile[i - 1]!.yFt;
      const next = profile[i + 1]!.yFt;
      profile[i]!.yFt = Math.min(profile[i]!.yFt, Math.max(prev, next) + 2);
    }
  }
  return profile;
}
