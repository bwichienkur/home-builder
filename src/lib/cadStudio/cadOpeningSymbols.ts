import type { CadOpeningHintFt } from './types';

export type OpeningPlanGeom = {
  len: number;
  ux: number;
  uy: number;
  nx: number;
  ny: number;
  mx: number;
  my: number;
  hingeAtStart: boolean;
  hingeX: number;
  hingeY: number;
  jambX: number;
  jambY: number;
  leafTipX: number;
  leafTipY: number;
  swingR: number;
  sweepPositive: boolean;
  swing: NonNullable<CadOpeningHintFt['swing']>;
};

/** Unit frame + Plan7-style hinge / leaf tip for a door swing. */
export function openingPlanFrame(
  o: Pick<CadOpeningHintFt, 'x1' | 'y1' | 'x2' | 'y2' | 'kind' | 'swing' | 'face'>,
): OpeningPlanGeom {
  const len = Math.hypot(o.x2 - o.x1, o.y2 - o.y1) || 1;
  const ux = (o.x2 - o.x1) / len;
  const uy = (o.y2 - o.y1) / len;
  const nx = -uy;
  const ny = ux;
  const mx = (o.x1 + o.x2) / 2;
  const my = (o.y1 + o.y2) / 2;
  const swing = o.swing ?? (o.kind === 'door' || o.kind === 'passage' ? 'left' : 'none');
  const faceSign = o.face === 'in' ? -1 : 1;
  const hingeAtStart = swing !== 'right';
  const hingeX = hingeAtStart ? o.x1 : o.x2;
  const hingeY = hingeAtStart ? o.y1 : o.y2;
  const swingSign = swing === 'right' ? -1 : 1;
  const swingR = Math.min(len, o.kind === 'garage' ? len : 3.5);
  const along = hingeAtStart ? 1 : -1;
  // Closed leaf tip along the opening (may be short of the far jamb when width is capped).
  const jambX = hingeX + ux * swingR * along;
  const jambY = hingeY + uy * swingR * along;
  const leafTipX = hingeX + nx * swingR * swingSign * faceSign;
  const leafTipY = hingeY + ny * swingR * swingSign * faceSign;
  const sweepPositive = swingSign * faceSign > 0;
  return {
    len,
    ux,
    uy,
    nx,
    ny,
    mx,
    my,
    hingeAtStart,
    hingeX,
    hingeY,
    jambX,
    jambY,
    leafTipX,
    leafTipY,
    swingR,
    sweepPositive,
    swing,
  };
}

/** Arc from closed position to open leaf tip (Plan7 swing). */
export function doorSwingArcPath(g: OpeningPlanGeom): string {
  return `M ${g.jambX} ${g.jambY} A ${g.swingR} ${g.swingR} 0 0 ${g.sweepPositive ? 1 : 0} ${g.leafTipX} ${g.leafTipY}`;
}

/** Garage sectional door: three parallel lines across the opening. */
export function garageDoorLines(
  o: Pick<CadOpeningHintFt, 'x1' | 'y1' | 'x2' | 'y2'>,
  nx: number,
  ny: number,
  offsetFt = 0.18,
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  return [-offsetFt, 0, offsetFt].map((off) => ({
    x1: o.x1 + nx * off,
    y1: o.y1 + ny * off,
    x2: o.x2 + nx * off,
    y2: o.y2 + ny * off,
  }));
}

/** Window glass: three thin mullion parallels. */
export function windowMullionLines(
  o: Pick<CadOpeningHintFt, 'x1' | 'y1' | 'x2' | 'y2'>,
  nx: number,
  ny: number,
  offsetFt = 0.12,
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  return [-offsetFt, 0, offsetFt].map((off) => ({
    x1: o.x1 + nx * off,
    y1: o.y1 + ny * off,
    x2: o.x2 + nx * off,
    y2: o.y2 + ny * off,
  }));
}

export function showsDoorSwing(
  kind: CadOpeningHintFt['kind'],
  swing: CadOpeningHintFt['swing'],
): boolean {
  if (kind !== 'door' && kind !== 'passage') return false;
  return swing != null && swing !== 'none' && swing !== 'slider';
}
