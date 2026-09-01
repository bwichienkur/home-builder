import type { Seg } from './dxfRooms';

const FT_EPS = 0.08;
const CORNER_CLUSTER = 0.35;

export type EstimatedCorner = {
  x: number;
  y: number;
  /** Segment indices that should meet here. */
  wallIndices: number[];
  kind: 'L' | 'T' | 'cross';
};

function isHorizontalSeg(s: Seg): boolean {
  return Math.abs(s.y1 - s.y2) <= FT_EPS;
}

function isVerticalSeg(s: Seg): boolean {
  return Math.abs(s.x1 - s.x2) <= FT_EPS;
}

function segLength(s: Seg): number {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
}

function endpointNearPoint(s: Seg, x: number, y: number, reach: number): boolean {
  return (
    Math.hypot(s.x1 - x, s.y1 - y) <= reach ||
    Math.hypot(s.x2 - x, s.y2 - y) <= reach
  );
}

function pointNearSegmentBody(px: number, py: number, s: Seg, eps: number): boolean {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(px - s.x1, py - s.y1) <= eps;
  let t = ((px - s.x1) * dx + (py - s.y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy)) <= eps;
}

/**
 * Predict H×V corner points from wall centerline geometry.
 * A corner is estimated when a horizontal and vertical wall are close enough
 * that their centerlines should meet (endpoint, T-body, or crossing).
 */
export function estimateWallCorners(segments: Seg[], reach = 2.0): EstimatedCorner[] {
  const horiz = segments.map((s, i) => ({ s, i })).filter(({ s }) => isHorizontalSeg(s));
  const vert = segments.map((s, i) => ({ s, i })).filter(({ s }) => isVerticalSeg(s));
  const raw: EstimatedCorner[] = [];

  for (const { s: h, i: hi } of horiz) {
    const hy = (h.y1 + h.y2) / 2;
    const hx0 = Math.min(h.x1, h.x2);
    const hx1 = Math.max(h.x1, h.x2);
    for (const { s: v, i: vi } of vert) {
      const vx = (v.x1 + v.x2) / 2;
      const vy0 = Math.min(v.y1, v.y2);
      const vy1 = Math.max(v.y1, v.y2);

      const xInH = vx >= hx0 - reach && vx <= hx1 + reach;
      const yInV = hy >= vy0 - reach && hy <= vy1 + reach;
      if (!xInH || !yInV) continue;

      const endpointTouch =
        endpointNearPoint(h, vx, hy, reach) ||
        endpointNearPoint(v, vx, hy, reach);
      const bodyTouch =
        pointNearSegmentBody(vx, hy, h, reach * 0.5) ||
        pointNearSegmentBody(vx, hy, v, reach * 0.5);
      if (!endpointTouch && !bodyTouch) continue;

      raw.push({
        x: vx,
        y: hy,
        wallIndices: [hi, vi],
        kind: 'L',
      });
    }
  }

  // Cluster nearby corner predictions.
  const merged: EstimatedCorner[] = [];
  for (const c of raw) {
    let found: EstimatedCorner | undefined;
    for (const m of merged) {
      if (Math.hypot(m.x - c.x, m.y - c.y) <= CORNER_CLUSTER) {
        found = m;
        break;
      }
    }
    if (found) {
      found.x = (found.x + c.x) / 2;
      found.y = (found.y + c.y) / 2;
      for (const idx of c.wallIndices) {
        if (!found.wallIndices.includes(idx)) found.wallIndices.push(idx);
      }
      if (found.wallIndices.length >= 3) found.kind = found.wallIndices.length >= 4 ? 'cross' : 'T';
    } else {
      merged.push({ ...c, wallIndices: [...c.wallIndices] });
    }
  }
  return merged;
}

function snapEndpoint(
  px: number,
  py: number,
  seg: Seg,
  corners: EstimatedCorner[],
  maxReach: number,
): { x: number; y: number } {
  let best: { x: number; y: number; d: number } | null = null;
  const horiz = isHorizontalSeg(seg);
  const vert = isVerticalSeg(seg);

  for (const c of corners) {
    const d = Math.hypot(px - c.x, py - c.y);
    if (d > maxReach) continue;
    if (horiz && Math.abs(py - c.y) > 0.2) continue;
    if (vert && Math.abs(px - c.x) > 0.2) continue;
    if (!best || d < best.d) best = { x: c.x, y: c.y, d };
  }
  return best ?? { x: px, y: py };
}

/** Snap wall endpoints to estimated corners; trim only past-corner overshoot. */
export function resolveWallCorners(segments: Seg[], maxReach = 1.75): Seg[] {
  const corners = estimateWallCorners(segments, maxReach + 0.5);
  if (!corners.length) return segments;

  return segments.map((s) => {
    const a = snapEndpoint(s.x1, s.y1, s, corners, maxReach);
    const b = snapEndpoint(s.x2, s.y2, s, corners, maxReach);
    let { x: x1, y: y1 } = a;
    let { x: x2, y: y2 } = b;

    // Trim overshoot: if segment extends past a corner along its axis, clip at corner.
    if (isHorizontalSeg(s)) {
      const y = (y1 + y2) / 2;
      y1 = y;
      y2 = y;
      const relevant = corners.filter((c) => Math.abs(c.y - y) <= 0.2);
      for (const c of relevant) {
        if (x1 < c.x && x2 > c.x + 0.15) {
          // corner in middle — keep as-is (T junction)
        } else if (x2 > c.x && Math.abs(x2 - c.x) < 0.5 && x1 < c.x - 0.1) {
          x2 = c.x;
        } else if (x1 < c.x && Math.abs(x1 - c.x) < 0.5 && x2 > c.x + 0.1) {
          x1 = c.x;
        }
      }
    } else if (isVerticalSeg(s)) {
      const x = (x1 + x2) / 2;
      x1 = x;
      x2 = x;
      const relevant = corners.filter((c) => Math.abs(c.x - x) <= 0.2);
      for (const c of relevant) {
        if (y2 > c.y && Math.abs(y2 - c.y) < 0.5 && y1 < c.y - 0.1) y2 = c.y;
        else if (y1 < c.y && Math.abs(y1 - c.y) < 0.5 && y2 > c.y + 0.1) y1 = c.y;
      }
    }

    const out = { ...s, x1, y1, x2, y2 };
    return segLength(out) >= 0.5 ? out : s;
  });
}
