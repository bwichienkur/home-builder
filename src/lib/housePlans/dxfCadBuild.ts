/**
 * CAD-faithful DXF build: walls from imported segments, room floors as polygons
 * (open edges allowed — walls are not synthesized from room boxes).
 */
import type { Opening, Point, Wall } from '../../types';
import { WORLD_ORIGIN } from '../geometry/placement';
import { PIXELS_PER_METER } from '../geometry/snapping';
import type { BuiltFloor, HousePlanFloor, PlanPointFt, PlanRoomRect } from './buildPlan';
import { roomPointsFt } from './buildPlan';
import type { Seg } from './dxfRooms';

const FT_TO_M = 0.3048;

export type PlanWallSegmentFt = Seg & {
  exterior?: boolean;
  thicknessFt?: number;
  materialId?: string;
};
export type PlanOpeningHintFt = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'door' | 'window' | 'passage' | 'garage';
  layer?: string;
  /** Optional sill height in feet (windows). */
  sillFt?: number;
  /** Optional clear opening height in feet. */
  heightFt?: number;
  swing?: 'left' | 'right' | 'none';
};

function ftToPx(ft: number) {
  return ft * FT_TO_M * PIXELS_PER_METER;
}

function segLen(s: { x1: number; y1: number; x2: number; y2: number }) {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
}

function translatePoint(p: PlanPointFt, dx: number, dy: number): PlanPointFt {
  return { x: p.x - dx, y: p.y - dy };
}

export function translateRoomsAndWalls(
  rooms: PlanRoomRect[],
  walls: PlanWallSegmentFt[],
  openings: PlanOpeningHintFt[] = [],
): {
  rooms: PlanRoomRect[];
  walls: PlanWallSegmentFt[];
  openings: PlanOpeningHintFt[];
  origin: PlanPointFt;
} {
  const allX = [
    ...rooms.flatMap((r) => roomPointsFt(r).map((p) => p.x)),
    ...walls.flatMap((s) => [s.x1, s.x2]),
    ...openings.flatMap((s) => [s.x1, s.x2]),
  ];
  const allY = [
    ...rooms.flatMap((r) => roomPointsFt(r).map((p) => p.y)),
    ...walls.flatMap((s) => [s.y1, s.y2]),
    ...openings.flatMap((s) => [s.y1, s.y2]),
  ];
  if (!allX.length) return { rooms, walls, openings, origin: { x: 0, y: 0 } };
  const ox = Math.min(...allX);
  const oy = Math.min(...allY);
  return {
    origin: { x: ox, y: oy },
    rooms: rooms.map((r) => ({
      ...r,
      x: r.x - ox,
      y: r.y - oy,
      pointsFt: r.pointsFt?.map((p) => translatePoint(p, ox, oy)),
    })),
    walls: walls.map((s) => ({
      ...s,
      x1: s.x1 - ox,
      y1: s.y1 - oy,
      x2: s.x2 - ox,
      y2: s.y2 - oy,
    })),
    openings: openings.map((s) => ({
      ...s,
      x1: s.x1 - ox,
      y1: s.y1 - oy,
      x2: s.x2 - ox,
      y2: s.y2 - oy,
    })),
  };
}

function ceilingMeters(rooms: PlanRoomRect[], fallback = 2.74) {
  const vals = rooms.map((r) => (r.ceilingFt ?? 9) * FT_TO_M);
  return vals.length ? Math.max(...vals) : fallback;
}

/** Project a point onto a segment; returns t in [0,1] and distance in feet. */
function projectPointToSeg(
  px: number,
  py: number,
  s: { x1: number; y1: number; x2: number; y2: number },
): { t: number; dist: number } {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return { t: 0, dist: Math.hypot(px - s.x1, py - s.y1) };
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / len2));
  const qx = s.x1 + t * dx;
  const qy = s.y1 + t * dy;
  return { t, dist: Math.hypot(px - qx, py - qy) };
}

/**
 * Map DXF door/window hints (and colinear wall gaps) onto CAD wall runs as Opening entities.
 */
export function openingsFromCadHints(
  walls: Wall[],
  segments: PlanWallSegmentFt[],
  hints: PlanOpeningHintFt[],
  height: number,
): Opening[] {
  if (!walls.length || !segments.length) return [];
  const openings: Opening[] = [];
  const used = new Set<string>();

  const addOpening = (
    wallIdx: number,
    offset: number,
    widthFt: number,
    kind: 'door' | 'window' | 'passage' | 'garage',
    idSuffix: string,
    sillFt?: number,
    heightFt?: number,
    swing?: 'left' | 'right' | 'none',
  ) => {
    const wall = walls[wallIdx]!;
    const wallLenFt = segLen(segments[wallIdx]!);
    if (wallLenFt < 1.5) return;
    const maxW = kind === 'garage' ? 5.5 : kind === 'window' ? 2.4 : 1.2;
    const minW = kind === 'garage' ? 2.4 : kind === 'window' ? 0.6 : 0.7;
    const widthM = Math.min(maxW, Math.max(minW, widthFt * FT_TO_M), wallLenFt * FT_TO_M * 0.95);
    const half = widthM / 2 / (wallLenFt * FT_TO_M);
    const clamped = Math.max(half + 0.02, Math.min(1 - half - 0.02, offset));
    const key = `${wall.id}:${kind}:${clamped.toFixed(2)}:${widthM.toFixed(2)}`;
    if (used.has(key)) return;
    used.add(key);
    const sillM =
      kind === 'window'
        ? sillFt != null && Number.isFinite(sillFt)
          ? Math.max(0, sillFt * FT_TO_M)
          : 0.9
        : 0;
    const heightM =
      heightFt != null && Number.isFinite(heightFt)
        ? Math.min(height * 0.98, Math.max(0.4, heightFt * FT_TO_M))
        : kind === 'window'
          ? Math.min(1.4, height * 0.45)
          : kind === 'garage'
            ? Math.min(2.4, height * 0.92)
            : Math.min(2.1, height * 0.95);
    openings.push({
      id: `${wall.id}-${idSuffix}`,
      wallId: wall.id,
      type: kind,
      offset: clamped,
      width: widthM,
      height: heightM,
      sill: sillM,
      swing: swing ?? (kind === 'door' ? 'left' : undefined),
      shape: kind === 'garage' ? 'wide' : undefined,
    });
  };

  // 1) Explicit door/window layer hints → nearest wall.
  for (let hi = 0; hi < hints.length; hi++) {
    const hint = hints[hi]!;
    const hx = (hint.x1 + hint.x2) / 2;
    const hy = (hint.y1 + hint.y2) / 2;
    const hintLen = segLen(hint);
    // Skip tiny swing ticks / noise; skip huge runs that are likely walls mis-layered.
    if (hintLen < 0.8 || hintLen > 16) continue;

    let bestIdx = -1;
    let bestDist = Infinity;
    let bestT = 0.5;
    for (let i = 0; i < segments.length; i++) {
      const mid = projectPointToSeg(hx, hy, segments[i]!);
      const a = projectPointToSeg(hint.x1, hint.y1, segments[i]!);
      const b = projectPointToSeg(hint.x2, hint.y2, segments[i]!);
      const dist = Math.min(mid.dist, (a.dist + b.dist) / 2);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
        bestT = mid.t;
      }
    }
    // Must sit near a wall (within ~2.5 ft of centerline).
    if (bestIdx < 0 || bestDist > 2.5) continue;
    const widthFt = Math.min(
      18,
      Math.max(
        hint.kind === 'window' ? 2 : hint.kind === 'garage' ? 9 : 2.5,
        hintLen,
      ),
    );
    addOpening(
      bestIdx,
      bestT,
      widthFt,
      hint.kind,
      `hint-${hi}`,
      hint.sillFt,
      hint.heightFt,
      hint.swing,
    );
  }

  // 2) Colinear wall gaps (1.8–4.5 ft) → passage/door openings when no hint covered them.
  for (let i = 0; i < segments.length; i++) {
    const a = segments[i]!;
    const aLen = segLen(a);
    if (aLen < 1) continue;
    const aDx = a.x2 - a.x1;
    const aDy = a.y2 - a.y1;
    for (let j = i + 1; j < segments.length; j++) {
      const b = segments[j]!;
      const bLen = segLen(b);
      if (bLen < 1) continue;
      // Same orientation (both H or both V).
      const aHoriz = Math.abs(aDy) < 0.15;
      const bHoriz = Math.abs(b.y2 - b.y1) < 0.15;
      const aVert = Math.abs(aDx) < 0.15;
      const bVert = Math.abs(b.x2 - b.x1) < 0.15;
      if (!(aHoriz && bHoriz) && !(aVert && bVert)) continue;

      // Share the same line within tolerance.
      if (aHoriz && Math.abs((a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2) > 0.35) continue;
      if (aVert && Math.abs((a.x1 + a.x2) / 2 - (b.x1 + b.x2) / 2) > 0.35) continue;

      const endpoints = [
        { ax: a.x1, ay: a.y1, bx: b.x1, by: b.y1 },
        { ax: a.x1, ay: a.y1, bx: b.x2, by: b.y2 },
        { ax: a.x2, ay: a.y2, bx: b.x1, by: b.y1 },
        { ax: a.x2, ay: a.y2, bx: b.x2, by: b.y2 },
      ];
      let gap = Infinity;
      let gx = 0;
      let gy = 0;
      for (const e of endpoints) {
        const d = Math.hypot(e.ax - e.bx, e.ay - e.by);
        if (d < gap) {
          gap = d;
          gx = (e.ax + e.bx) / 2;
          gy = (e.ay + e.by) / 2;
        }
      }
      if (gap < 2.2 || gap > 4.5) continue;

      // Prefer the longer wall as host; place opening near the gap endpoint.
      const host = aLen >= bLen ? i : j;
      const hostSeg = segments[host]!;
      const dStart = Math.hypot(gx - hostSeg.x1, gy - hostSeg.y1);
      const dEnd = Math.hypot(gx - hostSeg.x2, gy - hostSeg.y2);
      const tNear = dStart <= dEnd ? 0 : 1;
      // Nudge inward so the opening sits on the wall run, not past the tip.
      const inset = Math.min(0.35, (gap * 0.5) / Math.max(segLen(hostSeg), 1));
      const t = tNear === 0 ? inset : 1 - inset;
      const already = openings.some(
        (o) => o.wallId === walls[host]!.id && Math.abs(o.offset - t) < 0.12,
      );
      if (already) continue;
      addOpening(host, t, gap, 'door', `gap-${i}-${j}`);
    }
  }

  return openings;
}

/** Build scene walls from CAD centerlines; room polygons are floor-only (no box walls). */
export function buildFloorFromCadWalls(
  floor: HousePlanFloor,
  opts?: {
    centerFt?: { cx: number; cy: number };
    wallSegmentsFt?: PlanWallSegmentFt[];
    openingHintsFt?: PlanOpeningHintFt[];
  },
): BuiltFloor {
  const rooms = floor.rooms;
  const segments = opts?.wallSegmentsFt ?? floor.wallSegmentsFt ?? [];
  const hints = opts?.openingHintsFt ?? floor.openingHintsFt ?? [];
  if (!rooms.length && !segments.length) {
    return {
      id: floor.id,
      name: floor.name,
      rooms: [],
      roomPolygons: [],
      scene: { walls: [], openings: [], furniture: [], floorColor: '#c9b18f', wallColor: '#f3f0e9', ceilingColor: '#f4f6f8' },
    };
  }

  const allPts = [
    ...rooms.flatMap((r) => roomPointsFt(r)),
    ...segments.flatMap((s) => [
      { x: s.x1, y: s.y1 },
      { x: s.x2, y: s.y2 },
    ]),
  ];
  const minX = Math.min(...allPts.map((p) => p.x));
  const minY = Math.min(...allPts.map((p) => p.y));
  const maxX = Math.max(...allPts.map((p) => p.x));
  const maxY = Math.max(...allPts.map((p) => p.y));
  const cx = opts?.centerFt?.cx ?? (minX + maxX) / 2;
  const cy = opts?.centerFt?.cy ?? (minY + maxY) / 2;

  const toPoint = (xFt: number, yFt: number): Point => ({
    x: WORLD_ORIGIN.x + ftToPx(xFt - cx),
    y: WORLD_ORIGIN.y + ftToPx(yFt - cy),
  });

  const roomPolygons = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    roomType: r.roomType,
    points: roomPointsFt(r).map((p) => toPoint(p.x, p.y)),
  }));

  const height = ceilingMeters(rooms);
  const walls: Wall[] = segments.map((s, i) => {
    const thicknessM =
      s.thicknessFt != null && Number.isFinite(s.thicknessFt)
        ? Math.max(0.05, s.thicknessFt * FT_TO_M)
        : s.exterior
          ? 0.18
          : 0.12;
    return {
      id: `${floor.id}-cad-${i}`,
      start: toPoint(s.x1, s.y1),
      end: toPoint(s.x2, s.y2),
      thickness: thicknessM,
      height,
      assembly: s.exterior ? 'exterior' : 'interior',
      materialId: s.materialId,
    };
  });

  const openings = openingsFromCadHints(walls, segments, hints, height);

  return {
    id: floor.id,
    name: floor.name,
    rooms,
    roomPolygons,
    scene: {
      walls,
      openings,
      furniture: [],
      floorColor: '#c9b18f',
      wallColor: '#f3f0e9',
      ceilingColor: '#f4f6f8',
    },
  };
}

/** Plate center used by buildFloorFromCadWalls for a floor's rooms + wall segments. */
export function cadBuildCenterFt(floor: Pick<HousePlanFloor, 'rooms' | 'wallSegmentsFt'>): {
  cx: number;
  cy: number;
} {
  const rooms = floor.rooms ?? [];
  const segments = floor.wallSegmentsFt ?? [];
  const allPts = [
    ...rooms.flatMap((r) => roomPointsFt(r)),
    ...segments.flatMap((s) => [
      { x: s.x1, y: s.y1 },
      { x: s.x2, y: s.y2 },
    ]),
  ];
  if (!allPts.length) return { cx: 0, cy: 0 };
  const minX = Math.min(...allPts.map((p) => p.x));
  const minY = Math.min(...allPts.map((p) => p.y));
  const maxX = Math.max(...allPts.map((p) => p.x));
  const maxY = Math.max(...allPts.map((p) => p.y));
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}
