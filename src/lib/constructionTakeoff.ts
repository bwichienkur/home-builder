import type { FurnitureItem, Opening, UnitSystem, Wall } from '../types';
import { roomArea, validatePlan } from './geometry/rooms';
import { PIXELS_PER_METER } from './geometry/snapping';

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
};

/** Builder-facing quantities from the active floor geometry (not furniture $). */
export function computeConstructionTakeoff(input: {
  walls: Wall[];
  openings: Opening[];
  furniture: FurnitureItem[];
}): ConstructionTakeoff {
  const validation = validatePlan(input.walls);
  const floorAreaM2 = validation.rooms.reduce((sum, r) => sum + roomArea(r), 0);
  let wallLengthM = 0;
  let exteriorWallLengthM = 0;
  let interiorWallLengthM = 0;
  let partyWallLengthM = 0;
  for (const wall of input.walls) {
    const len =
      Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) / PIXELS_PER_METER;
    wallLengthM += len;
    const role = wall.assembly ?? 'interior';
    if (role === 'exterior') exteriorWallLengthM += len;
    else if (role === 'party') partyWallLengthM += len;
    else interiorWallLengthM += len;
  }
  const doorCount = input.openings.filter((o) => o.type === 'door').length;
  const windowCount = input.openings.filter((o) => o.type === 'window').length;
  const passageCount = input.openings.filter((o) => o.type === 'passage').length;
  const stairCount = input.furniture.filter((f) => f.placementKind === 'stair').length;
  return {
    floorAreaM2,
    wallLengthM,
    exteriorWallLengthM,
    interiorWallLengthM,
    partyWallLengthM,
    doorCount,
    windowCount,
    passageCount,
    stairCount,
  };
}

export function constructionTakeoffCsv(
  takeoff: ConstructionTakeoff,
  opts?: { name?: string; unitSystem?: UnitSystem },
): string {
  const imperial = (opts?.unitSystem ?? 'imperial') === 'imperial';
  const area = imperial ? takeoff.floorAreaM2 / 0.09290304 : takeoff.floorAreaM2;
  const len = (m: number) => (imperial ? m / 0.3048 : m);
  const areaUnit = imperial ? 'sf' : 'm2';
  const lenUnit = imperial ? 'ft' : 'm';
  const rows = [
    ['Project', opts?.name ?? 'Design'],
    ['Floor area', area.toFixed(1), areaUnit],
    ['Wall length (all)', len(takeoff.wallLengthM).toFixed(2), lenUnit],
    ['Exterior wall', len(takeoff.exteriorWallLengthM).toFixed(2), lenUnit],
    ['Interior wall', len(takeoff.interiorWallLengthM).toFixed(2), lenUnit],
    ['Party wall', len(takeoff.partyWallLengthM).toFixed(2), lenUnit],
    ['Doors', String(takeoff.doorCount), 'ea'],
    ['Windows', String(takeoff.windowCount), 'ea'],
    ['Passages', String(takeoff.passageCount), 'ea'],
    ['Stairs', String(takeoff.stairCount), 'ea'],
  ];
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';
}
