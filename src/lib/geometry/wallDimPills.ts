import { WORLD_ORIGIN } from './placement';
import { PIXELS_PER_METER } from './snapping';
import type { ElevationFace, Wall } from '../../types';
import { elevationFaceBasis, wallWorldFrame } from './elevationFace';

/** World-space dim type size — scales with the room, not the screen. */
export const DIM_FONT_M = 0.155;
/** Air gap from the wall face to the near edge of the pill. */
export const DIM_GAP_M = 0.14;

export type DimPlacement = 'top' | 'bottom' | 'left' | 'right';

export function dimPillSize(text: string, fontM = DIM_FONT_M): { w: number; h: number } {
  const w = Math.max(0.4, text.length * fontM * 0.52 + 0.14);
  const h = fontM * 1.72;
  return { w, h };
}

/** Half-extent along the outward normal for an axis-aligned (screen-upright) pill. */
export function planDimOutwardHalf(placement: DimPlacement, size: { w: number; h: number }): number {
  return placement === 'left' || placement === 'right' ? size.w / 2 : size.h / 2;
}

function roomCentroidWorld(roomPoints: { x: number; y: number }[]) {
  const n = roomPoints.length || 1;
  let cx = 0;
  let cz = 0;
  for (const p of roomPoints) {
    cx += (p.x - WORLD_ORIGIN.x) / PIXELS_PER_METER;
    cz += (p.y - WORLD_ORIGIN.y) / PIXELS_PER_METER;
  }
  return { cx: cx / n, cz: cz / n };
}

/**
 * Plan-view length pill: center sits clearly outside the wall.
 * Yaw is 0 (world +X) so type stays screen-upright; the renderer adds view yaw.
 */
export function planWallDimAnchor(opts: {
  midX: number;
  midZ: number;
  sx: number;
  sz: number;
  ex: number;
  ez: number;
  thickness: number;
  text: string;
  roomPoints?: { x: number; y: number }[];
}): {
  x: number;
  y: number;
  z: number;
  yaw: number;
  faceUp: boolean;
  w: number;
  h: number;
  placement: DimPlacement;
} {
  const length = Math.hypot(opts.ex - opts.sx, opts.ez - opts.sz) || 1;
  let nx = -(opts.ez - opts.sz) / length;
  let nz = (opts.ex - opts.sx) / length;
  if (opts.roomPoints && opts.roomPoints.length >= 3) {
    const { cx, cz } = roomCentroidWorld(opts.roomPoints);
    if (nx * (cx - opts.midX) + nz * (cz - opts.midZ) > 0) {
      nx = -nx;
      nz = -nz;
    }
  }
  const placement: DimPlacement =
    Math.abs(nx) >= Math.abs(nz) ? (nx >= 0 ? 'right' : 'left') : nz >= 0 ? 'bottom' : 'top';
  const { w, h } = dimPillSize(opts.text);
  const offsetM = Math.max(opts.thickness, 0.1) * 0.5 + DIM_GAP_M + planDimOutwardHalf(placement, { w, h });
  const x = opts.midX + nx * offsetM;
  const z = opts.midZ + nz * offsetM;
  return {
    x,
    y: 0.05,
    z,
    yaw: 0,
    faceUp: true,
    w,
    h,
    placement,
  };
}

/** Yaw so a +Z-facing plane looks at the elevation camera. */
export function elevationDimFacingYaw(face: ElevationFace): number {
  switch (face) {
    case 'front':
      return Math.PI;
    case 'back':
      return 0;
    case 'left':
      return Math.PI / 2;
    case 'right':
      return -Math.PI / 2;
  }
}

/**
 * Front-view pill centers: height to the left of the wall, length below the floor.
 * Origins are the pill centers (already outside the wall body).
 */
export function elevationDimPillAnchors(
  wall: Wall,
  face: ElevationFace,
  labels: { widthText: string; heightText: string },
) {
  const frame = wallWorldFrame(wall);
  const b = elevationFaceBasis(face);
  const towardCam = 0.05;
  const widthSize = dimPillSize(labels.widthText);
  const heightSize = dimPillSize(labels.heightText);
  const yaw = elevationDimFacingYaw(face);
  return {
    width: {
      x: frame.x + b.camX * towardCam,
      y: -(DIM_GAP_M + widthSize.h / 2),
      z: frame.z + b.camZ * towardCam,
      yaw,
      w: widthSize.w,
      h: widthSize.h,
    },
    height: {
      x: frame.x - b.rightX * (frame.len / 2 + DIM_GAP_M + heightSize.w / 2) + b.camX * towardCam,
      y: wall.height / 2,
      z: frame.z - b.rightZ * (frame.len / 2 + DIM_GAP_M + heightSize.w / 2) + b.camZ * towardCam,
      yaw,
      w: heightSize.w,
      h: heightSize.h,
    },
  };
}
