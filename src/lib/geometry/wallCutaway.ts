import type { Wall } from '../../types';
import { roomFloorCenter, wallFrame } from './placement';

/** Fully open cutaway — facing walls disappear so the interior is visible. */
export const CUTAWAY_MIN_OPACITY = 0;

/**
 * Facing·toCamera where the dissolve begins (≈ edge-on).
 * Keep near 0 so walls stay solid until they actually turn toward the lens.
 */
export const CUTAWAY_FADE_START = 0;

/**
 * Facing·toCamera where the wall is fully open.
 * Wider than the old ~0.42 band so dissolves cream across a longer orbit arc,
 * while still clearing on a typical corner dollhouse view.
 */
export const CUTAWAY_FADE_END = 0.52;

/** Quintic smootherstep — flatter at the ends, creamier mid fade than smoothstep. */
export function cutawayEase(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Room floor centroid in world XZ — used to decide which wall face is outward. */
export function roomCenterWorld(walls: Wall[]) {
  return roomFloorCenter(walls);
}

/**
 * IKEA-style dollhouse cutaway: walls whose outward face points toward the camera
 * fade away so the interior stays visible.
 *
 * Uses the vector from the wall midpoint to the camera (not only room-center azimuth),
 * so close orbit angles still open the correct faces. Opacity is a wide, eased ramp —
 * temporal smoothing in the scene hook finishes the creamy feel.
 */
export function wallCutawayOpacity(
  wall: Wall,
  cameraX: number,
  cameraZ: number,
  center: { x: number; z: number },
  enabled: boolean,
) {
  if (!enabled) return 1;
  const frame = wallFrame(wall);
  const midX = (frame.start.x + frame.end.x) / 2;
  const midZ = (frame.start.z + frame.end.z) / 2;

  // Direction from wall toward camera on the ground plane.
  let toCamX = cameraX - midX;
  let toCamZ = cameraZ - midZ;
  let len = Math.hypot(toCamX, toCamZ);
  // Nearly overhead relative to this wall — keep it solid.
  if (len < 0.35) return 1;
  toCamX /= len;
  toCamZ /= len;

  let nx = frame.normalX;
  let nz = frame.normalZ;
  // Flip so the normal points out of the room.
  if (nx * (midX - center.x) + nz * (midZ - center.z) < 0) {
    nx = -nx;
    nz = -nz;
  }

  const facing = nx * toCamX + nz * toCamZ;
  if (facing <= CUTAWAY_FADE_START) return 1;
  if (facing >= CUTAWAY_FADE_END) return CUTAWAY_MIN_OPACITY;
  const t = (facing - CUTAWAY_FADE_START) / (CUTAWAY_FADE_END - CUTAWAY_FADE_START);
  return 1 - cutawayEase(t);
}
