import type { CadGuidelineFt, CadPlate, CadWallCenterlineFt } from './types';

const ENDPOINT_TOL_FT = 0.85;
const MIDPOINT_TOL_FT = 0.75;
const GUIDE_TOL_FT = 0.65;
const ANGLE_SNAP_DEG = 15;

export type CadSnapResult = {
  x: number;
  y: number;
  kind: 'endpoint' | 'midpoint' | 'guide' | 'ortho' | 'angle' | 'free';
};

function collectEndpoints(plate: CadPlate): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (const w of plate.wallCenterlines) {
    pts.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
  }
  for (const o of plate.openingHints) {
    pts.push({ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 });
  }
  for (const g of plate.guidelines ?? []) {
    pts.push({ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 });
  }
  for (const s of plate.slabs ?? []) {
    for (const p of s.points) pts.push(p);
  }
  return pts;
}

function collectMidpoints(plate: CadPlate): Array<{ x: number; y: number }> {
  return plate.wallCenterlines.map((w) => ({
    x: (w.x1 + w.x2) / 2,
    y: (w.y1 + w.y2) / 2,
  }));
}

function nearestEndpoint(
  x: number,
  y: number,
  pts: Array<{ x: number; y: number }>,
  tolFt: number,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = tolFt;
  for (const p of pts) {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function projectToGuide(
  x: number,
  y: number,
  g: CadGuidelineFt,
  tolFt: number,
): { x: number; y: number } | null {
  const dx = g.x2 - g.x1;
  const dy = g.y2 - g.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return null;
  const t = ((x - g.x1) * dx + (y - g.y1) * dy) / len2;
  const qx = g.x1 + t * dx;
  const qy = g.y1 + t * dy;
  const d = Math.hypot(x - qx, y - qy);
  if (d > tolFt) return null;
  return { x: qx, y: qy };
}

export function applyOrtho(
  start: { x: number; y: number },
  end: { x: number; y: number },
  force = false,
): { x: number; y: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (!force && Math.abs(dx) >= 0.01 && Math.abs(dy) >= 0.01) {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax > 0 && ay / ax > 0.35 && ay / ax < 2.85) {
      return end;
    }
  }
  if (Math.abs(dx) >= Math.abs(dy)) return { x: end.x, y: start.y };
  return { x: start.x, y: end.y };
}

export function applyAngleSnap(
  start: { x: number; y: number },
  end: { x: number; y: number },
  stepDeg = ANGLE_SNAP_DEG,
): { x: number; y: number } | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.2) return null;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const snapped = Math.round(ang / stepDeg) * stepDeg;
  if (Math.abs(ang - snapped) > stepDeg * 0.35) return null;
  const rad = (snapped * Math.PI) / 180;
  return { x: start.x + Math.cos(rad) * len, y: start.y + Math.sin(rad) * len };
}

export function snapCadDraftPoint(
  plate: CadPlate,
  x: number,
  y: number,
  opts?: {
    enabled?: boolean;
    ortho?: boolean;
    angleSnap?: boolean;
    from?: { x: number; y: number } | null;
  },
): CadSnapResult {
  if (opts?.enabled === false) return { x, y, kind: 'free' };

  const ep = nearestEndpoint(x, y, collectEndpoints(plate), ENDPOINT_TOL_FT);
  if (ep) return { x: ep.x, y: ep.y, kind: 'endpoint' };

  const mid = nearestEndpoint(x, y, collectMidpoints(plate), MIDPOINT_TOL_FT);
  if (mid) return { x: mid.x, y: mid.y, kind: 'midpoint' };

  for (const g of plate.guidelines ?? []) {
    const hit = projectToGuide(x, y, g, GUIDE_TOL_FT);
    if (hit) return { x: hit.x, y: hit.y, kind: 'guide' };
  }

  if (opts?.ortho && opts.from) {
    const o = applyOrtho(opts.from, { x, y }, true);
    return { x: o.x, y: o.y, kind: 'ortho' };
  }

  if (opts?.from) {
    const soft = applyOrtho(opts.from, { x, y }, false);
    if (soft.x !== x || soft.y !== y) return { x: soft.x, y: soft.y, kind: 'ortho' };
  }

  if (opts?.angleSnap !== false && opts?.from) {
    const a = applyAngleSnap(opts.from, { x, y });
    if (a) return { x: a.x, y: a.y, kind: 'angle' };
  }

  return { x, y, kind: 'free' };
}

export function defaultWallThicknessFt(
  wall: Pick<CadWallCenterlineFt, 'exterior' | 'layer' | 'thicknessFt'>,
): number {
  if (wall.thicknessFt != null && Number.isFinite(wall.thicknessFt)) return wall.thicknessFt;
  if (wall.exterior || /EXT/i.test(wall.layer ?? '')) return 0.5;
  return 0.333;
}
