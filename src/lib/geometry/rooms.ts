import * as THREE from 'three';
import type { Point, Wall } from '../../types';
import { WORLD_ORIGIN } from './placement';
import { PIXELS_PER_METER } from './snapping';

const key = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;

/**
 * How far 3D/Walk floor meshes extend past the plan room polygon (meters).
 * Walls are centered on their plan line (~0.15 m thick); flood-fill rooms can sit
 * slightly inside the inner face — expand so floors tuck under walls and no
 * background shows at the wall–floor junction.
 */
export const FLOOR_UNDER_WALL_M = 0.12;

/** Extra underlay expand (meters) used only for the Walk/3D floor seal plate. */
export const FLOOR_SEAL_EXPAND_M = 0.22;

function polygonCentroid(points: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(points.length, 1);
  return { x: x / n, y: y / n };
}

/**
 * Expand (or shrink) a plan-pixel polygon along outward edge normals.
 * Positive `meters` grows the fill so 3D floors seal under wall thickness.
 */
export function expandRoomPolygon(
  points: Point[],
  meters: number,
  scale = PIXELS_PER_METER,
): Point[] {
  if (points.length < 3 || !Number.isFinite(meters) || Math.abs(meters) < 1e-9) {
    return points.map((p) => ({ x: p.x, y: p.y }));
  }
  const d = meters * scale;
  const c = polygonCentroid(points);
  const n = points.length;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]!;
    const curr = points[i]!;
    const next = points[(i + 1) % n]!;
    const e1x = curr.x - prev.x;
    const e1y = curr.y - prev.y;
    const e2x = next.x - curr.x;
    const e2y = next.y - curr.y;
    const len1 = Math.hypot(e1x, e1y) || 1;
    const len2 = Math.hypot(e2x, e2y) || 1;

    // Perp candidates; pick the one pointing away from the centroid (outward).
    let n1x = -e1y / len1;
    let n1y = e1x / len1;
    const m1x = (prev.x + curr.x) * 0.5;
    const m1y = (prev.y + curr.y) * 0.5;
    if (
      (m1x + n1x - c.x) ** 2 + (m1y + n1y - c.y) ** 2 <
      (m1x - n1x - c.x) ** 2 + (m1y - n1y - c.y) ** 2
    ) {
      n1x = -n1x;
      n1y = -n1y;
    }
    let n2x = -e2y / len2;
    let n2y = e2x / len2;
    const m2x = (curr.x + next.x) * 0.5;
    const m2y = (curr.y + next.y) * 0.5;
    if (
      (m2x + n2x - c.x) ** 2 + (m2y + n2y - c.y) ** 2 <
      (m2x - n2x - c.x) ** 2 + (m2y - n2y - c.y) ** 2
    ) {
      n2x = -n2x;
      n2y = -n2y;
    }

    let mx = n1x + n2x;
    let my = n1y + n2y;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    // Miter length so offset edges stay parallel to originals.
    const cosHalf = Math.max(0.25, n1x * mx + n1y * my);
    const miter = d / cosHalf;
    out.push({ x: curr.x + mx * miter, y: curr.y + my * miter });
  }
  return out;
}

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

/** World-XZ rectangle hole (meters) for stair cutouts — matches roomShape axes. */
export function stairCutoutPath(
  item: { x: number; z: number; width: number; depth: number; rotation: number },
): THREE.Path {
  const hw = item.width / 2;
  const hd = item.depth / 2;
  const cos = Math.cos(item.rotation);
  const sin = Math.sin(item.rotation);
  const corners = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([lx, lz]) => ({
    x: item.x + lx * cos - lz * sin,
    y: item.z + lx * sin + lz * cos,
  }));
  const path = new THREE.Path();
  corners.forEach((c, i) => {
    if (i) path.lineTo(c.x, c.y);
    else path.moveTo(c.x, c.y);
  });
  path.closePath();
  return path;
}

export function roomShapeWithHoles(
  points: Point[],
  holes: Array<{ x: number; z: number; width: number; depth: number; rotation: number }> = [],
  origin = WORLD_ORIGIN,
  scale = PIXELS_PER_METER,
) {
  const shape = roomShape(points, origin, scale);
  for (const hole of holes) shape.holes.push(stairCutoutPath(hole));
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
