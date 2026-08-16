import type { FurnitureItem, Opening, Point, Wall } from '../../types';
import { detectRoomPolygons } from './rooms';
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

/** Floor point suitable for ghost placement — always inside a detected room when possible. */
export function roomFloorCenter(walls: Wall[]): { x: number; z: number } {
  return roomInteriorPoint(walls);
}

/** True when the world XZ point lies inside any closed wall polygon. */
export function pointInWorldRooms(x: number, z: number, walls: Wall[]): boolean {
  if (!walls.length) return true;
  const rooms = detectRoomPolygons(walls).map((poly) => poly.map((p) => planToWorld(p)));
  if (!rooms.length) return true;
  return rooms.some((room) => pointInPolygon(x, z, room));
}

/**
 * Guaranteed-inside seed for placement. AABB/vertex averages can sit outside L-shaped
 * rooms, so we fall through to a coarse grid sample of the largest polygon.
 */
export function roomInteriorPoint(walls: Wall[]): { x: number; z: number } {
  if (!walls.length) return { x: 0, z: 0 };
  const rooms = detectRoomPolygons(walls).map((poly) => poly.map((p) => planToWorld(p)));
  if (!rooms.length) {
    const points = walls.flatMap((w) => [planToWorld(w.start), planToWorld(w.end)]);
    const xs = points.map((p) => p.x);
    const zs = points.map((p) => p.z);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      z: (Math.min(...zs) + Math.max(...zs)) / 2,
    };
  }
  const room = [...rooms].sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)))[0]!;
  const xs = room.map((p) => p.x);
  const zs = room.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const avg = {
    x: xs.reduce((sum, v) => sum + v, 0) / xs.length,
    z: zs.reduce((sum, v) => sum + v, 0) / zs.length,
  };
  const candidates = [
    { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
    avg,
  ];
  for (const c of candidates) {
    if (pointInPolygon(c.x, c.z, room)) return c;
  }
  for (let gy = 1; gy <= 10; gy++) {
    for (let gx = 1; gx <= 10; gx++) {
      const x = minX + ((maxX - minX) * gx) / 11;
      const z = minZ + ((maxZ - minZ) * gy) / 11;
      if (pointInPolygon(x, z, room)) return { x, z };
    }
  }
  return avg;
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
    const alongRaw = vx * frame.dirX + vz * frame.dirZ;
    const along = Math.max(0, Math.min(frame.length, alongRaw));
    const offset = along / frame.length;
    const closestX = frame.start.x + frame.dirX * along;
    const closestZ = frame.start.z + frame.dirZ * along;
    // True distance to the finite segment (not infinite-line perpendicular).
    const distance = Math.hypot(x - closestX, z - closestZ);
    if (distance > maxDistance) continue;
    const side = (x - closestX) * frame.normalX + (z - closestZ) * frame.normalZ;
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
  // Pictures, mirrors, and window panels must slide on walls only.
  if (
    hay.includes('mirror') ||
    hay.includes('picture') ||
    hay.includes('poster') ||
    hay.includes('artwork') ||
    hay.includes('wall art') ||
    hay.includes('canvas') ||
    hay.includes('frame') ||
    hay.includes('window panel') ||
    hay.includes('sconce')
  ) {
    return 'wall';
  }
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

/** Keep a wall-mounted piece fully on the segment (no half hanging past the corner). */
export function clampWallOffset(offset: number, itemWidth: number, wallLength: number) {
  if (wallLength <= 1e-6) return 0.5;
  if (itemWidth >= wallLength - 0.02) return 0.5;
  const min = itemWidth / 2 / wallLength;
  const max = 1 - min;
  return Math.max(min, Math.min(max, offset));
}

/** Keep wall art between the floor and ceiling on its host wall. */
export function clampWallMountY(y: number, itemHeight: number, wallHeight: number) {
  const maxY = Math.max(0.05, wallHeight - itemHeight - 0.05);
  return Math.min(Math.max(y, 0.05), maxY);
}

/** Snap a product to the nearest wall face, keeping depth clear of the wall thickness. */
export function snapToWallSurface(
  x: number,
  z: number,
  walls: Wall[],
  depth: number,
  mounting: MountingType = 'wall',
  maxDistance = mounting === 'wall' ? 12 : 1.5,
  width?: number,
) {
  if (!walls.length) return { ...snapFloorPosition(x, z), wallId: null as string | null, wallOffset: null as number | null, rotation: undefined as number | undefined };
  const hit = nearestWall(x, z, walls, maxDistance);
  if (!hit) return { ...snapFloorPosition(x, z), wallId: null, wallOffset: null, rotation: undefined };
  const frame = wallFrame(hit.wall);
  const along = width ?? depth;
  const offset = clampWallOffset(hit.offset, along, frame.length);
  const inset = hit.wall.thickness / 2 + depth / 2 + 0.01;
  const rooms = detectRoomPolygons(walls).map((poly) => poly.map((p) => planToWorld(p)));
  const plus = pointOnWall(hit.wall, offset, inset);
  const minus = pointOnWall(hit.wall, offset, -inset);
  const plusInside = rooms.some((room) => pointInPolygon(plus.x, plus.z, room));
  const minusInside = rooms.some((room) => pointInPolygon(minus.x, minus.z, room));
  // Prefer the side that lands inside the room (critical for concave / L plans).
  let side = 1;
  if (plusInside && !minusInside) side = 1;
  else if (minusInside && !plusInside) side = -1;
  else side = hit.inset >= 0 ? 1 : -1;
  const placed = side > 0 ? plus : minus;
  return {
    x: placed.x,
    z: placed.z,
    rotation: placed.rotation + (side < 0 ? Math.PI : 0),
    wallId: hit.wall.id,
    wallOffset: offset,
  };
}

function polygonSignedArea(pts: { x: number; z: number }[]) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a.x * b.z - b.x * a.z;
  }
  return area / 2;
}

function pointInPolygon(x: number, z: number, pts: { x: number; z: number }[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const zi = pts[i].z;
    const xj = pts[j].x;
    const zj = pts[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + Number.EPSILON) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonIsConvex(pts: { x: number; z: number }[]) {
  if (pts.length < 3) return true;
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = pts[(i + 2) % pts.length];
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cross) < 1e-8) continue;
    const s = cross > 0 ? 1 : -1;
    if (!sign) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/**
 * Keep a furniture footprint inside the room so it cannot protrude through walls.
 * Convex rooms use edge half-planes; concave (L) rooms only pull centers that are outside.
 */
export function containFurnitureInRoom(
  x: number,
  z: number,
  width: number,
  depth: number,
  rotation: number,
  walls: Wall[],
) {
  if (!walls.length) return { x, z };
  const rooms = detectRoomPolygons(walls);
  if (!rooms.length) return { x, z };

  const worldRooms = rooms.map((poly) => poly.map((p) => planToWorld(p)));
  let poly =
    worldRooms.find((room) => pointInPolygon(x, z, room)) ??
    worldRooms
      .map((room) => {
        const cx = room.reduce((sum, p) => sum + p.x, 0) / room.length;
        const cz = room.reduce((sum, p) => sum + p.z, 0) / room.length;
        return { room, d: (cx - x) ** 2 + (cz - z) ** 2 };
      })
      .sort((a, b) => a.d - b.d)[0]?.room;
  if (!poly?.length) return { x, z };

  const thickness = walls.reduce((sum, wall) => sum + wall.thickness, 0) / walls.length;
  // Flush to the inner finished face (wall centerline + half thickness). No extra gap.
  const margin = thickness / 2;
  const c = Math.abs(Math.cos(rotation));
  const s = Math.abs(Math.sin(rotation));
  const halfW = (width * c + depth * s) / 2;
  const halfD = (width * s + depth * c) / 2;

  // Half-plane pushes assume a convex set — they destroy valid L-arm placements.
  if (!polygonIsConvex(poly)) {
    if (pointInPolygon(x, z, poly)) return { x, z };
    const cx = poly.reduce((sum, p) => sum + p.x, 0) / poly.length;
    const cz = poly.reduce((sum, p) => sum + p.z, 0) / poly.length;
    let px = x;
    let pz = z;
    for (let i = 0; i < 12; i++) {
      px = px + (cx - px) * 0.35;
      pz = pz + (cz - pz) * 0.35;
      if (pointInPolygon(px, pz, poly)) return { x: px, z: pz };
    }
    return { x: cx, z: cz };
  }

  const ccw = polygonSignedArea(poly) > 0;
  let cx = x;
  let cz = z;
  // Corner cases need a few passes so adjacent edges both clear the AABB.
  for (let iter = 0; iter < 4; iter++) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = ccw ? -dz / len : dz / len;
      const nz = ccw ? dx / len : -dx / len;
      const signed = (cx - a.x) * nx + (cz - a.z) * nz;
      const extent = halfW * Math.abs(nx) + halfD * Math.abs(nz);
      const need = extent + margin;
      if (signed < need) {
        const push = need - signed;
        cx += nx * push;
        cz += nz * push;
      }
    }
  }

  return { x: cx, z: cz };
}

export function constrainPlacement(
  x: number,
  z: number,
  walls: Wall[],
  depth: number,
  opts: { mountingType?: string; category?: string; name?: string; rotation?: number; live?: boolean; width?: number },
) {
  const constraint = placementConstraint(opts.mountingType, opts.category, opts.name);
  let placed: {
    x: number;
    z: number;
    wallId: string | null;
    wallOffset: number | null;
    rotation?: number;
    constraint: PlacementConstraint;
  };
  if (constraint === 'wall') {
    const snapped = snapToWallSurface(x, z, walls, depth, 'wall', 12, opts.width);
    placed = { ...snapped, rotation: snapped.rotation ?? opts.rotation ?? 0, constraint };
  } else if (constraint === 'wall-prefer') {
    const near = nearestWall(x, z, walls, opts.live ? 0.85 : 0.55);
    if (near) {
      const snapped = snapToWallSurface(x, z, walls, depth, 'wall', 1.2, opts.width);
      placed = { ...snapped, rotation: snapped.rotation ?? opts.rotation ?? 0, constraint };
    } else {
      const floor = opts.live ? { x, z } : snapFloorPosition(x, z);
      placed = { ...floor, wallId: null, wallOffset: null, rotation: opts.rotation, constraint };
    }
  } else {
    const floor = opts.live ? { x, z } : snapFloorPosition(x, z);
    placed = { ...floor, wallId: null, wallOffset: null, rotation: opts.rotation, constraint };
  }

  const rotation = placed.rotation ?? opts.rotation ?? 0;
  // Wall-attached products already sit on a face — convex contain undoes L-room snaps.
  if (placed.wallId) {
    return { ...placed, rotation };
  }
  const width = opts.width ?? depth;
  const contained = containFurnitureInRoom(placed.x, placed.z, width, depth, rotation, walls);
  return { ...placed, x: contained.x, z: contained.z, rotation };
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
