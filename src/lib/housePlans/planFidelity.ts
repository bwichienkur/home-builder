import type { HousePlan, PlanPointFt, PlanRoomRect } from './buildPlan';
import { polygonAreaFt, roomPointsFt } from './buildPlan';

export type PlanFidelityMetrics = {
  roomCount: number;
  livingSqFt: number;
  wallBboxSqFt: number;
  /** Union of room footprints on a raster grid ÷ room AABB (0–1). Low when polygons leave open-plan gaps. */
  rasterCoveragePct: number;
  /** Parsed from flood-fill warnings when present (preferred regression signal). */
  envelopeCoveragePct?: number;
  /** Sum of room polygon areas (overlaps double-count). */
  grossRoomAreaSqFt: number;
  /** Expected name-pattern hits (uppercase substring match). */
  namedRoomHits: string[];
  missingExpectedNames: string[];
  roomNames: string[];
  outdoorRoomCount: number;
  polygonRoomCount: number;
};

export type PlanFidelityThresholds = {
  minRoomCount: number;
  minNamedHits: number;
  /** Parsed flood-fill envelope coverage (0–1), when import warnings include it. */
  minEnvelopeCoveragePct?: number;
  minLivingSqFt: number;
  minGrossRoomAreaSqFt: number;
  /** Substrings — a room name must include each pattern (case-insensitive). */
  requiredNamePatterns: string[];
};

export type PlanFidelityEvaluation = {
  pass: boolean;
  failures: string[];
  metrics: PlanFidelityMetrics;
};

/** Winding-number point-in-polygon (handles CW/CCW and axis-aligned boxes). */
function pointInPoly(px: number, py: number, pts: PlanPointFt[]): boolean {
  if (pts.length < 3) return false;
  let winding = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    if (a.y <= py) {
      if (b.y > py && (b.x - a.x) * (py - a.y) - (px - a.x) * (b.y - a.y) > 0) winding++;
    } else if (b.y <= py && (b.x - a.x) * (py - a.y) - (px - a.x) * (b.y - a.y) < 0) {
      winding--;
    }
  }
  return winding !== 0;
}

/** Axis-aligned bounding box area (sq ft) spanning all room AABBs. */
export function computeWallBboxSqFt(rooms: PlanRoomRect[]): number {
  if (!rooms.length) return 0;
  const xs = rooms.flatMap((r) => [r.x, r.x + r.w]);
  const ys = rooms.flatMap((r) => [r.y, r.y + r.h]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return Math.max(0, w * h);
}

/**
 * Raster union of room polygons over the wall bbox.
 * Uses cell centers inside each room footprint — de-duplicates overlaps.
 */
export function rasterFloorCoveragePct(rooms: PlanRoomRect[], resFt = 0.5): number {
  if (!rooms.length) return 0;
  const xs = rooms.flatMap((r) => [r.x, r.x + r.w]);
  const ys = rooms.flatMap((r) => [r.y, r.y + r.h]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const spanW = maxX - minX;
  const spanH = maxY - minY;
  if (spanW <= 0 || spanH <= 0) return 0;

  const cols = Math.max(1, Math.ceil(spanW / resFt));
  const rows = Math.max(1, Math.ceil(spanH / resFt));
  const painted = new Set<number>();

  for (const room of rooms) {
    const pts = roomPointsFt(room);
    const c0 = Math.max(0, Math.floor((room.x - minX) / resFt));
    const c1 = Math.min(cols, Math.ceil((room.x + room.w - minX) / resFt));
    const r0 = Math.max(0, Math.floor((room.y - minY) / resFt));
    const r1 = Math.min(rows, Math.ceil((room.y + room.h - minY) / resFt));
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        const cx = minX + (c + 0.5) * resFt;
        const cy = minY + (r + 0.5) * resFt;
        if (pointInPoly(cx, cy, pts)) painted.add(r * cols + c);
      }
    }
  }

  return painted.size / (cols * rows);
}

/** Extract "62% wall-bbox coverage" from flood-fill import warnings. */
export function parseEnvelopeCoveragePct(warnings: string[]): number | undefined {
  for (const w of warnings) {
    const m = w.match(/(\d+(?:\.\d+)?)% wall-bbox coverage/i);
    if (m) return Number(m[1]) / 100;
  }
  return undefined;
}

export function matchRoomNamePatterns(
  roomNames: string[],
  patterns: string[],
): { hits: string[]; missing: string[] } {
  const upper = roomNames.map((n) => n.toUpperCase());
  const hits: string[] = [];
  const missing: string[] = [];
  for (const pattern of patterns) {
    const key = pattern.toUpperCase();
    if (upper.some((n) => n.includes(key))) hits.push(pattern);
    else missing.push(pattern);
  }
  return { hits, missing };
}

export function computePlanFidelityMetrics(
  plan: HousePlan,
  opts?: { expectedNamePatterns?: string[]; floorIndex?: number; importWarnings?: string[] },
): PlanFidelityMetrics {
  const floorIndex = opts?.floorIndex ?? 0;
  const rooms = plan.floors[floorIndex]?.rooms ?? [];
  const conditioned = rooms.filter((r) => r.roomType !== 'Outdoor');
  const roomNames = rooms.map((r) => r.name);
  const patterns = opts?.expectedNamePatterns ?? [];
  const { hits, missing } = matchRoomNamePatterns(roomNames, patterns);

  return {
    roomCount: rooms.length,
    livingSqFt: plan.livingSqFt,
    wallBboxSqFt: computeWallBboxSqFt(conditioned.length ? conditioned : rooms),
    rasterCoveragePct: rasterFloorCoveragePct(conditioned.length ? conditioned : rooms),
    envelopeCoveragePct: opts?.importWarnings?.length
      ? parseEnvelopeCoveragePct(opts.importWarnings)
      : undefined,
    grossRoomAreaSqFt: rooms.reduce((s, r) => s + polygonAreaFt(roomPointsFt(r)), 0),
    namedRoomHits: hits,
    missingExpectedNames: missing,
    roomNames,
    outdoorRoomCount: rooms.filter((r) => r.roomType === 'Outdoor').length,
    polygonRoomCount: rooms.filter((r) => r.pointsFt && r.pointsFt.length >= 3).length,
  };
}

export function evaluatePlanFidelity(
  metrics: PlanFidelityMetrics,
  thresholds: PlanFidelityThresholds,
): PlanFidelityEvaluation {
  const failures: string[] = [];
  if (metrics.roomCount < thresholds.minRoomCount) {
    failures.push(`room count ${metrics.roomCount} < ${thresholds.minRoomCount}`);
  }
  if (metrics.namedRoomHits.length < thresholds.minNamedHits) {
    failures.push(
      `named hits ${metrics.namedRoomHits.length} < ${thresholds.minNamedHits} (missing: ${metrics.missingExpectedNames.join(', ')})`,
    );
  }
  if (thresholds.minEnvelopeCoveragePct != null) {
    if (metrics.envelopeCoveragePct == null) {
      failures.push('envelope coverage missing from import warnings');
    } else if (metrics.envelopeCoveragePct < thresholds.minEnvelopeCoveragePct) {
      failures.push(
        `envelope coverage ${(metrics.envelopeCoveragePct * 100).toFixed(1)}% < ${(thresholds.minEnvelopeCoveragePct * 100).toFixed(1)}%`,
      );
    }
  }
  if (metrics.livingSqFt < thresholds.minLivingSqFt) {
    failures.push(`living sq ft ${metrics.livingSqFt} < ${thresholds.minLivingSqFt}`);
  }
  if (metrics.grossRoomAreaSqFt < thresholds.minGrossRoomAreaSqFt) {
    failures.push(
      `gross room area ${Math.round(metrics.grossRoomAreaSqFt)} < ${thresholds.minGrossRoomAreaSqFt}`,
    );
  }
  for (const pattern of thresholds.requiredNamePatterns) {
    if (!metrics.namedRoomHits.some((h) => h.toUpperCase() === pattern.toUpperCase())) {
      failures.push(`required room name missing: ${pattern}`);
    }
  }
  return { pass: failures.length === 0, failures, metrics };
}

/** Debug SVG — room footprints with labels (plan feet, Y-up in model space). */
export function renderFidelityRoomSvg(rooms: PlanRoomRect[]): string {
  if (!rooms.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text x="1" y="5">No rooms</text></svg>`;
  }
  const xs = rooms.flatMap((r) => [r.x, r.x + r.w]);
  const ys = rooms.flatMap((r) => [r.y, r.y + r.h]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanW = Math.max(...xs) - minX;
  const spanH = Math.max(...ys) - minY;
  const pad = 2;
  const W = spanW + pad * 2;
  const H = spanH + pad * 2;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#f1f5f9"/>`;
  svg += `<g transform="translate(${pad - minX} ${H + minY - pad}) scale(1,-1)">`;
  for (const r of rooms) {
    const pts = roomPointsFt(r);
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
    const fill =
      r.roomType === 'Outdoor'
        ? 'rgba(134,239,172,0.45)'
        : /garage/i.test(r.name)
          ? 'rgba(148,163,184,0.5)'
          : 'rgba(217,168,106,0.45)';
    svg += `<path d="${d}" fill="${fill}" stroke="#92400e" stroke-width="0.12"/>`;
  }
  svg += `</g>`;
  for (const r of rooms) {
    const tx = r.x - minX + pad + r.w / 2;
    const ty = H - (r.y - minY + pad + r.h / 2);
    const label = r.name.replace(/&/g, '&amp;').slice(0, 24);
    svg += `<text x="${tx}" y="${ty}" text-anchor="middle" font-size="1" fill="#1e293b" font-family="sans-serif">${label}</text>`;
  }
  svg += `</svg>`;
  return svg;
}
