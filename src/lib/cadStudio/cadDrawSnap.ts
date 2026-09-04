import type { CadGuidelineFt, CadPlate, CadWallCenterlineFt } from './types';

const ENDPOINT_TOL_FT = 0.85;
const GUIDE_TOL_FT = 0.65;

export type CadSnapResult = {
  x: number;
  y: number;
  kind: 'endpoint' | 'guide' | 'ortho' | 'free';
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
  // Infinite line projection (guides extend virtually).
  const t = ((x - g.x1) * dx + (y - g.y1) * dy) / len2;
  const qx = g.x1 + t * dx;
  const qy = g.y1 + t * dy;
  const d = Math.hypot(x - qx, y - qy);
  if (d > tolFt) return null;
  return { x: qx, y: qy };
}

/** Lock draft end to horizontal or vertical from start when closer than 45°. */
export function applyOrtho(
  start: { x: number; y: number },
  end: { x: number; y: number },
  force = false,
): { x: number; y: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (!force && Math.abs(dx) >= 0.01 && Math.abs(dy) >= 0.01) {
    // Prefer axis with larger delta unless nearly diagonal.
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax > 0 && ay / ax > 0.35 && ay / ax < 2.85) {
      // Not close enough to axis — leave free unless Shift forces.
      return end;
    }
  }
  if (Math.abs(dx) >= Math.abs(dy)) return { x: end.x, y: start.y };
  return { x: start.x, y: end.y };
}

/**
 * Snap a plan-feet cursor for CAD drafting.
 * Priority: wall/opening endpoints → guidelines → optional ortho from draft start.
 */
export function snapCadDraftPoint(
  plate: CadPlate,
  x: number,
  y: number,
  opts?: {
    enabled?: boolean;
    ortho?: boolean;
    from?: { x: number; y: number } | null;
  },
): CadSnapResult {
  if (opts?.enabled === false) return { x, y, kind: 'free' };

  const ep = nearestEndpoint(x, y, collectEndpoints(plate), ENDPOINT_TOL_FT);
  if (ep) return { x: ep.x, y: ep.y, kind: 'endpoint' };

  for (const g of plate.guidelines ?? []) {
    const hit = projectToGuide(x, y, g, GUIDE_TOL_FT);
    if (hit) return { x: hit.x, y: hit.y, kind: 'guide' };
  }

  if (opts?.ortho && opts.from) {
    const o = applyOrtho(opts.from, { x, y }, true);
    return { x: o.x, y: o.y, kind: 'ortho' };
  }

  // Soft ortho when nearly axis-aligned from draft start.
  if (opts?.from) {
    const soft = applyOrtho(opts.from, { x, y }, false);
    if (soft.x !== x || soft.y !== y) return { x: soft.x, y: soft.y, kind: 'ortho' };
  }

  return { x, y, kind: 'free' };
}

/** Default wall thickness (feet) from layer / exterior flag. */
export function defaultWallThicknessFt(wall: Pick<CadWallCenterlineFt, 'exterior' | 'layer'>): number {
  if (wall.thicknessFt != null && Number.isFinite(wall.thicknessFt)) return wall.thicknessFt;
  if (wall.exterior || /EXT/i.test(wall.layer ?? '')) return 0.5;
  return 0.333;
}
