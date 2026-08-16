import { describe, expect, it } from 'vitest';
import {
  computeConstructionTakeoff,
  constructionTakeoffCsv,
  mergeConstructionTakeoffs,
} from './constructionTakeoff';
import type { Wall } from '../types';

describe('computeConstructionTakeoff', () => {
  it('sums wall length, floor area, studs, and drywall for a rectangle', () => {
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
    expect(takeoff.wallLengthM).toBeCloseTo(35, 0);
    expect(takeoff.exteriorWallLengthM).toBeCloseTo(35, 0);
    expect(takeoff.floorAreaM2).toBeCloseTo(75, 0);
    expect(takeoff.doorCount).toBe(1);
    expect(takeoff.windowCount).toBe(1);
    expect(takeoff.studCount).toBeGreaterThan(20);
    expect(takeoff.drywallAreaM2).toBeGreaterThan(100);
    expect(takeoff.paintAreaM2).toBeGreaterThan(40);
    expect(takeoff.exteriorSheathingAreaM2).toBeGreaterThan(40);
    expect(constructionTakeoffCsv(takeoff, { name: 'Test', unitSystem: 'metric' })).toContain('Drywall');
  });

  it('merges multi-floor takeoffs', () => {
    const walls: Wall[] = [
      { id: 'a', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 0.15, height: 2.7, assembly: 'interior' },
    ];
    const a = computeConstructionTakeoff({ walls, openings: [], furniture: [] });
    const merged = mergeConstructionTakeoffs([a, a]);
    expect(merged.wallLengthM).toBeCloseTo(a.wallLengthM * 2, 5);
    expect(merged.studCount).toBe(a.studCount * 2);
  });
});
