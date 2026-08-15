import { describe, expect, it } from 'vitest';
import type { PlanRoomLabel, Wall } from '../../types';
import { pointInPlanRoom, wallBelongsToRoom, wallExteriorSide, wallsBelongingToRoom } from './roomWalls';

const room: PlanRoomLabel = {
  id: 'r1',
  name: 'Test',
  roomType: 'Living room',
  points: [
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 260 },
    { x: 100, y: 260 },
  ],
};

const walls: Wall[] = [
  { id: 'a', start: { x: 100, y: 100 }, end: { x: 300, y: 100 }, thickness: 0.15, height: 2.7 },
  { id: 'b', start: { x: 300, y: 100 }, end: { x: 300, y: 260 }, thickness: 0.15, height: 2.7 },
  { id: 'c', start: { x: 300, y: 260 }, end: { x: 100, y: 260 }, thickness: 0.15, height: 2.7 },
  { id: 'd', start: { x: 100, y: 260 }, end: { x: 100, y: 100 }, thickness: 0.15, height: 2.7 },
  { id: 'other', start: { x: 400, y: 100 }, end: { x: 500, y: 100 }, thickness: 0.15, height: 2.7 },
];

describe('room wall membership', () => {
  it('keeps only walls on the room boundary', () => {
    expect(wallsBelongingToRoom(room, walls)).toHaveLength(4);
    expect(wallBelongsToRoom(walls[4], room)).toBe(false);
  });

  it('includes interior partitions whose ends are inside the room', () => {
    const divider: Wall = {
      id: 'div',
      start: { x: 200, y: 100 },
      end: { x: 200, y: 260 },
      thickness: 0.15,
      height: 2.7,
    };
    expect(wallBelongsToRoom(divider, room)).toBe(true);
  });

  it('tests points inside the room polygon', () => {
    expect(pointInPlanRoom(200, 180, room)).toBe(true);
    expect(pointInPlanRoom(50, 50, room)).toBe(false);
  });

  it('picks the exterior normal side for boundary walls', () => {
    // Walls travel CCW around the room; left-handed normal (+side) points inside → exterior is −1.
    expect(wallExteriorSide(walls[0], [room])).toBe(-1);
    expect(wallExteriorSide(walls[1], [room])).toBe(-1);
    expect(wallExteriorSide(walls[2], [room])).toBe(-1);
    expect(wallExteriorSide(walls[3], [room])).toBe(-1);
    // Reverse a wall: travel CW, so +normal is outside.
    const flipped = { ...walls[0], start: walls[0].end, end: walls[0].start };
    expect(wallExteriorSide(flipped, [room])).toBe(1);
  });
});
