import { describe, expect, it } from 'vitest';
import { wallCollisionSegs } from './FirstPersonControls';
import type { Opening, Wall } from '../../types';

describe('wallCollisionSegs door portals', () => {
  it('cuts door openings out of wall collision segments', () => {
    const walls: Wall[] = [
      {
        id: 'w1',
        start: { x: 0, y: 0 },
        end: { x: 800, y: 0 },
        thickness: 0.15,
        height: 2.7,
      },
    ];
    const openings: Opening[] = [
      {
        id: 'd1',
        wallId: 'w1',
        type: 'door',
        offset: 0.5,
        width: 0.9,
        height: 2.1,
        sill: 0,
      },
    ];
    const segs = wallCollisionSegs(walls, openings);
    expect(segs.length).toBe(2);
    const totalLen = segs.reduce((s, g) => s + Math.hypot(g.bx - g.ax, g.bz - g.az), 0);
    // Full wall is 10m; door ~0.9m + pad removed → solid stubs shorter than full run.
    expect(totalLen).toBeLessThan(10);
    expect(totalLen).toBeGreaterThan(7);
  });

  it('keeps solid walls without openings as one segment', () => {
    const walls: Wall[] = [
      { id: 'w2', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 0.1, height: 2.7 },
    ];
    const segs = wallCollisionSegs(walls, []);
    expect(segs).toHaveLength(1);
  });
});
