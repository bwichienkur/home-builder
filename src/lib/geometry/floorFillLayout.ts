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
};

export type WorldPoly = { x: number; z: number };
export type FloorHole = { x: number; z: number; width: number; depth: number; rotation: number };

const MAX_PIECES = 3600;
const FLOOR_TOP_Y = -0.004;

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

function polyBounds(poly: WorldPoly[]) {
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

function keepPose(
  x: number,
  z: number,
  poly: WorldPoly[],
  holes: FloorHole[] | undefined,
): boolean {
  if (!pointInWorldPoly(x, z, poly)) return false;
  if (holes?.some((h) => pointInFloorHole(x, z, h))) return false;
  return true;
}

/**
 * Instanced plank / tile / hex poses that fill a room polygon.
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

  const poses: FloorPiecePose[] = [];
  const push = (x: number, z: number, yaw: number) => {
    if (!keepPose(x, z, poly, holes)) return;
    if (poses.length >= maxCount) return;
    poses.push({ x, y, z, yaw });
  };

  if (opts.spec.kind === 'hex') {
    const flat = width;
    const pitchX = flat + grout;
    const pitchZ = flat * (Math.sqrt(3) / 2) + grout;
    let row = 0;
    for (let z = bounds.minZ + pitchZ * 0.5; z <= bounds.maxZ + pitchZ && poses.length < maxCount; z += pitchZ, row++) {
      const x0 = bounds.minX + pitchX * 0.5 + (row % 2 === 1 ? pitchX * 0.5 : 0);
      for (let x = x0; x <= bounds.maxX + pitchX && poses.length < maxCount; x += pitchX) {
        push(x, z, Math.PI / 6);
      }
    }
    return poses;
  }

  const pitchX = width + grout;
  const pitchZ = length + grout;
  const stagger = opts.spec.kind === 'running-bond';
  let row = 0;
  for (let z = bounds.minZ + pitchZ * 0.5; z <= bounds.maxZ + pitchZ && poses.length < maxCount; z += pitchZ, row++) {
    const xOff = stagger && row % 2 === 1 ? pitchX * 0.5 : 0;
    let col = 0;
    for (let x = bounds.minX + pitchX * 0.5 + xOff; x <= bounds.maxX + pitchX && poses.length < maxCount; x += pitchX, col++) {
      const flip = stagger && ((row + col) & 1) === 1 ? Math.PI : 0;
      push(x, z, flip);
    }
  }
  return poses;
}

export const FLOOR_FILL_TOP_Y = FLOOR_TOP_Y;
export const FLOOR_FILL_MAX_PIECES = MAX_PIECES;
