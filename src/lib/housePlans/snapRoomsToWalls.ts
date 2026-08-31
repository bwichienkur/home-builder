/**
 * Snap imported room polygons onto CAD wall segments so fills register with the overlay.
 * Edge-based: only edges nearly parallel to a nearby wall are projected onto that wall.
 * Soft/open-plan edges (no parallel wall) stay put.
 */
import type { PlanPointFt, PlanRoomRect } from './buildPlan';

export type WallSegFt = { x1: number; y1: number; x2: number; y2: number };

function distPointToSeg(
  px: number,
  py: number,
  s: WallSegFt,
): { d: number; qx: number; qy: number; t: number } {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) {
    const d = Math.hypot(px - s.x1, py - s.y1);
    return { d, qx: s.x1, qy: s.y1, t: 0 };
  }
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / len2));
  const qx = s.x1 + t * dx;
  const qy = s.y1 + t * dy;
  return { d: Math.hypot(px - qx, py - qy), qx, qy, t };
}

function roomPts(r: PlanRoomRect): PlanPointFt[] {
  if (r.pointsFt && r.pointsFt.length >= 3) return r.pointsFt.map((p) => ({ ...p }));
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

function projectPointToLine(px: number, py: number, s: WallSegFt): PlanPointFt {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return { x: s.x1, y: s.y1 };
  // Infinite line projection (not clamped) so corners can slide past segment ends.
  const t = ((px - s.x1) * dx + (py - s.y1) * dy) / len2;
  return { x: s.x1 + t * dx, y: s.y1 + t * dy };
}

/**
 * Pull room edges onto nearby parallel CAD walls.
 * Keeps open-plan soft edges free when no parallel wall is nearby.
 */
export function snapRoomsToWallSegments(
  rooms: PlanRoomRect[],
  walls: WallSegFt[],
  maxDistFt = 1.35,
): PlanRoomRect[] {
  if (!rooms.length || !walls.length) return rooms;
  const usable = walls.filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) >= 1.5);
  if (!usable.length) return rooms;

  return rooms.map((room) => {
    // Outdoor pads are synthetic — don't pin them to house walls.
    if (room.roomType === 'Outdoor') return room;
    const pts = roomPts(room);
    const n = pts.length;
    if (n < 3) return room;

    // Mutable copy — sequential edge snaps so corners become wall-line intersections.
    const snapped = pts.map((p) => ({ ...p }));
    let claimed = 0;

    for (let i = 0; i < n; i++) {
      const a = snapped[i]!;
      const b = snapped[(i + 1) % n]!;
      const edx = b.x - a.x;
      const edy = b.y - a.y;
      const elen = Math.hypot(edx, edy);
      if (elen < 0.75) continue;
      const eux = edx / elen;
      const euy = edy / elen;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;

      let best: { d: number; wall: WallSegFt } | null = null;
      for (const s of usable) {
        const wdx = s.x2 - s.x1;
        const wdy = s.y2 - s.y1;
        const wlen = Math.hypot(wdx, wdy);
        if (wlen < 1.5) continue;
        const wux = wdx / wlen;
        const wuy = wdy / wlen;
        if (Math.abs(eux * wux + euy * wuy) < 0.92) continue;
        const mid = distPointToSeg(mx, my, s);
        const da = distPointToSeg(a.x, a.y, s).d;
        const db = distPointToSeg(b.x, b.y, s).d;
        if (Math.max(mid.d, Math.min(da, db)) > maxDistFt) continue;
        if (!best || mid.d < best.d) best = { d: mid.d, wall: s };
      }
      if (!best) continue;
      claimed++;
      const j = (i + 1) % n;
      snapped[i] = projectPointToLine(snapped[i]!.x, snapped[i]!.y, best.wall);
      snapped[j] = projectPointToLine(snapped[j]!.x, snapped[j]!.y, best.wall);
    }

    if (claimed < 1) return room;

    // Drop consecutive duplicates after snap.
    const cleaned: PlanPointFt[] = [];
    for (const p of snapped) {
      const prev = cleaned[cleaned.length - 1];
      if (prev && Math.hypot(prev.x - p.x, prev.y - p.y) < 0.05) continue;
      cleaned.push(p);
    }
    if (cleaned.length >= 3) {
      const first = cleaned[0]!;
      const last = cleaned[cleaned.length - 1]!;
      if (Math.hypot(first.x - last.x, first.y - last.y) < 0.05) cleaned.pop();
    }
    if (cleaned.length < 3) return room;

    const xs = cleaned.map((p) => p.x);
    const ys = cleaned.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      ...room,
      x: minX,
      y: minY,
      w: Math.max(0.5, maxX - minX),
      h: Math.max(0.5, maxY - minY),
      pointsFt: cleaned,
    };
  });
}

/** Median distance (ft) from room boundary samples to nearest wall — registration score. */
export function medianRoomWallRegistrationFt(
  rooms: PlanRoomRect[],
  walls: WallSegFt[],
  samplesPerEdge = 3,
): number {
  if (!rooms.length || !walls.length) return Infinity;
  const dists: number[] = [];
  for (const room of rooms) {
    if (room.roomType === 'Outdoor') continue;
    const pts = roomPts(room);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const edgeLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (edgeLen < 1.0) continue;
      for (let k = 0; k < samplesPerEdge; k++) {
        const t = (k + 0.5) / samplesPerEdge;
        const px = a.x + (b.x - a.x) * t;
        const py = a.y + (b.y - a.y) * t;
        let best = Infinity;
        for (const s of walls) {
          const hit = distPointToSeg(px, py, s);
          if (hit.d < best) best = hit.d;
        }
        if (Number.isFinite(best)) dists.push(best);
      }
    }
  }
  if (!dists.length) return Infinity;
  dists.sort((a, b) => a - b);
  return dists[Math.floor(dists.length / 2)]!;
}

/**
 * Registration for edges that have a parallel wall within maxDist (solid edges only).
 * Soft open-plan edges are excluded so the score matches CAD overlay alignment.
 */
export function medianSolidEdgeRegistrationFt(
  rooms: PlanRoomRect[],
  walls: WallSegFt[],
  maxDistFt = 2.5,
): number {
  if (!rooms.length || !walls.length) return Infinity;
  const dists: number[] = [];
  for (const room of rooms) {
    if (room.roomType === 'Outdoor') continue;
    const pts = roomPts(room);
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % n]!;
      const edx = b.x - a.x;
      const edy = b.y - a.y;
      const elen = Math.hypot(edx, edy);
      if (elen < 1.0) continue;
      const eux = edx / elen;
      const euy = edy / elen;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      let best = Infinity;
      for (const s of walls) {
        const wdx = s.x2 - s.x1;
        const wdy = s.y2 - s.y1;
        const wlen = Math.hypot(wdx, wdy);
        if (wlen < 1.5) continue;
        if (Math.abs(eux * (wdx / wlen) + euy * (wdy / wlen)) < 0.92) continue;
        const d = distPointToSeg(mx, my, s).d;
        if (d < best) best = d;
      }
      if (best <= maxDistFt) dists.push(best);
    }
  }
  if (!dists.length) return Infinity;
  dists.sort((a, b) => a - b);
  return dists[Math.floor(dists.length / 2)]!;
}
