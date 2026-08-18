import { describe, expect, it } from 'vitest';
import type { Opening, Wall } from '../../types';
import {
  alignmentGuides,
  constrainPlacement,
  containFurnitureInRoom,
  furnitureBounds,
  furnitureFootprintInsideRoom,
  openingConflicts,
  placementConstraint,
  planToWorld,
  pointInWorldRooms,
  roomFloorCenter,
  roomInteriorPoint,
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

  it('keeps wall-mounted art fully on the wall segment', () => {
    const pastCorner = planToWorld({ x: 170, y: 150 });
    const snapped = snapToWallSurface(pastCorner.x, pastCorner.z, rect, 0.05, 'wall', 12, 1.2);
    expect(snapped.wallId).toBe('w1');
    const wallLen = Math.hypot(
      planToWorld({ x: 660, y: 150 }).x - planToWorld({ x: 180, y: 150 }).x,
      planToWorld({ x: 660, y: 150 }).z - planToWorld({ x: 180, y: 150 }).z,
    );
    const minX = planToWorld({ x: 180, y: 150 }).x + 1.2 / 2;
    expect(snapped.x).toBeGreaterThanOrEqual(Math.min(minX, planToWorld({ x: 660, y: 150 }).x) - 0.001);
    expect(snapped.wallOffset!).toBeGreaterThanOrEqual(1.2 / 2 / wallLen - 0.001);
    expect(snapped.wallOffset!).toBeLessThanOrEqual(1 - 1.2 / 2 / wallLen + 0.001);
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
    expect(pointInWorldRooms(center.x, center.z, rect)).toBe(true);
  });

  it('keeps L-shaped room seed points inside the polygon', () => {
    // Classic L: AABB center sits in the missing quadrant.
    const lShape: Wall[] = [
      { id: 'a', start: { x: 180, y: 150 }, end: { x: 660, y: 150 }, thickness: 0.15, height: 2.7 },
      { id: 'b', start: { x: 660, y: 150 }, end: { x: 660, y: 330 }, thickness: 0.15, height: 2.7 },
      { id: 'c', start: { x: 660, y: 330 }, end: { x: 420, y: 330 }, thickness: 0.15, height: 2.7 },
      { id: 'd', start: { x: 420, y: 330 }, end: { x: 420, y: 510 }, thickness: 0.15, height: 2.7 },
      { id: 'e', start: { x: 420, y: 510 }, end: { x: 180, y: 510 }, thickness: 0.15, height: 2.7 },
      { id: 'f', start: { x: 180, y: 510 }, end: { x: 180, y: 150 }, thickness: 0.15, height: 2.7 },
    ];
    const aabb = planToWorld({ x: 420, y: 330 });
    // AABB mid of the bounding box is on the inner corner / missing bay for this L.
    const interior = roomInteriorPoint(lShape);
    expect(pointInWorldRooms(interior.x, interior.z, lShape)).toBe(true);
    expect(pointInWorldRooms(roomFloorCenter(lShape).x, roomFloorCenter(lShape).z, lShape)).toBe(true);
    // Sanity: the naive AABB center of the overall bounds is not required to match interior.
    void aabb;
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

const lShape: Wall[] = [
  { id: 'w1', start: { x: 160, y: 150 }, end: { x: 680, y: 150 }, thickness: 0.15, height: 2.7 },
  { id: 'w2', start: { x: 680, y: 150 }, end: { x: 680, y: 510 }, thickness: 0.15, height: 2.7 },
  { id: 'w3', start: { x: 680, y: 510 }, end: { x: 420, y: 510 }, thickness: 0.15, height: 2.7 },
  { id: 'w4', start: { x: 420, y: 510 }, end: { x: 420, y: 350 }, thickness: 0.15, height: 2.7 },
  { id: 'w5', start: { x: 420, y: 350 }, end: { x: 160, y: 350 }, thickness: 0.15, height: 2.7 },
  { id: 'w6', start: { x: 160, y: 350 }, end: { x: 160, y: 150 }, thickness: 0.15, height: 2.7 },
];

describe('L-shaped room placement', () => {
  it('picks the true nearest segment past a reentrant corner', () => {
    const nearTop = planToWorld({ x: 420, y: 170 });
    const snapped = snapToWallSurface(nearTop.x, nearTop.z, lShape, 0.34, 'wall');
    expect(snapped.wallId).toBe('w1');
  });

  it('keeps a bookcase on the inner L wall without drifting', () => {
    const nearInner = planToWorld({ x: 400, y: 430 });
    const docked = constrainPlacement(nearInner.x, nearInner.z, lShape, 0.34, {
      mountingType: 'floor',
      category: 'Storage',
      name: 'Arch Bookcase',
      width: 0.8,
      live: true,
    });
    expect(docked.constraint).toBe('wall-prefer');
    expect(docked.wallId).toBe('w4');
    expect(Math.abs(docked.x - nearInner.x)).toBeLessThan(1.2);
  });

  it('does not shove free furniture out of an L arm', () => {
    const inArm = planToWorld({ x: 250, y: 250 });
    const kept = containFurnitureInRoom(inArm.x, inArm.z, 1, 1, 0, lShape);
    expect(kept.x).toBeCloseTo(inArm.x, 1);
    expect(kept.z).toBeCloseTo(inArm.z, 1);
    expect(furnitureFootprintInsideRoom(kept.x, kept.z, 1, 1, 0, lShape)).toBe(true);
  });

  it('keeps a free item from hanging into the missing L bay', () => {
    // Inner corner is (420, 350). A 1 m square just inside the top arm still
    // overlaps the empty quadrant unless the AABB is clamped.
    const atInner = planToWorld({ x: 400, y: 340 });
    expect(pointInWorldRooms(atInner.x, atInner.z, lShape)).toBe(true);
    expect(furnitureFootprintInsideRoom(atInner.x, atInner.z, 1, 1, 0, lShape)).toBe(false);

    const contained = containFurnitureInRoom(atInner.x, atInner.z, 1, 1, 0, lShape);
    expect(furnitureFootprintInsideRoom(contained.x, contained.z, 1, 1, 0, lShape)).toBe(true);
    expect(pointInWorldRooms(contained.x, contained.z, lShape)).toBe(true);

    const dragged = constrainPlacement(atInner.x, atInner.z, lShape, 1, {
      mountingType: 'floor',
      category: 'Bedroom',
      name: 'Cloud Platform Bed',
      width: 1,
      live: true,
    });
    expect(furnitureFootprintInsideRoom(dragged.x, dragged.z, 1, 1, dragged.rotation ?? 0, lShape)).toBe(true);
  });

  it('pulls a free item that was dragged fully into the missing bay back inside', () => {
    const missing = planToWorld({ x: 250, y: 430 });
    expect(pointInWorldRooms(missing.x, missing.z, lShape)).toBe(false);
    const contained = containFurnitureInRoom(missing.x, missing.z, 1, 1, 0, lShape);
    expect(pointInWorldRooms(contained.x, contained.z, lShape)).toBe(true);
    expect(furnitureFootprintInsideRoom(contained.x, contained.z, 1, 1, 0, lShape)).toBe(true);
  });
});
