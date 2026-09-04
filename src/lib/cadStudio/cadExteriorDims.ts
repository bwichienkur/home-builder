import { formatWallLengthFt, segLengthFt } from './editCadPlate';
import type { CadPlate, CadWallCenterlineFt } from './types';

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

/**
 * Automatic exterior dimension chains (Plan7-inspired).
 * Places overall AABB dims plus per exterior-wall segment dims outside the plate.
 */
export function computeExteriorDims(plate: CadPlate, offsetFt = 3.5): CadExteriorDim[] {
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
    labelY: minY - offsetFt - 1.1,
  });

  dims.push({
    id: 'overall-d',
    x1: minX - offsetFt,
    y1: minY,
    x2: minX - offsetFt,
    y2: maxY,
    label: formatWallLengthFt(depth),
    labelX: minX - offsetFt - 1.1,
    labelY: cy,
  });

  const segOffset = offsetFt + 2.2;
  walls.forEach((w, i) => {
    const len = segLengthFt(w);
    if (len < 1.5) return;
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
      labelX: (x1 + x2) / 2 + ox * 0.15,
      labelY: (y1 + y2) / 2 + oy * 0.15,
    });
  });

  return dims;
}

/** Interior wall segment dimensions (offset toward building center). */
export function computeInteriorDims(plate: CadPlate, offsetFt = 1.4): CadExteriorDim[] {
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
    });
  });

  return dims;
}
