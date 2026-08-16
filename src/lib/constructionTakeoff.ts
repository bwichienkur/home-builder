import type { FurnitureItem, Opening, Wall } from '../types';
import { roomArea, validatePlan } from './geometry/rooms';
import { PIXELS_PER_METER } from './geometry/snapping';

export type ConstructionTakeoff = {
  floorAreaM2: number;
  wallLengthM: number;
  exteriorWallLengthM: number;
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
  for (const wall of input.walls) {
    const len =
      Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) / PIXELS_PER_METER;
    wallLengthM += len;
    if ((wall.assembly ?? 'interior') === 'exterior') exteriorWallLengthM += len;
  }
  const doorCount = input.openings.filter((o) => o.type === 'door').length;
  const windowCount = input.openings.filter((o) => o.type === 'window').length;
  const passageCount = input.openings.filter((o) => o.type === 'passage').length;
  const stairCount = input.furniture.filter((f) => f.placementKind === 'stair').length;
  return {
    floorAreaM2,
    wallLengthM,
    exteriorWallLengthM,
    doorCount,
    windowCount,
    passageCount,
    stairCount,
  };
}
