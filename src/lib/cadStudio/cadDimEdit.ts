import { upsertAnnotativeDim } from './cadExteriorDims';
import {
  setDistanceBetweenOpenings,
  setOpeningHeight,
  setOpeningOffsetFromStart,
  openingOffsetFromStartFt,
  defaultOpeningHeightFt,
} from './cadOpeningEdit';
import { setDistanceBetweenWalls } from './cadWallGraph';
import {
  moveWall,
  resyncHostedOpenings,
  setOpeningSill,
  setOpeningWidth,
  setWallLength,
} from './cadWallModify';
import { formatWallLengthFt, segLengthFt } from './editCadPlate';
import type { CadPlate, CadWallCenterlineFt } from './types';

export type CadTempDim = {
  id: string;
  kind:
    | 'wall-length'
    | 'opening-width'
    | 'opening-sill'
    | 'opening-height'
    | 'opening-offset'
    | 'between-walls'
    | 'between-openings';
  wallIndex?: number;
  openingIndex?: number;
  openingIndexA?: number;
  openingIndexB?: number;
  wallIndexA?: number;
  wallIndexB?: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  valueFt: number;
  label: string;
};

export type CadTempDimSelection =
  | { kind: 'wall'; index: number }
  | { kind: 'opening'; index: number };

const DIM_OFFSET_FT = 2.25;
const PARALLEL_ANGLE_TOL_DEG = 8;

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

/** Signed centerline distance from wall A to wall B (B mid relative to A left normal). */
export function signedCenterlineDistanceFt(
  a: CadWallCenterlineFt,
  b: CadWallCenterlineFt,
): number {
  const { nx, ny } = wallUnit(a);
  const mx = (b.x1 + b.x2) / 2;
  const my = (b.y1 + b.y2) / 2;
  return (mx - a.x1) * nx + (my - a.y1) * ny;
}

function offsetDimLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ox: number,
  oy: number,
): { x1: number; y1: number; x2: number; y2: number } {
  return { x1: x1 + ox, y1: y1 + oy, x2: x2 + ox, y2: y2 + oy };
}

/** Temporary dims for the current selection (wall / opening). */
export function buildTempDimsForSelection(
  plate: CadPlate,
  selection: CadTempDimSelection,
): CadTempDim[] {
  if (selection.kind === 'wall') {
    const w = plate.wallCenterlines[selection.index];
    if (!w) return [];
    const { nx, ny, len } = wallUnit(w);
    const line = offsetDimLine(w.x1, w.y1, w.x2, w.y2, nx * DIM_OFFSET_FT, ny * DIM_OFFSET_FT);
    return [
      {
        id: `temp-wall-${selection.index}`,
        kind: 'wall-length',
        wallIndex: selection.index,
        ...line,
        valueFt: len,
        label: formatWallLengthFt(len),
      },
    ];
  }

  const o = plate.openingHints[selection.index];
  if (!o) return [];
  const width = o.widthFt ?? segLengthFt(o);
  const { ux, uy, nx, ny } = wallUnit({
    x1: o.x1,
    y1: o.y1,
    x2: o.x2,
    y2: o.y2,
  });
  const mx = (o.x1 + o.x2) / 2;
  const my = (o.y1 + o.y2) / 2;
  const dims: CadTempDim[] = [];

  const widthLine = offsetDimLine(o.x1, o.y1, o.x2, o.y2, nx * DIM_OFFSET_FT * 0.7, ny * DIM_OFFSET_FT * 0.7);
  dims.push({
    id: `temp-opening-w-${selection.index}`,
    kind: 'opening-width',
    openingIndex: selection.index,
    wallIndex: o.hostWallIndex,
    ...widthLine,
    valueFt: width,
    label: formatWallLengthFt(width),
  });

  const heightFt = o.heightFt ?? defaultOpeningHeightFt(o.kind);
  dims.push({
    id: `temp-opening-h-${selection.index}`,
    kind: 'opening-height',
    openingIndex: selection.index,
    x1: mx + nx * 1.1,
    y1: my + ny * 1.1,
    x2: mx + nx * 1.1 + ux * 0.01,
    y2: my + ny * 1.1 + uy * 0.01,
    valueFt: heightFt,
    label: `H ${formatWallLengthFt(heightFt)}`,
  });

  if (o.kind === 'window') {
    const sill = o.sillFt ?? 3;
    dims.push({
      id: `temp-opening-sill-${selection.index}`,
      kind: 'opening-sill',
      openingIndex: selection.index,
      x1: mx - nx * 1.4,
      y1: my - ny * 1.4,
      x2: mx - nx * 1.4 + ux * 0.01,
      y2: my - ny * 1.4 + uy * 0.01,
      valueFt: sill,
      label: `Sill ${formatWallLengthFt(sill)}`,
    });
  }

  const offset = openingOffsetFromStartFt(plate, selection.index);
  if (offset != null && o.hostWallIndex != null) {
    const w = plate.wallCenterlines[o.hostWallIndex]!;
    const { ux: wux, uy: wuy, nx: wnx, ny: wny } = wallUnit(w);
    const nearX = w.x1 + wux * offset;
    const nearY = w.y1 + wuy * offset;
    dims.push({
      id: `temp-opening-off-${selection.index}`,
      kind: 'opening-offset',
      openingIndex: selection.index,
      wallIndex: o.hostWallIndex,
      x1: w.x1 + wnx * 1.2,
      y1: w.y1 + wny * 1.2,
      x2: nearX + wnx * 1.2,
      y2: nearY + wny * 1.2,
      valueFt: Math.max(0, offset),
      label: formatWallLengthFt(Math.max(0, offset)),
    });
  }

  return dims;
}

/** Build a between-walls dim when A and B are roughly parallel; null otherwise. */
export function buildBetweenWallDim(
  plate: CadPlate,
  indexA: number,
  indexB: number,
): CadTempDim | null {
  const a = plate.wallCenterlines[indexA];
  const b = plate.wallCenterlines[indexB];
  if (!a || !b || indexA === indexB) return null;
  if (angleDiffDeg(angleDeg(a), angleDeg(b)) > PARALLEL_ANGLE_TOL_DEG) return null;

  const signed = signedCenterlineDistanceFt(a, b);
  const dist = Math.abs(signed);
  const { nx, ny } = wallUnit(a);
  const sign = signed >= 0 ? 1 : -1;
  const amx = (a.x1 + a.x2) / 2;
  const amy = (a.y1 + a.y2) / 2;

  return {
    id: `temp-between-${indexA}-${indexB}`,
    kind: 'between-walls',
    wallIndexA: indexA,
    wallIndexB: indexB,
    x1: amx,
    y1: amy,
    x2: amx + nx * dist * sign,
    y2: amy + ny * dist * sign,
    valueFt: dist,
    label: formatWallLengthFt(dist),
  };
}

/**
 * Apply a typed temporary-dim edit.
 */
export function applyTempDimEdit(
  plate: CadPlate,
  dim: CadTempDim,
  newLengthFt: number,
): CadPlate {
  const len = Math.max(0.25, newLengthFt);

  if (dim.kind === 'wall-length' && dim.wallIndex != null) {
    const next = setWallLength(plate, dim.wallIndex, len, 'start');
    return resyncHostedOpenings(next, dim.wallIndex);
  }

  if (dim.kind === 'opening-width' && dim.openingIndex != null) {
    return setOpeningWidth(plate, dim.openingIndex, len);
  }

  if (dim.kind === 'opening-sill' && dim.openingIndex != null) {
    return setOpeningSill(plate, dim.openingIndex, len);
  }

  if (dim.kind === 'opening-height' && dim.openingIndex != null) {
    return setOpeningHeight(plate, dim.openingIndex, len);
  }

  if (dim.kind === 'opening-offset' && dim.openingIndex != null) {
    return setOpeningOffsetFromStart(plate, dim.openingIndex, len);
  }

  if (dim.kind === 'between-walls' && dim.wallIndexA != null && dim.wallIndexB != null) {
    return setDistanceBetweenWalls(plate, dim.wallIndexA, dim.wallIndexB, len);
  }

  if (dim.kind === 'between-openings' && dim.openingIndexA != null && dim.openingIndexB != null) {
    return setDistanceBetweenOpenings(plate, dim.openingIndexA, dim.openingIndexB, len);
  }

  return plate;
}

/**
 * Associative exterior overall dim edit (O2).
 * overall-w → move max-X walls; overall-d → move max-Y walls.
 */
export function applyAssociativeExteriorDim(
  plate: CadPlate,
  dimId: string,
  newLengthFt: number,
): CadPlate {
  const target = Math.max(4, newLengthFt);
  const walls = plate.wallCenterlines;
  if (!walls.length) return plate;

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

  if (dimId === 'overall-w' || dimId.startsWith('anno-') && dimId.includes('overall-w')) {
    const cur = maxX - minX;
    const delta = target - cur;
    if (Math.abs(delta) < 1e-6) return plate;
    let next = plate;
    walls.forEach((w, i) => {
      const mid = (w.x1 + w.x2) / 2;
      if (mid > (minX + maxX) / 2) next = moveWall(next, i, delta, 0);
    });
    return next;
  }

  if (dimId === 'overall-d' || (dimId.startsWith('anno-') && dimId.includes('overall-d'))) {
    const cur = maxY - minY;
    const delta = target - cur;
    if (Math.abs(delta) < 1e-6) return plate;
    let next = plate;
    walls.forEach((w, i) => {
      const mid = (w.y1 + w.y2) / 2;
      if (mid > (minY + maxY) / 2) next = moveWall(next, i, 0, delta);
    });
    return next;
  }

  return plate;
}

/** Convert a temporary dim into a permanent annotative dim (auto dims won't wipe it). */
export function promoteTempDimToAnnotative(plate: CadPlate, dim: CadTempDim): CadPlate {
  const mx = (dim.x1 + dim.x2) / 2;
  const my = (dim.y1 + dim.y2) / 2;
  const { nx, ny } = (() => {
    const len = Math.hypot(dim.x2 - dim.x1, dim.y2 - dim.y1) || 1;
    return { nx: -(dim.y2 - dim.y1) / len, ny: (dim.x2 - dim.x1) / len };
  })();
  return upsertAnnotativeDim(plate, {
    id: `anno-${dim.id}`,
    x1: dim.x1,
    y1: dim.y1,
    x2: dim.x2,
    y2: dim.y2,
    label: dim.label,
    labelX: mx + nx * 1.1,
    labelY: my + ny * 1.1,
    valueFt: dim.valueFt,
    locked: false,
  });
}
