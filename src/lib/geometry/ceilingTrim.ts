import type { FurnitureItem, PlanRoomLabel, Wall } from '../../types';
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
  // Distance from item center to wall centerline.
  const vx = item.x - frame.start.x;
  const vz = item.z - frame.start.z;
  const along = vx * frame.dirX + vz * frame.dirZ;
  const perp = vx * frame.normalX + vz * frame.normalZ;
  if (Math.abs(perp) > Math.max(halfD, halfW) + wall.thickness + 0.35) return false;
  if (along < -0.2 || along > frame.length + 0.2) return false;
  const span = Math.max(item.width, item.depth);
  return span / frame.length >= coverRatio;
}

/**
 * Build trim strips along the room’s wall–ceiling or wall–floor junctions,
 * inset to the interior face. Ends are shortened for a simple miter meet.
 * Floor trim skips walls dominated by counters / cabinets.
 */
export function perimeterTrimSegments(
  room: PlanRoomLabel,
  walls: Wall[],
  opts: {
    profileDepth: number;
    profileHeight: number;
    edge: PerimeterTrimEdge;
    furniture?: FurnitureItem[];
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
    const placed = side > 0 ? plus : minus;
    const y = opts.edge === 'ceiling' ? Math.max(0.05, wall.height - height) : 0;
    // Shorten by profile depth so adjacent strips meet at a miter instead of overlapping.
    const width = Math.max(0.15, frame.length - depth);
    out.push({
      wallId: wall.id,
      x: placed.x,
      z: placed.z,
      y,
      rotation: placed.rotation + (side < 0 ? Math.PI : 0),
      width,
      depth,
      height,
      wallOffset: 0.5,
    });
  }
  return out;
}
