import { describe, expect, it } from 'vitest';
import type { Opening, Wall } from '../../types';
import { pointOnWall, WORLD_ORIGIN } from './placement';
import { clampOpeningOffset, openingCenterOnWall, wallSolidBoxes } from './wallOpenings';
import { PIXELS_PER_METER } from './snapping';

const wall: Wall = {
  id: 'w1',
  start: { x: WORLD_ORIGIN.x, y: WORLD_ORIGIN.y },
  end: { x: WORLD_ORIGIN.x + 5 * PIXELS_PER_METER, y: WORLD_ORIGIN.y },
  thickness: 0.15,
  height: 2.7,
};

const door: Opening = {
  id: 'd1',
  wallId: 'w1',
  type: 'door',
  offset: 0.5,
  width: 1,
  height: 2.1,
  sill: 0,
  swing: 'left',
};

const window: Opening = {
  id: 'w1o',
  wallId: 'w1',
  type: 'window',
  offset: 0.25,
  width: 1.2,
  height: 1.2,
  sill: 0.9,
};

describe('wallSolidBoxes', () => {
  it('keeps a continuous lintel above a door spanning the full wall', () => {
    const boxes = wallSolidBoxes(2.7, 5, 5, 0, [door]);
    const lintels = boxes.filter((b) => b.y0 >= 2.05 && b.y1 <= 2.75);
    expect(lintels).toHaveLength(1);
    expect(lintels[0]!.along0).toBeCloseTo(0, 5);
    expect(lintels[0]!.along1).toBeCloseTo(5, 5);
  });

  it('keeps a continuous sill band under a window', () => {
    const boxes = wallSolidBoxes(2.7, 5, 5, 0, [window]);
    const sills = boxes.filter((b) => b.y0 <= 0.01 && b.y1 >= 0.85 && b.y1 <= 0.95);
    expect(sills.some((b) => b.along0 <= 0.01 && b.along1 >= 4.99)).toBe(true);
  });

  it('leaves a hole only in the opening’s height band', () => {
    const boxes = wallSolidBoxes(2.7, 5, 5, 0, [door]);
    const mid = boxes.filter((b) => b.y0 < 1 && b.y1 > 1);
    // Two side pieces, no solid through the door center at x=2.5
    expect(mid.every((b) => b.along1 <= 2.0 + 0.01 || b.along0 >= 3.0 - 0.01)).toBe(true);
  });

  it('centers the door hole on the same world point as the door leaf', () => {
    const boxes = wallSolidBoxes(2.7, 5, 5, 0, [door]);
    const mid = boxes.filter((b) => b.y0 < 1 && b.y1 > 1);
    const gapLeft = Math.max(...mid.filter((b) => b.along1 <= 2.6).map((b) => b.along1));
    const gapRight = Math.min(...mid.filter((b) => b.along0 >= 2.4).map((b) => b.along0));
    const holeCenter = (gapLeft + gapRight) / 2;
    const placed = pointOnWall(wall, door.offset);
    expect(holeCenter).toBeCloseTo(door.offset * 5, 5);
    expect(placed.x).toBeCloseTo(door.offset * 5, 5);
    // Scene places fixtures with the same along/length ratio as the hole center.
    const t = holeCenter / 5;
    expect(t).toBeCloseTo(door.offset, 5);
  });

  it('cuts a full-height plan gap at the same offset as the door leaf', () => {
    const planDoor = { ...door, sill: 0, height: 2.7 };
    const boxes = wallSolidBoxes(2.7, 5, 5, 0, [planDoor]);
    const mid = boxes.filter((b) => b.y0 < 1.2 && b.y1 > 1.2);
    expect(mid.every((b) => b.along1 <= 2.0 + 0.01 || b.along0 >= 3.0 - 0.01)).toBe(true);
    const top = boxes.filter((b) => b.y0 > 2.0);
    // Full-height cut: no continuous lintel through the door in plan mode.
    expect(top.every((b) => b.along1 <= 2.0 + 0.01 || b.along0 >= 3.0 - 0.01)).toBe(true);
  });
  it('openingCenterOnWall matches wallSolidBoxes hole centers', () => {
    const boxes = wallSolidBoxes(2.7, 5, 5, 0, [door]);
    const mid = boxes.filter((b) => b.y0 < 1 && b.y1 > 1);
    const gapLeft = Math.max(...mid.filter((b) => b.along1 <= 2.6).map((b) => b.along1));
    const gapRight = Math.min(...mid.filter((b) => b.along0 >= 2.4).map((b) => b.along0));
    const holeCenter = (gapLeft + gapRight) / 2;
    const placed = openingCenterOnWall(wall, door.offset, WORLD_ORIGIN, PIXELS_PER_METER);
    expect(placed.x).toBeCloseTo(holeCenter, 5);
    expect(placed.z).toBeCloseTo(0, 5);
  });
});

describe('clampOpeningOffset', () => {
  it('keeps openings from overlapping on the same wall', () => {
    const a = { ...door, id: 'a', offset: 0.4, width: 1 };
    const b = { ...door, id: 'b', offset: 0.45, width: 1 };
    const next = clampOpeningOffset(b, [a, b], 5);
    const a0 = a.offset * 5 - 0.5;
    const a1 = a.offset * 5 + 0.5;
    const b0 = next * 5 - 0.5;
    const b1 = next * 5 + 0.5;
    expect(a0 >= b1 - 0.02 || b0 >= a1 - 0.02).toBe(true);
  });
});
