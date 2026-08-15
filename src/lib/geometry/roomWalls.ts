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
  if (!rooms.length) return 1;
  // Fallback — prefer north-ish outside on our plan plates.
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
  // Card ~180×160 CSS px ≈ 1.6×1.4 m at tight wall-focus zoom — pad past that.
  const cardHalfAlongWallM = verticalOnPlan ? 0.95 : 1.15;
  const cardHalfAlongNormalM = verticalOnPlan ? 1.25 : 1.05;
  const faceGap = 0.55;
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
