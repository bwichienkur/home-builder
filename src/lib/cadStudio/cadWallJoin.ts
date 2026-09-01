import type { Seg } from '../housePlans/dxfRooms';

const FT_EPS = 0.08;
const FT_TO_M = 0.3048;

export type WallEndTrimM = { startM: number; endM: number };

function isHorizontalSeg(s: Seg): boolean {
  return Math.abs(s.y1 - s.y2) <= FT_EPS;
}

function isVerticalSeg(s: Seg): boolean {
  return Math.abs(s.x1 - s.x2) <= FT_EPS;
}

function onSegSpan(coord: number, a: number, b: number, pad = FT_EPS): boolean {
  return coord >= Math.min(a, b) - pad && coord <= Math.max(a, b) + pad;
}

function orthoSegIntersection(h: Seg, v: Seg): { x: number; y: number } | null {
  if (!isHorizontalSeg(h) || !isVerticalSeg(v)) return null;
  const hy = (h.y1 + h.y2) / 2;
  const vx = (v.x1 + v.x2) / 2;
  if (!onSegSpan(vx, h.x1, h.x2) || !onSegSpan(hy, v.y1, v.y2)) return null;
  return { x: vx, y: hy };
}

function segmentsMeet(a: Seg, b: Seg, eps = 0.35): boolean {
  const aEnds = [
    { x: a.x1, y: a.y1 },
    { x: a.x2, y: a.y2 },
  ];
  const bEnds = [
    { x: b.x1, y: b.y1 },
    { x: b.x2, y: b.y2 },
  ];
  for (const p of aEnds) {
    for (const q of bEnds) {
      if (Math.hypot(p.x - q.x, p.y - q.y) <= eps) return true;
    }
  }
  if (isHorizontalSeg(a) && isVerticalSeg(b)) return orthoSegIntersection(a, b) != null;
  if (isVerticalSeg(a) && isHorizontalSeg(b)) return orthoSegIntersection(b, a) != null;
  return false;
}

function halfThicknessM(exterior?: boolean): number {
  return (exterior ? 0.18 : 0.12) / 2;
}

/**
 * Per-wall end trims (meters) so box meshes meet cleanly at corners without spillover.
 */
export function wallEndTrimsFt(segments: Array<Seg & { exterior?: boolean }>): WallEndTrimM[] {
  return segments.map((s, i) => {
    let startM = 0;
    let endM = 0;
    const half = halfThicknessM(s.exterior);

    for (let j = 0; j < segments.length; j++) {
      if (i === j) continue;
      const other = segments[j]!;
      if (!segmentsMeet(s, other)) continue;
      const otherHalf = halfThicknessM(other.exterior);
      const trim = Math.min(half, otherHalf);

      const dStartA = Math.hypot(s.x1 - other.x1, s.y1 - other.y1);
      const dStartB = Math.hypot(s.x1 - other.x2, s.y1 - other.y2);
      const dEndA = Math.hypot(s.x2 - other.x1, s.y2 - other.y1);
      const dEndB = Math.hypot(s.x2 - other.x2, s.y2 - other.y2);

      if (Math.min(dStartA, dStartB) <= 0.35) startM = Math.max(startM, trim);
      if (Math.min(dEndA, dEndB) <= 0.35) endM = Math.max(endM, trim);
    }

    return { startM, endM };
  });
}

export function trimmedWallLengthM(
  lengthFt: number,
  trim: WallEndTrimM,
): { lenM: number } {
  const lenM = lengthFt * FT_TO_M;
  const trimmed = Math.max(0.05, lenM - trim.startM - trim.endM);
  return { lenM: trimmed };
}
