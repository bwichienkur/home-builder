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
  /** Centered dollhouse orbit pose that fits the whole plate. */
  orbitPose: [number, number, number];
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

/** Orbit distance so the full AABB fits; camera sits on the +Z side looking at center. */
export function orbitViewPose(
  center: [number, number, number],
  span: number,
  opts?: { fovDeg?: number; pad?: number; elevDeg?: number },
): [number, number, number] {
  const fov = ((opts?.fovDeg ?? 48) * Math.PI) / 180;
  const elev = ((opts?.elevDeg ?? 32) * Math.PI) / 180;
  // Extra pad so 3D never feels corner-zoomed once chrome eats the edges.
  const pad = opts?.pad ?? 3.35;
  const half = (Math.max(span, 2) * 0.5) * pad;
  const dist = Math.max(10, half / Math.tan(fov / 2) / Math.max(0.35, Math.sin(elev)));
  return [center[0], dist * Math.sin(elev), center[2] + dist * Math.cos(elev)];
}

export function framingFromPoints(points: Point[], opts?: { pad?: number; minSpan?: number; minHeight?: number }): PlanFraming {
  if (!points.length) {
    const height = topViewHeight(8, { pad: opts?.pad, min: opts?.minHeight ?? 12 });
    const center: [number, number, number] = [0, 0, 0];
    return {
      center,
      span: 8,
      topHeight: height,
      topPose: [0, height, height * Math.tan(0.065)],
      orbitPose: orbitViewPose(center, 8, { pad: opts?.pad }),
    };
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
  // Match CameraRig top polar (~0.065 rad) so OrbitControls does not clamp and skew the plate.
  const zBias = topHeight * Math.tan(0.065);
  const center: [number, number, number] = [cx, 0, cz];
  return {
    center,
    span,
    topHeight,
    topPose: [cx, topHeight, cz + zBias],
    orbitPose: orbitViewPose(center, span, { pad: opts?.pad }),
  };
}

export function framingFromWalls(walls: Wall[], opts?: { pad?: number; minHeight?: number }): PlanFraming {
  const points = walls.flatMap((w) => [w.start, w.end]);
  return framingFromPoints(points, { minSpan: 3, minHeight: opts?.minHeight ?? 12, pad: opts?.pad });
}
