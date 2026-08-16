import { describe, expect, it } from 'vitest';
import { computeConstructionTakeoff } from './constructionTakeoff';
import type { Wall } from '../types';

describe('computeConstructionTakeoff', () => {
  it('sums wall length and floor area for a rectangle', () => {
    const walls: Wall[] = [
      { id: 'a', start: { x: 0, y: 0 }, end: { x: 800, y: 0 }, thickness: 0.15, height: 2.7, assembly: 'exterior' },
      { id: 'b', start: { x: 800, y: 0 }, end: { x: 800, y: 600 }, thickness: 0.15, height: 2.7, assembly: 'exterior' },
      { id: 'c', start: { x: 800, y: 600 }, end: { x: 0, y: 600 }, thickness: 0.15, height: 2.7, assembly: 'exterior' },
      { id: 'd', start: { x: 0, y: 600 }, end: { x: 0, y: 0 }, thickness: 0.15, height: 2.7, assembly: 'exterior' },
    ];
    const takeoff = computeConstructionTakeoff({
      walls,
      openings: [
        { id: 'd1', wallId: 'a', type: 'door', offset: 0.4, width: 0.9, height: 2.1, sill: 0 },
        { id: 'w1', wallId: 'b', type: 'window', offset: 0.5, width: 1.2, height: 1.2, sill: 0.9 },
      ],
      furniture: [],
    });
    expect(takeoff.wallLengthM).toBeCloseTo(35, 0); // 10+7.5+10+7.5
    expect(takeoff.exteriorWallLengthM).toBeCloseTo(35, 0);
    expect(takeoff.floorAreaM2).toBeCloseTo(75, 0); // 10×7.5
    expect(takeoff.doorCount).toBe(1);
    expect(takeoff.windowCount).toBe(1);
  });
});
