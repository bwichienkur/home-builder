import type { TakeoffObject, TakeoffPointPx, TakeoffScale } from './types';

export function distPx(a: TakeoffPointPx, b: TakeoffPointPx): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

export function polylineLengthPx(points: TakeoffPointPx[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) sum += distPx(points[i - 1]!, points[i]!);
  return sum;
}

/** Shoelace area in px² (absolute). */
export function polygonAreaPx2(points: TakeoffPointPx[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function pxToFt(px: number, scale: TakeoffScale | undefined): number | undefined {
  if (!scale?.pixelsPerFoot || scale.pixelsPerFoot <= 0) return undefined;
  return px / scale.pixelsPerFoot;
}

export function measureObject(
  points: TakeoffPointPx[],
  kind: TakeoffObject['kind'],
  scale: TakeoffScale | undefined,
): { lengthFt?: number; areaSqFt?: number } {
  if (kind === 'room') {
    const areaPx = polygonAreaPx2(points);
    const areaSqFt = scale?.pixelsPerFoot
      ? areaPx / (scale.pixelsPerFoot * scale.pixelsPerFoot)
      : undefined;
    return { areaSqFt };
  }
  const lenPx = polylineLengthPx(points);
  return { lengthFt: pxToFt(lenPx, scale) };
}

/** Architectural feet-inches, e.g. 12'-6". */
export function formatFtIn(ft: number | undefined, digits = 0): string {
  if (ft == null || !Number.isFinite(ft)) return '—';
  const sign = ft < 0 ? '-' : '';
  const abs = Math.abs(ft);
  const whole = Math.floor(abs);
  const inches = Math.round((abs - whole) * 12 * 10 ** digits) / 10 ** digits;
  if (inches >= 12) return `${sign}${whole + 1}'-0"`;
  const inchStr = Number.isInteger(inches) ? String(inches) : inches.toFixed(digits);
  return `${sign}${whole}'-${inchStr}"`;
}

export function formatSqFt(area: number | undefined): string {
  if (area == null || !Number.isFinite(area)) return '—';
  return `${area.toFixed(1)} sf`;
}

/**
 * Calibrate scale from two clicks and a known length in feet.
 * Points are in page pixel space at the render viewport used for drawing.
 */
export function calibrateScaleFromPoints(
  a: TakeoffPointPx,
  b: TakeoffPointPx,
  knownLengthFt: number,
  scaleHint?: string,
): TakeoffScale {
  const px = distPx(a, b);
  if (px < 1 || knownLengthFt <= 0) {
    throw new Error('Calibration needs two distinct points and a positive length.');
  }
  return {
    pixelsPerFoot: px / knownLengthFt,
    calibratedLengthFt: knownLengthFt,
    scaleHint,
    calibratedAt: new Date().toISOString(),
  };
}

/** Parse lengths like 12, 12.5, 12', 12'-6", 12' 6", 150" */
export function parseLengthFt(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  const ftIn = s.match(/^(\d+(?:\.\d+)?)\s*'\s*-?\s*(\d+(?:\.\d+)?)\s*"?$/);
  if (ftIn) return Number(ftIn[1]) + Number(ftIn[2]) / 12;
  const ftOnly = s.match(/^(\d+(?:\.\d+)?)\s*'$/);
  if (ftOnly) return Number(ftOnly[1]);
  const inOnly = s.match(/^(\d+(?:\.\d+)?)\s*"$/);
  if (inOnly) return Number(inOnly[1]) / 12;
  const plain = s.match(/^(\d+(?:\.\d+)?)$/);
  if (plain) return Number(plain[1]);
  return null;
}

const SNAP_PX = 10;

export function snapPoint(
  point: TakeoffPointPx,
  candidates: TakeoffPointPx[],
  orthoFrom?: TakeoffPointPx | null,
): TakeoffPointPx {
  let next = { ...point };
  if (orthoFrom) {
    const dx = Math.abs(point.x - orthoFrom.x);
    const dy = Math.abs(point.y - orthoFrom.y);
    if (dx > dy) next = { x: point.x, y: orthoFrom.y };
    else next = { x: orthoFrom.x, y: point.y };
  }
  let best: TakeoffPointPx | null = null;
  let bestDist = SNAP_PX;
  for (const c of candidates) {
    const d = distPx(next, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best ?? next;
}

export function collectSnapCandidates(objects: TakeoffObject[], pageId: string): TakeoffPointPx[] {
  const out: TakeoffPointPx[] = [];
  for (const obj of objects) {
    if (obj.pageId !== pageId) continue;
    for (const p of obj.points) out.push(p);
  }
  return out;
}

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
