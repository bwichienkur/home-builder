import type { FurnitureItem, Opening, Wall } from '../../types';
import { WORLD_ORIGIN } from './placement';
import { PIXELS_PER_METER } from './snapping';

function world(x: number, y: number): [number, number] {
  return [(x - WORLD_ORIGIN.x) / PIXELS_PER_METER, (y - WORLD_ORIGIN.y) / PIXELS_PER_METER];
}

export type DoorSwingZone = {
  openingId: string;
  /** Axis-aligned box for the clear space in front of the door. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

/**
 * Floor footprint kept clear for a door: a rectangle the door’s width along the
 * wall and the door’s width into the room (face in/out). Hinge side does not
 * change the blocked area — only which way the leaf visually swings.
 */
export function doorSwingZones(openings: Opening[], walls: Wall[]): DoorSwingZone[] {
  const zones: DoorSwingZone[] = [];
  for (const o of openings) {
    if (o.type !== 'door' || !o.swing || o.swing === 'none') continue;
    const wall = walls.find((w) => w.id === o.wallId);
    if (!wall) continue;
    const [sx, sz] = world(wall.start.x, wall.start.y);
    const [ex, ez] = world(wall.end.x, wall.end.y);
    const len = Math.hypot(ex - sx, ez - sz) || 1;
    const ux = (ex - sx) / len;
    const uz = (ez - sz) / len;
    const faceSign = o.face === 'out' ? -1 : 1;
    const nx = -uz * faceSign;
    const nz = ux * faceSign;
    const midX = sx + (ex - sx) * o.offset;
    const midZ = sz + (ez - sz) * o.offset;
    const half = o.width / 2;
    const depth = o.width;
    const corners = [
      { x: midX - ux * half, z: midZ - uz * half },
      { x: midX + ux * half, z: midZ + uz * half },
      { x: midX - ux * half + nx * depth, z: midZ - uz * half + nz * depth },
      { x: midX + ux * half + nx * depth, z: midZ + uz * half + nz * depth },
    ];
    zones.push({
      openingId: o.id,
      minX: Math.min(...corners.map((c) => c.x)),
      maxX: Math.max(...corners.map((c) => c.x)),
      minZ: Math.min(...corners.map((c) => c.z)),
      maxZ: Math.max(...corners.map((c) => c.z)),
    });
  }
  return zones;
}

export function furnitureHitsDoorSwing(
  item: Pick<FurnitureItem, 'x' | 'z' | 'width' | 'depth' | 'rotation'>,
  zones: DoorSwingZone[],
): boolean {
  const c = Math.abs(Math.cos(item.rotation));
  const s = Math.abs(Math.sin(item.rotation));
  const halfW = (item.width * c + item.depth * s) / 2;
  const halfD = (item.width * s + item.depth * c) / 2;
  const minX = item.x - halfW;
  const maxX = item.x + halfW;
  const minZ = item.z - halfD;
  const maxZ = item.z + halfD;
  return zones.some(
    (z) => !(maxX < z.minX || minX > z.maxX || maxZ < z.minZ || minZ > z.maxZ),
  );
}

/** Net wall face area (m²) after subtracting openings — for BOM / material estimates. */
export function wallNetAreaM2(wall: Wall, openings: Opening[]): number {
  const len =
    Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) / PIXELS_PER_METER;
  const gross = len * wall.height;
  const hole = openings
    .filter((o) => o.wallId === wall.id)
    .reduce((sum, o) => sum + o.width * o.height, 0);
  return Math.max(0, gross - hole);
}

export function wallsNetAreaM2(walls: Wall[], openings: Opening[]): number {
  return walls.reduce((sum, w) => sum + wallNetAreaM2(w, openings), 0);
}
