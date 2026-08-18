/** Floor-fill pieces: catalog dims are [faceA, thickness, faceB] in meters. */

export type FloorFillKind = 'slab' | 'grid' | 'running-bond' | 'hex';

export type FloorPieceSpec = {
  kind: FloorFillKind;
  /** Face size along X (meters). */
  width: number;
  /** Face size along Z (meters). */
  length: number;
  thickness: number;
  grout: number;
};

export type FloorPiecePose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Width scale vs spec.width (1 = full board). */
  sx: number;
  /** Length scale vs spec.length. */
  sz: number;
};

export type WorldPoly = { x: number; z: number };
export type FloorHole = { x: number; z: number; width: number; depth: number; rotation: number };

export type Aabb = { minX: number; maxX: number; minZ: number; maxZ: number };

const MAX_PIECES = 3600;
const FLOOR_TOP_Y = -0.004;
const MIN_EDGE = 0.008;
const CLIP_EPS = 1e-4;

export function floorPieceSpec(item: {
  dims: [number, number, number] | number[];
  name?: string;
  subcategory?: string;
  category?: string;
}): FloorPieceSpec {
  const faceA = Math.max(0.04, item.dims[0] || 0.3);
  const thickRaw = item.dims[1] || 0.012;
  const faceB = Math.max(0.04, item.dims[2] || faceA);
  const thickness = thickRaw > 0 && thickRaw < 0.16 ? thickRaw : 0.012;
  const name = (item.name ?? '').toLowerCase();
  const sub = (item.subcategory ?? '').toLowerCase();
  const cat = (item.category ?? '').toLowerCase();

  const minFace = Math.min(faceA, faceB);
  const maxFace = Math.max(faceA, faceB);
  const aspect = maxFace / minFace;

  if (name.includes('hex')) {
    return { kind: 'hex', width: minFace, length: minFace, thickness, grout: 0.003 };
  }
  if (sub === 'carpet' || sub === 'concrete' || cat === 'carpet' || minFace >= 0.85) {
    return { kind: 'slab', width: maxFace, length: maxFace, thickness: Math.max(thickness, 0.01), grout: 0 };
  }
  if (aspect >= 1.45) {
    const grout = sub === 'tile' || cat === 'tile' || name.includes('tile') ? 0.003 : 0.0012;
    return { kind: 'running-bond', width: minFace, length: maxFace, thickness, grout };
  }
  const grout = 0.003;
  return { kind: 'grid', width: faceA, length: faceB, thickness, grout };
}

export function pointInWorldPoly(x: number, z: number, poly: WorldPoly[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x;
    const zi = poly[i]!.z;
    const xj = poly[j]!.x;
    const zj = poly[j]!.z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + Number.EPSILON) + xi) inside = !inside;
  }
  return inside;
}

export function pointInFloorHole(x: number, z: number, hole: FloorHole): boolean {
  const dx = x - hole.x;
  const dz = z - hole.z;
  const c = Math.cos(-hole.rotation);
  const s = Math.sin(-hole.rotation);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= hole.width / 2 && Math.abs(lz) <= hole.depth / 2;
}

export function polyBounds(poly: WorldPoly[]): Aabb {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

export function polyArea(poly: WorldPoly[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    area += a.x * b.z - b.x * a.z;
  }
  return area / 2;
}

export function aabbArea(b: Aabb): number {
  return Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxZ - b.minZ);
}

export function intersectAabb(a: Aabb, b: Aabb): Aabb | null {
  const minX = Math.max(a.minX, b.minX);
  const maxX = Math.min(a.maxX, b.maxX);
  const minZ = Math.max(a.minZ, b.minZ);
  const maxZ = Math.min(a.maxZ, b.maxZ);
  if (maxX - minX < MIN_EDGE || maxZ - minZ < MIN_EDGE) return null;
  return { minX, maxX, minZ, maxZ };
}

export function isAxisAlignedRect(poly: WorldPoly[]): boolean {
  if (poly.length < 4) return false;
  const b = polyBounds(poly);
  return Math.abs(Math.abs(polyArea(poly)) - aabbArea(b)) < 1e-4;
}

export function holeAabb(hole: FloorHole): Aabb {
  const c = Math.abs(Math.cos(hole.rotation));
  const s = Math.abs(Math.sin(hole.rotation));
  const hx = (hole.width * c + hole.depth * s) / 2;
  const hz = (hole.width * s + hole.depth * c) / 2;
  return { minX: hole.x - hx, maxX: hole.x + hx, minZ: hole.z - hz, maxZ: hole.z + hz };
}

/** Up to four axis-aligned remnants after cutting a hole out of a board. */
export function subtractAabb(rect: Aabb, hole: Aabb): Aabb[] {
  const i = intersectAabb(rect, hole);
  if (!i) return [rect];
  const out: Aabb[] = [];
  if (rect.minZ < i.minZ - CLIP_EPS) out.push({ minX: rect.minX, maxX: rect.maxX, minZ: rect.minZ, maxZ: i.minZ });
  if (rect.maxZ > i.maxZ + CLIP_EPS) out.push({ minX: rect.minX, maxX: rect.maxX, minZ: i.maxZ, maxZ: rect.maxZ });
  const midMinZ = Math.max(rect.minZ, i.minZ);
  const midMaxZ = Math.min(rect.maxZ, i.maxZ);
  if (midMaxZ - midMinZ >= MIN_EDGE) {
    if (rect.minX < i.minX - CLIP_EPS) out.push({ minX: rect.minX, maxX: i.minX, minZ: midMinZ, maxZ: midMaxZ });
    if (rect.maxX > i.maxX + CLIP_EPS) out.push({ minX: i.maxX, maxX: rect.maxX, minZ: midMinZ, maxZ: midMaxZ });
  }
  return out.filter((r) => r.maxX - r.minX >= MIN_EDGE && r.maxZ - r.minZ >= MIN_EDGE);
}

function aabbCornersInside(b: Aabb, poly: WorldPoly[], slop = CLIP_EPS): boolean {
  const pts: WorldPoly[] = [
    { x: b.minX + slop, z: b.minZ + slop },
    { x: b.maxX - slop, z: b.minZ + slop },
    { x: b.maxX - slop, z: b.maxZ - slop },
    { x: b.minX + slop, z: b.maxZ - slop },
  ];
  return pts.every((p) => pointInWorldPoly(p.x, p.z, poly));
}

/**
 * Clip a candidate board to the room. Axis-aligned rooms use an exact AABB clip;
 * concave rooms sample the cell so the result stays inside the polygon.
 */
export function clipCellToRoom(cell: Aabb, poly: WorldPoly[]): Aabb | null {
  const bounds = polyBounds(poly);
  const box = intersectAabb(cell, bounds);
  if (!box) return null;
  if (isAxisAlignedRect(poly)) return box;
  if (aabbCornersInside(box, poly)) return box;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let n = 0;
  const nx = 10;
  const nz = 10;
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const x = box.minX + ((box.maxX - box.minX) * i) / nx;
      const z = box.minZ + ((box.maxZ - box.minZ) * j) / nz;
      if (!pointInWorldPoly(x, z, poly)) continue;
      n++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  if (n < 4 || maxX - minX < MIN_EDGE || maxZ - minZ < MIN_EDGE) return null;
  const sampled = { minX, maxX, minZ, maxZ };
  return aabbCornersInside(sampled, poly, 0) ? sampled : sampled;
}

export function clipCellToFloor(cell: Aabb, poly: WorldPoly[], holes?: FloorHole[]): Aabb[] {
  const room = clipCellToRoom(cell, poly);
  if (!room) return [];
  if (!holes?.length) return [room];
  let parts = [room];
  for (const hole of holes) {
    const hb = holeAabb(hole);
    const next: Aabb[] = [];
    for (const part of parts) next.push(...subtractAabb(part, hb));
    parts = next;
  }
  return parts.filter((p) => aabbCornersInside(p, poly) || isAxisAlignedRect(poly));
}

export function pieceWorldAabb(pose: FloorPiecePose, spec: FloorPieceSpec): Aabb {
  const hw = (spec.width * pose.sx) / 2;
  const hl = (spec.length * pose.sz) / 2;
  const c = Math.cos(pose.yaw);
  const s = Math.sin(pose.yaw);
  const ex = Math.abs(c) * hw + Math.abs(s) * hl;
  const ez = Math.abs(s) * hw + Math.abs(c) * hl;
  return { minX: pose.x - ex, maxX: pose.x + ex, minZ: pose.z - ez, maxZ: pose.z + ez };
}

function poseFromAabb(box: Aabb, geomW: number, geomL: number, y: number): FloorPiecePose {
  return {
    x: (box.minX + box.maxX) / 2,
    y,
    z: (box.minZ + box.maxZ) / 2,
    yaw: 0,
    sx: (box.maxX - box.minX) / geomW,
    sz: (box.maxZ - box.minZ) / geomL,
  };
}

/**
 * Instanced plank / tile / hex poses that fill a room polygon.
 * Edge pieces are clipped (sx/sz < 1) so boards stop at the walls.
 * Slab finishes return [] — the caller extrudes the room shape instead.
 */
export function layoutFloorPieces(opts: {
  polygon: WorldPoly[];
  spec: FloorPieceSpec;
  holes?: FloorHole[];
  maxCount?: number;
}): FloorPiecePose[] {
  const poly = opts.polygon;
  if (poly.length < 3 || opts.spec.kind === 'slab') return [];
  const maxCount = opts.maxCount ?? MAX_PIECES;
  const holes = opts.holes;
  const y = FLOOR_TOP_Y - opts.spec.thickness / 2;

  let width = opts.spec.width;
  let length = opts.spec.length;
  let grout = opts.spec.grout;
  const bounds = polyBounds(poly);
  const spanX = Math.max(0.2, bounds.maxX - bounds.minX);
  const spanZ = Math.max(0.2, bounds.maxZ - bounds.minZ);
  const area = spanX * spanZ;
  const cell = Math.max(1e-4, (width + grout) * (length + grout));
  if (area / cell > maxCount) {
    const scale = Math.sqrt(area / cell / maxCount);
    width *= scale;
    length *= scale;
    grout *= scale;
  }
  const geomW = opts.spec.width;
  const geomL = opts.spec.length;

  const poses: FloorPiecePose[] = [];
  const pushBox = (box: Aabb) => {
    if (poses.length >= maxCount) return;
    poses.push(poseFromAabb(box, geomW, geomL, y));
  };

  if (opts.spec.kind === 'hex') {
    const flat = width;
    const pitchX = flat + grout;
    const pitchZ = flat * (Math.sqrt(3) / 2) + grout;
    let row = 0;
    for (let z0 = bounds.minZ; z0 < bounds.maxZ - CLIP_EPS && poses.length < maxCount; z0 += pitchZ, row++) {
      const xOff = row % 2 === 1 ? pitchX * 0.5 : 0;
      for (let x0 = bounds.minX - xOff; x0 < bounds.maxX - CLIP_EPS && poses.length < maxCount; x0 += pitchX) {
        const cellAabb: Aabb = { minX: x0, maxX: x0 + flat, minZ: z0, maxZ: z0 + pitchZ - grout };
        for (const part of clipCellToFloor(cellAabb, poly, holes)) {
          const frac = aabbArea(part) / Math.max(aabbArea(cellAabb), 1e-6);
          if (frac < 0.35) continue;
          if (poses.length >= maxCount) break;
          poses.push(poseFromAabb(part, geomW, geomL, y));
        }
      }
    }
    return poses;
  }

  const pitchX = width + grout;
  const pitchZ = length + grout;
  const stagger = opts.spec.kind === 'running-bond';
  let row = 0;
  for (let z0 = bounds.minZ; z0 < bounds.maxZ - CLIP_EPS && poses.length < maxCount; z0 += pitchZ, row++) {
    const xOff = stagger && row % 2 === 1 ? pitchX * 0.5 : 0;
    for (let x0 = bounds.minX - xOff; x0 < bounds.maxX - CLIP_EPS && poses.length < maxCount; x0 += pitchX) {
      const cellAabb: Aabb = { minX: x0, maxX: x0 + width, minZ: z0, maxZ: z0 + length };
      for (const part of clipCellToFloor(cellAabb, poly, holes)) pushBox(part);
    }
  }
  return poses;
}

export const FLOOR_FILL_TOP_Y = FLOOR_TOP_Y;
export const FLOOR_FILL_MAX_PIECES = MAX_PIECES;
