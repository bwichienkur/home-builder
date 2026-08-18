/** Shared room()/poly() helpers for sample and Olsen flyer catalogs. */
import type { PlanRoomRect } from './buildPlan';
import type { RoomType } from '../../types';

export function room(
  name: string,
  roomType: RoomType | string,
  x: number,
  y: number,
  w: number,
  h: number,
  ceilingFt?: number,
): PlanRoomRect {
  return {
    id: `${name.toLowerCase().replace(/\W+/g, '-')}-${Math.round(x * 10)}-${Math.round(y * 10)}`,
    name,
    roomType: roomType as RoomType,
    x,
    y,
    w,
    h,
    ceilingFt,
  };
}

export function poly(
  name: string,
  roomType: RoomType | string,
  pointsFt: { x: number; y: number }[],
  ceilingFt?: number,
): PlanRoomRect {
  const xs = pointsFt.map((p) => p.x);
  const ys = pointsFt.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    id: `${name.toLowerCase().replace(/\W+/g, '-')}-${Math.round(minX * 10)}-${Math.round(minY * 10)}`,
    name,
    roomType: roomType as RoomType,
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    pointsFt,
    ceilingFt,
  };
}

export function ft(feet: number, inches = 0) {
  return feet + inches / 12;
}
