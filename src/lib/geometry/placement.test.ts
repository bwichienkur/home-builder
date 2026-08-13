import { describe, expect, it } from 'vitest';
import type { Opening, Wall } from '../../types';
import { alignmentGuides, openingConflicts, planToWorld, snapToWallSurface, worldToPlan } from './placement';

const rect: Wall[] = [
  { id: 'w1', start: { x: 180, y: 150 }, end: { x: 660, y: 150 }, thickness: 0.15, height: 2.7 },
  { id: 'w2', start: { x: 660, y: 150 }, end: { x: 660, y: 510 }, thickness: 0.15, height: 2.7 },
  { id: 'w3', start: { x: 660, y: 510 }, end: { x: 180, y: 510 }, thickness: 0.15, height: 2.7 },
  { id: 'w4', start: { x: 180, y: 510 }, end: { x: 180, y: 150 }, thickness: 0.15, height: 2.7 },
];

describe('placement helpers', () => {
  it('round-trips plan and world coordinates', () => {
    const world = planToWorld({ x: 420, y: 330 });
    expect(world.x).toBeCloseTo(0);
    expect(world.z).toBeCloseTo(0);
    const back = worldToPlan(world.x, world.z);
    expect(back.x).toBeCloseTo(420);
    expect(back.y).toBeCloseTo(330);
  });

  it('snaps wall-mounted products onto the nearest wall face', () => {
    const nearTop = planToWorld({ x: 420, y: 170 });
    const snapped = snapToWallSurface(nearTop.x, nearTop.z, rect, 0.1, 'wall');
    expect(snapped.wallId).toBe('w1');
    expect(snapped.wallOffset).not.toBeNull();
    expect(Math.abs(snapped.z - planToWorld({ x: 420, y: 150 }).z)).toBeGreaterThan(0.05);
  });

  it('detects overlapping openings on the same wall', () => {
    const openings: Opening[] = [
      { id: 'o1', wallId: 'w1', type: 'door', offset: 0.4, width: 0.9, height: 2.1, sill: 0 },
      { id: 'o2', wallId: 'w1', type: 'window', offset: 0.45, width: 1.2, height: 1.1, sill: 0.9 },
    ];
    expect(openingConflicts(openings[1], openings, rect)).toHaveLength(1);
  });

  it('produces alignment guides when furniture centers line up', () => {
    const selected = { id: 'a', catalogId: 'a', name: 'A', category: 'Seating', x: 0, y: 0, z: 0, rotation: 0, color: '#000', width: 1, depth: 1, height: 1 };
    const other = { ...selected, id: 'b', x: 0, z: 2 };
    const guides = alignmentGuides(selected, [other]);
    expect(guides.some((g) => g.kind === 'align-x')).toBe(true);
  });
});
