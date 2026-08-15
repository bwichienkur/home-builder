import { describe, expect, it } from 'vitest';
import type { PlanRoomLabel, Wall } from '../../types';
import { boundaryWallsForRoom, perimeterTrimSegments } from './ceilingTrim';
import { planToWorld } from './placement';

const room: PlanRoomLabel = {
  id: 'r1',
  name: 'Living',
  roomType: 'Living room',
  points: [
    { x: 180, y: 150 },
    { x: 660, y: 150 },
    { x: 660, y: 510 },
    { x: 180, y: 510 },
  ],
};

const walls: Wall[] = [
  { id: 'w1', start: { x: 180, y: 150 }, end: { x: 660, y: 150 }, thickness: 0.15, height: 2.7 },
  { id: 'w2', start: { x: 660, y: 150 }, end: { x: 660, y: 510 }, thickness: 0.15, height: 2.7 },
  { id: 'w3', start: { x: 660, y: 510 }, end: { x: 180, y: 510 }, thickness: 0.15, height: 2.7 },
  { id: 'w4', start: { x: 180, y: 510 }, end: { x: 180, y: 150 }, thickness: 0.15, height: 2.7 },
  { id: 'other', start: { x: 800, y: 100 }, end: { x: 900, y: 100 }, thickness: 0.15, height: 2.7 },
];

function pointInPolygon(x: number, z: number, pts: { x: number; z: number }[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]!.x;
    const zi = pts[i]!.z;
    const xj = pts[j]!.x;
    const zj = pts[j]!.z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + Number.EPSILON) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

describe('ceiling / floor perimeter trim', () => {
  it('uses only boundary walls (not distant walls)', () => {
    expect(boundaryWallsForRoom(room, walls).map((w) => w.id).sort()).toEqual(['w1', 'w2', 'w3', 'w4']);
  });

  it('places one ceiling strip per boundary wall under the ceiling plane', () => {
    const segs = perimeterTrimSegments(room, walls, { profileDepth: 0.05, profileHeight: 0.09, edge: 'ceiling' });
    expect(segs).toHaveLength(4);
    for (const seg of segs) {
      expect(seg.y).toBeCloseTo(2.7 - 0.09, 5);
      expect(seg.height).toBeCloseTo(0.09, 5);
      expect(seg.depth).toBeCloseTo(0.05, 5);
      // Mitered: shorter than full wall length by profile depth.
      expect(seg.width).toBeGreaterThan(1);
      expect(seg.width).toBeLessThan(6);
    }
  });

  it('skips baseboard on walls covered by counters', () => {
    const counter = {
      id: 'c1',
      catalogId: 'counter',
      name: 'Kitchen counter',
      category: 'Kitchen',
      x: 0,
      y: 0,
      z: ((150 + 510) / 2 - 330) / 80,
      rotation: Math.PI / 2,
      color: '#ccc',
      width: 3,
      depth: 0.6,
      height: 0.9,
      mountingType: 'floor' as const,
    };
    // Place counter along left wall (w4: x=180).
    const left = {
      ...counter,
      x: (180 - 420) / 80,
      z: 0,
      width: 3.5,
      depth: 0.65,
      rotation: Math.PI / 2,
    };
    const segs = perimeterTrimSegments(room, walls, {
      profileDepth: 0.015,
      profileHeight: 0.09,
      edge: 'floor',
      furniture: [left],
    });
    expect(segs.length).toBeLessThan(4);
    expect(segs.every((s) => s.wallId !== 'w4')).toBe(true);
  });

  it('places floor baseboard strips on the floor plane', () => {
    const segs = perimeterTrimSegments(room, walls, { profileDepth: 0.015, profileHeight: 0.09, edge: 'floor' });
    expect(segs).toHaveLength(4);
    expect(segs.every((s) => s.y === 0)).toBe(true);
  });

  it('insets strips to the room interior', () => {
    const roomWorld = room.points.map((p) => planToWorld(p));
    const segs = perimeterTrimSegments(room, walls, { profileDepth: 0.05, profileHeight: 0.09, edge: 'ceiling' });
    for (const seg of segs) {
      expect(pointInPolygon(seg.x, seg.z, roomWorld)).toBe(true);
    }
  });

  it('ignores interior partitions that are not on the outline', () => {
    const divider: Wall = {
      id: 'div',
      start: { x: 420, y: 150 },
      end: { x: 420, y: 510 },
      thickness: 0.15,
      height: 2.7,
    };
    const withDivider = [...walls.slice(0, 4), divider];
    const segs = perimeterTrimSegments(room, withDivider, { profileDepth: 0.05, profileHeight: 0.09, edge: 'ceiling' });
    expect(segs).toHaveLength(4);
    expect(segs.every((s) => s.wallId !== 'div')).toBe(true);
  });
});
