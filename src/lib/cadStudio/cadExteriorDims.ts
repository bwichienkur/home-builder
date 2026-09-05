import { formatWallLengthFt, segLengthFt } from './editCadPlate';
import type { CadAnnotativeDim, CadPlate, CadWallCenterlineFt } from './types';

export type CadExteriorDim = {
  id: string;
  /** Dimension line endpoints in plan feet. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  labelX: number;
  labelY: number;
  locked?: boolean;
  valueFt?: number;
  /** Measured feature endpoints for witness/extension lines (plan feet). */
  wx1?: number;
  wy1?: number;
  wx2?: number;
  wy2?: number;
};

function wallMid(w: CadWallCenterlineFt) {
  return { x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 };
}

/** Offset a wall outward from building center for exterior dim placement. */
function outwardOffset(
  w: CadWallCenterlineFt,
  cx: number,
  cy: number,
  offsetFt: number,
): { ox: number; oy: number } {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  const mid = wallMid(w);
  if ((mid.x - cx) * nx + (mid.y - cy) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { ox: nx * offsetFt, oy: ny * offsetFt };
}

function inwardOffset(
  w: CadWallCenterlineFt,
  cx: number,
  cy: number,
  offsetFt: number,
): { ox: number; oy: number } {
  const out = outwardOffset(w, cx, cy, offsetFt);
  return { ox: -out.ox, oy: -out.oy };
}

function isMostlyHorizontal(d: { x1: number; y1: number; x2: number; y2: number }): boolean {
  return Math.abs(d.x2 - d.x1) >= Math.abs(d.y2 - d.y1);
}

/** True when auto dim would collide with a preserved manual dim (SoftPlan lesson). */
export function dimCoveredByManual(
  auto: CadExteriorDim,
  manuals: CadAnnotativeDim[],
  tolFt = 4,
): boolean {
  const aHoriz = isMostlyHorizontal(auto);
  const amx = (auto.x1 + auto.x2) / 2;
  const amy = (auto.y1 + auto.y2) / 2;
  for (const m of manuals) {
    if (isMostlyHorizontal(m) !== aHoriz) continue;
    const mmx = (m.x1 + m.x2) / 2;
    const mmy = (m.y1 + m.y2) / 2;
    if (Math.hypot(amx - mmx, amy - mmy) <= tolFt) return true;
  }
  return false;
}

function buildAutoExteriorDims(plate: CadPlate, offsetFt: number): CadExteriorDim[] {
  const exterior = plate.wallCenterlines.filter((w) => w.exterior);
  const walls = exterior.length ? exterior : plate.wallCenterlines;
  if (!walls.length) return [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.x1, w.x2);
    minY = Math.min(minY, w.y1, w.y2);
    maxX = Math.max(maxX, w.x1, w.x2);
    maxY = Math.max(maxY, w.y1, w.y2);
  }
  if (!Number.isFinite(minX)) return [];

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const width = maxX - minX;
  const depth = maxY - minY;
  const dims: CadExteriorDim[] = [];

  dims.push({
    id: 'overall-w',
    x1: minX,
    y1: minY - offsetFt,
    x2: maxX,
    y2: minY - offsetFt,
    label: formatWallLengthFt(width),
    labelX: cx,
    labelY: minY - offsetFt,
    valueFt: width,
    wx1: minX,
    wy1: minY,
    wx2: maxX,
    wy2: minY,
  });

  dims.push({
    id: 'overall-d',
    x1: minX - offsetFt,
    y1: minY,
    x2: minX - offsetFt,
    y2: maxY,
    label: formatWallLengthFt(depth),
    labelX: minX - offsetFt,
    labelY: cy,
    valueFt: depth,
    wx1: minX,
    wy1: minY,
    wx2: minX,
    wy2: maxY,
  });

  const segOffset = offsetFt + 2.8;
  /** Skip wall segments that duplicate the overall AABB dims on the same side. */
  const near = (a: number, b: number, tol = 0.6) => Math.abs(a - b) <= tol;
  walls.forEach((w, i) => {
    const len = segLengthFt(w);
    if (len < 1.5) return;
    const horiz = Math.abs(w.x2 - w.x1) >= Math.abs(w.y2 - w.y1);
    // overall-w sits below minY; overall-d sits left of minX.
    if (horiz && near(len, width) && near(Math.min(w.y1, w.y2), minY, 1.25)) return;
    if (!horiz && near(len, depth) && near(Math.min(w.x1, w.x2), minX, 1.25)) return;
    // Right-hand full-depth wall equals overall-d — omit the twin.
    if (!horiz && near(len, depth) && near(Math.max(w.x1, w.x2), maxX, 1.25)) return;
    // Top full-width wall equals overall-w — omit the twin (overall is already on bottom).
    if (horiz && near(len, width) && near(Math.max(w.y1, w.y2), maxY, 1.25)) return;
    const { ox, oy } = outwardOffset(w, cx, cy, segOffset);
    const x1 = w.x1 + ox;
    const y1 = w.y1 + oy;
    const x2 = w.x2 + ox;
    const y2 = w.y2 + oy;
    dims.push({
      id: `ext-${i}`,
      x1,
      y1,
      x2,
      y2,
      label: formatWallLengthFt(len),
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2,
      valueFt: len,
      wx1: w.x1,
      wy1: w.y1,
      wx2: w.x2,
      wy2: w.y2,
    });
  });

  return dims;
}

/**
 * Automatic exterior dimension chains (Plan7-inspired).
 * Places overall AABB dims plus per exterior-wall segment dims outside the plate.
 * Manual `annotativeDims` are always kept; auto dims that collide with manuals are skipped.
 */
export function computeExteriorDims(plate: CadPlate, offsetFt = 4.25): CadExteriorDim[] {
  const manuals: CadExteriorDim[] = (plate.annotativeDims ?? []).map((d) => ({
    id: d.id,
    x1: d.x1,
    y1: d.y1,
    x2: d.x2,
    y2: d.y2,
    label: d.label,
    labelX: d.labelX,
    labelY: d.labelY,
    locked: d.locked,
    valueFt: d.valueFt,
    wx1: d.wx1,
    wy1: d.wy1,
    wx2: d.wx2,
    wy2: d.wy2,
  }));
  const auto = buildAutoExteriorDims(plate, offsetFt).filter(
    (d) => !dimCoveredByManual(d, plate.annotativeDims ?? []),
  );
  return [...manuals, ...auto];
}

/** Append or replace an annotative (manual) dim by id. */
export function upsertAnnotativeDim(plate: CadPlate, dim: CadAnnotativeDim): CadPlate {
  const list = [...(plate.annotativeDims ?? [])];
  const i = list.findIndex((d) => d.id === dim.id);
  if (i >= 0) list[i] = dim;
  else list.push(dim);
  return { ...plate, annotativeDims: list };
}

/** Toggle or set lock on an annotative dim (U5 lite constraints). */
export function setAnnotativeDimLocked(
  plate: CadPlate,
  dimId: string,
  locked: boolean,
): CadPlate {
  const list = plate.annotativeDims;
  if (!list?.length) return plate;
  let changed = false;
  const next = list.map((d) => {
    if (d.id !== dimId) return d;
    if (!!d.locked === locked) return d;
    changed = true;
    return { ...d, locked };
  });
  if (!changed) return plate;
  return { ...plate, annotativeDims: next };
}

/** Interior wall segment dimensions (offset toward building center). */
export function computeInteriorDims(plate: CadPlate, offsetFt = 1.75): CadExteriorDim[] {
  const exterior = plate.wallCenterlines.filter((w) => w.exterior);
  const walls = plate.wallCenterlines.filter((w) => !w.exterior);
  if (!walls.length) return [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const w of exterior.length ? exterior : plate.wallCenterlines) {
    minX = Math.min(minX, w.x1, w.x2);
    minY = Math.min(minY, w.y1, w.y2);
    maxX = Math.max(maxX, w.x1, w.x2);
    maxY = Math.max(maxY, w.y1, w.y2);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const dims: CadExteriorDim[] = [];

  walls.forEach((w, i) => {
    const len = segLengthFt(w);
    if (len < 2) return;
    const { ox, oy } = inwardOffset(w, cx, cy, offsetFt);
    const x1 = w.x1 + ox;
    const y1 = w.y1 + oy;
    const x2 = w.x2 + ox;
    const y2 = w.y2 + oy;
    dims.push({
      id: `int-${i}`,
      x1,
      y1,
      x2,
      y2,
      label: formatWallLengthFt(len),
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2,
      valueFt: len,
      wx1: w.x1,
      wy1: w.y1,
      wx2: w.x2,
      wy2: w.y2,
    });
  });

  return dims;
}
