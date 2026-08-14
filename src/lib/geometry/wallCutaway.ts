import type { Wall } from '../../types';
import { roomFloorCenter, wallFrame } from './placement';

/** Fully open cutaway — facing walls disappear so the interior is visible. */
export const CUTAWAY_MIN_OPACITY = 0;

/** Room floor centroid in world XZ — used to decide which wall face is outward. */
export function roomCenterWorld(walls: Wall[]) {
  return roomFloorCenter(walls);
}

/**
 * IKEA-style dollhouse cutaway: walls whose outward face points toward the camera
 * fade away so the interior stays visible.
 *
 * Uses the vector from the wall midpoint to the camera (not only room-center azimuth),
 * so close orbit angles still open the correct faces.
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
  // Open early so the two walls facing the lens clear the view.
  if (facing <= 0.05) return 1;
  if (facing >= 0.32) return CUTAWAY_MIN_OPACITY;
  const t = (facing - 0.05) / 0.27;
  const ease = t * t * (3 - 2 * t);
  return 1 - ease;
}
