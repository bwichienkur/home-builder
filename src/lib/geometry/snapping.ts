import type { Point } from '../../types';
export const GRID_SIZE = 20;
export const PIXELS_PER_METER = 80;
export const snapPoint = (point: Point, size = GRID_SIZE): Point => ({ x: Math.round(point.x / size) * size, y: Math.round(point.y / size) * size });
export const wallLengthMeters = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y) / PIXELS_PER_METER;
