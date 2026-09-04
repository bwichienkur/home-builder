import type { CadOpeningHintFt, CadPlate, CadWallCenterlineFt } from './types';
import { wallAngleDeg } from './cadLengthParse';
import { defaultWallThicknessFt } from './cadDrawSnap';
import { segLengthFt, syncWallSegments, updateWallCenterline } from './editCadPlate';

const JOIN_TOL = 0.55;

function unit(w: CadWallCenterlineFt): { ux: number; uy: number; len: number } {
  const len = segLengthFt(w) || 1;
  return { ux: (w.x2 - w.x1) / len, uy: (w.y2 - w.y1) / len, len };
}

/** Resize wall length keeping an anchor fixed. */
export function setWallLength(
  plate: CadPlate,
  index: number,
  lengthFt: number,
  anchor: 'start' | 'end' | 'mid' = 'start',
): CadPlate {
  const w = plate.wallCenterlines[index];
  if (!w) return plate;
  const len = Math.max(0.25, lengthFt);
  const { ux, uy, len: cur } = unit(w);
  if (anchor === 'start') {
    return updateWallCenterline(plate, index, {
      ...w,
      x2: w.x1 + ux * len,
      y2: w.y1 + uy * len,
    });
  }
  if (anchor === 'end') {
    return updateWallCenterline(plate, index, {
      ...w,
      x1: w.x2 - ux * len,
      y1: w.y2 - uy * len,
    });
  }
  const mx = (w.x1 + w.x2) / 2;
  const my = (w.y1 + w.y2) / 2;
  const half = len / 2;
  void cur;
  return updateWallCenterline(plate, index, {
    ...w,
    x1: mx - ux * half,
    y1: my - uy * half,
    x2: mx + ux * half,
    y2: my + uy * half,
  });
}

/** Rotate wall about start or midpoint. */
export function setWallAngle(
  plate: CadPlate,
  index: number,
  angleDeg: number,
  pivot: 'start' | 'mid' = 'mid',
): CadPlate {
  const w = plate.wallCenterlines[index];
  if (!w) return plate;
  const len = segLengthFt(w);
  const rad = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  if (pivot === 'start') {
    return updateWallCenterline(plate, index, {
      ...w,
      x2: w.x1 + ux * len,
      y2: w.y1 + uy * len,
    });
  }
  const mx = (w.x1 + w.x2) / 2;
  const my = (w.y1 + w.y2) / 2;
  const half = len / 2;
  return updateWallCenterline(plate, index, {
    ...w,
    x1: mx - ux * half,
    y1: my - uy * half,
    x2: mx + ux * half,
    y2: my + uy * half,
  });
}

export function flipWall(plate: CadPlate, index: number): CadPlate {
  const w = plate.wallCenterlines[index];
  if (!w) return plate;
  return updateWallCenterline(plate, index, { ...w, x1: w.x2, y1: w.y2, x2: w.x1, y2: w.y1 });
}

export function moveWall(plate: CadPlate, index: number, dx: number, dy: number): CadPlate {
  const w = plate.wallCenterlines[index];
  if (!w) return plate;
  const next = updateWallCenterline(plate, index, {
    ...w,
    x1: w.x1 + dx,
    y1: w.y1 + dy,
    x2: w.x2 + dx,
    y2: w.y2 + dy,
  });
  return resyncHostedOpenings(next, index);
}

export function moveWalls(plate: CadPlate, indices: number[], dx: number, dy: number): CadPlate {
  let next = plate;
  for (const i of indices) next = moveWall(next, i, dx, dy);
  return next;
}

/** Snap new wall endpoints to nearby existing walls (auto-join). */
export function autoJoinWallEndpoints(
  plate: CadPlate,
  index: number,
  tolFt = JOIN_TOL,
): CadPlate {
  const w = plate.wallCenterlines[index];
  if (!w) return plate;
  let x1 = w.x1;
  let y1 = w.y1;
  let x2 = w.x2;
  let y2 = w.y2;
  for (let i = 0; i < plate.wallCenterlines.length; i++) {
    if (i === index) continue;
    const o = plate.wallCenterlines[i]!;
    for (const p of [
      { x: o.x1, y: o.y1 },
      { x: o.x2, y: o.y2 },
    ]) {
      if (Math.hypot(x1 - p.x, y1 - p.y) <= tolFt) {
        x1 = p.x;
        y1 = p.y;
      }
      if (Math.hypot(x2 - p.x, y2 - p.y) <= tolFt) {
        x2 = p.x;
        y2 = p.y;
      }
    }
  }
  if (x1 === w.x1 && y1 === w.y1 && x2 === w.x2 && y2 === w.y2) return plate;
  return updateWallCenterline(plate, index, { ...w, x1, y1, x2, y2 });
}

function lineIntersect(
  a: CadWallCenterlineFt,
  b: CadWallCenterlineFt,
): { x: number; y: number; tA: number; tB: number } | null {
  const dax = a.x2 - a.x1;
  const day = a.y2 - a.y1;
  const dbx = b.x2 - b.x1;
  const dby = b.y2 - b.y1;
  const den = dax * dby - day * dbx;
  if (Math.abs(den) < 1e-10) return null;
  const tA = ((b.x1 - a.x1) * dby - (b.y1 - a.y1) * dbx) / den;
  const tB = ((b.x1 - a.x1) * day - (b.y1 - a.y1) * dax) / den;
  return { x: a.x1 + tA * dax, y: a.y1 + tA * day, tA, tB };
}

/** Trim wall `target` to the cutting wall (shorten to intersection). */
export function trimWallTo(
  plate: CadPlate,
  targetIndex: number,
  cutterIndex: number,
): CadPlate {
  const target = plate.wallCenterlines[targetIndex];
  const cutter = plate.wallCenterlines[cutterIndex];
  if (!target || !cutter) return plate;
  const hit = lineIntersect(target, cutter);
  if (!hit) return plate;
  // Keep the portion whose midpoint is farther from cutter mid if both ends beyond; else keep side containing more of wall
  const dStart = Math.hypot(target.x1 - hit.x, target.y1 - hit.y);
  const dEnd = Math.hypot(target.x2 - hit.x, target.y2 - hit.y);
  // Prefer keeping the longer remaining stub from the end that is outside the cutter segment
  if (hit.tA < 0) {
    return updateWallCenterline(plate, targetIndex, { ...target, x1: hit.x, y1: hit.y });
  }
  if (hit.tA > 1) {
    return updateWallCenterline(plate, targetIndex, { ...target, x2: hit.x, y2: hit.y });
  }
  // Intersection on segment: keep the longer side
  if (dStart >= dEnd) {
    return updateWallCenterline(plate, targetIndex, { ...target, x2: hit.x, y2: hit.y });
  }
  return updateWallCenterline(plate, targetIndex, { ...target, x1: hit.x, y1: hit.y });
}

/** Extend wall `target` to meet cutter (infinite line of cutter). */
export function extendWallTo(
  plate: CadPlate,
  targetIndex: number,
  cutterIndex: number,
): CadPlate {
  const target = plate.wallCenterlines[targetIndex];
  const cutter = plate.wallCenterlines[cutterIndex];
  if (!target || !cutter) return plate;
  const hit = lineIntersect(target, cutter);
  if (!hit) return plate;
  if (hit.tA < 0.5) {
    return updateWallCenterline(plate, targetIndex, { ...target, x1: hit.x, y1: hit.y });
  }
  return updateWallCenterline(plate, targetIndex, { ...target, x2: hit.x, y2: hit.y });
}

/** Break wall at plan point into two segments. */
export function breakWallAt(
  plate: CadPlate,
  index: number,
  x: number,
  y: number,
): CadPlate {
  const w = plate.wallCenterlines[index];
  if (!w) return plate;
  const { ux, uy, len } = unit(w);
  let t = ((x - w.x1) * ux + (y - w.y1) * uy) / len;
  t = Math.max(0.05, Math.min(0.95, t));
  const bx = w.x1 + ux * len * t;
  const by = w.y1 + uy * len * t;
  const a: CadWallCenterlineFt = { ...w, x2: bx, y2: by };
  const b: CadWallCenterlineFt = { ...w, x1: bx, y1: by };
  const wallCenterlines = [
    ...plate.wallCenterlines.slice(0, index),
    a,
    b,
    ...plate.wallCenterlines.slice(index + 1),
  ];
  return syncWallSegments({ ...plate, wallCenterlines });
}

/** Offset wall parallel by distance (positive = left of direction). */
export function offsetWall(
  plate: CadPlate,
  index: number,
  distanceFt: number,
): CadPlate {
  const w = plate.wallCenterlines[index];
  if (!w) return plate;
  const { ux, uy } = unit(w);
  const nx = -uy;
  const ny = ux;
  const copy: CadWallCenterlineFt = {
    ...w,
    x1: w.x1 + nx * distanceFt,
    y1: w.y1 + ny * distanceFt,
    x2: w.x2 + nx * distanceFt,
    y2: w.y2 + ny * distanceFt,
  };
  return syncWallSegments({
    ...plate,
    wallCenterlines: [...plate.wallCenterlines, copy],
  });
}

export function copyWalls(
  plate: CadPlate,
  indices: number[],
  dx: number,
  dy: number,
): CadPlate {
  const copies = indices
    .map((i) => plate.wallCenterlines[i])
    .filter(Boolean)
    .map((w) => ({
      ...w!,
      x1: w!.x1 + dx,
      y1: w!.y1 + dy,
      x2: w!.x2 + dx,
      y2: w!.y2 + dy,
    }));
  return syncWallSegments({
    ...plate,
    wallCenterlines: [...plate.wallCenterlines, ...copies],
  });
}

/** Mirror walls across vertical (x=cx) or horizontal (y=cy) axis through point. */
export function mirrorWalls(
  plate: CadPlate,
  indices: number[],
  axis: 'x' | 'y',
  center: { x: number; y: number },
): CadPlate {
  const copies = indices
    .map((i) => plate.wallCenterlines[i])
    .filter(Boolean)
    .map((w) => {
      if (axis === 'x') {
        return {
          ...w!,
          x1: 2 * center.x - w!.x1,
          x2: 2 * center.x - w!.x2,
        };
      }
      return {
        ...w!,
        y1: 2 * center.y - w!.y1,
        y2: 2 * center.y - w!.y2,
      };
    });
  return syncWallSegments({
    ...plate,
    wallCenterlines: [...plate.wallCenterlines, ...copies],
  });
}

/** Place opening hosted on a wall by centerline parameter t and width. */
export function placeHostedOpening(
  plate: CadPlate,
  wallIndex: number,
  t: number,
  widthFt: number,
  kind: CadOpeningHintFt['kind'],
  sillFt = 0,
): CadPlate {
  const w = plate.wallCenterlines[wallIndex];
  if (!w) return plate;
  const { ux, uy, len } = unit(w);
  const tt = Math.max(0.05, Math.min(0.95, t));
  const half = Math.min(widthFt / 2, len * 0.45);
  const cx = w.x1 + ux * len * tt;
  const cy = w.y1 + uy * len * tt;
  const layer =
    kind === 'window'
      ? 'WINDOWS'
      : kind === 'garage'
        ? 'GARAGE DOORS'
        : kind === 'passage'
          ? 'OPENINGS'
          : 'DOORS';
  const hint: CadOpeningHintFt = {
    x1: cx - ux * half,
    y1: cy - uy * half,
    x2: cx + ux * half,
    y2: cy + uy * half,
    kind,
    layer,
    sillFt: kind === 'window' ? sillFt : 0,
    heightFt: kind === 'window' ? 4 : kind === 'garage' ? 7 : 6 + 8 / 12,
    hostWallIndex: wallIndex,
    hostT: tt,
    widthFt: half * 2,
    swing: kind === 'door' ? 'left' : kind === 'passage' || kind === 'garage' ? 'none' : undefined,
  };
  return syncWallSegments({
    ...plate,
    openingHints: [...plate.openingHints, hint],
    segments: [
      ...plate.segments,
      {
        x1: hint.x1,
        y1: hint.y1,
        x2: hint.x2,
        y2: hint.y2,
        layer,
        role: 'opening' as const,
      },
    ],
  });
}

export function setOpeningWidth(plate: CadPlate, index: number, widthFt: number): CadPlate {
  const o = plate.openingHints[index];
  if (!o) return plate;
  const w =
    o.hostWallIndex != null ? plate.wallCenterlines[o.hostWallIndex] : null;
  if (w && o.hostT != null) {
    const { ux, uy, len } = unit(w);
    const half = Math.min(Math.max(0.5, widthFt) / 2, len * 0.45);
    const cx = w.x1 + ux * len * o.hostT;
    const cy = w.y1 + uy * len * o.hostT;
    const next = {
      ...o,
      x1: cx - ux * half,
      y1: cy - uy * half,
      x2: cx + ux * half,
      y2: cy + uy * half,
      widthFt: half * 2,
    };
    const openingHints = plate.openingHints.map((h, i) => (i === index ? next : h));
    return syncWallSegments({ ...plate, openingHints });
  }
  const { ux, uy } = unit({
    x1: o.x1,
    y1: o.y1,
    x2: o.x2,
    y2: o.y2,
    thicknessFt: defaultWallThicknessFt({ exterior: false }),
  });
  const cx = (o.x1 + o.x2) / 2;
  const cy = (o.y1 + o.y2) / 2;
  const half = Math.max(0.5, widthFt) / 2;
  const next = {
    ...o,
    x1: cx - ux * half,
    y1: cy - uy * half,
    x2: cx + ux * half,
    y2: cy + uy * half,
    widthFt: half * 2,
  };
  const openingHints = plate.openingHints.map((h, i) => (i === index ? next : h));
  return syncWallSegments({ ...plate, openingHints });
}

export function setOpeningSill(plate: CadPlate, index: number, sillFt: number): CadPlate {
  const openingHints = plate.openingHints.map((h, i) =>
    i === index ? { ...h, sillFt: Math.max(0, sillFt) } : h,
  );
  return { ...plate, openingHints };
}

export function flipOpeningHand(plate: CadPlate, index: number): CadPlate {
  const o = plate.openingHints[index];
  if (!o) return plate;
  const next = { ...o, x1: o.x2, y1: o.y2, x2: o.x1, y2: o.y1 };
  const openingHints = plate.openingHints.map((h, i) => (i === index ? next : h));
  return syncWallSegments({ ...plate, openingHints });
}

/** After wall edit, re-seat hosted openings on that wall. */
export function resyncHostedOpenings(plate: CadPlate, wallIndex: number): CadPlate {
  const w = plate.wallCenterlines[wallIndex];
  if (!w) return plate;
  const { ux, uy, len } = unit(w);
  const openingHints = plate.openingHints.map((o) => {
    if (o.hostWallIndex !== wallIndex || o.hostT == null) return o;
    const half = (o.widthFt ?? segLengthFt(o)) / 2;
    const cx = w.x1 + ux * len * o.hostT;
    const cy = w.y1 + uy * len * o.hostT;
    return {
      ...o,
      x1: cx - ux * half,
      y1: cy - uy * half,
      x2: cx + ux * half,
      y2: cy + uy * half,
    };
  });
  return syncWallSegments({ ...plate, openingHints });
}

/** Apply a temporary length dim: set selected wall length. */
export function applyWallLengthDim(
  plate: CadPlate,
  wallIndex: number,
  lengthFt: number,
): CadPlate {
  const next = setWallLength(plate, wallIndex, lengthFt, 'start');
  return resyncHostedOpenings(next, wallIndex);
}

export function wallHeadingLabel(w: CadWallCenterlineFt): string {
  const a = wallAngleDeg(w);
  const abs = Math.abs(a);
  if (abs < 5 || abs > 175) return a >= 0 ? 'E' : 'W';
  if (Math.abs(abs - 90) < 5) return a > 0 ? 'N' : 'S';
  return `${a.toFixed(1)}°`;
}
