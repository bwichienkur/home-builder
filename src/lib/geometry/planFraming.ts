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

export type FramingOpts = {
  /** Padding for top-down framing (defaults ~2.8). */
  pad?: number;
  /** Padding for orbit framing — kept separate so top chrome pad does not zoom 3D out. */
  orbitPad?: number;
  minSpan?: number;
  minHeight?: number;
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

/** Orbit distance so the full AABB fills the frame; camera sits on the +Z side looking at center. */
export function orbitViewPose(
  center: [number, number, number],
  span: number,
  opts?: { fovDeg?: number; pad?: number; elevDeg?: number },
): [number, number, number] {
  const fov = ((opts?.fovDeg ?? 50) * Math.PI) / 180;
  const elev = ((opts?.elevDeg ?? 38) * Math.PI) / 180;
  // Keep the plate large in frame — do not inherit top-view chrome padding.
  const pad = opts?.pad ?? 1.18;
  const half = (Math.max(span, 2) * 0.5) * pad;
  const dist = Math.max(5.5, half / Math.tan(fov / 2) / Math.max(0.48, Math.sin(elev)));
  return [center[0], dist * Math.sin(elev), center[2] + dist * Math.cos(elev)];
}

export function framingFromPoints(points: Point[], opts?: FramingOpts): PlanFraming {
  const orbitPad = opts?.orbitPad ?? 1.18;
  if (!points.length) {
    const height = topViewHeight(8, { pad: opts?.pad, min: opts?.minHeight ?? 12 });
    const center: [number, number, number] = [0, 0, 0];
    return {
      center,
      span: 8,
      topHeight: height,
      topPose: [0, height, height * Math.tan(0.065)],
      orbitPose: orbitViewPose(center, 8, { pad: orbitPad }),
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
    orbitPose: orbitViewPose(center, span, { pad: orbitPad }),
  };
}

export function framingFromWalls(walls: Wall[], opts?: FramingOpts): PlanFraming {
  const points = walls.flatMap((w) => [w.start, w.end]);
  return framingFromPoints(points, { minSpan: 3, minHeight: opts?.minHeight ?? 12, pad: opts?.pad, orbitPad: opts?.orbitPad });
}
