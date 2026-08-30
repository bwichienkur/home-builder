import type { HousePlan, PlanRoomRect } from './buildPlan';
import {
  parseDxfEntitiesToSegments,
  type DxfSeg,
  type DxfLabel,
} from './dxfParse';
import {
  readInsUnits,
  segmentsToRoomsAccurate,
  segmentsToOrthogonalRoomsLegacy,
} from './dxfRooms';

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

/** Translate to origin, snap shared edges, and grid-align imported room boxes. */
export function finalizeImportedRooms(rooms: PlanRoomRect[]): PlanRoomRect[] {
  if (!rooms.length) return rooms;
  const minX = Math.min(...rooms.map((r) => r.x));
  const minY = Math.min(...rooms.map((r) => r.y));
  let out = rooms.map((r) => ({
    ...r,
    x: r.x - minX,
    y: r.y - minY,
  }));
  out = bridgeGarageToHouse(out);
  out = snapRoomEdges(out);
  out = out.map((r) => {
    const x = roundGrid(r.x);
    const y = roundGrid(r.y);
    const x2 = roundGrid(r.x + r.w);
    const y2 = roundGrid(r.y + r.h);
    return {
      ...r,
      x,
      y,
      w: Math.max(MIN_ROOM_FT, x2 - x),
      h: Math.max(MIN_ROOM_FT, y2 - y),
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
  opts?: { labels?: DxfLabel[]; segments?: DxfSeg[] },
): DxfImportResult {
  const insUnits = readInsUnits(dxfText);
  const parsed = opts?.segments
    ? { segments: opts.segments, labels: opts.labels ?? [], warnings: [] as string[] }
    : parseDxfEntitiesToSegments(dxfText);
  const segments = parsed.segments;
  const warnings = [...parsed.warnings];
  if (!segments.length) {
    warnings.push('No LINE/LWPOLYLINE geometry found.');
  }

  const labels = opts?.labels?.length ? opts.labels : parsed.labels;
  const accurate = segmentsToRoomsAccurate(segments, { labels, insUnits });
  warnings.push(...accurate.warnings);

  let rooms = finalizeImportedRooms(accurate.rooms);
  if (rooms.length <= 1 && segments.length > 20) {
    const legacy = segmentsToOrthogonalRoomsLegacy(accurate.scaledSegments);
    if (legacy.rooms.length > rooms.length) {
      rooms = finalizeImportedRooms(legacy.rooms);
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
  // If rooms are scattered (viewport leftovers), prefer living area over absurd bbox.
  const underRoof = spanArea > living * 2.5 ? living * 1.12 : spanArea;
  warnings.push('Normalized room coordinates to local origin and snapped shared edges.');
  const plan: HousePlan = {
    id: `dxf-${crypto.randomUUID().slice(0, 8)}`,
    name,
    stories: 1,
    beds: rooms.filter((r) => /bed|suite|owner/i.test(r.name)).length,
    baths: rooms.filter((r) => /bath|powder/i.test(r.name)).length,
    livingSqFt: Math.round(living),
    totalUnderRoofSqFt: Math.round(underRoof),
    sourceUrl: '',
    note: 'Imported from DXF. Sealed-envelope rooms — review names/sizes in Plan verification.',
    floors: [{ id: `dxf-floor-1`, name: 'First story', rooms }],
  };
  return { plan, warnings, lineCount: segments.length };
}

/** IFC inspect — delegated to planExport/buildIfc (spaces/walls summary). */
export { inspectIfc } from '../planExport/buildIfc';
