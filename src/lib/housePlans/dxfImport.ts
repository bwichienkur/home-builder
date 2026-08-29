import type { HousePlan } from './buildPlan';
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

  let rooms = accurate.rooms;
  if (rooms.length <= 1 && segments.length > 20) {
    const legacy = segmentsToOrthogonalRoomsLegacy(accurate.scaledSegments);
    if (legacy.rooms.length > rooms.length) {
      rooms = legacy.rooms;
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
  const plan: HousePlan = {
    id: `dxf-${crypto.randomUUID().slice(0, 8)}`,
    name,
    stories: 1,
    beds: rooms.filter((r) => /bed|suite|owner/i.test(r.name)).length,
    baths: rooms.filter((r) => /bath|powder/i.test(r.name)).length,
    livingSqFt: Math.round(living),
    totalUnderRoofSqFt: Math.round(underRoof),
    sourceUrl: '',
    note: 'Imported from DXF. Wall centerlines + flood-fill rooms — review names/sizes in Plan verification.',
    floors: [{ id: `dxf-floor-1`, name: 'First story', rooms }],
  };
  return { plan, warnings, lineCount: segments.length };
}

/** IFC inspect — delegated to planExport/buildIfc (spaces/walls summary). */
export { inspectIfc } from '../planExport/buildIfc';
