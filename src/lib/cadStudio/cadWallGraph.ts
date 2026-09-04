import { moveWall, resyncHostedOpenings } from './cadWallModify';
import {
  moveWallEndpoint,
  nearestWallHost,
  segLengthFt,
  syncWallSegments,
  updateWallCenterline,
} from './editCadPlate';
import type { CadOpeningHintFt, CadPlate, CadWallCenterlineFt } from './types';

const DEFAULT_TOL_FT = 0.55;
const DEFAULT_ANGLE_TOL_DEG = 6;

function wallUnit(w: CadWallCenterlineFt): { ux: number; uy: number; nx: number; ny: number; len: number } {
  const len = segLengthFt(w) || 1;
  const ux = (w.x2 - w.x1) / len;
  const uy = (w.y2 - w.y1) / len;
  return { ux, uy, nx: -uy, ny: ux, len };
}

function angleDeg(w: CadWallCenterlineFt): number {
  return (Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180) / Math.PI;
}

function angleDiffDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 180;
  if (d > 90) d = 180 - d;
  return d;
}

function sameLayer(a: CadWallCenterlineFt, b: CadWallCenterlineFt): boolean {
  return (a.layer ?? 'WALLS') === (b.layer ?? 'WALLS');
}

function pointLineDist(px: number, py: number, w: CadWallCenterlineFt): number {
  const { nx, ny } = wallUnit(w);
  return Math.abs((px - w.x1) * nx + (py - w.y1) * ny);
}

function projectT(px: number, py: number, w: CadWallCenterlineFt): number {
  const { ux, uy, len } = wallUnit(w);
  return ((px - w.x1) * ux + (py - w.y1) * uy) / len;
}

function endpointsClose(a: CadWallCenterlineFt, b: CadWallCenterlineFt, tolFt: number): boolean {
  const ptsA = [
    { x: a.x1, y: a.y1 },
    { x: a.x2, y: a.y2 },
  ];
  const ptsB = [
    { x: b.x1, y: b.y1 },
    { x: b.x2, y: b.y2 },
  ];
  for (const pa of ptsA) {
    for (const pb of ptsB) {
      if (Math.hypot(pa.x - pb.x, pa.y - pb.y) <= tolFt) return true;
    }
  }
  return false;
}

function projectionsOverlapOrTouch(a: CadWallCenterlineFt, b: CadWallCenterlineFt, tolFt: number): boolean {
  const tB1 = projectT(b.x1, b.y1, a);
  const tB2 = projectT(b.x2, b.y2, a);
  const lo = Math.min(tB1, tB2);
  const hi = Math.max(tB1, tB2);
  const pad = tolFt / (segLengthFt(a) || 1);
  return !(hi < -pad || lo > 1 + pad);
}

function canMergeCollinear(
  a: CadWallCenterlineFt,
  b: CadWallCenterlineFt,
  tolFt: number,
  angleTolDeg: number,
): boolean {
  if (!sameLayer(a, b)) return false;
  if (angleDiffDeg(angleDeg(a), angleDeg(b)) > angleTolDeg) return false;
  if (pointLineDist(b.x1, b.y1, a) > tolFt || pointLineDist(b.x2, b.y2, a) > tolFt) return false;
  if (!endpointsClose(a, b, tolFt) && !projectionsOverlapOrTouch(a, b, tolFt)) return false;
  return true;
}

function mergeTwoWalls(a: CadWallCenterlineFt, b: CadWallCenterlineFt): CadWallCenterlineFt {
  const { ux, uy } = wallUnit(a);
  const pts = [
    { x: a.x1, y: a.y1 },
    { x: a.x2, y: a.y2 },
    { x: b.x1, y: b.y1 },
    { x: b.x2, y: b.y2 },
  ];
  let minT = Infinity;
  let maxT = -Infinity;
  let minP = pts[0]!;
  let maxP = pts[0]!;
  for (const p of pts) {
    const t = (p.x - a.x1) * ux + (p.y - a.y1) * uy;
    if (t < minT) {
      minT = t;
      minP = p;
    }
    if (t > maxT) {
      maxT = t;
      maxP = p;
    }
  }
  return {
    ...a,
    x1: minP.x,
    y1: minP.y,
    x2: maxP.x,
    y2: maxP.y,
    exterior: a.exterior || b.exterior,
    thicknessFt: a.thicknessFt ?? b.thicknessFt,
    materialId: a.materialId ?? b.materialId,
  };
}

function remapOpeningHost(
  o: CadOpeningHintFt,
  removedIndex: number,
  keptIndex: number,
): CadOpeningHintFt {
  if (o.hostWallIndex == null) return o;
  if (o.hostWallIndex === removedIndex) {
    return { ...o, hostWallIndex: keptIndex };
  }
  if (o.hostWallIndex > removedIndex) {
    return { ...o, hostWallIndex: o.hostWallIndex - 1 };
  }
  return o;
}

function reseatOpeningOnWall(o: CadOpeningHintFt, w: CadWallCenterlineFt): CadOpeningHintFt {
  const cx = (o.x1 + o.x2) / 2;
  const cy = (o.y1 + o.y2) / 2;
  const { ux, uy, len } = wallUnit(w);
  let t = projectT(cx, cy, w);
  t = Math.max(0.05, Math.min(0.95, t));
  const width = o.widthFt ?? segLengthFt(o);
  const half = Math.min(width / 2, len * 0.45);
  return {
    ...o,
    hostT: t,
    widthFt: half * 2,
    x1: w.x1 + ux * len * t - ux * half,
    y1: w.y1 + uy * len * t - uy * half,
    x2: w.x1 + ux * len * t + ux * half,
    y2: w.y1 + uy * len * t + uy * half,
  };
}

/** Merge abutting collinear same-layer walls; remap hosted openings. */
export function combineCollinearWalls(
  plate: CadPlate,
  tolFt = DEFAULT_TOL_FT,
  angleTolDeg = DEFAULT_ANGLE_TOL_DEG,
): CadPlate {
  let walls = [...plate.wallCenterlines];
  let openings = [...plate.openingHints];
  let changed = true;
  let didMerge = false;

  while (changed) {
    changed = false;
    outer: for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        const a = walls[i]!;
        const b = walls[j]!;
        if (!canMergeCollinear(a, b, tolFt, angleTolDeg)) continue;
        const merged = mergeTwoWalls(a, b);
        openings = openings.map((o) => {
          const remapped = remapOpeningHost(o, j, i);
          if (remapped.hostWallIndex === i) {
            return reseatOpeningOnWall(remapped, merged);
          }
          return remapped;
        });
        walls[i] = merged;
        walls.splice(j, 1);
        changed = true;
        didMerge = true;
        break outer;
      }
    }
  }

  if (!didMerge) return plate;
  return syncWallSegments({ ...plate, wallCenterlines: walls, openingHints: openings });
}

/** Move a wall endpoint and any other wall endpoints within tol to the same point. */
export function stretchSharedNode(
  plate: CadPlate,
  wallIndex: number,
  end: 'a' | 'b',
  x: number,
  y: number,
  tolFt = DEFAULT_TOL_FT,
): CadPlate {
  const w = plate.wallCenterlines[wallIndex];
  if (!w) return plate;
  const from =
    end === 'a' ? { x: w.x1, y: w.y1 } : { x: w.x2, y: w.y2 };

  let next = moveWallEndpoint(plate, wallIndex, end, x, y);

  for (let i = 0; i < next.wallCenterlines.length; i++) {
    if (i === wallIndex) continue;
    const o = next.wallCenterlines[i]!;
    if (Math.hypot(o.x1 - from.x, o.y1 - from.y) <= tolFt) {
      next = moveWallEndpoint(next, i, 'a', x, y);
    }
    if (Math.hypot(o.x2 - from.x, o.y2 - from.y) <= tolFt) {
      next = moveWallEndpoint(next, i, 'b', x, y);
    }
  }

  // Resync openings on any walls we touched — at least the primary wall
  next = resyncHostedOpenings(next, wallIndex);
  return next;
}

/** Align wall midpoints to their average along X or Y. */
export function alignWalls(
  plate: CadPlate,
  indices: number[],
  axis: 'x' | 'y',
): CadPlate {
  const walls = indices
    .map((i) => ({ i, w: plate.wallCenterlines[i] }))
    .filter((e): e is { i: number; w: CadWallCenterlineFt } => Boolean(e.w));
  if (walls.length < 2) return plate;

  const avg =
    walls.reduce((sum, e) => {
      const mid = axis === 'x' ? (e.w.x1 + e.w.x2) / 2 : (e.w.y1 + e.w.y2) / 2;
      return sum + mid;
    }, 0) / walls.length;

  let next = plate;
  for (const { i, w } of walls) {
    const mid = axis === 'x' ? (w.x1 + w.x2) / 2 : (w.y1 + w.y2) / 2;
    const delta = avg - mid;
    if (Math.abs(delta) < 1e-9) continue;
    const updated =
      axis === 'x'
        ? { ...w, x1: w.x1 + delta, x2: w.x2 + delta }
        : { ...w, y1: w.y1 + delta, y2: w.y2 + delta };
    next = updateWallCenterline(next, i, updated);
    next = resyncHostedOpenings(next, i);
  }
  return next;
}

/** Signed centerline distance from A to B mid along A's left normal. */
export function signedWallDistanceFt(
  a: CadWallCenterlineFt,
  b: CadWallCenterlineFt,
): number {
  const { nx, ny } = wallUnit(a);
  const mx = (b.x1 + b.x2) / 2;
  const my = (b.y1 + b.y2) / 2;
  return (mx - a.x1) * nx + (my - a.y1) * ny;
}

/** Move wall B parallel so centerline distance equals target (A fixed). */
export function setDistanceBetweenWalls(
  plate: CadPlate,
  indexA: number,
  indexB: number,
  distanceFt: number,
): CadPlate {
  const a = plate.wallCenterlines[indexA];
  const b = plate.wallCenterlines[indexB];
  if (!a || !b || indexA === indexB) return plate;
  const { nx, ny } = wallUnit(a);
  const signed = signedWallDistanceFt(a, b);
  const mag = Math.max(0, distanceFt);
  const desired = signed === 0 ? mag : Math.sign(signed) * mag;
  const delta = desired - signed;
  let next = moveWall(plate, indexB, nx * delta, ny * delta);
  next = resyncHostedOpenings(next, indexB);
  return next;
}

/**
 * Attach openings missing hostWallIndex to the nearest wall within tol.
 * Sets hostWallIndex, hostT, and widthFt; aligns geometry to the host.
 */
export function autoHostOpenings(plate: CadPlate, tolFt = 2.5): CadPlate {
  let changed = false;
  const openingHints = plate.openingHints.map((o) => {
    if (o.hostWallIndex != null) return o;
    const cx = (o.x1 + o.x2) / 2;
    const cy = (o.y1 + o.y2) / 2;
    const host = nearestWallHost(plate, cx, cy, tolFt);
    if (!host) return o;
    const w = plate.wallCenterlines[host.wallIndex];
    if (!w) return o;
    changed = true;
    const width = o.widthFt ?? segLengthFt(o);
    return reseatOpeningOnWall(
      { ...o, hostWallIndex: host.wallIndex, widthFt: width },
      w,
    );
  });
  if (!changed) return plate;
  return syncWallSegments({ ...plate, openingHints });
}
