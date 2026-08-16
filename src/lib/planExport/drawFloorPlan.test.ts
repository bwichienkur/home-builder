import { describe, expect, it } from 'vitest';
import { openingMetersFromOffset, openingOffsetFromMeters, wallLengthM } from './drawFloorPlan';
import type { Wall } from '../../types';
import { WORLD_ORIGIN } from '../geometry/placement';
import { PIXELS_PER_METER } from '../geometry/snapping';

const wall: Wall = {
  id: 'w1',
  start: { x: WORLD_ORIGIN.x, y: WORLD_ORIGIN.y },
  end: { x: WORLD_ORIGIN.x + 4 * PIXELS_PER_METER, y: WORLD_ORIGIN.y },
  thickness: 0.15,
  height: 2.7,
};

describe('opening offset helpers', () => {
  it('reports wall length in meters', () => {
    expect(wallLengthM(wall)).toBeCloseTo(4, 5);
  });

  it('converts meters to normalized offset along the wall', () => {
    expect(openingOffsetFromMeters(2, wall)).toBeCloseTo(0.5, 5);
    expect(openingOffsetFromMeters(0, wall)).toBeGreaterThanOrEqual(0.03);
    expect(openingOffsetFromMeters(40, wall)).toBeLessThanOrEqual(0.97);
  });

  it('converts offset back to meters', () => {
    expect(openingMetersFromOffset(0.25, wall)).toBeCloseTo(1, 5);
  });
});
