import type { Point, Wall } from '../../types';
import { WORLD_ORIGIN } from './placement';
import { PIXELS_PER_METER } from './snapping';

export type PlanFraming = {
  center: [number, number, number];
  span: number;
  /** Safe head-on camera height for top view (meters). */
  topHeight: number;
  /** Tiny Z offset so lookAt is not parallel to world up (avoids blank/NaN views). */
  topPose: [number, number, number];
};

function world(x: number, y: number): [number, number] {
  return [(x - WORLD_ORIGIN.x) / PIXELS_PER_METER, (y - WORLD_ORIGIN.y) / PIXELS_PER_METER];
}

/** Camera height so a plan of `span` meters fits in a top-down FOV with UI padding. */
export function topViewHeight(span: number, opts?: { fovDeg?: number; pad?: number; min?: number }) {
  const fov = ((opts?.fovDeg ?? 42) * Math.PI) / 180;
  const pad = opts?.pad ?? 2.8;
  const min = opts?.min ?? 10;
  const half = (Math.max(span, 2) * 0.5) * pad;
  return Math.max(min, half / Math.tan(fov / 2));
}

export function framingFromPoints(points: Point[], opts?: { pad?: number; minSpan?: number; minHeight?: number }): PlanFraming {
  if (!points.length) {
    const height = topViewHeight(8, { pad: opts?.pad, min: opts?.minHeight ?? 12 });
    return { center: [0, 0, 0], span: 8, topHeight: height, topPose: [0, height, 0.05] };
  }
  const worldPts = points.map((p) => world(p.x, p.y));
  const xs = worldPts.map((p) => p[0]);
  const zs = worldPts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const span = Math.max(maxX - minX, maxZ - minZ, opts?.minSpan ?? 3);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const topHeight = topViewHeight(span, { pad: opts?.pad, min: opts?.minHeight ?? 10 });
  // Keep a small Z offset so the camera never sits exactly on the look-at axis.
  const zBias = Math.max(0.08, span * 0.004);
  return {
    center: [cx, 0, cz],
    span,
    topHeight,
    topPose: [cx, topHeight, cz + zBias],
  };
}

export function framingFromWalls(walls: Wall[], opts?: { pad?: number; minHeight?: number }): PlanFraming {
  const points = walls.flatMap((w) => [w.start, w.end]);
  return framingFromPoints(points, { minSpan: 3, minHeight: opts?.minHeight ?? 12, pad: opts?.pad });
}
