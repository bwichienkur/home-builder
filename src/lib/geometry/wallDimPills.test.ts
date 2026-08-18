import { describe, expect, it } from 'vitest';
import { WORLD_ORIGIN } from './placement';
import { PIXELS_PER_METER } from './snapping';
import { DIM_GAP_M, dimPillSize, elevationDimPillAnchors, planWallDimAnchor } from './wallDimPills';
import type { PlanRoomLabel, Wall } from '../../types';

const px = (x: number, y: number) => ({
  x: WORLD_ORIGIN.x + x * PIXELS_PER_METER,
  y: WORLD_ORIGIN.y + y * PIXELS_PER_METER,
});

const room: PlanRoomLabel = {
  id: 'r',
  name: 'Room',
  roomType: 'Living room',
  points: [px(0, 0), px(6, 0), px(6, 4.5), px(0, 4.5)],
};

describe('world-space wall dim pills', () => {
  it('sizes pills from the label text, not the screen', () => {
    const short = dimPillSize('6.00 m');
    const long = dimPillSize(`12' 3 1/2"`);
    expect(short.h).toBeLessThan(0.25);
    expect(short.w).toBeGreaterThan(0.35);
    expect(long.w).toBeGreaterThan(short.w);
  });

  it('parks Plan dims just outside each wall and keeps them on that wall when the view yaws', () => {
    const back = planWallDimAnchor({
      midX: 3,
      midZ: 0,
      sx: 0,
      sz: 0,
      ex: 6,
      ez: 0,
      thickness: 0.15,
      text: '6.00 m',
      roomPoints: room.points,
    });
    const front = planWallDimAnchor({
      midX: 3,
      midZ: 4.5,
      sx: 6,
      sz: 4.5,
      ex: 0,
      ez: 4.5,
      thickness: 0.15,
      text: '6.00 m',
      roomPoints: room.points,
    });
    const left = planWallDimAnchor({
      midX: 0,
      midZ: 2.25,
      sx: 0,
      sz: 4.5,
      ex: 0,
      ez: 0,
      thickness: 0.15,
      text: '4.50 m',
      roomPoints: room.points,
    });
    const right = planWallDimAnchor({
      midX: 6,
      midZ: 2.25,
      sx: 6,
      sz: 0,
      ex: 6,
      ez: 4.5,
      thickness: 0.15,
      text: '4.50 m',
      roomPoints: room.points,
    });
    expect(back.placement).toBe('top');
    expect(front.placement).toBe('bottom');
    expect(left.placement).toBe('left');
    expect(right.placement).toBe('right');
    expect(back.z).toBeLessThan(-DIM_GAP_M);
    expect(front.z).toBeGreaterThan(4.5 + DIM_GAP_M);
    expect(left.x).toBeLessThan(-DIM_GAP_M);
    expect(right.x).toBeGreaterThan(6 + DIM_GAP_M);
    // Close: not a meter off the face.
    expect(Math.abs(back.z)).toBeLessThan(0.45);
    expect(right.x - 6).toBeLessThan(0.45);
  });

  it('parks Front height left of the wall and length below the floor, not on the body', () => {
    const wall: Wall = {
      id: 's',
      start: px(0, 0),
      end: px(6, 0),
      thickness: 0.15,
      height: 2.7,
    };
    const a = elevationDimPillAnchors(wall, 'front', { widthText: '6.00 m', heightText: '2.70 m' });
    expect(a.width.y).toBeLessThan(-DIM_GAP_M);
    expect(a.width.y).toBeGreaterThan(-0.4);
    expect(a.height.x).toBeLessThan(-DIM_GAP_M);
    expect(a.height.x).toBeGreaterThan(-0.7);
    expect(a.height.y).toBeCloseTo(1.35, 5);
    expect(a.height.yaw).toBeCloseTo(Math.PI);
  });
});
