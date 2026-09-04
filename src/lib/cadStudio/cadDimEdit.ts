import { setDistanceBetweenWalls } from './cadWallGraph';
import {
  resyncHostedOpenings,
  setOpeningWidth,
  setWallLength,
} from './cadWallModify';
import { formatWallLengthFt, segLengthFt } from './editCadPlate';
import type { CadPlate, CadWallCenterlineFt } from './types';

export type CadTempDim = {
  id: string;
  kind: 'wall-length' | 'opening-width' | 'between-walls';
  wallIndex?: number;
  openingIndex?: number;
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

/** Temporary dims for the current selection (wall length or opening width). */
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
  const { nx, ny } = wallUnit({
    x1: o.x1,
    y1: o.y1,
    x2: o.x2,
    y2: o.y2,
  });
  const line = offsetDimLine(o.x1, o.y1, o.x2, o.y2, nx * DIM_OFFSET_FT * 0.7, ny * DIM_OFFSET_FT * 0.7);
  return [
    {
      id: `temp-opening-${selection.index}`,
      kind: 'opening-width',
      openingIndex: selection.index,
      wallIndex: o.hostWallIndex,
      ...line,
      valueFt: width,
      label: formatWallLengthFt(width),
    },
  ];
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
 * wall-length → setWallLength + resyncHostedOpenings;
 * opening-width → setOpeningWidth;
 * between-walls → move wall B along A's normal to hit distance.
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

  if (dim.kind === 'between-walls' && dim.wallIndexA != null && dim.wallIndexB != null) {
    return setDistanceBetweenWalls(plate, dim.wallIndexA, dim.wallIndexB, len);
  }

  return plate;
}
