import { describe, expect, it } from 'vitest';
import type { Wall } from '../../types';
import { planToWorld, roomFloorCenter } from './placement';
import { CUTAWAY_FADE_END, CUTAWAY_FADE_START, CUTAWAY_MIN_OPACITY, cutawayEase, wallCutawayOpacity } from './wallCutaway';

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
    expect(east).toBeLessThan(0.02);
    expect(south).toBeLessThan(0.02);
    expect(north).toBeGreaterThan(0.85);
    expect(west).toBeGreaterThan(0.85);
  });

  it('ramps opacity smoothly across the facing band', () => {
    const center = roomFloorCenter(rect);
    const south = rect[2];
    // Dense sweep so the ease is visible (not only endpoints).
    const samples = Array.from({ length: 33 }, (_, i) => {
      const t = i / 32;
      const ang = Math.PI - t * (Math.PI / 2); // west → south
      return wallCutawayOpacity(south, center.x + Math.cos(ang) * 8, center.z + Math.sin(ang) * 8, center, true);
    });
    expect(samples[0]).toBeGreaterThan(0.9);
    expect(samples[32]).toBe(CUTAWAY_MIN_OPACITY);
    // Monotonic non-increasing dissolve.
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1] + 1e-9);
    }
    // At least one mid sample sits in the partial-fade range (not a binary pop).
    expect(samples.some((v) => v > 0.08 && v < 0.92)).toBe(true);
  });

  it('uses a soft ease curve and a meaningful fade window', () => {
    expect(CUTAWAY_FADE_END - CUTAWAY_FADE_START).toBeGreaterThan(0.35);
    expect(cutawayEase(0)).toBe(0);
    expect(cutawayEase(1)).toBe(1);
    expect(cutawayEase(0.5)).toBeCloseTo(0.5, 5);
    // Flatter near the ends than linear.
    expect(cutawayEase(0.1)).toBeLessThan(0.1);
    expect(cutawayEase(0.9)).toBeGreaterThan(0.9);
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
