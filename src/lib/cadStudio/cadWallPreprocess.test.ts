import { describe, expect, it } from 'vitest';
import {
  joinOrthogonalWallCenterlines,
  prepareCadWallCenterlines,
  wallEndpointJoinStats,
} from '../housePlans/dxfRooms';

describe('prepareCadWallCenterlines', () => {
  it('joins corners on a double-line box without spillover endpoints', () => {
    const thick = 0.5;
    const raw = [
      { x1: 0, y1: 0, x2: 30, y2: 0, layer: 'WALLS EXT' },
      { x1: 0, y1: thick, x2: 30, y2: thick, layer: 'WALLS EXT' },
      { x1: 0, y1: 20, x2: 30, y2: 20, layer: 'WALLS EXT' },
      { x1: 0, y1: 20 - thick, x2: 30, y2: 20 - thick, layer: 'WALLS EXT' },
      { x1: 0, y1: 0, x2: 0, y2: 20, layer: 'WALLS EXT' },
      { x1: thick, y1: 0, x2: thick, y2: 20, layer: 'WALLS EXT' },
      { x1: 30, y1: 0, x2: 30, y2: 20, layer: 'WALLS EXT' },
      { x1: 30 - thick, y1: 0, x2: 30 - thick, y2: 20, layer: 'WALLS EXT' },
    ];
    const centers = prepareCadWallCenterlines(raw);
    const stats = wallEndpointJoinStats(centers, 0.35);
    expect(centers.length).toBeGreaterThanOrEqual(4);
    expect(stats.joined / stats.total).toBeGreaterThan(0.75);
  });

  it('joinOrthogonalWallCenterlines snaps T junction endpoints', () => {
    const segs = [
      { x1: 0, y1: 10, x2: 20.5, y2: 10 },
      { x1: 10, y1: 0, x2: 10, y2: 9.7 },
    ];
    const joined = joinOrthogonalWallCenterlines(segs, 1.0);
    const vert = joined.find((s) => Math.abs(s.x1 - s.x2) < 0.01)!;
    expect(vert.y2).toBeCloseTo(10, 0);
  });
});
