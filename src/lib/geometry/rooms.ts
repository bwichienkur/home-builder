import * as THREE from 'three';
import type { Point, Wall } from '../../types';
import { WORLD_ORIGIN } from './placement';
import { PIXELS_PER_METER } from './snapping';

const key = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;

export function detectRoomPolygons(walls: Wall[]): Point[][] {
  const unused = new Set(walls.map((w) => w.id));
  const rooms: Point[][] = [];
  while (unused.size) {
    const first = walls.find((w) => unused.has(w.id))!;
    unused.delete(first.id);
    const chain = [first.start, first.end];
    let cursor = first.end;
    for (let guard = 0; guard < walls.length + 1; guard++) {
      const next = walls.find(
        (w) => unused.has(w.id) && (key(w.start) === key(cursor) || key(w.end) === key(cursor)),
      );
      if (!next) break;
      unused.delete(next.id);
      cursor = key(next.start) === key(cursor) ? next.end : next.start;
      if (key(cursor) === key(chain[0])) {
        if (chain.length >= 3) rooms.push(chain);
        break;
      }
      chain.push(cursor);
    }
  }
  return rooms;
}

/**
 * Build a THREE.Shape in X/Y that maps to world X/Z the same way walls do:
 * plan x → world x, plan y → world z (no mirror).
 * Scene meshes then use rotation.x = π/2 so shape Y becomes world Z.
 */
export function roomShape(points: Point[], origin = WORLD_ORIGIN, scale = PIXELS_PER_METER) {
  const shape = new THREE.Shape();
  points.forEach((p, i) => {
    const x = (p.x - origin.x) / scale;
    const y = (p.y - origin.y) / scale;
    if (i) shape.lineTo(x, y);
    else shape.moveTo(x, y);
  });
  shape.closePath();
  return shape;
}

/** Convert plan-pixel polygon corners to world XZ (matches wall placement). */
export function roomPolygonWorld(points: Point[], origin = WORLD_ORIGIN, scale = PIXELS_PER_METER) {
  return points.map((p) => ({
    x: (p.x - origin.x) / scale,
    z: (p.y - origin.y) / scale,
  }));
}

export function roomArea(points: Point[], scale = PIXELS_PER_METER) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area / 2) / (scale * scale);
}

export function validatePlan(walls: Wall[]) {
  const rooms = detectRoomPolygons(walls);
  const endpoints = new Map<string, number>();
  walls.forEach((w) =>
    [w.start, w.end].forEach((p) => endpoints.set(key(p), (endpoints.get(key(p)) ?? 0) + 1)),
  );
  return {
    rooms,
    unclosed: [...endpoints].filter(([, count]) => count % 2 !== 0).map(([point]) => point),
    valid: rooms.length > 0,
  };
}
