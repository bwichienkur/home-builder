import { describe, expect, it } from 'vitest';
import type { Wall } from '../../types';
import { planToWorld, roomFloorCenter } from './placement';
import { CUTAWAY_MIN_OPACITY, wallCutawayOpacity } from './wallCutaway';

const rect: Wall[] = [
  { id: 'w1', start: { x: 180, y: 150 }, end: { x: 660, y: 150 }, thickness: 0.15, height: 2.7 },
  { id: 'w2', start: { x: 660, y: 150 }, end: { x: 660, y: 510 }, thickness: 0.15, height: 2.7 },
  { id: 'w3', start: { x: 660, y: 510 }, end: { x: 180, y: 510 }, thickness: 0.15, height: 2.7 },
  { id: 'w4', start: { x: 180, y: 510 }, end: { x: 180, y: 150 }, thickness: 0.15, height: 2.7 },
];

describe('wall cutaway', () => {
  it('opens camera-facing walls so the interior is visible', () => {
    const center = roomFloorCenter(rect);
    // Camera south-east of the room (positive X / positive Z in world).
    const cam = { x: center.x + 6, z: center.z + 7 };
    const east = wallCutawayOpacity(rect[1], cam.x, cam.z, center, true);
    const south = wallCutawayOpacity(rect[2], cam.x, cam.z, center, true);
    const north = wallCutawayOpacity(rect[0], cam.x, cam.z, center, true);
    const west = wallCutawayOpacity(rect[3], cam.x, cam.z, center, true);
    expect(east).toBeLessThan(0.08);
    expect(south).toBeLessThan(0.08);
    expect(east).toBeGreaterThanOrEqual(CUTAWAY_MIN_OPACITY - 0.001);
    expect(south).toBeGreaterThanOrEqual(CUTAWAY_MIN_OPACITY - 0.001);
    expect(north).toBeGreaterThan(0.85);
    expect(west).toBeGreaterThan(0.85);
  });

  it('ramps opacity smoothly between edge-on and face-on', () => {
    const center = roomFloorCenter(rect);
    const south = rect[2];
    // Sweep camera from west (edge-on to south wall) toward south (face-on).
    const samples = [0, 0.35, 0.7, 1].map((t) => {
      const ang = Math.PI / 2 + t * (Math.PI / 2); // west → south
      return wallCutawayOpacity(south, center.x + Math.cos(ang) * 8, center.z + Math.sin(ang) * 8, center, true);
    });
    expect(samples[0]).toBeGreaterThan(0.9);
    expect(samples[1]).toBeGreaterThan(samples[2]);
    expect(samples[2]).toBeGreaterThan(samples[3]);
    expect(samples[3]).toBeLessThan(0.08);
  });

  it('keeps all walls when cutaway is disabled or camera is overhead', () => {
    const center = roomFloorCenter(rect);
    const mid = planToWorld({ x: 420, y: 330 });
    for (const wall of rect) {
      expect(wallCutawayOpacity(wall, mid.x, mid.z, center, true)).toBe(1);
      expect(wallCutawayOpacity(wall, center.x + 6, center.z + 7, center, false)).toBe(1);
    }
  });
});
