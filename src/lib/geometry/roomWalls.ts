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
