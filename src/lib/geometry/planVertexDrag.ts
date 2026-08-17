import type { Point } from '../../types';
import { PIXELS_PER_METER } from './snapping';

const INCH = 0.0254;
const FOOT = 0.3048;

/** R3F ortho: world meters per CSS pixel ≈ 1 / zoom. */
export function orthoMetersPerPixel(zoom: number): number {
  return 1 / Math.max(zoom, 1);
}

/** Grid step in plan pixels — coarser when zoomed out so corners don’t twitch. */
export function vertexSnapStepPx(zoom: number): number {
  const rawM = orthoMetersPerPixel(zoom) * 12;
  const stepM = rawM >= 0.22 ? FOOT : rawM >= 0.12 ? FOOT / 2 : rawM >= 0.05 ? INCH * 3 : INCH;
  return stepM * PIXELS_PER_METER;
}

export function snapPlanPoint(point: Point, snapPx: number): Point {
  const size = Math.max(snapPx, 1);
  return {
    x: Math.round(point.x / size) * size,
    y: Math.round(point.y / size) * size,
  };
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
  const magnetPx = orthoMetersPerPixel(zoom) * 16 * PIXELS_PER_METER;
  let { x, y } = snapPlanPoint(point, snapPx);
  for (const p of others) {
    if (Math.abs(p.x - point.x) <= magnetPx) x = p.x;
    if (Math.abs(p.y - point.y) <= magnetPx) y = p.y;
  }
  return { x, y };
}

/** Ignore sub-threshold pointer noise before the first committed move. */
export function vertexDragArmed(from: Point, to: Point, zoom: number, thresholdPx = 10): boolean {
  const meters = Math.hypot(to.x - from.x, to.y - from.y) / PIXELS_PER_METER;
  return meters * Math.max(zoom, 1) >= thresholdPx;
}

export function samePlanPoint(a: Point, b: Point, epsilonPx = 0.75): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < epsilonPx;
}

/** World-meter radius so a handle stays ~targetPx on screen. */
export function screenHandleMeters(zoom: number, targetPx: number, minM = 0.16, maxM = 0.62): number {
  const world = targetPx * orthoMetersPerPixel(zoom);
  return Math.min(maxM, Math.max(minM, world));
}
