import type { Wall } from '../../types';
import { roomFloorCenter, wallFrame } from './placement';

/**
 * Near-zero floor so camera-facing walls become see-through.
 * Kept tiny (not hard 0) so materials stay stable while lerping.
 */
export const CUTAWAY_MIN_OPACITY = 0.02;

/** Room floor centroid in world XZ — used to decide which wall face is outward. */
export function roomCenterWorld(walls: Wall[]) {
  return roomFloorCenter(walls);
}

/**
 * IKEA-style dollhouse cutaway: walls whose outward face points toward the camera
 * fade to nearly transparent so the interior stays visible.
 * Returns CUTAWAY_MIN_OPACITY–1; pair with temporal lerp while orbiting.
 */
export function wallCutawayOpacity(
  wall: Wall,
  cameraX: number,
  cameraZ: number,
  center: { x: number; z: number },
  enabled: boolean,
) {
  if (!enabled) return 1;
  const dx = cameraX - center.x;
  const dz = cameraZ - center.z;
  const len = Math.hypot(dx, dz);
  // Nearly overhead — keep every wall (Top / bird’s-eye).
  if (len < 0.4) return 1;

  const camX = dx / len;
  const camZ = dz / len;
  const frame = wallFrame(wall);
  const midX = (frame.start.x + frame.end.x) / 2;
  const midZ = (frame.start.z + frame.end.z) / 2;
  let nx = frame.normalX;
  let nz = frame.normalZ;
  // Flip so the normal points out of the room.
  if (nx * (midX - center.x) + nz * (midZ - center.z) < 0) {
    nx = -nx;
    nz = -nz;
  }
  const facing = nx * camX + nz * camZ;
  // Wide smoothstep across most of the hemisphere so orbit fades feel continuous.
  if (facing <= 0.02) return 1;
  if (facing >= 0.72) return CUTAWAY_MIN_OPACITY;
  const t = (facing - 0.02) / 0.7;
  const ease = t * t * (3 - 2 * t);
  return 1 - ease * (1 - CUTAWAY_MIN_OPACITY);
}
