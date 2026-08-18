import type { Point } from '../../types';
import { PIXELS_PER_METER } from './snapping';

const INCH = 0.0254;

/** R3F ortho: world meters per CSS pixel ≈ 1 / zoom. */
export function orthoMetersPerPixel(zoom: number): number {
  return 1 / Math.max(zoom, 1);
}

/** Grid step in plan pixels — stay fine even when zoomed out so corners don’t jump. */
export function vertexSnapStepPx(zoom: number): number {
  const rawM = orthoMetersPerPixel(zoom) * 10;
  const stepM = rawM >= 0.08 ? INCH * 3 : INCH;
  return stepM * PIXELS_PER_METER;
}

export function snapPlanPoint(point: Point, snapPx: number): Point {
  const size = Math.max(snapPx, 1);
  return {
    x: Math.round(point.x / size) * size,
    y: Math.round(point.y / size) * size,
  };
}

/** Pointer → vertex gain. 1:1 so the corner follows the cursor. */
export function vertexDragGain(_zoom?: number): number {
  return 1;
}

export const VERTEX_DRAG_MAX_M = Infinity;

/** @deprecated travel is no longer capped — corners follow the pointer. */
export function clampVertexDragTravel(start: Point, next: Point, _maxM = VERTEX_DRAG_MAX_M): Point {
  void start;
  return next;
}

export type VertexDragAxis = 'x' | 'y';

/** Lock to the dominant axis once the pointer has a clear direction. */
export function vertexDragAxisLock(from: Point, to: Point, zoom: number, thresholdPx = 10): VertexDragAxis | null {
  const meters = Math.hypot(to.x - from.x, to.y - from.y) / PIXELS_PER_METER;
  if (meters * Math.max(zoom, 1) < thresholdPx) return null;
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? 'x' : 'y';
}

export function lockVertexDragAxis(start: Point, next: Point, axis: VertexDragAxis): Point {
  return axis === 'x' ? { x: next.x, y: start.y } : { x: start.x, y: next.y };
}

/** Apply 1:1 travel, optional Shift axis lock, then snap. */
export function applyVertexDrag(opts: {
  anchor: Point;
  startPointer: Point;
  pointer: Point;
  others: Point[];
  zoom: number;
  axis: VertexDragAxis | null;
  /** Hold Shift to lock to the dominant axis. */
  lockAxis?: boolean;
}): { point: Point; axis: VertexDragAxis | null } {
  const gain = vertexDragGain(opts.zoom);
  let point: Point = {
    x: opts.anchor.x + (opts.pointer.x - opts.startPointer.x) * gain,
    y: opts.anchor.y + (opts.pointer.y - opts.startPointer.y) * gain,
  };
  let axis: VertexDragAxis | null = null;
  if (opts.lockAxis) {
    axis = opts.axis ?? vertexDragAxisLock(opts.anchor, point, opts.zoom);
    if (axis) point = lockVertexDragAxis(opts.anchor, point, axis);
  }
  point = snapVertexDrag(point, opts.others, opts.zoom);
  return { point, axis };
}

/**
 * Snap a dragged corner to the zoom grid and to other vertices’ X/Y
 * so walls stay straight without pixel-level jitter.
 */
export function snapVertexDrag(
  point: Point,
  others: Point[],
  zoom: number,
): Point {
  const snapPx = vertexSnapStepPx(zoom);
  const magnetPx = Math.min(orthoMetersPerPixel(zoom) * 10, 0.06) * PIXELS_PER_METER;
  let { x, y } = snapPlanPoint(point, snapPx);
  for (const p of others) {
    if (Math.abs(p.x - point.x) <= magnetPx) x = p.x;
    if (Math.abs(p.y - point.y) <= magnetPx) y = p.y;
  }
  return { x, y };
}

/** Ignore sub-threshold pointer noise before the first committed move. */
export function vertexDragArmed(from: Point, to: Point, zoom: number, thresholdPx = 8): boolean {
  const meters = Math.hypot(to.x - from.x, to.y - from.y) / PIXELS_PER_METER;
  return meters * Math.max(zoom, 1) >= thresholdPx;
}

/**
 * World offset from the wall centerline to the exterior face.
 * Dim pills are then parked in CSS so they stay outside at every zoom.
 */
export function wallDimFaceOffset(thicknessM = 0.15, gapM = 0.06): number {
  return Math.max(thicknessM, 0.1) * 0.5 + gapM;
}

/** @deprecated use wallDimFaceOffset — zoom no longer affects the dim origin. */
export function wallDimWorldOffset(_zoom?: number, thicknessM = 0.15): number {
  return wallDimFaceOffset(thicknessM);
}

export function samePlanPoint(a: Point, b: Point, epsilonPx = 0.75): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < epsilonPx;
}

/** World-meter radius so a handle stays ~targetPx on screen. */
export function screenHandleMeters(zoom: number, targetPx: number, minM = 0.14, maxM = 0.38): number {
  const world = targetPx * orthoMetersPerPixel(zoom);
  return Math.min(maxM, Math.max(minM, world));
}

/**
 * Unit outward bisector at a polygon corner (plan space). Used to park
 * drag handles outside the room instead of on top of the vertex.
 */
export function exteriorCornerDir(
  prev: Point,
  point: Point,
  next: Point,
  centroid: Point,
): { x: number; y: number } {
  const ax = prev.x - point.x;
  const ay = prev.y - point.y;
  const bx = next.x - point.x;
  const by = next.y - point.y;
  const al = Math.hypot(ax, ay) || 1;
  const bl = Math.hypot(bx, by) || 1;
  let ox = ax / al + bx / bl;
  let oy = ay / al + by / bl;
  let ol = Math.hypot(ox, oy);
  if (ol < 1e-4) {
    ox = -ay / al;
    oy = ax / al;
    ol = 1;
  }
  ox /= ol;
  oy /= ol;
  if (ox * (point.x - centroid.x) + oy * (point.y - centroid.y) < 0) {
    ox = -ox;
    oy = -oy;
  }
  return { x: ox, y: oy };
}
