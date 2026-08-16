import type { FurnitureItem, Opening, UnitSystem, Wall } from '../types';
import { roomArea, validatePlan } from './geometry/rooms';
import { PIXELS_PER_METER } from './geometry/snapping';

/** Default stud spacing for framing takeoff (16 in OC). */
export const DEFAULT_STUD_SPACING_M = 0.4064;
/** Default waste factor applied to finish SF lines. */
export const DEFAULT_WASTE_FACTOR = 0.1;

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
  /** Average wall height used for SF calcs (m). */
  avgWallHeightM: number;
  /** Opening cutouts deducted from wall SF (m²). */
  openingAreaM2: number;
  /** Both faces of all walls minus openings (m²). */
  drywallAreaM2: number;
  /** Interior + party faces only, minus openings share (m²). */
  paintAreaM2: number;
  /** Exterior face sheathing / cladding SF (m²). */
  exteriorSheathingAreaM2: number;
  /** Rough stud count at 16" OC (both plates not included). */
  studCount: number;
  /** Baseboard LF ≈ interior wall length (m). */
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
  // End studs + intermediates at spacing.
  return Math.max(2, Math.floor(lengthM / spacingM) + 1);
}

/** Builder-facing quantities from floor geometry (not furniture $). */
export function computeConstructionTakeoff(input: {
  walls: Wall[];
  openings: Opening[];
  furniture: FurnitureItem[];
  studSpacingM?: number;
  wasteFactor?: number;
}): ConstructionTakeoff {
  const studSpacingM = input.studSpacingM ?? DEFAULT_STUD_SPACING_M;
  const wasteFactor = input.wasteFactor ?? DEFAULT_WASTE_FACTOR;
  const validation = validatePlan(input.walls);
  const floorAreaM2 = validation.rooms.reduce((sum, r) => sum + roomArea(r), 0);
  let wallLengthMTotal = 0;
  let exteriorWallLengthM = 0;
  let interiorWallLengthM = 0;
  let partyWallLengthM = 0;
  let heightSum = 0;
  let drywallGross = 0;
  let paintGross = 0;
  let exteriorSheathing = 0;
  let openingAreaM2 = 0;
  let studCount = 0;

  for (const wall of input.walls) {
    const len = wallLengthM(wall);
    const h = wall.height > 0.5 ? wall.height : 2.7;
    const openA = openingAreaOnWall(wall, input.openings);
    wallLengthMTotal += len;
    heightSum += h;
    openingAreaM2 += openA;
    studCount += studsForLength(len, studSpacingM);
    const face = Math.max(0, len * h - openA);
    // Two faces for drywall on most partitions; exterior still gets interior face.
    drywallGross += face * 2;
    const role = wall.assembly ?? 'interior';
    if (role === 'exterior') {
      exteriorWallLengthM += len;
      exteriorSheathing += face;
      paintGross += face; // interior face of exterior wall
    } else if (role === 'party') {
      partyWallLengthM += len;
      paintGross += face * 2;
    } else {
      interiorWallLengthM += len;
      paintGross += face * 2;
    }
  }

  const doorCount = input.openings.filter((o) => o.type === 'door').length;
  const windowCount = input.openings.filter((o) => o.type === 'window').length;
  const passageCount = input.openings.filter((o) => o.type === 'passage').length;
  const stairCount = input.furniture.filter((f) => f.placementKind === 'stair').length;
  const avgWallHeightM = input.walls.length ? heightSum / input.walls.length : 2.7;

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
    baseboardLengthM: interiorWallLengthM + partyWallLengthM,
    wasteFactor,
  };
}

function withWaste(value: number, waste: number): number {
  return value * (1 + waste);
}

export function constructionTakeoffCsv(
  takeoff: ConstructionTakeoff,
  opts?: { name?: string; unitSystem?: UnitSystem; floorName?: string },
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
    ['Floor area', area(takeoff.floorAreaM2).toFixed(1), areaUnit],
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
    ['Studs @ 16 in OC (ea)', String(takeoff.studCount), 'ea'],
    ['Baseboard (approx)', len(takeoff.baseboardLengthM).toFixed(2), lenUnit],
    ['Doors', String(takeoff.doorCount), 'ea'],
    ['Windows', String(takeoff.windowCount), 'ea'],
    ['Passages', String(takeoff.passageCount), 'ea'],
    ['Stairs', String(takeoff.stairCount), 'ea'],
    ['Waste factor', `${(w * 100).toFixed(0)}%`, ''],
  ];
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';
}

/** Roll up takeoffs from multiple floors (sums quantities). */
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
      baseboardLengthM: 0,
      wasteFactor: DEFAULT_WASTE_FACTOR,
    },
  );
  return {
    ...sum,
    avgWallHeightM: sum.avgWallHeightM / parts.length,
  };
}
