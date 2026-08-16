import type { FurnitureItem, Opening, PlanRoomLabel, UnitSystem, Wall } from '../types';
import { roomArea, validatePlan } from './geometry/rooms';
import { PIXELS_PER_METER } from './geometry/snapping';
import { WALL_ASSEMBLY_PRESETS } from './buildingChecks';

/** Default stud spacing for framing takeoff (16 in OC). */
export const DEFAULT_STUD_SPACING_M = 0.4064;
/** Default waste factor applied to finish SF lines. */
export const DEFAULT_WASTE_FACTOR = 0.1;
/** Simple gable roof factor over footprint (allows for pitch / overhang). */
export const DEFAULT_ROOF_AREA_FACTOR = 1.15;

export type ConstructionTakeoff = {
  floorAreaM2: number;
  wallLengthM: number;
  exteriorWallLengthM: number;
  interiorWallLengthM: number;
  partyWallLengthM: number;
  doorCount: number;
  windowCount: number;
  passageCount: number;
  stairCount: number;
  avgWallHeightM: number;
  openingAreaM2: number;
  drywallAreaM2: number;
  paintAreaM2: number;
  exteriorSheathingAreaM2: number;
  studCount: number;
  /** Top + bottom plates (2 × wall LF as count of plate pieces at 1 LF each). */
  plateLengthM: number;
  /** Rough headers ≈ one per door/window opening. */
  headerCount: number;
  /** Exterior wall cavity insulation SF. */
  insulationAreaM2: number;
  /** Floor finish SF (room area). */
  flooringAreaM2: number;
  /** Ground-floor slab proxy (= floor area). */
  slabAreaM2: number;
  /** Continuous footing LF ≈ exterior wall length. */
  footingLengthM: number;
  /** Roof SF proxy = footprint × pitch factor. */
  roofAreaM2: number;
  /** Sum of door leaf widths (m) for allowance pricing. */
  doorWidthSumM: number;
  /** Sum of window areas (m²). */
  windowAreaM2: number;
  baseboardLengthM: number;
  wasteFactor: number;
};

function wallLengthM(wall: Wall): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) / PIXELS_PER_METER;
}

function openingAreaOnWall(wall: Wall, openings: Opening[]): number {
  return openings
    .filter((o) => o.wallId === wall.id && (o.type === 'door' || o.type === 'window'))
    .reduce((sum, o) => sum + o.width * o.height, 0);
}

function studsForLength(lengthM: number, spacingM: number): number {
  if (lengthM < 0.05) return 0;
  return Math.max(2, Math.floor(lengthM / spacingM) + 1);
}

function studSpacingForWall(wall: Wall, fallback: number): number {
  const role = wall.assembly ?? 'interior';
  const preset = WALL_ASSEMBLY_PRESETS[role];
  return preset?.studSpacingM ?? fallback;
}

/** Builder-facing quantities from floor geometry (not furniture $). */
export function computeConstructionTakeoff(input: {
  walls: Wall[];
  openings: Opening[];
  furniture: FurnitureItem[];
  planRooms?: PlanRoomLabel[];
  studSpacingM?: number;
  wasteFactor?: number;
  roofAreaFactor?: number;
  /** When true, include slab/footing/roof (ground / whole-house envelope). */
  includeEnvelope?: boolean;
}): ConstructionTakeoff {
  const studSpacingM = input.studSpacingM ?? DEFAULT_STUD_SPACING_M;
  const wasteFactor = input.wasteFactor ?? DEFAULT_WASTE_FACTOR;
  const roofFactor = input.roofAreaFactor ?? DEFAULT_ROOF_AREA_FACTOR;
  const includeEnvelope = input.includeEnvelope ?? true;
  const validation = validatePlan(input.walls);
  const floorAreaM2 =
    input.planRooms && input.planRooms.length
      ? input.planRooms.reduce((sum, r) => sum + roomArea(r.points), 0)
      : validation.rooms.reduce((sum, r) => sum + roomArea(r), 0);

  let wallLengthMTotal = 0;
  let exteriorWallLengthM = 0;
  let interiorWallLengthM = 0;
  let partyWallLengthM = 0;
  let heightSum = 0;
  let drywallGross = 0;
  let paintGross = 0;
  let exteriorSheathing = 0;
  let insulationAreaM2 = 0;
  let openingAreaM2 = 0;
  let studCount = 0;

  for (const wall of input.walls) {
    const len = wallLengthM(wall);
    const h = wall.height > 0.5 ? wall.height : 2.7;
    const openA = openingAreaOnWall(wall, input.openings);
    const spacing = studSpacingForWall(wall, studSpacingM);
    wallLengthMTotal += len;
    heightSum += h;
    openingAreaM2 += openA;
    studCount += studsForLength(len, spacing);
    const face = Math.max(0, len * h - openA);
    drywallGross += face * 2;
    const role = wall.assembly ?? 'interior';
    if (role === 'exterior') {
      exteriorWallLengthM += len;
      exteriorSheathing += face;
      insulationAreaM2 += face;
      paintGross += face;
    } else if (role === 'party') {
      partyWallLengthM += len;
      paintGross += face * 2;
      insulationAreaM2 += face; // fire/party often insulated
    } else {
      interiorWallLengthM += len;
      paintGross += face * 2;
    }
  }

  const doors = input.openings.filter((o) => o.type === 'door');
  const windows = input.openings.filter((o) => o.type === 'window');
  const doorCount = doors.length;
  const windowCount = windows.length;
  const passageCount = input.openings.filter((o) => o.type === 'passage').length;
  const stairCount = input.furniture.filter((f) => f.placementKind === 'stair').length;
  const avgWallHeightM = input.walls.length ? heightSum / input.walls.length : 2.7;
  const doorWidthSumM = doors.reduce((s, d) => s + d.width, 0);
  const windowAreaM2 = windows.reduce((s, w) => s + w.width * w.height, 0);

  return {
    floorAreaM2,
    wallLengthM: wallLengthMTotal,
    exteriorWallLengthM,
    interiorWallLengthM,
    partyWallLengthM,
    doorCount,
    windowCount,
    passageCount,
    stairCount,
    avgWallHeightM,
    openingAreaM2,
    drywallAreaM2: drywallGross,
    paintAreaM2: paintGross,
    exteriorSheathingAreaM2: exteriorSheathing,
    studCount,
    plateLengthM: wallLengthMTotal * 2,
    headerCount: doorCount + windowCount,
    insulationAreaM2,
    flooringAreaM2: floorAreaM2,
    slabAreaM2: includeEnvelope ? floorAreaM2 : 0,
    footingLengthM: includeEnvelope ? exteriorWallLengthM : 0,
    roofAreaM2: includeEnvelope ? floorAreaM2 * roofFactor : 0,
    doorWidthSumM,
    windowAreaM2,
    baseboardLengthM: interiorWallLengthM + partyWallLengthM,
    wasteFactor,
  };
}

function withWaste(value: number, waste: number): number {
  return value * (1 + waste);
}

export function constructionTakeoffCsv(
  takeoff: ConstructionTakeoff,
  opts?: { name?: string; unitSystem?: UnitSystem; floorName?: string; disclaimer?: string },
): string {
  const imperial = (opts?.unitSystem ?? 'imperial') === 'imperial';
  const area = (m2: number) => (imperial ? m2 / 0.09290304 : m2);
  const len = (m: number) => (imperial ? m / 0.3048 : m);
  const areaUnit = imperial ? 'sf' : 'm2';
  const lenUnit = imperial ? 'ft' : 'm';
  const w = takeoff.wasteFactor;
  const rows: string[][] = [
    ['Project', opts?.name ?? 'Design'],
    ['Floor', opts?.floorName ?? 'Active'],
    ['Disclaimer', opts?.disclaimer ?? 'Internal estimate quantities — not a contract bid'],
    ['Floor area', area(takeoff.floorAreaM2).toFixed(1), areaUnit],
    ['Flooring SF', area(takeoff.flooringAreaM2).toFixed(1), areaUnit],
    ['Slab SF', area(takeoff.slabAreaM2).toFixed(1), areaUnit],
    ['Roof SF (proxy)', area(takeoff.roofAreaM2).toFixed(1), areaUnit],
    ['Footing LF', len(takeoff.footingLengthM).toFixed(2), lenUnit],
    ['Wall length (all)', len(takeoff.wallLengthM).toFixed(2), lenUnit],
    ['Exterior wall', len(takeoff.exteriorWallLengthM).toFixed(2), lenUnit],
    ['Interior wall', len(takeoff.interiorWallLengthM).toFixed(2), lenUnit],
    ['Party wall', len(takeoff.partyWallLengthM).toFixed(2), lenUnit],
    ['Avg wall height', len(takeoff.avgWallHeightM).toFixed(2), lenUnit],
    ['Opening cutouts', area(takeoff.openingAreaM2).toFixed(1), areaUnit],
    ['Drywall (both faces, net)', area(takeoff.drywallAreaM2).toFixed(1), areaUnit],
    ['Drywall + waste', area(withWaste(takeoff.drywallAreaM2, w)).toFixed(1), areaUnit],
    ['Paint (interior faces, net)', area(takeoff.paintAreaM2).toFixed(1), areaUnit],
    ['Paint + waste', area(withWaste(takeoff.paintAreaM2, w)).toFixed(1), areaUnit],
    ['Exterior sheathing (net)', area(takeoff.exteriorSheathingAreaM2).toFixed(1), areaUnit],
    ['Exterior sheathing + waste', area(withWaste(takeoff.exteriorSheathingAreaM2, w)).toFixed(1), areaUnit],
    ['Insulation (cavity)', area(takeoff.insulationAreaM2).toFixed(1), areaUnit],
    ['Studs (ea)', String(takeoff.studCount), 'ea'],
    ['Plates LF', len(takeoff.plateLengthM).toFixed(2), lenUnit],
    ['Headers (ea)', String(takeoff.headerCount), 'ea'],
    ['Baseboard (approx)', len(takeoff.baseboardLengthM).toFixed(2), lenUnit],
    ['Doors', String(takeoff.doorCount), 'ea'],
    ['Windows', String(takeoff.windowCount), 'ea'],
    ['Window area', area(takeoff.windowAreaM2).toFixed(1), areaUnit],
    ['Passages', String(takeoff.passageCount), 'ea'],
    ['Stairs', String(takeoff.stairCount), 'ea'],
    ['Waste factor', `${(w * 100).toFixed(0)}%`, ''],
  ];
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';
}

/** Roll up takeoffs from multiple floors (sums quantities). Envelope on first part only if callers set includeEnvelope. */
export function mergeConstructionTakeoffs(parts: ConstructionTakeoff[]): ConstructionTakeoff {
  if (!parts.length) {
    return computeConstructionTakeoff({ walls: [], openings: [], furniture: [] });
  }
  const sum = parts.reduce(
    (a, t) => ({
      floorAreaM2: a.floorAreaM2 + t.floorAreaM2,
      wallLengthM: a.wallLengthM + t.wallLengthM,
      exteriorWallLengthM: a.exteriorWallLengthM + t.exteriorWallLengthM,
      interiorWallLengthM: a.interiorWallLengthM + t.interiorWallLengthM,
      partyWallLengthM: a.partyWallLengthM + t.partyWallLengthM,
      doorCount: a.doorCount + t.doorCount,
      windowCount: a.windowCount + t.windowCount,
      passageCount: a.passageCount + t.passageCount,
      stairCount: a.stairCount + t.stairCount,
      avgWallHeightM: a.avgWallHeightM + t.avgWallHeightM,
      openingAreaM2: a.openingAreaM2 + t.openingAreaM2,
      drywallAreaM2: a.drywallAreaM2 + t.drywallAreaM2,
      paintAreaM2: a.paintAreaM2 + t.paintAreaM2,
      exteriorSheathingAreaM2: a.exteriorSheathingAreaM2 + t.exteriorSheathingAreaM2,
      studCount: a.studCount + t.studCount,
      plateLengthM: a.plateLengthM + t.plateLengthM,
      headerCount: a.headerCount + t.headerCount,
      insulationAreaM2: a.insulationAreaM2 + t.insulationAreaM2,
      flooringAreaM2: a.flooringAreaM2 + t.flooringAreaM2,
      slabAreaM2: a.slabAreaM2 + t.slabAreaM2,
      footingLengthM: a.footingLengthM + t.footingLengthM,
      roofAreaM2: a.roofAreaM2 + t.roofAreaM2,
      doorWidthSumM: a.doorWidthSumM + t.doorWidthSumM,
      windowAreaM2: a.windowAreaM2 + t.windowAreaM2,
      baseboardLengthM: a.baseboardLengthM + t.baseboardLengthM,
      wasteFactor: t.wasteFactor,
    }),
    {
      floorAreaM2: 0,
      wallLengthM: 0,
      exteriorWallLengthM: 0,
      interiorWallLengthM: 0,
      partyWallLengthM: 0,
      doorCount: 0,
      windowCount: 0,
      passageCount: 0,
      stairCount: 0,
      avgWallHeightM: 0,
      openingAreaM2: 0,
      drywallAreaM2: 0,
      paintAreaM2: 0,
      exteriorSheathingAreaM2: 0,
      studCount: 0,
      plateLengthM: 0,
      headerCount: 0,
      insulationAreaM2: 0,
      flooringAreaM2: 0,
      slabAreaM2: 0,
      footingLengthM: 0,
      roofAreaM2: 0,
      doorWidthSumM: 0,
      windowAreaM2: 0,
      baseboardLengthM: 0,
      wasteFactor: DEFAULT_WASTE_FACTOR,
    },
  );
  return {
    ...sum,
    avgWallHeightM: sum.avgWallHeightM / parts.length,
  };
}
