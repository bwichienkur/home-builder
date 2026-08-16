import { describe, expect, it } from 'vitest';
import { remapOpeningsAfterPlanRebuild } from './planOpeningRemap';
import type { Opening, Wall } from '../../types';
import { WORLD_ORIGIN } from './placement';
import { PIXELS_PER_METER } from './snapping';

describe('remapOpeningsAfterPlanRebuild', () => {
  it('keeps a door on the nearest rebuilt wall', () => {
    const prevWalls: Wall[] = [
      {
        id: 'old',
        start: { x: WORLD_ORIGIN.x, y: WORLD_ORIGIN.y },
        end: { x: WORLD_ORIGIN.x + 4 * PIXELS_PER_METER, y: WORLD_ORIGIN.y },
        thickness: 0.15,
        height: 2.7,
      },
    ];
    const nextWalls: Wall[] = [
      {
        id: 'new',
        start: { x: WORLD_ORIGIN.x, y: WORLD_ORIGIN.y },
        end: { x: WORLD_ORIGIN.x + 4.2 * PIXELS_PER_METER, y: WORLD_ORIGIN.y },
        thickness: 0.15,
        height: 2.7,
      },
    ];
    const prevOpenings: Opening[] = [
      { id: 'd1', wallId: 'old', type: 'door', offset: 0.4, width: 0.9, height: 2.1, sill: 0 },
    ];
    const remapped = remapOpeningsAfterPlanRebuild(prevWalls, nextWalls, prevOpenings, []);
    expect(remapped).toHaveLength(1);
    expect(remapped[0]?.wallId).toBe('new');
    expect(remapped[0]?.offset).toBeGreaterThan(0.2);
  });
});
