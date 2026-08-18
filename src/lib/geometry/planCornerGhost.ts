import type { Point } from '../../types';

export type OutlineProjection = {
  edgeIndex: number;
  t: number;
  point: Point;
  dist: number;
};

/** Project `p` onto segment a→b. `t` is clamped to [0, 1]. */
export function projectPointOntoSegment(p: Point, a: Point, b: Point): { t: number; point: Point; dist: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) {
    return { t: 0, point: { x: a.x, y: a.y }, dist: Math.hypot(p.x - a.x, p.y - a.y) };
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const point = { x: a.x + dx * t, y: a.y + dy * t };
  return { t, point, dist: Math.hypot(p.x - point.x, p.y - point.y) };
}

/** Nearest point on a closed polygon outline. Interior points still snap to the boundary. */
export function projectPointOntoPolygonOutline(points: Point[], p: Point): OutlineProjection | null {
  if (points.length < 2) return null;
  let best: OutlineProjection | null = null;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const hit = projectPointOntoSegment(p, a, b);
    if (!best || hit.dist < best.dist) {
      best = { edgeIndex: i, t: hit.t, point: hit.point, dist: hit.dist };
    }
  }
  return best;
}

/** Keep inserted corners off existing vertices so the polygon does not duplicate a point. */
export function clampInsertT(t: number, edgeLenPx: number, minPx = 12): number {
  if (!Number.isFinite(t)) return 0.5;
  if (!(edgeLenPx > 0) || edgeLenPx < minPx * 2) return 0.5;
  const pad = minPx / edgeLenPx;
  return Math.min(1 - pad, Math.max(pad, t));
}

export function pointOnPolygonEdge(points: Point[], edgeIndex: number, t: number): Point | null {
  if (points.length < 2) return null;
  const i = ((edgeIndex % points.length) + points.length) % points.length;
  const a = points[i]!;
  const b = points[(i + 1) % points.length]!;
  const tt = Math.max(0, Math.min(1, t));
  return { x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt };
}

export function splitEdgeEndpoints(points: Point[], edgeIndex: number, t: number): { a: Point; ghost: Point; b: Point } | null {
  if (points.length < 2) return null;
  const i = ((edgeIndex % points.length) + points.length) % points.length;
  const a = points[i]!;
  const b = points[(i + 1) % points.length]!;
  const ghost = pointOnPolygonEdge(points, i, t);
  if (!ghost) return null;
  return { a, ghost, b };
}
