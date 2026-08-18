import type { PlanRoomLabel, Point, Wall } from '../../types';

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointNearSegment(p: Point, a: Point, b: Point, tol: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const proj = { x: a.x + dx * t, y: a.y + dy * t };
  return dist(p, proj) <= tol;
}

/**
 * True when the wall is on the room boundary, or is an interior partition
 * whose endpoints sit inside (or on) the room.
 */
export function wallBelongsToRoom(wall: Wall, room: PlanRoomLabel, tol = 28) {
  const pts = room.points;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (pointNearSegment(wall.start, a, b, tol) && pointNearSegment(wall.end, a, b, tol)) return true;
  }
  const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  const startIn = pointInPlanRoom(wall.start.x, wall.start.y, room) || pointNearRoomEdge(wall.start, room, tol);
  const endIn = pointInPlanRoom(wall.end.x, wall.end.y, room) || pointNearRoomEdge(wall.end, room, tol);
  const midIn = pointInPlanRoom(mid.x, mid.y, room);
  return (startIn && endIn) || (midIn && (startIn || endIn));
}

/** Polygon edge index (a→b) that this wall sits on, or null if it is not an outline edge. */
export function planRoomEdgeIndexForWall(room: PlanRoomLabel, wall: Wall, tol = 28): number | null {
  const pts = room.points;
  if (pts.length < 3) return null;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    if (!pointNearSegment(wall.start, a, b, tol) || !pointNearSegment(wall.end, a, b, tol)) continue;
    const midWall = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
    const midEdge = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const score = dist(midWall, midEdge);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best >= 0 ? best : null;
}

function pointNearRoomEdge(p: Point, room: PlanRoomLabel, tol: number) {
  const pts = room.points;
  for (let i = 0; i < pts.length; i++) {
    if (pointNearSegment(p, pts[i], pts[(i + 1) % pts.length], tol)) return true;
  }
  return false;
}

export function wallsBelongingToRoom(room: PlanRoomLabel, walls: Wall[], tol = 28) {
  return walls.filter((w) => wallBelongsToRoom(w, room, tol));
}

/**
 * Walls that lie on the room outline only (not neighbor walls that merely
 * graze a corner or span past an edge — those caused “leftover” stubs in room focus).
 */
export function boundaryWallsForRoomOutline(room: PlanRoomLabel, walls: Wall[], tol = 28) {
  const pts = room.points;
  if (pts.length < 3) return wallsBelongingToRoom(room, walls, tol);
  return walls.filter((wall) => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      if (pointNearSegment(wall.start, a, b, tol) && pointNearSegment(wall.end, a, b, tol)) return true;
    }
    return false;
  });
}

/**
 * Exact enclosure for room focus / furnish: one wall per polygon edge, clipped to
 * the room corners so nothing sticks past. Reuses thickness/height/id from a
 * matching outline wall when available so openings stay attached.
 */
export function enclosureWallsForRoom(room: PlanRoomLabel, walls: Wall[], defaultHeight = 2.7, tol = 28): Wall[] {
  const pts = room.points;
  if (pts.length < 3) return [];
  const out: Wall[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const edgeLen = dist(a, b);
    let match: Wall | undefined;
    let bestScore = Infinity;
    for (const wall of walls) {
      const onEdge =
        pointNearSegment(wall.start, a, b, tol) && pointNearSegment(wall.end, a, b, tol);
      const midOnWall = pointNearSegment(mid, wall.start, wall.end, tol);
      if (!onEdge && !midOnWall) continue;
      const wallLen = dist(wall.start, wall.end);
      // Prefer walls whose length is closest to this edge (exact outline over long facades).
      const score = onEdge ? Math.abs(wallLen - edgeLen) : Math.abs(wallLen - edgeLen) + 50;
      if (score < bestScore) {
        bestScore = score;
        match = wall;
      }
    }
    out.push({
      id: match?.id ?? `${room.id}-edge-${i}`,
      start: { x: a.x, y: a.y },
      end: { x: b.x, y: b.y },
      thickness: match?.thickness ?? 0.15,
      height: match?.height ?? defaultHeight,
    });
  }
  return out;
}

/**
 * Which unit normal side of the wall is outside the room(s).
 * Returns +1 for the (+normal) side, -1 for the (−normal) side.
 * Normal is left-handed relative to start→end in plan pixels: (−dy, dx).
 */
export function wallExteriorSide(wall: Wall, rooms: PlanRoomLabel[], probePx = 28): 1 | -1 {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  const plus = { x: mid.x + nx * probePx, y: mid.y + ny * probePx };
  const minus = { x: mid.x - nx * probePx, y: mid.y - ny * probePx };
  const plusIn = rooms.some((r) => pointInPlanRoom(plus.x, plus.y, r));
  const minusIn = rooms.some((r) => pointInPlanRoom(minus.x, minus.y, r));
  if (plusIn && !minusIn) return -1;
  if (minusIn && !plusIn) return 1;
  // Ambiguous / no rooms: pick the side farther from room centroids (true outside).
  if (rooms.length) {
    const centroids = rooms.map((r) => {
      const pts = r.points;
      const cx = pts.reduce((s, p) => s + p.x, 0) / (pts.length || 1);
      const cy = pts.reduce((s, p) => s + p.y, 0) / (pts.length || 1);
      return { x: cx, y: cy };
    });
    const distSum = (p: Point) =>
      centroids.reduce((s, c) => s + Math.hypot(p.x - c.x, p.y - c.y), 0);
    return distSum(plus) >= distSum(minus) ? 1 : -1;
  }
  // Last resort — prefer north-ish outside on our plan plates.
  return -ny >= 0 ? 1 : -1;
}

export type WallDimPlacement = 'top' | 'bottom' | 'left' | 'right';
export type WallGrowSide = 'left' | 'right' | 'up' | 'down';

export type WallDimFieldLayout = {
  side: 1 | -1;
  /** Wall runs mostly along plan Y (up/down on screen). */
  verticalOnPlan: boolean;
  /** Where the dim card sits relative to the wall (always exterior). */
  placement: WallDimPlacement;
  /** Meters from wall centerline to card center (exterior). */
  cardOffsetM: number;
  /** Half-extents of the dim card in meters (for framing / no-overlap). */
  cardHalfAlongWallM: number;
  cardHalfAlongNormalM: number;
  /** @deprecated Use cardOffsetM — kept for older call sites. */
  sideOffsetM: number;
  endOffsetM: number;
  endExteriorM: number;
  dirX: number;
  dirY: number;
  nx: number;
  ny: number;
};

/**
 * Shared L/W/H card placement. One card sits fully outside the room, centered
 * on the wall’s exterior face (top / bottom / left / right).
 *
 * `cardOffsetM` is the distance from the wall centerline to the **card center**
 * in world meters (face + gap + half card). Html uses `center` on that point so
 * the near edge never lands on the wall at any zoom — CSS px nudges alone are
 * not enough when the plan is zoomed in on a wall.
 */
export function wallDimFieldLayout(wall: Wall, exteriorSide: 1 | -1): WallDimFieldLayout {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy) || 1;
  const dirX = dx / len;
  const dirY = dy / len;
  const nx = -dy / len;
  const ny = dx / len;
  const verticalOnPlan = Math.abs(dirY) >= Math.abs(dirX);
  const halfThick = Math.max(wall.thickness, 0.12) * 0.5;
  // At wall-focus zoom the Html card is ~160–180 CSS px; that can read as
  // ~1.6–2.0 m toward the wall. Budget the full half so the near edge clears.
  const cardHalfAlongWallM = verticalOnPlan ? 1.15 : 1.35;
  const cardHalfAlongNormalM = verticalOnPlan ? 2.05 : 1.85;
  const faceGap = 0.75;
  const cardOffsetM = halfThick + faceGap + cardHalfAlongNormalM;
  const ox = nx * exteriorSide;
  const oy = ny * exteriorSide;
  // North-up plan: −Y = top of screen, +Y = bottom, −X = left, +X = right.
  let placement: WallDimPlacement;
  if (Math.abs(ox) >= Math.abs(oy)) placement = ox >= 0 ? 'right' : 'left';
  else placement = oy >= 0 ? 'bottom' : 'top';
  return {
    side: exteriorSide,
    verticalOnPlan,
    placement,
    cardOffsetM,
    cardHalfAlongWallM,
    cardHalfAlongNormalM,
    sideOffsetM: cardOffsetM,
    endOffsetM: cardHalfAlongWallM + 0.2,
    endExteriorM: cardOffsetM,
    dirX,
    dirY,
    nx,
    ny,
  };
}

/** Which wall endpoint moves when growing toward a screen side (other end stays fixed). */
export function wallEndpointForGrowSide(wall: Wall, grow: WallGrowSide): 'start' | 'end' {
  if (grow === 'left') return wall.start.x <= wall.end.x ? 'start' : 'end';
  if (grow === 'right') return wall.start.x >= wall.end.x ? 'start' : 'end';
  if (grow === 'up') return wall.start.y <= wall.end.y ? 'start' : 'end';
  return wall.start.y >= wall.end.y ? 'start' : 'end';
}

/** Default grow side: extend the “farther east / south” end (common edit habit). */
export function defaultWallGrowSide(wall: Wall): WallGrowSide {
  const dx = Math.abs(wall.end.x - wall.start.x);
  const dy = Math.abs(wall.end.y - wall.start.y);
  return dy >= dx ? 'down' : 'right';
}

/** Point-in-polygon for plan-pixel coordinates (room focus furniture filter). */
export function pointInPlanRoom(x: number, y: number, room: PlanRoomLabel) {
  const pts = room.points;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi) inside = !inside;
  }
  return inside;
}
