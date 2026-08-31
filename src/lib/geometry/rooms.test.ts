import { describe, expect, it } from 'vitest';
import type { Wall } from '../../types';
import { planToWorld, WORLD_ORIGIN } from './placement';
import { PIXELS_PER_METER } from './snapping';
import {
  detectRoomPolygons,
  expandRoomPolygon,
  FLOOR_UNDER_WALL_M,
  roomBoundsPolygon,
  roomArea,
  roomPolygonWorld,
  roomShape,
  validatePlan,
} from './rooms';

const walls: Wall[] = [
  ['a', 0, 0, 400, 0],
  ['b', 400, 0, 400, 320],
  ['c', 400, 320, 0, 320],
  ['d', 0, 320, 0, 0],
].map(([id, x1, y1, x2, y2]) => ({
  id: String(id),
  start: { x: +x1, y: +y1 },
  end: { x: +x2, y: +y2 },
  thickness: 0.15,
  height: 2.7,
}));

const rect: Wall[] = [
  { id: 'w1', start: { x: 180, y: 150 }, end: { x: 660, y: 150 }, thickness: 0.15, height: 2.7 },
  { id: 'w2', start: { x: 660, y: 150 }, end: { x: 660, y: 510 }, thickness: 0.15, height: 2.7 },
  { id: 'w3', start: { x: 660, y: 510 }, end: { x: 180, y: 510 }, thickness: 0.15, height: 2.7 },
  { id: 'w4', start: { x: 180, y: 510 }, end: { x: 180, y: 150 }, thickness: 0.15, height: 2.7 },
];

describe('room geometry', () => {
  it('detects a closed room', () => expect(detectRoomPolygons(walls)).toHaveLength(1));
  it('calculates square meters', () => expect(roomArea(detectRoomPolygons(walls)[0])).toBeCloseTo(20));
  it('flags an open plan', () => expect(validatePlan(walls.slice(0, 3)).valid).toBe(false));

  it('maps floor shape vertices to the same world XZ as walls (no Y mirror)', () => {
    const poly = detectRoomPolygons(rect)[0];
    expect(poly.length).toBeGreaterThanOrEqual(3);
    const shape = roomShape(poly);
    const shapePts = shape.getPoints();
    const world = roomPolygonWorld(poly);

    // Shape X/Y become world X/Z after the scene's π/2 X rotation.
    expect(shapePts.length).toBeGreaterThanOrEqual(world.length);
    for (let i = 0; i < world.length; i++) {
      expect(shapePts[i].x).toBeCloseTo(world[i].x, 5);
      expect(shapePts[i].y).toBeCloseTo(world[i].z, 5);
      const fromPlan = planToWorld(poly[i]);
      expect(world[i].x).toBeCloseTo(fromPlan.x, 5);
      expect(world[i].z).toBeCloseTo(fromPlan.z, 5);
    }

    // A south wall point (larger plan y) must land at positive world Z — not mirrored negative.
    const south = planToWorld({ x: 420, y: 510 });
    expect(south.z).toBeGreaterThan(0);
    const southOnShape = shapePts.find((p) => Math.abs(p.y - south.z) < 1e-6);
    expect(southOnShape).toBeTruthy();
  });

  it('uses the shared world origin and pixels-per-meter constants', () => {
    expect(WORLD_ORIGIN.x).toBe(420);
    expect(PIXELS_PER_METER).toBe(80);
  });

  it('expands a rectangle outward so 3D floors tuck under walls', () => {
    const poly = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 260 },
      { x: 100, y: 260 },
    ];
    const grown = expandRoomPolygon(poly, FLOOR_UNDER_WALL_M);
    expect(grown).toHaveLength(4);
    // Area must increase.
    expect(roomArea(grown)).toBeGreaterThan(roomArea(poly));
    // Each edge moves outward by ~FLOOR_UNDER_WALL_M (in meters).
    const insetM = (300 - 100) / PIXELS_PER_METER;
    const grownW = (Math.max(...grown.map((p) => p.x)) - Math.min(...grown.map((p) => p.x))) / PIXELS_PER_METER;
    expect(grownW).toBeCloseTo(insetM + 2 * FLOOR_UNDER_WALL_M, 2);
    // Zero expand is a copy.
    const same = expandRoomPolygon(poly, 0);
    expect(same).toEqual(poly);
    expect(same).not.toBe(poly);
  });

  it('expands concave L-shapes without insetting the re-entrant corner', () => {
    // L: outer 200×200 with a 100×100 bite from the top-right.
    const poly = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 200 },
      { x: 0, y: 200 },
    ];
    const grown = expandRoomPolygon(poly, 0.1);
    expect(roomArea(grown)).toBeGreaterThan(roomArea(poly));
    // Re-entrant vertex (100,100) must move toward the exterior of the L (down-right),
    // not into the solid (up-left). Outward for that corner is +x / +y in plan.
    const re = grown[3]!;
    expect(re.x).toBeGreaterThan(100);
    expect(re.y).toBeGreaterThan(100);
  });

  it('builds an expanded AABB underlay covering all rooms', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ];
    const b = [
      { x: 100, y: 0 },
      { x: 220, y: 0 },
      { x: 220, y: 120 },
      { x: 100, y: 120 },
    ];
    const plate = roomBoundsPolygon([a, b], 0.1);
    expect(plate).toHaveLength(4);
    const xs = plate!.map((p) => p.x);
    const ys = plate!.map((p) => p.y);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(220);
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(Math.max(...ys)).toBeGreaterThan(120);
  });
});
