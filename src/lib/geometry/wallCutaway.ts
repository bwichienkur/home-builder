import type { Wall } from '../../types';
import { roomFloorCenter, wallFrame } from './placement';

/** Room floor centroid in world XZ — used to decide which wall face is outward. */
export function roomCenterWorld(walls: Wall[]) {
  return roomFloorCenter(walls);
}

/**
 * IKEA-style dollhouse cutaway: walls whose outward face points toward the camera
 * fade out so the interior stays visible. Returns 0–1 opacity.
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
  if (facing <= 0.08) return 1;
  if (facing >= 0.28) return 0;
  return 1 - (facing - 0.08) / 0.2;
}
