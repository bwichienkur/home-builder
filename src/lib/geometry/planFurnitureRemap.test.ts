import { describe, expect, it } from 'vitest';
import type { FurnitureItem, PlanRoomLabel, Wall } from '../../types';
import { remapFurnitureAfterPlanRebuild, roomCentroidWorld } from './planFurnitureRemap';
import { rebuildFromPlanRooms } from '../housePlans/buildPlan';
import { perimeterTrimSegments } from './ceilingTrim';
import { WORLD_ORIGIN } from './placement';
import { PIXELS_PER_METER } from './snapping';

const FT = 0.3048;

function rectRoom(id: string, cxFt: number, cyFt: number, wFt = 12, dFt = 12): PlanRoomLabel {
  const hx = (wFt * FT * PIXELS_PER_METER) / 2;
  const hy = (dFt * FT * PIXELS_PER_METER) / 2;
  const cx = WORLD_ORIGIN.x + cxFt * FT * PIXELS_PER_METER;
  const cy = WORLD_ORIGIN.y + cyFt * FT * PIXELS_PER_METER;
  return {
    id,
    name: id,
    roomType: 'Bedroom',
    points: [
      { x: cx - hx, y: cy - hy },
      { x: cx + hx, y: cy - hy },
      { x: cx + hx, y: cy + hy },
      { x: cx - hx, y: cy + hy },
    ],
  };
}

describe('remapFurnitureAfterPlanRebuild', () => {
  it('regenerates perimeter trim onto new walls after adding a second room', () => {
    const roomA = rectRoom('a', 0, 0);
    const builtA = rebuildFromPlanRooms([roomA], 'f1', 2.7);
    const roomABuilt = builtA.roomPolygons[0]!;
    const segs = perimeterTrimSegments(roomABuilt, builtA.scene.walls, {
      profileDepth: 0.015,
      profileHeight: 0.09,
      edge: 'floor',
    });
    const runId = 'run-1';
    const trim: FurnitureItem[] = segs.map((seg, i) => ({
      id: `t${i}`,
      catalogId: 'baseboard',
      name: 'Baseboard',
      category: 'Trim',
      color: '#fff',
      x: seg.x,
      y: 0,
      z: seg.z,
      rotation: seg.rotation,
      width: seg.width,
      depth: seg.depth,
      height: seg.height,
      mountingType: 'floor',
      wallId: seg.wallId,
      wallOffset: seg.wallOffset,
      placementKind: 'perimeter-trim',
      runId,
      trimEdge: 'floor',
    }));

    const roomB = rectRoom('b', 12, 0);
    const builtAB = rebuildFromPlanRooms([roomA, roomB], 'f1', 2.7);
    const remapped = remapFurnitureAfterPlanRebuild(
      [roomABuilt],
      builtAB.roomPolygons,
      builtAB.scene.walls,
      trim,
    );

    const nextTrim = remapped.filter((f) => f.placementKind === 'perimeter-trim');
    expect(nextTrim.length).toBeGreaterThanOrEqual(4);
    expect(nextTrim.every((f) => builtAB.scene.walls.some((w: Wall) => w.id === f.wallId))).toBe(true);

    const roomANext = builtAB.roomPolygons.find((r) => r.id === 'a')!;
    const expected = perimeterTrimSegments(roomANext, builtAB.scene.walls, {
      profileDepth: 0.015,
      profileHeight: 0.09,
      edge: 'floor',
    });
    expect(nextTrim).toHaveLength(expected.length);
    // Strips sit on the rebuilt room A centroid — not left at the pre-recenter origin.
    const c = roomCentroidWorld(roomANext);
    for (const strip of nextTrim) {
      expect(Math.hypot(strip.x - c.x, strip.z - c.z)).toBeLessThan(8);
    }
  });

  it('translates free furniture with its room after recenter', () => {
    const roomA = rectRoom('a', 0, 0);
    const builtA = rebuildFromPlanRooms([roomA], 'f1', 2.7);
    const chair: FurnitureItem = {
      id: 'chair',
      catalogId: 'chair',
      name: 'Chair',
      category: 'Seating',
      color: '#888',
      x: roomCentroidWorld(builtA.roomPolygons[0]!).x,
      y: 0,
      z: roomCentroidWorld(builtA.roomPolygons[0]!).z,
      rotation: 0,
      width: 0.5,
      depth: 0.5,
      height: 0.8,
      mountingType: 'floor',
    };
    const roomB = rectRoom('b', 12, 0);
    const builtAB = rebuildFromPlanRooms([roomA, roomB], 'f1', 2.7);
    const remapped = remapFurnitureAfterPlanRebuild(
      builtA.roomPolygons,
      builtAB.roomPolygons,
      builtAB.scene.walls,
      [chair],
    );
    const next = remapped[0]!;
    const c = roomCentroidWorld(builtAB.roomPolygons.find((r) => r.id === 'a')!);
    expect(next.x).toBeCloseTo(c.x, 1);
    expect(next.z).toBeCloseTo(c.z, 1);
  });
});
