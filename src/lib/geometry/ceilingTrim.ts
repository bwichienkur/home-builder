import type { FurnitureItem, Opening, PlanRoomLabel, Wall } from '../../types';
import { planToWorld, pointOnWall, wallFrame } from './placement';
import { wallsBelongingToRoom } from './roomWalls';

export type PerimeterTrimEdge = 'ceiling' | 'floor';

export type PerimeterTrimSegment = {
  wallId: string;
  x: number;
  z: number;
  y: number;
  rotation: number;
  width: number;
  depth: number;
  height: number;
  wallOffset: number;
};

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

function pointNearSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  tol: number,
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const proj = { x: a.x + dx * t, y: a.y + dy * t };
  return Math.hypot(p.x - proj.x, p.y - proj.y) <= tol;
}

/** Walls that lie on the room outline (not interior partitions). */
export function boundaryWallsForRoom(room: PlanRoomLabel, walls: Wall[], tol = 28) {
  const pts = room.points;
  if (pts.length < 3) return wallsBelongingToRoom(room, walls, tol);
  return walls.filter((wall) => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      if (pointNearSegment(wall.start, a, b, tol) && pointNearSegment(wall.end, a, b, tol)) return true;
    }
    return false;
  });
}

const BUILTIN_RE = /counter|cabinet|base cabinet|kitchen island|vanity|cupboard|sideboard/i;

/** Floor built-ins that baseboard should route around (not crown). */
export function isTrimBypassBuiltin(item: Pick<FurnitureItem, 'name' | 'category' | 'mountingType' | 'placementKind'>) {
  if (item.placementKind === 'perimeter-trim') return false;
  if (item.mountingType === 'wall' || item.mountingType === 'ceiling') return false;
  return BUILTIN_RE.test(`${item.name} ${item.category}`);
}

function builtinCoversWall(
  item: Pick<FurnitureItem, 'x' | 'z' | 'width' | 'depth' | 'rotation'>,
  wall: Wall,
  coverRatio = 0.45,
) {
  const frame = wallFrame(wall);
  const c = Math.abs(Math.cos(item.rotation ?? 0));
  const s = Math.abs(Math.sin(item.rotation ?? 0));
  const halfW = (item.width * c + item.depth * s) / 2;
  const halfD = (item.width * s + item.depth * c) / 2;
  const vx = item.x - frame.start.x;
  const vz = item.z - frame.start.z;
  const along = vx * frame.dirX + vz * frame.dirZ;
  const perp = vx * frame.normalX + vz * frame.normalZ;
  if (Math.abs(perp) > Math.max(halfD, halfW) + wall.thickness + 0.35) return false;
  if (along < -0.2 || along > frame.length + 0.2) return false;
  const span = Math.max(item.width, item.depth);
  return span / frame.length >= coverRatio;
}

/** True when an opening’s vertical band overlaps the trim strip. */
export function openingIntersectsTrimBand(
  opening: Pick<Opening, 'sill' | 'height'>,
  trimY: number,
  trimHeight: number,
) {
  const o0 = opening.sill;
  const o1 = opening.sill + opening.height;
  const t0 = trimY;
  const t1 = trimY + trimHeight;
  return o0 < t1 - 0.01 && o1 > t0 + 0.01;
}

/** Subtract holes from a 1D interval; drop remnants shorter than minLen. */
export function subtractIntervals(
  span: [number, number],
  holes: [number, number][],
  minLen = 0.08,
): [number, number][] {
  let parts: [number, number][] = [span];
  for (const [h0Raw, h1Raw] of holes) {
    const h0 = Math.min(h0Raw, h1Raw);
    const h1 = Math.max(h0Raw, h1Raw);
    const next: [number, number][] = [];
    for (const [a, b] of parts) {
      if (h1 <= a || h0 >= b) {
        next.push([a, b]);
        continue;
      }
      if (h0 > a) next.push([a, Math.min(b, h0)]);
      if (h1 < b) next.push([Math.max(a, h1), b]);
    }
    parts = next.filter(([a, b]) => b - a >= minLen);
  }
  return parts;
}

function openingHolesAlongWall(
  wall: Wall,
  openings: Opening[],
  trimY: number,
  trimHeight: number,
  casing = 0.02,
): [number, number][] {
  const len = wallFrame(wall).length;
  const holes: [number, number][] = [];
  for (const opening of openings) {
    if (opening.wallId !== wall.id) continue;
    if (!openingIntersectsTrimBand(opening, trimY, trimHeight)) continue;
    const center = opening.offset * len;
    const half = opening.width / 2 + casing;
    holes.push([Math.max(0, center - half), Math.min(len, center + half)]);
  }
  return holes;
}

/**
 * Build trim strips along the room’s wall–ceiling or wall–floor junctions,
 * inset to the interior face. Ends are shortened for a simple miter meet.
 * Floor trim skips walls dominated by counters / cabinets.
 * Segments stop at openings that intersect the trim height band.
 */
export function perimeterTrimSegments(
  room: PlanRoomLabel,
  walls: Wall[],
  opts: {
    profileDepth: number;
    profileHeight: number;
    edge: PerimeterTrimEdge;
    furniture?: FurnitureItem[];
    openings?: Opening[];
  },
): PerimeterTrimSegment[] {
  const boundary = boundaryWallsForRoom(room, walls);
  if (!boundary.length) return [];
  const roomWorld = room.points.map((p) => planToWorld(p));
  const depth = Math.max(0.03, opts.profileDepth);
  const height = Math.max(0.03, opts.profileHeight);
  const builtins =
    opts.edge === 'floor'
      ? (opts.furniture ?? []).filter(isTrimBypassBuiltin)
      : [];
  const openings = opts.openings ?? [];

  const out: PerimeterTrimSegment[] = [];
  for (const wall of boundary) {
    if (builtins.some((b) => builtinCoversWall(b, wall))) continue;
    const frame = wallFrame(wall);
    const inset = wall.thickness / 2 + depth / 2 + 0.004;
    const plus = pointOnWall(wall, 0.5, inset);
    const minus = pointOnWall(wall, 0.5, -inset);
    const plusInside = pointInPolygon(plus.x, plus.z, roomWorld);
    const minusInside = pointInPolygon(minus.x, minus.z, roomWorld);
    let side = 1;
    if (plusInside && !minusInside) side = 1;
    else if (minusInside && !plusInside) side = -1;
    const y = opts.edge === 'ceiling' ? Math.max(0.05, wall.height - height) : 0;
    const miter = depth;
    const spanStart = miter;
    const spanEnd = frame.length - miter;
    if (spanEnd - spanStart < 0.08) continue;

    const holes = openingHolesAlongWall(wall, openings, y, height);
    const intervals = subtractIntervals([spanStart, spanEnd], holes, 0.08);

    for (const [a, b] of intervals) {
      const mid = (a + b) / 2;
      const wallOffset = mid / frame.length;
      const placed = pointOnWall(wall, wallOffset, side * inset);
      out.push({
        wallId: wall.id,
        x: placed.x,
        z: placed.z,
        y,
        rotation: placed.rotation + (side < 0 ? Math.PI : 0),
        width: b - a,
        depth,
        height,
        wallOffset,
      });
    }
  }
  return out;
}
