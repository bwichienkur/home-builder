import { describe, expect, it } from 'vitest';
import { WORLD_ORIGIN } from './placement';
import { PIXELS_PER_METER } from './snapping';
import {
  DIM_GAP_M,
  dimPillSize,
  elevationDimPillAnchors,
  planDimOutwardHalf,
  planWallDimAnchor,
} from './wallDimPills';
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

function anchors() {
  return {
    back: planWallDimAnchor({
      midX: 3,
      midZ: 0,
      sx: 0,
      sz: 0,
      ex: 6,
      ez: 0,
      thickness: 0.15,
      text: '6.00 m',
      roomPoints: room.points,
    }),
    front: planWallDimAnchor({
      midX: 3,
      midZ: 4.5,
      sx: 6,
      sz: 4.5,
      ex: 0,
      ez: 4.5,
      thickness: 0.15,
      text: '6.00 m',
      roomPoints: room.points,
    }),
    left: planWallDimAnchor({
      midX: 0,
      midZ: 2.25,
      sx: 0,
      sz: 4.5,
      ex: 0,
      ez: 0,
      thickness: 0.15,
      text: '4.50 m',
      roomPoints: room.points,
    }),
    right: planWallDimAnchor({
      midX: 6,
      midZ: 2.25,
      sx: 6,
      sz: 0,
      ex: 6,
      ez: 4.5,
      thickness: 0.15,
      text: '4.50 m',
      roomPoints: room.points,
    }),
  };
}

describe('world-space wall dim pills', () => {
  it('sizes pills from the label text, not the screen', () => {
    const short = dimPillSize('6.00 m');
    const long = dimPillSize(`12' 3 1/2"`);
    expect(short.h).toBeLessThan(0.32);
    expect(short.w).toBeGreaterThan(0.38);
    expect(long.w).toBeGreaterThan(short.w);
  });

  it('parks Plan dims clearly outside each wall', () => {
    const { back, front, left, right } = anchors();
    expect(back.placement).toBe('top');
    expect(front.placement).toBe('bottom');
    expect(left.placement).toBe('left');
    expect(right.placement).toBe('right');
    const backSize = { w: back.w, h: back.h };
    const rightSize = { w: right.w, h: right.h };
    expect(-back.z).toBeGreaterThan(DIM_GAP_M + planDimOutwardHalf('top', backSize) * 0.5);
    expect(front.z - 4.5).toBeGreaterThan(DIM_GAP_M);
    expect(-left.x).toBeGreaterThan(DIM_GAP_M);
    expect(right.x - 6).toBeGreaterThan(DIM_GAP_M + planDimOutwardHalf('right', rightSize) * 0.5);
    // Close: not a meter off the face.
    expect(Math.abs(back.z)).toBeLessThan(0.7);
    expect(right.x - 6).toBeLessThan(1.05);
  });

  it('keeps Plan type yaw at 0 so labels stay screen-upright (renderer adds view yaw)', () => {
    const { back, front, left, right } = anchors();
    expect(back.yaw).toBe(0);
    expect(front.yaw).toBe(0);
    expect(left.yaw).toBe(0);
    expect(right.yaw).toBe(0);
  });

  it('offsets left/right by pill width so a horizontal capsule clears the wall', () => {
    const { left, right } = anchors();
    const half = planDimOutwardHalf('right', { w: right.w, h: right.h });
    expect(half).toBeCloseTo(right.w / 2, 5);
    expect(right.x - 6).toBeGreaterThan(half);
    expect(-left.x).toBeGreaterThan(planDimOutwardHalf('left', { w: left.w, h: left.h }));
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
    expect(a.width.y).toBeGreaterThan(-0.7);
    expect(a.height.x).toBeLessThan(-DIM_GAP_M);
    expect(a.height.x).toBeGreaterThan(-1.15);
    expect(a.height.y).toBeCloseTo(1.35, 5);
    expect(a.height.yaw).toBeCloseTo(Math.PI);
  });
});
