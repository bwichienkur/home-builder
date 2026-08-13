import type { FurnitureItem, Opening, Point, Wall } from '../../types';
import { PIXELS_PER_METER } from './snapping';

export const WORLD_ORIGIN = { x: 420, y: 330 };

export type MountingType = 'floor' | 'wall' | 'ceiling';

export type GuideLine = {
  kind: 'align-x' | 'align-z' | 'gap';
  a: [number, number, number];
  b: [number, number, number];
  label?: string;
};

export function planToWorld(point: Point): { x: number; z: number } {
  return { x: (point.x - WORLD_ORIGIN.x) / PIXELS_PER_METER, z: (point.y - WORLD_ORIGIN.y) / PIXELS_PER_METER };
}

export function worldToPlan(x: number, z: number): Point {
  return { x: x * PIXELS_PER_METER + WORLD_ORIGIN.x, y: z * PIXELS_PER_METER + WORLD_ORIGIN.y };
}

export function wallFrame(wall: Wall) {
  const start = planToWorld(wall.start);
  const end = planToWorld(wall.end);
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz) || 1;
  const dirX = dx / length;
  const dirZ = dz / length;
  const normalX = -dirZ;
  const normalZ = dirX;
  const angle = -Math.atan2(dz, dx);
  return { start, end, length, dirX, dirZ, normalX, normalZ, angle };
}

export function pointOnWall(wall: Wall, offset: number, inset = 0) {
  const frame = wallFrame(wall);
  const t = Math.max(0, Math.min(1, offset));
  return {
    ...frame,
    x: frame.start.x + frame.dirX * frame.length * t + frame.normalX * inset,
    z: frame.start.z + frame.dirZ * frame.length * t + frame.normalZ * inset,
    rotation: frame.angle,
  };
}

export function nearestWall(x: number, z: number, walls: Wall[], maxDistance = 1.25) {
  let best: { wall: Wall; distance: number; offset: number; inset: number; point: ReturnType<typeof pointOnWall> } | null = null;
  for (const wall of walls) {
    const frame = wallFrame(wall);
    const vx = x - frame.start.x;
    const vz = z - frame.start.z;
    const along = Math.max(0, Math.min(frame.length, vx * frame.dirX + vz * frame.dirZ));
    const offset = along / frame.length;
    const closestX = frame.start.x + frame.dirX * along;
    const closestZ = frame.start.z + frame.dirZ * along;
    const side = (x - closestX) * frame.normalX + (z - closestZ) * frame.normalZ;
    const distance = Math.abs(side);
    if (distance > maxDistance) continue;
    if (!best || distance < best.distance) {
      best = {
        wall,
        distance,
        offset,
        inset: side,
        point: pointOnWall(wall, offset, 0),
      };
    }
  }
  return best;
}

export function snapFloorPosition(x: number, z: number, step = 0.25) {
  return { x: Math.round(x / step) * step, z: Math.round(z / step) * step };
}

export type PlacementConstraint = 'free' | 'wall' | 'wall-prefer';

/** IKEA-style product limits: mirrors stay on walls; beds free; storage docks to walls when near. */
export function placementConstraint(mounting?: string, category?: string, name?: string): PlacementConstraint {
  const m = resolveMountingType(mounting);
  if (m === 'wall') return 'wall';
  if (m === 'ceiling') return 'free';
  const hay = `${category ?? ''} ${name ?? ''}`.toLowerCase();
  if (
    hay.includes('storage') ||
    hay.includes('cabinetry') ||
    hay.includes('wardrobe') ||
    hay.includes('drawer') ||
    hay.includes('bookcase') ||
    hay.includes('cabinet') ||
    hay.includes('shelf') ||
    hay.includes('vanity')
  ) {
    return 'wall-prefer';
  }
  return 'free';
}

/** Snap a product to the nearest wall face, keeping depth clear of the wall thickness. */
export function snapToWallSurface(
  x: number,
  z: number,
  walls: Wall[],
  depth: number,
  mounting: MountingType = 'wall',
  maxDistance = mounting === 'wall' ? 12 : 1.5,
) {
  if (!walls.length) return { ...snapFloorPosition(x, z), wallId: null as string | null, wallOffset: null as number | null, rotation: undefined as number | undefined };
  const hit = nearestWall(x, z, walls, maxDistance);
  if (!hit) return { ...snapFloorPosition(x, z), wallId: null, wallOffset: null, rotation: undefined };
  const inset = hit.wall.thickness / 2 + depth / 2 + 0.01;
  // Prefer the room-facing side (positive inset from the hit, else flip)
  const side = hit.inset >= 0 ? 1 : -1;
  const placed = pointOnWall(hit.wall, hit.offset, side * inset);
  return {
    x: placed.x,
    z: placed.z,
    rotation: placed.rotation + (side < 0 ? Math.PI : 0),
    wallId: hit.wall.id,
    wallOffset: hit.offset,
  };
}

export function constrainPlacement(
  x: number,
  z: number,
  walls: Wall[],
  depth: number,
  opts: { mountingType?: string; category?: string; name?: string; rotation?: number; live?: boolean },
) {
  const constraint = placementConstraint(opts.mountingType, opts.category, opts.name);
  if (constraint === 'wall') {
    const snapped = snapToWallSurface(x, z, walls, depth, 'wall', 12);
    return { ...snapped, rotation: snapped.rotation ?? opts.rotation ?? 0, constraint };
  }
  if (constraint === 'wall-prefer') {
    const near = nearestWall(x, z, walls, opts.live ? 0.85 : 0.55);
    if (near) {
      const snapped = snapToWallSurface(x, z, walls, depth, 'wall', 1.2);
      return { ...snapped, rotation: snapped.rotation ?? opts.rotation ?? 0, constraint };
    }
  }
  const floor = opts.live ? { x, z } : snapFloorPosition(x, z);
  return { ...floor, wallId: null as string | null, wallOffset: null as number | null, rotation: opts.rotation, constraint };
}

export function furnitureBounds(item: Pick<FurnitureItem, 'x' | 'z' | 'width' | 'depth' | 'rotation'>) {
  const c = Math.abs(Math.cos(item.rotation));
  const s = Math.abs(Math.sin(item.rotation));
  const halfW = (item.width * c + item.depth * s) / 2;
  const halfD = (item.width * s + item.depth * c) / 2;
  return {
    minX: item.x - halfW,
    maxX: item.x + halfW,
    minZ: item.z - halfD,
    maxZ: item.z + halfD,
  };
}

export function alignmentGuides(selected: FurnitureItem, others: FurnitureItem[], threshold = 0.08): GuideLine[] {
  const guides: GuideLine[] = [];
  const a = furnitureBounds(selected);
  for (const other of others) {
    if (other.id === selected.id) continue;
    const b = furnitureBounds(other);
    const centersX = Math.abs(selected.x - other.x) <= threshold;
    const centersZ = Math.abs(selected.z - other.z) <= threshold;
    const left = Math.abs(a.minX - b.minX) <= threshold || Math.abs(a.minX - b.maxX) <= threshold;
    const right = Math.abs(a.maxX - b.maxX) <= threshold || Math.abs(a.maxX - b.minX) <= threshold;
    const top = Math.abs(a.minZ - b.minZ) <= threshold || Math.abs(a.minZ - b.maxZ) <= threshold;
    const bottom = Math.abs(a.maxZ - b.maxZ) <= threshold || Math.abs(a.maxZ - b.minZ) <= threshold;

    if (centersX || left || right) {
      const x = centersX ? selected.x : left ? a.minX : a.maxX;
      guides.push({
        kind: 'align-x',
        a: [x, 0.02, Math.min(a.minZ, b.minZ) - 0.2],
        b: [x, 0.02, Math.max(a.maxZ, b.maxZ) + 0.2],
      });
    }
    if (centersZ || top || bottom) {
      const z = centersZ ? selected.z : top ? a.minZ : a.maxZ;
      guides.push({
        kind: 'align-z',
        a: [Math.min(a.minX, b.minX) - 0.2, 0.02, z],
        b: [Math.max(a.maxX, b.maxX) + 0.2, 0.02, z],
      });
    }

    const gapX = Math.min(Math.abs(a.maxX - b.minX), Math.abs(b.maxX - a.minX));
    const overlapZ = !(a.maxZ < b.minZ || b.maxZ < a.minZ);
    if (overlapZ && gapX > 0.02 && gapX < 1.2) {
      const x1 = a.maxX < b.minX ? a.maxX : b.maxX;
      const x2 = a.maxX < b.minX ? b.minX : a.minX;
      const z = (Math.max(a.minZ, b.minZ) + Math.min(a.maxZ, b.maxZ)) / 2;
      guides.push({
        kind: 'gap',
        a: [x1, 0.03, z],
        b: [x2, 0.03, z],
        label: `${Math.round(gapX * 100)} cm`,
      });
    }
  }
  return guides.slice(0, 8);
}

export function openingsOverlap(a: Opening, b: Opening, wallLength: number) {
  if (a.wallId !== b.wallId || a.id === b.id) return false;
  const a0 = a.offset * wallLength - a.width / 2;
  const a1 = a.offset * wallLength + a.width / 2;
  const b0 = b.offset * wallLength - b.width / 2;
  const b1 = b.offset * wallLength + b.width / 2;
  return a0 < b1 - 0.02 && b0 < a1 - 0.02;
}

export function openingConflicts(candidate: Opening, openings: Opening[], walls: Wall[]) {
  const wall = walls.find((w) => w.id === candidate.wallId);
  if (!wall) return [] as Opening[];
  const length = wallFrame(wall).length;
  return openings.filter((o) => openingsOverlap(candidate, o, length));
}

export function resolveMountingType(value?: string): MountingType {
  const v = (value ?? 'floor').toLowerCase();
  if (v.includes('wall') || v === 'mounted') return 'wall';
  if (v.includes('ceiling')) return 'ceiling';
  return 'floor';
}
