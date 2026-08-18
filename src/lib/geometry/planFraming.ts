import type { CameraMode, Point, Wall } from '../../types';
import { WORLD_ORIGIN } from './placement';
import { wallDimFieldLayout } from './roomWalls';
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
  /**
   * Exterior unit normal side of the wall (+1 / −1, left of start→end).
   * When set, label padding is biased outside the room so L/W/H stay in frame.
   */
  exteriorSide?: 1 | -1;
};

function world(x: number, y: number): [number, number] {
  return [(x - WORLD_ORIGIN.x) / PIXELS_PER_METER, (y - WORLD_ORIGIN.y) / PIXELS_PER_METER];
}

/** Camera height so a plan of `span` meters fits in a top-down FOV with UI padding. */
export function topViewHeight(span: number, opts?: { fovDeg?: number; pad?: number; min?: number }) {
  const fov = ((opts?.fovDeg ?? 42) * Math.PI) / 180;
  const pad = opts?.pad ?? 2.45;
  const min = opts?.min ?? 9;
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
  const pad = opts?.pad ?? 1.4;
  const half = (Math.max(span, 2) * 0.5) * pad;
  const dist = Math.max(5.5, half / Math.tan(fov / 2) / Math.max(0.48, Math.sin(elev)));
  return [center[0], dist * Math.sin(elev), center[2] + dist * Math.cos(elev)];
}

export function framingFromPoints(points: Point[], opts?: FramingOpts): PlanFraming {
  const orbitPad = opts?.orbitPad ?? 1.4;
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

/** Frame a single wall so it fills the free viewport (plan edit focus). */
export function framingFromWall(wall: Wall, opts?: FramingOpts): PlanFraming {
  const start = world(wall.start.x, wall.start.y);
  const end = world(wall.end.x, wall.end.y);
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz) || 1;
  const dirX = dx / length;
  const dirZ = dz / length;
  const nx = -dz / length;
  const nz = dx / length;
  const side = opts?.exteriorSide;
  const layout = wallDimFieldLayout(wall, side === 1 || side === -1 ? side : 1);
  // Card center + half extents + spare margin so the whole dim card stays in frame.
  const chipPad = 1.15;
  const cardNear = layout.cardOffsetM - layout.cardHalfAlongNormalM;
  const cardFar = layout.cardOffsetM + layout.cardHalfAlongNormalM + chipPad;
  const alongPad = layout.cardHalfAlongWallM + chipPad;
  const halfThick = Math.max(wall.thickness, 0.12) * 0.5 + 0.25;
  const px = PIXELS_PER_METER;
  const midX = (wall.start.x + wall.end.x) / 2;
  const midY = (wall.start.y + wall.end.y) / 2;
  const s = side === 1 || side === -1 ? side : 1;
  const corners: Point[] = [
    // Wall body (thin pad so the wall itself stays visible).
    { x: wall.start.x + nx * halfThick * px, y: wall.start.y + nz * halfThick * px },
    { x: wall.start.x - nx * halfThick * px, y: wall.start.y - nz * halfThick * px },
    { x: wall.end.x + nx * halfThick * px, y: wall.end.y + nz * halfThick * px },
    { x: wall.end.x - nx * halfThick * px, y: wall.end.y - nz * halfThick * px },
    // Dim card AABB fully outside the room (near edge, far edge, along span).
    {
      x: midX + nx * s * cardNear * px + dirX * alongPad * px,
      y: midY + nz * s * cardNear * px + dirZ * alongPad * px,
    },
    {
      x: midX + nx * s * cardNear * px - dirX * alongPad * px,
      y: midY + nz * s * cardNear * px - dirZ * alongPad * px,
    },
    {
      x: midX + nx * s * cardFar * px + dirX * alongPad * px,
      y: midY + nz * s * cardFar * px + dirZ * alongPad * px,
    },
    {
      x: midX + nx * s * cardFar * px - dirX * alongPad * px,
      y: midY + nz * s * cardFar * px - dirZ * alongPad * px,
    },
  ];
  const minSpan = Math.max(length * 1.35, layout.verticalOnPlan ? 4.2 : 3.6);
  return framingFromPoints(corners, {
    minSpan,
    minHeight: opts?.minHeight ?? 6.5,
    pad: opts?.pad ?? 2.35,
    orbitPad: opts?.orbitPad ?? 1.15,
  });
}

export type ChromeFit = {
  /** Full canvas CSS pixels. */
  width: number;
  height: number;
  /** Right overlay width (rail or inspector), not including gutter. */
  rightChromePx: number;
  /** Extra clear space between content and the right chrome. */
  gutterPx?: number;
  /** Top floating chrome (menu / breadcrumb). */
  topChromePx?: number;
  /** Bottom dock + browser chrome. */
  bottomChromePx?: number;
};

/**
 * Zoom scale so a plate centered on the FULL page still clears the right chrome.
 *
 * No lateral shift — the look target stays on the geometric page center.
 * Because the rail only covers the right side, a page-centered plate can only
 * grow to `width - 2 * rightReserve` before its right edge goes under the bar.
 */
export function pageCenterFit(chrome: ChromeFit) {
  const W = Math.max(1, chrome.width);
  const H = Math.max(1, chrome.height);
  const gutter = chrome.gutterPx ?? 0;
  const right = Math.max(0, chrome.rightChromePx) + gutter;
  const top = Math.max(0, chrome.topChromePx ?? 0);
  const bottom = Math.max(0, chrome.bottomChromePx ?? 0);
  // Nearly fill the free band left of the rail. Reserve the rail on both sides of a
  // page-centered plate so the room does not sit under the overlay.
  const maxPlateW = Math.max(140, W - right * 2);
  const freeH = Math.max(160, H - top - bottom);
  const widthScale = W / maxPlateW;
  const heightScale = H / freeH;
  const padScale = Math.max(widthScale, heightScale, 1);
  return {
    maxPlateW,
    freeW: maxPlateW,
    freeH,
    rightReserve: right,
    padScale,
    shiftFraction: 0,
  };
}

/**
 * Zoom + shift so the plate is centered in the free rectangle LEFT of a wide
 * overlay (edit inspector). Use this when the panel covers too much of the
 * page for page-centering to keep the room visible.
 */
export function freeAreaFit(chrome: ChromeFit) {
  const W = Math.max(1, chrome.width);
  const H = Math.max(1, chrome.height);
  const gutter = chrome.gutterPx ?? 0;
  const right = Math.max(0, chrome.rightChromePx) + gutter;
  const top = Math.max(0, chrome.topChromePx ?? 0);
  const bottom = Math.max(0, chrome.bottomChromePx ?? 0);
  const freeW = Math.max(120, W - right);
  const freeH = Math.max(160, H - top - bottom);
  const padScale = Math.max(W / freeW, H / freeH, 1);
  return {
    maxPlateW: freeW,
    freeW,
    freeH,
    rightReserve: right,
    padScale,
    /** rightReserve / (2W) — pair with worldShiftForFreeArea (positive X). */
    shiftFraction: right / (2 * W),
  };
}

/**
 * World X offset for camera + look target so content sits on the free-area
 * center line. Positive X pans the view so fixed content slides LEFT on screen.
 */
export function worldShiftForFreeArea(shiftFraction: number, cameraDist: number, fovDeg: number, aspect: number) {
  const fov = (fovDeg * Math.PI) / 180;
  const visibleW = 2 * Math.tan(fov / 2) * Math.max(cameraDist, 0.01) * Math.max(aspect, 0.35);
  return shiftFraction * visibleW;
}

/**
 * Plan/Front chrome: stay page-centered for the slim black rail (zoom out so
 * dims clear it). Only pan into the free band for a wide inspector or wall card.
 */
export function planChromeFit(opts: {
  width: number;
  height: number;
  coarse?: boolean;
  inspectorOpen?: boolean;
  showRightRail?: boolean;
  mode: CameraMode;
  frameRoom?: boolean;
  focusWall?: boolean;
  /** W/D/H row is in the dock — reserve extra bottom chrome. */
  dimTray?: boolean;
}) {
  const coarse = !!opts.coarse;
  const inspectorOpen = !!opts.inspectorOpen;
  const showElevDims = opts.mode === 'elevation' && !inspectorOpen && !opts.focusWall;
  const showPlanDims = (!!opts.frameRoom && opts.mode !== 'elevation') || showElevDims;
  const dimVertPx = showPlanDims ? (opts.mode === 'elevation' ? 36 : 34) : 0;
  const dimTrayPx = opts.dimTray ? (coarse ? 44 : 36) : 0;
  const topChromePx = (coarse ? 112 : 88) + dimVertPx;
  const bottomChromePx = (coarse ? 128 : 100) + dimVertPx + dimTrayPx;
  const railPx = opts.showRightRail ? 86 : 0;
  const gutterPx = railPx ? (coarse ? 18 : 12) : 0;
  if (inspectorOpen || opts.focusWall) {
    const rightChromePx = inspectorOpen ? Math.min(260, Math.round(opts.width * 0.44)) : railPx;
    return freeAreaFit({
      width: opts.width,
      height: opts.height,
      rightChromePx,
      gutterPx: inspectorOpen ? (coarse ? 12 : 10) : gutterPx,
      topChromePx,
      bottomChromePx,
    });
  }
  return pageCenterFit({
    width: opts.width,
    height: opts.height,
    rightChromePx: railPx,
    gutterPx,
    topChromePx,
    bottomChromePx,
  });
}
