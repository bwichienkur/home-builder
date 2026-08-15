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

export type WallDimFieldLayout = {
  side: 1 | -1;
  /** Wall runs mostly along plan Y (up/down on screen) — chips need wider side clearance. */
  verticalOnPlan: boolean;
  /** Meters from wall centerline to L chip center (exterior). */
  sideOffsetM: number;
  /** Meters past each endpoint for W / H. */
  endOffsetM: number;
  /** Exterior nudge for W / H (meters). */
  endExteriorM: number;
  dirX: number;
  dirY: number;
  nx: number;
  ny: number;
};

/**
 * Shared L/W/H chip offsets. Html pills are wide (~1 m at focus zoom) and short (~0.4 m),
 * so vertical walls need much more exterior clearance than horizontal ones.
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
  // Screen-space pills ≈ 110×42 px ≈ 1.05×0.4 m at wall-focus zoom.
  const sideClear = verticalOnPlan ? 1.28 : 0.72;
  const sideOffsetM = Math.max(sideClear, wall.thickness * 0.5 + (verticalOnPlan ? 1.12 : 0.55));
  const endOffsetM = Math.max(verticalOnPlan ? 1.05 : 0.85, wall.thickness * 0.5 + 0.7);
  // Vertical: keep W/H fully outside (same clear as L). Horizontal: lighter end nudge.
  const endExteriorM = verticalOnPlan ? sideOffsetM : sideOffsetM * 0.55;
  return {
    side: exteriorSide,
    verticalOnPlan,
    sideOffsetM,
    endOffsetM,
    endExteriorM,
    dirX,
    dirY,
    nx,
    ny,
  };
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
