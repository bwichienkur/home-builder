import { describe, expect, it } from 'vitest';
import { nearestElevationFace, nextElevationFace, pickFacingWall, elevationFaceBasis, elevationOrthoZoom, elevationDimAnchors } from './elevationFace';
import { WORLD_ORIGIN } from './placement';
import { PIXELS_PER_METER } from './snapping';
import type { PlanRoomLabel, Wall } from '../../types';

describe('elevation face', () => {
  it('maps cardinal azimuths to faces', () => {
    expect(nearestElevationFace(0)).toBe('back');
    expect(nearestElevationFace(Math.PI)).toBe('front');
    expect(nearestElevationFace(Math.PI / 2)).toBe('left');
    expect(nearestElevationFace(-Math.PI / 2)).toBe('right');
  });

  it('snaps in-between angles to the nearest wall', () => {
    expect(nearestElevationFace(0.2)).toBe('back');
    expect(nearestElevationFace(Math.PI - 0.2)).toBe('front');
  });

  it('cycles faces around the house', () => {
    expect(nextElevationFace('front', 1)).toBe('right');
    expect(nextElevationFace('right', 1)).toBe('back');
    expect(nextElevationFace('back', 1)).toBe('left');
    expect(nextElevationFace('left', 1)).toBe('front');
    expect(nextElevationFace('front', -1)).toBe('left');
  });

  it('picks the south wall for the front camera', () => {
    const px = (x: number, y: number) => ({
      x: WORLD_ORIGIN.x + x * PIXELS_PER_METER,
      y: WORLD_ORIGIN.y + y * PIXELS_PER_METER,
    });
    const walls: Wall[] = [
      { id: 'n', start: px(-3, -2), end: px(3, -2), thickness: 0.15, height: 2.7 },
      { id: 's', start: px(3, 2), end: px(-3, 2), thickness: 0.15, height: 2.7 },
      { id: 'e', start: px(3, -2), end: px(3, 2), thickness: 0.15, height: 2.7 },
      { id: 'w', start: px(-3, 2), end: px(-3, -2), thickness: 0.15, height: 2.7 },
    ];
    const room: PlanRoomLabel = {
      id: 'r',
      name: 'Room',
      roomType: 'Living room',
      points: [px(-3, -2), px(3, -2), px(3, 2), px(-3, 2)],
    };
    expect(pickFacingWall(walls, room, 'front')?.id).toBe('n');
    expect(pickFacingWall(walls, room, 'back')?.id).toBe('s');
    expect(elevationFaceBasis('front').camZ).toBe(-1);
  });

  it('parks Front-view dims outside the wall body', () => {
    const wall: Wall = {
      id: 's',
      start: { x: WORLD_ORIGIN.x, y: WORLD_ORIGIN.y },
      end: { x: WORLD_ORIGIN.x + 6 * PIXELS_PER_METER, y: WORLD_ORIGIN.y },
      thickness: 0.15,
      height: 2.7,
    };
    const a = elevationDimAnchors(wall, 'front');
    const midX = 3;
    expect(a.width.y).toBeLessThanOrEqual(0);
    expect(a.height.x).toBeLessThan(0);
    expect(a.height.x).toBeLessThan(midX - 3);
    expect(a.height.y).toBeCloseTo(1.35, 5);
  });

  it('zooms Front view out when the rail pad scale grows', () => {
    const tight = elevationOrthoZoom({ canvasW: 1280, canvasH: 800, wallLen: 6, wallH: 2.7, padScale: 1 });
    const rail = elevationOrthoZoom({ canvasW: 1280, canvasH: 800, wallLen: 6, wallH: 2.7, padScale: 1.45 });
    expect(rail).toBeLessThan(tight);
    const visW = 1280 / rail;
    expect(visW).toBeGreaterThan(1.45 * 6);
    expect(visW).toBeLessThan(1.45 * (6 + 1.2));
  });
});
