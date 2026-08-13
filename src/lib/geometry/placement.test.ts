import { describe, expect, it } from 'vitest';
import type { Opening, Wall } from '../../types';
import {
  alignmentGuides,
  constrainPlacement,
  containFurnitureInRoom,
  furnitureBounds,
  openingConflicts,
  placementConstraint,
  planToWorld,
  roomFloorCenter,
  snapToWallSurface,
  worldToPlan,
} from './placement';

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

  it('classifies placement constraints like IKEA product limits', () => {
    expect(placementConstraint('wall', 'Lighting', 'Halo Wall Sconce')).toBe('wall');
    expect(placementConstraint('floor', 'Storage', 'Arch Bookcase')).toBe('wall-prefer');
    expect(placementConstraint('floor', 'Bedroom', 'Cloud Platform Bed')).toBe('free');
    expect(placementConstraint('floor', 'Decor', 'Oval Wall Mirror')).toBe('wall');
    expect(placementConstraint(undefined, 'Decor', 'Landscape Picture')).toBe('wall');
    expect(placementConstraint('floor', 'Decor', 'Window Panel Accent')).toBe('wall');
  });

  it('keeps wall-locked products on a wall face while free products stay on the floor', () => {
    const nearCenter = planToWorld({ x: 420, y: 330 });
    const wallLocked = constrainPlacement(nearCenter.x, nearCenter.z, rect, 0.1, {
      mountingType: 'wall',
      category: 'Decor',
      name: 'Mirror',
    });
    expect(wallLocked.constraint).toBe('wall');
    expect(wallLocked.wallId).toBeTruthy();

    const bed = constrainPlacement(nearCenter.x + 0.3, nearCenter.z + 0.2, rect, 2.1, {
      mountingType: 'floor',
      category: 'Bedroom',
      name: 'Cloud Platform Bed',
    });
    expect(bed.constraint).toBe('free');
    expect(bed.wallId).toBeNull();
    expect(bed.x).toBeCloseTo(Math.round((nearCenter.x + 0.3) * 4) / 4);
  });

  it('docks storage to a wall when dragged nearby', () => {
    const nearWall = planToWorld({ x: 420, y: 175 });
    const docked = constrainPlacement(nearWall.x, nearWall.z, rect, 0.34, {
      mountingType: 'floor',
      category: 'Storage',
      name: 'Arch Bookcase',
      live: true,
    });
    expect(docked.constraint).toBe('wall-prefer');
    expect(docked.wallId).toBe('w1');
  });

  it('returns the floor centroid for ghost placement', () => {
    const center = roomFloorCenter(rect);
    const expected = planToWorld({ x: 420, y: 330 });
    expect(center.x).toBeCloseTo(expected.x, 1);
    expect(center.z).toBeCloseTo(expected.z, 1);
  });

  it('keeps free furniture from protruding through walls', () => {
    const outside = planToWorld({ x: 420, y: 140 }); // past the north wall centerline
    const contained = containFurnitureInRoom(outside.x, outside.z, 1.6, 2.0, 0, rect);
    const bounds = furnitureBounds({ x: contained.x, z: contained.z, width: 1.6, depth: 2.0, rotation: 0 });
    const north = planToWorld({ x: 420, y: 150 }).z;
    const south = planToWorld({ x: 420, y: 510 }).z;
    const west = planToWorld({ x: 180, y: 330 }).x;
    const east = planToWorld({ x: 660, y: 330 }).x;
    const inset = 0.15 / 2;
    expect(bounds.minZ).toBeGreaterThanOrEqual(Math.min(north, south) + inset - 0.001);
    expect(bounds.maxZ).toBeLessThanOrEqual(Math.max(north, south) - inset + 0.001);
    expect(bounds.minX).toBeGreaterThanOrEqual(Math.min(west, east) + inset - 0.001);
    expect(bounds.maxX).toBeLessThanOrEqual(Math.max(west, east) - inset + 0.001);
  });

  it('clamps free placement against walls during constrainPlacement', () => {
    const pastWall = planToWorld({ x: 170, y: 330 });
    const placed = constrainPlacement(pastWall.x, pastWall.z, rect, 2.1, {
      mountingType: 'floor',
      category: 'Bedroom',
      name: 'Cloud Platform Bed',
      width: 1.7,
      live: true,
    });
    const bounds = furnitureBounds({
      x: placed.x,
      z: placed.z,
      width: 1.7,
      depth: 2.1,
      rotation: placed.rotation ?? 0,
    });
    const west = planToWorld({ x: 180, y: 330 }).x;
    expect(bounds.minX).toBeGreaterThanOrEqual(west + 0.15 / 2 - 0.001);
  });
});
