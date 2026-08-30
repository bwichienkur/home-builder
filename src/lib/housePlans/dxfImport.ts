import type { HousePlan, PlanRoomRect } from './buildPlan';
import {
  parseDxfEntitiesToSegments,
  type DxfSeg,
  type DxfLabel,
} from './dxfParse';
import {
  readInsUnits,
  scaleSegmentsToFeet,
  segmentsToRoomsAccurate,
  segmentsToOrthogonalRoomsLegacy,
  wallCenterlinesFromSegments,
} from './dxfRooms';
import { translateRoomsAndWalls, type PlanOpeningHintFt } from './dxfCadBuild';

const MAX_CAD_PLAN_VECTORS = 8000;

function openingKindFromLayer(layer: string): 'door' | 'window' {
  const u = layer.trim().toUpperCase();
  if (/WINDOW|GLAZ|WIND/.test(u)) return 'window';
  return 'door';
}

function planVectorRole(layer: string): 'wall' | 'opening' | 'fixture' | 'soft' | 'other' {
  const u = layer.trim().toUpperCase();
  if (/DOOR|WINDOW|GLAZ|OPENING|A-GLAZ|A-DOOR|A-WIND/.test(u)) return 'opening';
  if (/\bWALLS?\b|A-WALL|WALL-/.test(u)) return 'wall';
  if (/FIXTURE|COUNTER|CABINET|APPLIANCE|SINK|TOILET|RANGE|STOVE|OVEN/.test(u)) return 'fixture';
  if (/CEILING|VOLUME|SPACE.?BOUND|ROOM.?BOUND|OPEN.?PLAN/.test(u)) return 'soft';
  return 'other';
}

/**
 * Flip CAD Y so plan orientation matches floor sheets / PDF (SVG already uses scale(1,-1)).
 * Apply once to all channels before room detection.
 */
export function flipPlanY<T extends { y1: number; y2: number }>(segs: T[]): T[] {
  return segs.map((s) => ({ ...s, y1: -s.y1, y2: -s.y2 }));
}

export function flipPlanLabels<T extends { y: number }>(labels: T[]): T[] {
  return labels.map((l) => ({ ...l, y: -l.y }));
}

export type DxfImportResult = {
  plan: HousePlan;
  warnings: string[];
  lineCount: number;
};

export type Seg = DxfSeg;

const EDGE_SNAP_FT = 2.5;
const GRID_FT = 0.25;
const MIN_ROOM_FT = 3;

function roundGrid(v: number, step = GRID_FT) {
  return Math.round(v / step) * step;
}

/** Cluster nearby edge coordinates so adjacent rooms share walls after import. */
function snapRoomEdges(rooms: PlanRoomRect[], tol = EDGE_SNAP_FT): PlanRoomRect[] {
  if (rooms.length < 2) return rooms;
  const xEdges: number[] = [];
  const yEdges: number[] = [];
  for (const r of rooms) {
    xEdges.push(r.x, r.x + r.w);
    yEdges.push(r.y, r.y + r.h);
  }
  const cluster = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const map = new Map<number, number>();
    let group: number[] = [sorted[0]!];
    const flush = () => {
      const rep = group.reduce((a, b) => a + b, 0) / group.length;
      for (const v of group) map.set(v, rep);
      group = [];
    };
    for (let i = 1; i < sorted.length; i++) {
      const v = sorted[i]!;
      if (v - group[group.length - 1]! <= tol) group.push(v);
      else {
        flush();
        group = [v];
      }
    }
    flush();
    return map;
  };
  const xMap = cluster(xEdges);
  const yMap = cluster(yEdges);
  return rooms.map((r) => {
    const x0 = xMap.get(r.x) ?? r.x;
    const x1 = xMap.get(r.x + r.w) ?? r.x + r.w;
    const y0 = yMap.get(r.y) ?? r.y;
    const y1 = yMap.get(r.y + r.h) ?? r.y + r.h;
    return {
      ...r,
      x: x0,
      y: y0,
      w: Math.max(MIN_ROOM_FT, x1 - x0),
      h: Math.max(MIN_ROOM_FT, y1 - y0),
    };
  });
}

/** Snap garage footprint to the house cluster when separated only by a door opening. */
function bridgeGarageToHouse(rooms: PlanRoomRect[]): PlanRoomRect[] {
  const garage = rooms.find((r) => /garage/i.test(r.name));
  if (!garage) return rooms;
  const house = rooms.filter(
    (r) =>
      r !== garage &&
      /laundry|foyer|mud|pantry|hall|stop|drop|utility|garage entry/i.test(r.name),
  );
  if (!house.length) return rooms;
  const houseMinY = Math.min(...house.map((r) => r.y));
  const garageMaxY = garage.y + garage.h;
  const gap = houseMinY - garageMaxY;
  if (gap <= 0 || gap > 8) return rooms;
  const seam = garageMaxY + gap / 2;
  garage.h = Math.max(MIN_ROOM_FT, seam - garage.y);
  for (const r of house) {
    if (r.y <= houseMinY + 1) {
      const oldBottom = r.y + r.h;
      r.y = seam;
      r.h = Math.max(MIN_ROOM_FT, oldBottom - seam);
    }
  }
  return rooms;
}

/** Snap shared edges and grid-align imported room boxes (expects local origin). */
export function finalizeImportedRooms(rooms: PlanRoomRect[]): PlanRoomRect[] {
  if (!rooms.length) return rooms;
  let out = bridgeGarageToHouse([...rooms]);
  out = snapRoomEdges(out);
  out = out.map((r) => {
    const x = roundGrid(r.x);
    const y = roundGrid(r.y);
    const x2 = roundGrid(r.x + r.w);
    const y2 = roundGrid(r.y + r.h);
    const pointsFt = r.pointsFt?.map((p) => ({
      x: roundGrid(p.x),
      y: roundGrid(p.y),
    }));
    return {
      ...r,
      x,
      y,
      w: Math.max(MIN_ROOM_FT, x2 - x),
      h: Math.max(MIN_ROOM_FT, y2 - y),
      pointsFt,
    };
  });
  return out;
}

/** @deprecated prefer parseDxfEntitiesToSegments — kept for tests */
export function parseDxfToSegments(dxfText: string): { segments: Seg[]; warnings: string[] } {
  const { segments, warnings } = parseDxfEntitiesToSegments(dxfText);
  return { segments, warnings };
}

/** @deprecated use segmentsToRoomsAccurate */
export function segmentsToOrthogonalRooms(segments: Seg[]): {
  rooms: ReturnType<typeof segmentsToRoomsAccurate>['rooms'];
  warnings: string[];
} {
  return segmentsToOrthogonalRoomsLegacy(segments);
}

export function importDxfHousePlan(
  dxfText: string,
  name = 'Imported DXF plan',
  opts?: {
    labels?: DxfLabel[];
    segments?: DxfSeg[];
    openingSegments?: DxfSeg[];
    /** Raw model-space linework for Plan CAD overlay (same units as segments). */
    planVectors?: DxfSeg[];
    /** Soft/dashed space boundaries for open-plan room partitions. */
    softPartitions?: DxfSeg[];
    /** Skip sheet-matching Y flip (tests / already-flipped geometry). */
    skipYFlip?: boolean;
  },
): DxfImportResult {
  const insUnits = readInsUnits(dxfText);
  const parsed = opts?.segments
    ? { segments: opts.segments, labels: opts.labels ?? [], warnings: [] as string[] }
    : parseDxfEntitiesToSegments(dxfText);
  let segments = parsed.segments;
  let labels = opts?.labels?.length ? opts.labels : parsed.labels;
  let rawOpenings = opts?.openingSegments ?? [];
  let rawPlanVectors = opts?.planVectors?.length ? opts.planVectors : [...segments, ...rawOpenings];
  let rawSoft = opts?.softPartitions ?? [];
  const warnings = [...parsed.warnings];

  // Match floor-sheet / PDF orientation (garage bottom-right on Stillwater, etc.).
  if (!opts?.skipYFlip) {
    segments = flipPlanY(segments);
    labels = flipPlanLabels(labels);
    rawOpenings = flipPlanY(rawOpenings);
    rawPlanVectors = flipPlanY(rawPlanVectors);
    rawSoft = flipPlanY(rawSoft);
    warnings.push('Flipped plan Y to match floor-sheet orientation.');
  }

  if (!segments.length) {
    warnings.push('No LINE/LWPOLYLINE geometry found.');
  }

  const accurate = segmentsToRoomsAccurate(segments, {
    labels,
    insUnits,
    softPartitions: rawSoft,
  });
  warnings.push(...accurate.warnings);

  const wallLines = wallCenterlinesFromSegments(accurate.scaledSegments);

  // Scale + classify opening-layer segments with the same unit scale as walls.
  const openingScaled = rawOpenings.length
    ? scaleSegmentsToFeet(rawOpenings, insUnits).segments
    : [];
  const openingHints: PlanOpeningHintFt[] = openingScaled.map((s) => ({
    x1: s.x1,
    y1: s.y1,
    x2: s.x2,
    y2: s.y2,
    layer: s.layer,
    kind: openingKindFromLayer(s.layer ?? ''),
  }));

  const normalized = translateRoomsAndWalls(accurate.rooms, wallLines, openingHints);
  let rooms = finalizeImportedRooms(normalized.rooms);
  let wallSegmentsFt = normalized.walls;
  let openingHintsFt = normalized.openings;
  const origin = normalized.origin;

  // Plan CAD overlay vectors — exact DXF linework in the same local-feet frame.
  const planScaled = rawPlanVectors.length
    ? scaleSegmentsToFeet(rawPlanVectors, insUnits).segments
    : [];
  const classifyPlanVector = (s: (typeof planScaled)[number], ox: number, oy: number) => {
    const base = planVectorRole(s.layer ?? '');
    const lt = (s.linetype ?? '').toUpperCase();
    // Dashed/hidden space boundaries stay dotted even on wall layers (DWG room ticks).
    const role: 'wall' | 'opening' | 'fixture' | 'soft' | 'other' =
      base === 'opening' || base === 'fixture'
        ? base
        : base === 'soft' || /DASH|HIDDEN|PHANTOM|DOT|CENTER/.test(lt)
          ? 'soft'
          : base;
    return {
      x1: s.x1 - ox,
      y1: s.y1 - oy,
      x2: s.x2 - ox,
      y2: s.y2 - oy,
      layer: s.layer,
      role,
    };
  };

  let cadPlanVectorsFt = planScaled
    .filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 0.05)
    .slice(0, MAX_CAD_PLAN_VECTORS)
    .map((s) => classifyPlanVector(s, origin.x, origin.y));

  if (rooms.length <= 1 && segments.length > 20) {
    const legacy = segmentsToOrthogonalRoomsLegacy(accurate.scaledSegments);
    if (legacy.rooms.length > rooms.length) {
      const legacyNorm = translateRoomsAndWalls(legacy.rooms, wallLines, openingHints);
      rooms = finalizeImportedRooms(legacyNorm.rooms);
      wallSegmentsFt = legacyNorm.walls;
      openingHintsFt = legacyNorm.openings;
      cadPlanVectorsFt = planScaled
        .filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 0.05)
        .slice(0, MAX_CAD_PLAN_VECTORS)
        .map((s) => classifyPlanVector(s, legacyNorm.origin.x, legacyNorm.origin.y));
      warnings.push('Used rectangular cell detection (more rooms than flood-fill).');
      warnings.push(...legacy.warnings);
    }
  }

  const maxX = Math.max(...rooms.map((r) => r.x + r.w), 0);
  const minX = Math.min(...rooms.map((r) => r.x), 0);
  const maxY = Math.max(...rooms.map((r) => r.y + r.h), 0);
  const minY = Math.min(...rooms.map((r) => r.y), 0);
  const living = rooms.reduce((s, r) => s + r.w * r.h, 0);
  const spanArea = Math.max(maxX - minX, 0) * Math.max(maxY - minY, 0);
  const underRoof = spanArea > living * 2.5 ? living * 1.12 : spanArea;
  const fixtureCount = cadPlanVectorsFt.filter((v) => v.role === 'fixture').length;
  warnings.push(
    `CAD build: ${wallSegmentsFt.length} wall centerline(s), ${openingHintsFt.length} opening hint(s), ${cadPlanVectorsFt.length} plan vector(s) (${fixtureCount} fixture), ${rooms.filter((r) => r.pointsFt?.length).length} polygon room(s).`,
  );
  const plan: HousePlan = {
    id: `dxf-${crypto.randomUUID().slice(0, 8)}`,
    name,
    stories: 1,
    beds: rooms.filter((r) => /bed|suite|owner/i.test(r.name)).length,
    baths: rooms.filter((r) => /bath|powder/i.test(r.name)).length,
    livingSqFt: Math.round(living),
    totalUnderRoofSqFt: Math.round(underRoof),
    sourceUrl: '',
    note: 'Imported from DXF (plan-first: Y-matched sheet, CAD overlay, open-plan fills). Review in Plan verification.',
    floors: [
      {
        id: `dxf-floor-1`,
        name: 'First story',
        rooms,
        wallSegmentsFt,
        openingHintsFt: openingHintsFt.length ? openingHintsFt : undefined,
        cadPlanVectorsFt: cadPlanVectorsFt.length ? cadPlanVectorsFt : undefined,
      },
    ],
  };
  return { plan, warnings, lineCount: segments.length };
}

/** IFC inspect — delegated to planExport/buildIfc (spaces/walls summary). */
export { inspectIfc } from '../planExport/buildIfc';
