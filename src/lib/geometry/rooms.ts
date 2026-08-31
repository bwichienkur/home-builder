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
export const FLOOR_UNDER_WALL_M = 0.25;

/** Extra underlay expand (meters) used only for the Walk/3D floor seal plate. */
export const FLOOR_SEAL_EXPAND_M = 0.55;

/** Ray-cast point-in-polygon (plan pixels). Inclusive on edges. */
function pointInPolygon(x: number, y: number, points: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i]!;
    const pj = points[j]!;
    const denom = pj.y - pi.y || 1e-12;
    const intersect =
      pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / denom + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

function outwardNormal(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  points: Point[],
): { x: number; y: number } {
  const ex = bx - ax;
  const ey = by - ay;
  const len = Math.hypot(ex, ey) || 1;
  // Candidate perpendicular; flip if a probe along it lands inside the polygon.
  let nx = -ey / len;
  let ny = ex / len;
  const mx = (ax + bx) * 0.5;
  const my = (ay + by) * 0.5;
  const probe = 0.35; // ~plan px — enough to leave the edge without jumping rooms
  if (pointInPolygon(mx + nx * probe, my + ny * probe, points)) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

/**
 * Expand (or shrink) a plan-pixel polygon along outward edge normals.
 * Positive `meters` grows the fill so 3D floors seal under wall thickness.
 * Uses point-in-polygon probes so concave / L-shaped rooms expand correctly
 * (centroid-based outward tests can inset on re-entrant edges).
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
  const n = points.length;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]!;
    const curr = points[i]!;
    const next = points[(i + 1) % n]!;
    const n1 = outwardNormal(prev.x, prev.y, curr.x, curr.y, points);
    const n2 = outwardNormal(curr.x, curr.y, next.x, next.y, points);

    let mx = n1.x + n2.x;
    let my = n1.y + n2.y;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    // Miter length so offset edges stay parallel to originals.
    const cosHalf = Math.max(0.25, n1.x * mx + n1.y * my);
    const miter = d / cosHalf;
    out.push({ x: curr.x + mx * miter, y: curr.y + my * miter });
  }
  return out;
}

/**
 * Axis-aligned plan-pixel bounds of many room polygons, expanded by `meters`.
 * Used as a continuous under-house floor plate so soft gaps between rooms stay filled.
 */
export function roomBoundsPolygon(
  rooms: Point[][],
  expandM = FLOOR_SEAL_EXPAND_M,
  scale = PIXELS_PER_METER,
): Point[] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pts of rooms) {
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX) || maxX - minX < 1 || maxY - minY < 1) return null;
  const pad = expandM * scale;
  return [
    { x: minX - pad, y: minY - pad },
    { x: maxX + pad, y: minY - pad },
    { x: maxX + pad, y: maxY + pad },
    { x: minX - pad, y: maxY + pad },
  ];
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
