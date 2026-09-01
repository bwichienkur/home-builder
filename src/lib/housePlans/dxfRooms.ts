/**
 * Accurate-ish room extraction from architectural DXF wall segments.
 * Handles double-line walls, soft orthogonality, unit scaling, and flood-fill rooms.
 */
import type { PlanRoomRect } from './buildPlan';
import { room, poly } from './planFactories';
import type { RoomType } from '../../types';
import { looksLikeRoomName } from './dxfParse';

export type Seg = { x1: number; y1: number; x2: number; y2: number; layer?: string; linetype?: string };
export type RoomLabel = { x: number; y: number; text: string };

const FT_EPS = 0.08; // ~1" snap cluster
const ORTHO_RATIO = 0.04; // |min(dx,dy)|/|max| below this ⇒ treat as ortho
const MIN_ROOM_FT = 3;
const MIN_ROOM_AREA = 20; // sq ft
const WALL_THICK_MIN = 0.2; // ft (~2.5")

function isExteriorLayer(layer?: string): boolean {
  const u = (layer ?? '').toUpperCase();
  if (!u) return false;
  if (/INT|INTERIOR/.test(u) && !/EXT/.test(u)) return false;
  return /EXT|EXTERIOR|OUT/i.test(u) || /\bWALLS EXT\b/.test(u);
}

function segLength(s: Seg): number {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
}

function pointNearSegment(
  px: number,
  py: number,
  s: Seg,
  eps: number,
): boolean {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(px - s.x1, py - s.y1) <= eps;
  let t = ((px - s.x1) * dx + (py - s.y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy)) <= eps;
}

/** True when two wall centerlines share a corner or form a T-junction. */
function wallsJoin(a: Seg, b: Seg, eps = 0.35): boolean {
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
    if (pointNearSegment(p.x, p.y, b, eps)) return true;
  }
  for (const p of bEnds) {
    if (pointNearSegment(p.x, p.y, a, eps)) return true;
  }
  return false;
}

/**
 * Drop floating centerlines that do not join the wall graph.
 * Paired hatch / column / dimension fragments often survive double-line collapse
 * as short isolated runs that are not real partitions.
 */
export function dropIsolatedWallCenterlines(segments: Seg[], joinEps = 0.35): Seg[] {
  if (segments.length < 2) return segments;
  return segments.filter((s, i) =>
    segments.some((o, j) => i !== j && wallsJoin(s, o, joinEps)),
  );
}

/**
 * Collapse double-line walls to centerlines for scene rendering.
 * Prefers paired face→centerline results so lone dimension / witness / tick
 * lines on wall layers are not extruded as walls. Falls back to raw segments
 * only when pairing finds nothing (true single-line drawings).
 */
export function wallCenterlinesFromSegments(segments: Seg[]): (Seg & { exterior?: boolean })[] {
  const centers = centerlinesFromDoubleWalls(segments);
  // Any successful pairs win — unpaired annotation faces on wall layers must not
  // re-enter via a "% of raw faces" fallback. Single-line plans yield zero pairs.
  const source = centers.length > 0 ? centers : segments;
  const connected = dropIsolatedWallCenterlines(
    source.filter((s) => segLength(s) >= 1.5),
  );
  return connected.map((s) => ({
    ...s,
    exterior: isExteriorLayer(s.layer),
  }));
}

function polygonAreaFtLocal(points: { x: number; y: number }[]) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function simplifyOrthogonalPolygon(points: { x: number; y: number }[]) {
  if (points.length < 4) return points;
  const out: { x: number; y: number }[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]!;
    const cur = points[i]!;
    const next = points[(i + 1) % n]!;
    const colinearH = Math.abs(prev.y - cur.y) < 1e-6 && Math.abs(cur.y - next.y) < 1e-6;
    const colinearV = Math.abs(prev.x - cur.x) < 1e-6 && Math.abs(cur.x - next.x) < 1e-6;
    if (!colinearH && !colinearV) out.push(cur);
  }
  return out.length >= 3 ? out : points;
}

/** Trace an orthogonal polygon from flood-fill grid cells. */
export function traceRegionPolygon(
  cellIndices: number[],
  cols: number,
  res: number,
  originX: number,
  originY: number,
): { x: number; y: number }[] {
  const cells = new Set(cellIndices);
  const has = (c: number, r: number) => cells.has(r * cols + c);
  type GEdge = { x1: number; y1: number; x2: number; y2: number };
  const edges: GEdge[] = [];
  for (const idx of cells) {
    const c = idx % cols;
    const r = (idx / cols) | 0;
    if (!has(c, r - 1)) edges.push({ x1: c, y1: r, x2: c + 1, y2: r });
    if (!has(c + 1, r)) edges.push({ x1: c + 1, y1: r, x2: c + 1, y2: r + 1 });
    if (!has(c, r + 1)) edges.push({ x1: c + 1, y1: r + 1, x2: c, y2: r + 1 });
    if (!has(c - 1, r)) edges.push({ x1: c, y1: r + 1, x2: c, y2: r });
  }
  if (!edges.length) return [];
  const key = (x: number, y: number) => `${x},${y}`;
  const byStart = new Map<string, GEdge[]>();
  for (const e of edges) {
    const k = key(e.x1, e.y1);
    const list = byStart.get(k) ?? [];
    list.push(e);
    byStart.set(k, list);
  }
  const used = new Set<GEdge>();
  const loops: { x: number; y: number }[][] = [];
  for (const start of edges) {
    if (used.has(start)) continue;
    const loop: { x: number; y: number }[] = [];
    let cur: GEdge | null = start;
    let guard = 0;
    while (cur && guard++ < edges.length + 4) {
      used.add(cur);
      loop.push({ x: originX + cur.x1 * res, y: originY + cur.y1 * res });
      const candidates: GEdge[] = (byStart.get(key(cur.x2, cur.y2)) ?? []).filter((e) => !used.has(e));
      cur = candidates[0] ?? null;
      if (cur === start) break;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  if (!loops.length) return [];
  loops.sort((a, b) => polygonAreaFtLocal(b) - polygonAreaFtLocal(a));
  return simplifyOrthogonalPolygon(loops[0]!);
}

const WALL_THICK_MAX = 1.2; // ft (~14")
export function isNearOrtho(s: Seg): boolean {
  const dx = Math.abs(s.x1 - s.x2);
  const dy = Math.abs(s.y1 - s.y2);
  if (dx < 1e-9 && dy < 1e-9) return false;
  if (dx < 1e-6 || dy < 1e-6) return true;
  return Math.min(dx, dy) / Math.max(dx, dy) < ORTHO_RATIO;
}

export function snapOrtho(s: Seg): Seg {
  const dx = Math.abs(s.x1 - s.x2);
  const dy = Math.abs(s.y1 - s.y2);
  if (dx >= dy) {
    const y = (s.y1 + s.y2) / 2;
    return { ...s, y1: y, y2: y };
  }
  const x = (s.x1 + s.x2) / 2;
  return { ...s, x1: x, x2: x };
}

/** Cluster nearby numeric values (sorted) into snapped representatives. */
export function clusterValues(values: number[], eps = FT_EPS): Map<number, number> {
  const sorted = [...values].sort((a, b) => a - b);
  const map = new Map<number, number>();
  if (!sorted.length) return map;
  let group: number[] = [sorted[0]!];
  const flush = () => {
    const rep = group.reduce((a, b) => a + b, 0) / group.length;
    for (const v of group) map.set(v, rep);
    group = [];
  };
  for (let i = 1; i < sorted.length; i++) {
    const v = sorted[i]!;
    if (v - group[group.length - 1]! <= eps) group.push(v);
    else {
      flush();
      group = [v];
    }
  }
  flush();
  return map;
}

function snapSeg(s: Seg, xMap: Map<number, number>, yMap: Map<number, number>): Seg {
  const key = (m: Map<number, number>, v: number) => {
    if (m.has(v)) return m.get(v)!;
    let best = v;
    let bestD = Infinity;
    for (const [k, rep] of m) {
      const d = Math.abs(k - v);
      if (d < bestD) {
        bestD = d;
        best = rep;
      }
    }
    return bestD <= FT_EPS * 2 ? best : v;
  };
  return {
    ...s,
    x1: key(xMap, s.x1),
    x2: key(xMap, s.x2),
    y1: key(yMap, s.y1),
    y2: key(yMap, s.y2),
  };
}

/** Merge overlapping colinear horizontal/vertical segments. */
export function mergeColinear(segments: Seg[]): Seg[] {
  const horiz: Seg[] = [];
  const vert: Seg[] = [];
  for (const s of segments) {
    if (Math.abs(s.y1 - s.y2) <= FT_EPS) horiz.push(s);
    else if (Math.abs(s.x1 - s.x2) <= FT_EPS) vert.push(s);
  }

  const mergeGroup = (segs: Seg[], axis: 'h' | 'v'): Seg[] => {
    const byKey = new Map<string, Seg[]>();
    for (const s of segs) {
      const key =
        axis === 'h'
          ? String(Math.round(((s.y1 + s.y2) / 2) / FT_EPS) * FT_EPS)
          : String(Math.round(((s.x1 + s.x2) / 2) / FT_EPS) * FT_EPS);
      const list = byKey.get(key) ?? [];
      list.push(s);
      byKey.set(key, list);
    }
    const out: Seg[] = [];
    for (const [, group] of byKey) {
      const intervals = group
        .map((s) =>
          axis === 'h'
            ? { a: Math.min(s.x1, s.x2), b: Math.max(s.x1, s.x2), c: (s.y1 + s.y2) / 2, layer: s.layer }
            : { a: Math.min(s.y1, s.y2), b: Math.max(s.y1, s.y2), c: (s.x1 + s.x2) / 2, layer: s.layer },
        )
        .sort((u, v) => u.a - v.a);
      let cur = intervals[0]!;
      for (let i = 1; i < intervals.length; i++) {
        const n = intervals[i]!;
        if (n.a <= cur.b + FT_EPS * 2) {
          cur = { ...cur, b: Math.max(cur.b, n.b), c: (cur.c + n.c) / 2 };
        } else {
          out.push(
            axis === 'h'
              ? { x1: cur.a, y1: cur.c, x2: cur.b, y2: cur.c, layer: cur.layer }
              : { x1: cur.c, y1: cur.a, x2: cur.c, y2: cur.b, layer: cur.layer },
          );
          cur = n;
        }
      }
      out.push(
        axis === 'h'
          ? { x1: cur.a, y1: cur.c, x2: cur.b, y2: cur.c, layer: cur.layer }
          : { x1: cur.c, y1: cur.a, x2: cur.c, y2: cur.b, layer: cur.layer },
      );
    }
    return out;
  };

  return [...mergeGroup(horiz, 'h'), ...mergeGroup(vert, 'v')];
}

/**
 * Collapse parallel double-line walls to centerlines.
 * Unpaired faces are omitted — lone measurement, witness, and tick lines on wall
 * layers must not become wall centerlines. Single-line drawings are handled by
 * {@link wallCenterlinesFromSegments} falling back to raw segments.
 */
export function centerlinesFromDoubleWalls(segments: Seg[]): Seg[] {
  const horiz = segments.filter((s) => Math.abs(s.y1 - s.y2) <= FT_EPS);
  const vert = segments.filter((s) => Math.abs(s.x1 - s.x2) <= FT_EPS);
  const usedH = new Set<number>();
  const usedV = new Set<number>();
  const out: Seg[] = [];

  for (let i = 0; i < horiz.length; i++) {
    if (usedH.has(i)) continue;
    const a = horiz[i]!;
    const ay = (a.y1 + a.y2) / 2;
    const a0 = Math.min(a.x1, a.x2);
    const a1 = Math.max(a.x1, a.x2);
    let pair = -1;
    let bestDist = Infinity;
    for (let j = i + 1; j < horiz.length; j++) {
      if (usedH.has(j)) continue;
      const b = horiz[j]!;
      const by = (b.y1 + b.y2) / 2;
      const dist = Math.abs(ay - by);
      if (dist < WALL_THICK_MIN || dist > WALL_THICK_MAX) continue;
      const b0 = Math.min(b.x1, b.x2);
      const b1 = Math.max(b.x1, b.x2);
      const overlap = Math.min(a1, b1) - Math.max(a0, b0);
      if (overlap < Math.min(a1 - a0, b1 - b0) * 0.4) continue;
      if (dist < bestDist) {
        bestDist = dist;
        pair = j;
      }
    }
    if (pair >= 0) {
      const b = horiz[pair]!;
      const by = (b.y1 + b.y2) / 2;
      const b0 = Math.min(b.x1, b.x2);
      const b1 = Math.max(b.x1, b.x2);
      const y = (ay + by) / 2;
      out.push({ x1: Math.min(a0, b0), y1: y, x2: Math.max(a1, b1), y2: y, layer: a.layer });
      usedH.add(i);
      usedH.add(pair);
    }
  }

  for (let i = 0; i < vert.length; i++) {
    if (usedV.has(i)) continue;
    const a = vert[i]!;
    const ax = (a.x1 + a.x2) / 2;
    const a0 = Math.min(a.y1, a.y2);
    const a1 = Math.max(a.y1, a.y2);
    let pair = -1;
    let bestDist = Infinity;
    for (let j = i + 1; j < vert.length; j++) {
      if (usedV.has(j)) continue;
      const b = vert[j]!;
      const bx = (b.x1 + b.x2) / 2;
      const dist = Math.abs(ax - bx);
      if (dist < WALL_THICK_MIN || dist > WALL_THICK_MAX) continue;
      const b0 = Math.min(b.y1, b.y2);
      const b1 = Math.max(b.y1, b.y2);
      const overlap = Math.min(a1, b1) - Math.max(a0, b0);
      if (overlap < Math.min(a1 - a0, b1 - b0) * 0.4) continue;
      if (dist < bestDist) {
        bestDist = dist;
        pair = j;
      }
    }
    if (pair >= 0) {
      const b = vert[pair]!;
      const bx = (b.x1 + b.x2) / 2;
      const b0 = Math.min(b.y1, b.y2);
      const b1 = Math.max(b.y1, b.y2);
      const x = (ax + bx) / 2;
      out.push({ x1: x, y1: Math.min(a0, b0), x2: x, y2: Math.max(a1, b1), layer: a.layer });
      usedV.add(i);
      usedV.add(pair);
    }
  }

  return mergeColinear(out);
}

/** Bridge small gaps (door openings) so rooms stay enclosed for flood-fill. */
export function closeSmallGaps(segments: Seg[], maxGap = 3.5): Seg[] {
  const horiz = segments.filter((s) => Math.abs(s.y1 - s.y2) <= FT_EPS);
  const vert = segments.filter((s) => Math.abs(s.x1 - s.x2) <= FT_EPS);
  const out = [...segments];

  const byY = new Map<number, { a: number; b: number }[]>();
  for (const s of horiz) {
    const y = Math.round(((s.y1 + s.y2) / 2) / FT_EPS) * FT_EPS;
    const list = byY.get(y) ?? [];
    list.push({ a: Math.min(s.x1, s.x2), b: Math.max(s.x1, s.x2) });
    byY.set(y, list);
  }
  for (const [y, intervals] of byY) {
    intervals.sort((u, v) => u.a - v.a);
    for (let i = 0; i < intervals.length - 1; i++) {
      const gap = intervals[i + 1]!.a - intervals[i]!.b;
      if (gap > FT_EPS && gap <= maxGap) {
        out.push({ x1: intervals[i]!.b, y1: y, x2: intervals[i + 1]!.a, y2: y });
      }
    }
  }

  const byX = new Map<number, { a: number; b: number }[]>();
  for (const s of vert) {
    const x = Math.round(((s.x1 + s.x2) / 2) / FT_EPS) * FT_EPS;
    const list = byX.get(x) ?? [];
    list.push({ a: Math.min(s.y1, s.y2), b: Math.max(s.y1, s.y2) });
    byX.set(x, list);
  }
  for (const [x, intervals] of byX) {
    intervals.sort((u, v) => u.a - v.a);
    for (let i = 0; i < intervals.length - 1; i++) {
      const gap = intervals[i + 1]!.a - intervals[i]!.b;
      if (gap > FT_EPS && gap <= maxGap) {
        out.push({ x1: x, y1: intervals[i]!.b, x2: x, y2: intervals[i + 1]!.a });
      }
    }
  }
  return mergeColinear(out);
}

function guessRoomType(name: string): RoomType | string {
  const n = name.toLowerCase();
  if (/garage|carport/.test(n)) return 'Garage';
  if (/lanai|porch|patio|balcony|courtyard|pool/.test(n)) return 'Outdoor';
  if (/kitchen|pantry/.test(n)) return 'Kitchen';
  if (/bath|powder|toilet|w\.?\s*c/.test(n)) return 'Bathroom';
  if (/bed|suite|owner|master|guest/.test(n)) return 'Bedroom';
  if (/laundry|mud|utility|mech/.test(n)) return 'Utility';
  if (/dining|nook/.test(n)) return 'Dining room';
  if (/office|study|flex/.test(n)) return 'Office';
  if (/closet|wardrobe|w\.?\s*i\.?\s*c/.test(n)) return 'Closet';
  if (/foyer|entry|hall|corridor/.test(n)) return 'Hallway';
  if (/great|living|family|lounge|den/.test(n)) return 'Living room';
  return 'Living room';
}

function normalizeRoomLabel(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 40);
}

function labelsInsideRoom(
  labels: RoomLabel[],
  x: number,
  y: number,
  w: number,
  h: number,
): RoomLabel[] {
  const hit: RoomLabel[] = [];
  const seen = new Set<string>();
  for (const l of labels) {
    if (!looksLikeRoomName(l.text)) continue;
    if (l.x < x - 0.5 || l.x > x + w + 0.5 || l.y < y - 0.5 || l.y > y + h + 0.5) continue;
    const key = normalizeRoomLabel(l.text).toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hit.push({ ...l, text: normalizeRoomLabel(l.text) });
  }
  return hit;
}

function labelForRoom(
  labels: RoomLabel[],
  x: number,
  y: number,
  w: number,
  h: number,
  fallback: string,
): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const inside = labelsInsideRoom(labels, x, y, w, h);
  if (!inside.length) return fallback;
  let best = inside[0]!;
  let bestD = Infinity;
  for (const l of inside) {
    const d = (l.x - cx) ** 2 + (l.y - cy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best.text || fallback;
}

/** Axis-aligned Voronoi boxes for open-plan regions with multiple room labels. */
function roomsFromLabelVoronoi(
  x: number,
  y: number,
  w: number,
  h: number,
  labels: RoomLabel[],
): PlanRoomRect[] {
  if (labels.length < 2) return [];
  const out: PlanRoomRect[] = [];
  for (const label of labels) {
    let x0 = x;
    let y0 = y;
    let x1 = x + w;
    let y1 = y + h;
    for (const other of labels) {
      if (other === label) continue;
      const mx = (label.x + other.x) / 2;
      const my = (label.y + other.y) / 2;
      if (other.x < label.x) x0 = Math.max(x0, mx);
      else if (other.x > label.x) x1 = Math.min(x1, mx);
      if (other.y < label.y) y0 = Math.max(y0, my);
      else if (other.y > label.y) y1 = Math.min(y1, my);
    }
    const rw = x1 - x0;
    const rh = y1 - y0;
    if (rw < MIN_ROOM_FT || rh < MIN_ROOM_FT || rw * rh < MIN_ROOM_AREA) continue;
    out.push(
      poly(
        label.text,
        guessRoomType(label.text),
        [
          { x: x0, y: y0 },
          { x: x1, y: y0 },
          { x: x1, y: y1 },
          { x: x0, y: y1 },
        ],
        9,
      ),
    );
  }
  return out.length >= 2 ? out : [];
}

/**
 * Partition a flood-fill region by nearest room label (raster Voronoi).
 * Each label gets the cells closest to it — fills grow to the wall envelope
 * instead of shrinking to midplane AABBs.
 */
export function roomsFromLabelCells(
  cellIndices: number[],
  cols: number,
  res: number,
  originX: number,
  originY: number,
  labels: RoomLabel[],
): PlanRoomRect[] {
  if (labels.length < 2 || cellIndices.length < 8) return [];
  const buckets: number[][] = labels.map(() => []);
  for (const idx of cellIndices) {
    const c = idx % cols;
    const r = (idx / cols) | 0;
    const cx = originX + (c + 0.5) * res;
    const cy = originY + (r + 0.5) * res;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < labels.length; i++) {
      const l = labels[i]!;
      const d = (l.x - cx) ** 2 + (l.y - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    buckets[best]!.push(idx);
  }
  const out: PlanRoomRect[] = [];
  for (let i = 0; i < labels.length; i++) {
    const cells = buckets[i]!;
    if (cells.length < 4) continue;
    const label = labels[i]!;
    const footprint = traceRegionPolygon(cells, cols, res, originX, originY);
    if (footprint.length >= 3) {
      const xs = footprint.map((p) => p.x);
      const ys = footprint.map((p) => p.y);
      const rw = Math.max(...xs) - Math.min(...xs);
      const rh = Math.max(...ys) - Math.min(...ys);
      const area = polygonAreaFtLocal(footprint);
      if (rw < MIN_ROOM_FT || rh < MIN_ROOM_FT || area < MIN_ROOM_AREA) continue;
      out.push(poly(label.text, guessRoomType(label.text), footprint, 9));
    } else {
      // Fallback AABB of assigned cells
      let minC = Infinity;
      let maxC = -Infinity;
      let minR = Infinity;
      let maxR = -Infinity;
      for (const idx of cells) {
        const c = idx % cols;
        const r = (idx / cols) | 0;
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
      }
      const x0 = originX + minC * res;
      const y0 = originY + minR * res;
      const rw = (maxC - minC + 1) * res;
      const rh = (maxR - minR + 1) * res;
      if (rw < MIN_ROOM_FT || rh < MIN_ROOM_FT || rw * rh < MIN_ROOM_AREA) continue;
      out.push(
        poly(
          label.text,
          guessRoomType(label.text),
          [
            { x: x0, y: y0 },
            { x: x0 + rw, y: y0 },
            { x: x0 + rw, y: y0 + rh },
            { x: x0, y: y0 + rh },
          ],
          9,
        ),
      );
    }
  }
  return out.length >= 2 ? out : [];
}

/** Soft / dashed space-boundary segments — partition rooms, not solid walls.
 * Avoid painting all CEILING geometry (too noisy — shreds open plan into strips).
 */
export function isSoftPartitionSeg(s: Seg): boolean {
  const lt = (s.linetype ?? '').toUpperCase();
  const layer = (s.layer ?? '').toUpperCase();
  // Explicit space / room boundary layers.
  if (/SPACE.?BOUND|ROOM.?BOUND|OPEN.?PLAN|VOLUME.?LINE/.test(layer)) return true;
  // Dashed/hidden on wall layers only (volume ticks on walls, not full ceiling grids).
  if (/DASH|HIDDEN|PHANTOM|DOT/.test(lt) && /\bWALL/.test(layer)) return true;
  // Long centerline-style ticks on INT layers often mark open-plan edges (Stillwater great room).
  if (/CENTER|CENTERLINE/.test(lt) && /\bWALL/.test(layer) && segLength(s) >= 4) return true;
  return false;
}

/** Soft edges kept for Plan overlay (dotted room outlines) — broader than partition paint. */
export function isSoftOverlaySeg(s: Seg): boolean {
  if (isSoftPartitionSeg(s)) return true;
  const lt = (s.linetype ?? '').toUpperCase();
  const layer = (s.layer ?? '').toUpperCase();
  if (/DASH|HIDDEN|PHANTOM|DOT|CENTER/.test(lt)) return true;
  if (/CEILING|VOLUME/.test(layer) && segLength(s) >= 3) return true;
  return false;
}

function pointInPoly(px: number, py: number, pts: { x: number; y: number }[]): boolean {
  if (pts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]!.x;
    const yi = pts[i]!.y;
    const xj = pts[j]!.x;
    const yj = pts[j]!.y;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function roomFootprint(r: PlanRoomRect): { x: number; y: number }[] {
  if (r.pointsFt && r.pointsFt.length >= 3) return r.pointsFt;
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

/**
 * Claim leftover interior cells so the floor plate has no blank holes.
 * Large leftover blobs become Hall/Living (or take a nearby unused label);
 * small leftovers merge into the nearest existing room polygon.
 */
export function fillResidualInterior(
  rooms: PlanRoomRect[],
  interiorCells: number[],
  cols: number,
  res: number,
  originX: number,
  originY: number,
  labels: RoomLabel[] = [],
): PlanRoomRect[] {
  // Always return a new array — callers may clear `rooms` after assign.
  if (!interiorCells.length || !rooms.length) return rooms.slice();
  const footprints = rooms.map(roomFootprint);
  const uncovered: number[] = [];
  for (const idx of interiorCells) {
    const c = idx % cols;
    const r = (idx / cols) | 0;
    const cx = originX + (c + 0.5) * res;
    const cy = originY + (r + 0.5) * res;
    const covered = footprints.some((fp) => pointInPoly(cx, cy, fp));
    if (!covered) uncovered.push(idx);
  }
  if (!uncovered.length) return rooms.map((r) => ({ ...r, pointsFt: r.pointsFt ? [...r.pointsFt] : undefined }));

  // Connected components of uncovered interior.
  const uncoveredSet = new Set(uncovered);
  const seen = new Set<number>();
  const components: number[][] = [];
  for (const start of uncovered) {
    if (seen.has(start)) continue;
    const q = [start];
    seen.add(start);
    const comp: number[] = [];
    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi]!;
      comp.push(cur);
      const cc = cur % cols;
      const rr = (cur / cols) | 0;
      for (const [nc, nr] of [
        [cc + 1, rr],
        [cc - 1, rr],
        [cc, rr + 1],
        [cc, rr - 1],
      ] as const) {
        const ni = nr * cols + nc;
        if (!uncoveredSet.has(ni) || seen.has(ni)) continue;
        seen.add(ni);
        q.push(ni);
      }
    }
    components.push(comp);
  }

  const usedLabels = new Set(rooms.map((r) => r.name.replace(/\s+/g, ' ').trim().toUpperCase()));
  const next: PlanRoomRect[] = rooms.map((r) => ({
    ...r,
    pointsFt: r.pointsFt ? [...r.pointsFt] : undefined,
  }));
  const extras: PlanRoomRect[] = [];

  for (const comp of components) {
    const areaFt = comp.length * res * res;
    if (areaFt < 12) continue;
    const footprint = traceRegionPolygon(comp, cols, res, originX, originY);
    if (footprint.length < 3) continue;
    const xs = footprint.map((p) => p.x);
    const ys = footprint.map((p) => p.y);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const w = Math.max(...xs) - x0;
    const h = Math.max(...ys) - y0;
    const cx = x0 + w / 2;
    const cy = y0 + h / 2;

    // Prefer an unused label that sits in/near this blob (lanai, hall, nook, …).
    let labelHit: RoomLabel | undefined;
    let bestLabelD = Infinity;
    for (const l of labels) {
      if (!looksLikeRoomName(l.text)) continue;
      const key = normalizeRoomLabel(l.text).toUpperCase();
      if (usedLabels.has(key)) continue;
      if (l.x < x0 - 4 || l.x > x0 + w + 4 || l.y < y0 - 4 || l.y > y0 + h + 4) continue;
      const d = (l.x - cx) ** 2 + (l.y - cy) ** 2;
      if (d < bestLabelD) {
        bestLabelD = d;
        labelHit = l;
      }
    }

    if (labelHit || areaFt >= 40) {
      const name = labelHit ? normalizeRoomLabel(labelHit.text) : areaFt >= 160 ? 'Living' : 'Hall';
      usedLabels.add(name.toUpperCase());
      extras.push(poly(name, guessRoomType(name), footprint, 9));
      continue;
    }

    // Small leftover — merge into nearest room by expanding its AABB/polygon union roughly.
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < next.length; i++) {
      const r = next[i]!;
      const rcx = r.x + r.w / 2;
      const rcy = r.y + r.h / 2;
      const d = (rcx - cx) ** 2 + (rcy - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    const host = next[bestIdx]!;
    // Do not replace a traced wall-hugging polygon with an AABB — that drifts fills off CAD.
    if (host.pointsFt && host.pointsFt.length >= 3 && areaFt < 90) {
      continue;
    }
    const hostFp = roomFootprint(host);
    const merged = [...hostFp, ...footprint];
    const mxs = merged.map((p) => p.x);
    const mys = merged.map((p) => p.y);
    const mx0 = Math.min(...mxs);
    const my0 = Math.min(...mys);
    const mw = Math.max(...mxs) - mx0;
    const mh = Math.max(...mys) - my0;
    // Prefer traced union when host already has a polygon — use AABB of both as a solid fill.
    next[bestIdx] = poly(host.name, host.roomType, [
      { x: mx0, y: my0 },
      { x: mx0 + mw, y: my0 },
      { x: mx0 + mw, y: my0 + mh },
      { x: mx0, y: my0 + mh },
    ], host.ceilingFt ?? 9);
  }

  return [...next, ...extras];
}

/**
 * Create Outdoor rooms for LANAI/PORCH/PATIO/ENTRY labels that flood-fill missed
 * (often outside the sealed wall envelope).
 */
export function roomsFromOutdoorLabels(
  labels: RoomLabel[],
  existing: PlanRoomRect[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): PlanRoomRect[] {
  const out: PlanRoomRect[] = [];
  const used = new Set(existing.map((r) => r.name.replace(/\s+/g, ' ').trim().toUpperCase()));
  for (const l of labels) {
    if (!looksLikeRoomName(l.text)) continue;
    if (!/LANAI|PORCH|PATIO|BALCONY|ENTRY|COURTYARD/i.test(l.text)) continue;
    const key = normalizeRoomLabel(l.text).toUpperCase();
    if (used.has(key)) continue;
    // Skip if label already sits inside an existing room.
    if (existing.some((r) => pointInPoly(l.x, l.y, roomFootprint(r)))) continue;
    used.add(key);
    // Default outdoor pad around the label, clamped to drawing bounds.
    // Prefer growing toward nearest existing room edge (lanai usually abuts great room).
    let w = /ENTRY/i.test(l.text) ? 12 : /LANAI|PORCH/i.test(l.text) ? 28 : 16;
    let h = /ENTRY/i.test(l.text) ? 10 : /LANAI|PORCH/i.test(l.text) ? 16 : 12;
    let x0 = l.x - w / 2;
    let y0 = l.y - h / 2;
    // Snap pad toward nearest non-outdoor room so outdoor space sits against the plate.
    let nearest: { x: number; y: number; w: number; h: number } | undefined;
    let bestD = Infinity;
    for (const r of existing) {
      if (r.roomType === 'Outdoor') continue;
      const rcx = r.x + r.w / 2;
      const rcy = r.y + r.h / 2;
      const d = (rcx - l.x) ** 2 + (rcy - l.y) ** 2;
      if (d < bestD) {
        bestD = d;
        nearest = r;
      }
    }
    if (nearest && /LANAI|PORCH|PATIO/i.test(l.text)) {
      // Place pad centered on label but abut the nearest room AABB on the closest side.
      const cx = l.x;
      const cy = l.y;
      const nx0 = nearest.x;
      const ny0 = nearest.y;
      const nx1 = nearest.x + nearest.w;
      const ny1 = nearest.y + nearest.h;
      const distLeft = Math.abs(cx - nx0);
      const distRight = Math.abs(cx - nx1);
      const distTop = Math.abs(cy - ny0);
      const distBottom = Math.abs(cy - ny1);
      const minSide = Math.min(distLeft, distRight, distTop, distBottom);
      if (minSide === distBottom) {
        y0 = ny1;
        x0 = Math.min(Math.max(cx - w / 2, nx0 - 2), nx1 + 2 - w);
      } else if (minSide === distTop) {
        y0 = ny0 - h;
        x0 = Math.min(Math.max(cx - w / 2, nx0 - 2), nx1 + 2 - w);
      } else if (minSide === distRight) {
        x0 = nx1;
        y0 = Math.min(Math.max(cy - h / 2, ny0 - 2), ny1 + 2 - h);
      } else {
        x0 = nx0 - w;
        y0 = Math.min(Math.max(cy - h / 2, ny0 - 2), ny1 + 2 - h);
      }
    }
    x0 = Math.max(bounds.minX, Math.min(bounds.maxX - w, x0));
    y0 = Math.max(bounds.minY, Math.min(bounds.maxY - h, y0));
    out.push(
      poly(
        normalizeRoomLabel(l.text),
        'Outdoor',
        [
          { x: x0, y: y0 },
          { x: x0 + w, y: y0 },
          { x: x0 + w, y: y0 + h },
          { x: x0, y: y0 + h },
        ],
        10,
      ),
    );
  }
  return out;
}

/** Raster flood-fill room extraction with adaptive envelope sealing. */
export function roomsFromFloodFill(
  segments: Seg[],
  labels: RoomLabel[] = [],
  opts?: { softPartitions?: Seg[] },
): { rooms: PlanRoomRect[]; warnings: string[] } {
  const warnings: string[] = [];
  const softFromWalls = segments.filter(isSoftPartitionSeg);
  const solidSegments = segments.filter((s) => !isSoftPartitionSeg(s));
  const softPartitions = [...softFromWalls, ...(opts?.softPartitions ?? [])];
  if (!solidSegments.length && !segments.length) return { rooms: [], warnings: ['No wall segments for room fill.'] };
  const wallSegs = solidSegments.length ? solidSegments : segments;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of [...wallSegs, ...softPartitions]) {
    minX = Math.min(minX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxX = Math.max(maxX, s.x1, s.x2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }
  const pad = 4;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const bboxArea = Math.max(1, (maxX - minX) * (maxY - minY));

  // Finer grid for better envelope fidelity (~3").
  const res = 0.25;
  const cols = Math.min(1400, Math.max(8, Math.ceil((maxX - minX) / res) + 1));
  const rows = Math.min(1400, Math.max(8, Math.ceil((maxY - minY) / res) + 1));
  if (cols * rows > 1_600_000) {
    warnings.push('Plan raster clamped for memory — very large drawings may lose detail.');
  }

  const idx = (c: number, r: number) => r * cols + c;
  const toC = (x: number) => Math.max(0, Math.min(cols - 1, Math.round((x - minX) / res)));
  const toR = (y: number) => Math.max(0, Math.min(rows - 1, Math.round((y - minY) / res)));

  const paintSegs = (target: Uint8Array, thick: number, segs: Seg[] = wallSegs) => {
    const paint = (c0: number, r0: number, c1: number, r1: number) => {
      const dc = Math.abs(c1 - c0);
      const dr = Math.abs(r1 - r0);
      const steps = Math.max(dc, dr, 1);
      for (let i = 0; i <= steps; i++) {
        const c = Math.round(c0 + ((c1 - c0) * i) / steps);
        const r = Math.round(r0 + ((r1 - r0) * i) / steps);
        for (let dy = -thick; dy <= thick; dy++) {
          for (let dx = -thick; dx <= thick; dx++) {
            const nc = c + dx;
            const nr = r + dy;
            if (nc >= 0 && nr >= 0 && nc < cols && nr < rows) target[idx(nc, nr)] = 1;
          }
        }
      }
    };
    for (const s of segs) {
      paint(toC(s.x1), toR(s.y1), toC(s.x2), toR(s.y2));
    }
  };

  /** Binary dilate (square kernel). */
  const dilate = (input: Uint8Array, radius: number): Uint8Array => {
    if (radius <= 0) return input;
    const out = new Uint8Array(input.length);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!input[idx(c, r)]) continue;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nc = c + dx;
            const nr = r + dy;
            if (nc >= 0 && nr >= 0 && nc < cols && nr < rows) out[idx(nc, nr)] = 1;
          }
        }
      }
    }
    return out;
  };

  /** Binary erode (square kernel). */
  const erode = (input: Uint8Array, radius: number): Uint8Array => {
    if (radius <= 0) return input;
    const out = new Uint8Array(input.length);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let ok = true;
        for (let dy = -radius; dy <= radius && ok; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nc = c + dx;
            const nr = r + dy;
            if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || !input[idx(nc, nr)]) {
              ok = false;
              break;
            }
          }
        }
        if (ok) out[idx(c, r)] = 1;
      }
    }
    return out;
  };

  const morphClose = (src: Uint8Array, radius: number): Uint8Array => erode(dilate(src, radius), radius);

  const floodOutside = (blocked: Uint8Array): Uint8Array => {
    const outside = new Uint8Array(cols * rows);
    const stack: number[] = [];
    const push = (c: number, r: number) => {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      const i = idx(c, r);
      if (blocked[i] || outside[i]) return;
      outside[i] = 1;
      stack.push(i);
    };
    for (let c = 0; c < cols; c++) {
      push(c, 0);
      push(c, rows - 1);
    }
    for (let r = 0; r < rows; r++) {
      push(0, r);
      push(cols - 1, r);
    }
    while (stack.length) {
      const i = stack.pop()!;
      const c = i % cols;
      const rr = (i / cols) | 0;
      push(c + 1, rr);
      push(c - 1, rr);
      push(c, rr + 1);
      push(c, rr - 1);
    }
    return outside;
  };

  // Base wall paint (slightly thick so double-line faces connect).
  const baseWalls = new Uint8Array(cols * rows);
  paintSegs(baseWalls, 1);

  // Adaptive envelope: increase morphological close until exterior flood stops
  // leaking into the house (garage doors ~16 ft need ~8 ft radius).
  // Keep searching past the first "good enough" seal — Stillwater often needs
  // 3.5–5 ft to close porch/garage openings without swallowing the yard.
  const sealCandidatesFt = [2.5, 3.5, 5, 6.5, 8, 10];
  let outside = floodOutside(baseWalls);
  let sealUsedFt = 0;
  let bestInterior = 0;
  let bestScore = -Infinity;
  for (const sealFt of sealCandidatesFt) {
    const sealed = morphClose(baseWalls, Math.max(1, Math.round(sealFt / res)));
    const candOutside = floodOutside(sealed);
    let interior = 0;
    for (let i = 0; i < candOutside.length; i++) {
      if (!candOutside[i] && !sealed[i]) interior++;
    }
    const interiorArea = interior * res * res;
    const ratio = interiorArea / bboxArea;
    if (ratio < 0.18 || ratio > 0.92) continue;
    // Score: maximize enclosed interior, lightly prefer mid-band coverage, penalize oversized seals.
    const score = interiorArea - Math.abs(ratio - 0.72) * bboxArea * 0.15 - sealFt * 8;
    if (score > bestScore || (score === bestScore && interiorArea > bestInterior)) {
      bestScore = score;
      bestInterior = interiorArea;
      outside = candOutside;
      sealUsedFt = sealFt;
    }
    // Diminishing returns — larger seals rarely add plate once we are mid-band.
    if (ratio >= 0.55 && ratio <= 0.85 && interiorArea >= 2200 && sealFt >= 5) {
      break;
    }
  }
  if (sealUsedFt > 0) {
    warnings.push(`Envelope sealed with ${sealUsedFt.toFixed(1)} ft morphological close.`);
  } else {
    warnings.push('Envelope seal weak — exterior may leak through large openings.');
  }

  // Partition walls: seal typical interior door gaps (~2 ft) so rooms stay separate.
  const partitionSealed = morphClose(baseWalls, Math.max(1, Math.round(2 / res)));
  // Soft/dashed space boundaries (ceiling breaks, open-plan edges) — partition only.
  if (softPartitions.length) {
    paintSegs(partitionSealed, 0, softPartitions);
    warnings.push(`Applied ${softPartitions.length} soft space-boundary segment(s).`);
  }

  const seen = new Uint8Array(cols * rows);
  const rooms: PlanRoomRect[] = [];
  let n = 1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = idx(c, r);
      // Interior empty: not outside, not a partition wall.
      if (outside[i] || partitionSealed[i] || seen[i]) continue;
      let minC = c;
      let maxC = c;
      let minR = r;
      let maxR = r;
      let area = 0;
      const cells: number[] = [];
      const q = [i];
      seen[i] = 1;
      for (let qi = 0; qi < q.length; qi++) {
        const cur = q[qi]!;
        const cc = cur % cols;
        const rr = (cur / cols) | 0;
        area++;
        cells.push(cur);
        minC = Math.min(minC, cc);
        maxC = Math.max(maxC, cc);
        minR = Math.min(minR, rr);
        maxR = Math.max(maxR, rr);
        for (const [nc, nr] of [
          [cc + 1, rr],
          [cc - 1, rr],
          [cc, rr + 1],
          [cc, rr - 1],
        ] as const) {
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          const ni = idx(nc, nr);
          if (outside[ni] || partitionSealed[ni] || seen[ni]) continue;
          seen[ni] = 1;
          q.push(ni);
        }
      }

      const wFt = (maxC - minC + 1) * res;
      const hFt = (maxR - minR + 1) * res;
      const areaFt = area * res * res;
      if (wFt < MIN_ROOM_FT || hFt < MIN_ROOM_FT || areaFt < MIN_ROOM_AREA) continue;
      const fillRatio = areaFt / (wFt * hFt);
      // Reject wall-cavity slivers and spaghetti corridors.
      if (fillRatio < 0.4 && areaFt < 180) continue;
      if (fillRatio < 0.28) continue;

      const x = minX + minC * res;
      const y = minY + minR * res;

      const insideLabels = labelsInsideRoom(labels, x, y, wFt, hFt);
      if (insideLabels.length >= 2 && areaFt >= 280) {
        // Prefer cell-nearest partition so fills grow to the wall envelope.
        let split = roomsFromLabelCells(cells, cols, res, minX, minY, insideLabels);
        if (split.length < 2) {
          split = roomsFromLabelVoronoi(x, y, wFt, hFt, insideLabels);
        }
        if (split.length >= 2) {
          rooms.push(...split);
          n += split.length;
          continue;
        }
      }

      const fallback = `Room ${n}`;
      const name = labelForRoom(labels, x, y, wFt, hFt, fallback);
      const footprint = traceRegionPolygon(cells, cols, res, minX, minY);
      if (footprint.length >= 3 && fillRatio >= 0.55) {
        rooms.push(poly(name, guessRoomType(name), footprint, 9));
      } else {
        rooms.push(room(name, guessRoomType(name), x, y, wFt, hFt, 9));
      }
      n++;
    }
  }

  if (!rooms.length) {
    warnings.push('Flood-fill found no enclosed rooms — falling back to bounding room.');
    rooms.push(
      room(
        'Imported space',
        'Living room',
        minX + pad,
        minY + pad,
        Math.max(maxX - minX - 2 * pad, MIN_ROOM_FT),
        Math.max(maxY - minY - 2 * pad, MIN_ROOM_FT),
        9,
      ),
    );
  } else {
    const strongName =
      /GARAGE|KITCHEN|BED|BATH|SUITE|GREAT|LIVING|DINING|FOYER|PANTRY|LAUNDRY|OFFICE|STUDY|FAMILY|OWNER|MUD|CLOSET|HALL|ENTRY|NOOK|BONUS|FLEX|MASTER|POWDER|LANAI|W\.?I\.?C/i;
    const filtered = rooms.filter((r) => {
      const area = r.w * r.h;
      if (area < MIN_ROOM_AREA) return false;
      // Drop huge unlabeled exterior leftovers (yard / lanai bleed).
      if (area > 2800 && !strongName.test(r.name)) return false;
      // Drop tiny unlabeled crumbs (wall pockets / fixture niches).
      if (area < 70 && /^Room\s+\d+/i.test(r.name)) return false;
      return true;
    });
    if (filtered.length) {
      rooms.length = 0;
      rooms.push(...filtered);
    }

    // Drop duplicate labels that appear both as a sealed room and inside an open-plan split.
    const deduped: PlanRoomRect[] = [];
    const byArea = [...rooms].sort((a, b) => b.w * b.h - a.w * a.h);
    for (const r of byArea) {
      const key = r.name.replace(/\s+/g, ' ').trim().toUpperCase();
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const clash = deduped.some((o) => {
        const ok = o.name.replace(/\s+/g, ' ').trim().toUpperCase();
        if (ok !== key) return false;
        const ox = o.x + o.w / 2;
        const oy = o.y + o.h / 2;
        return Math.hypot(cx - ox, cy - oy) < 10;
      });
      if (!clash) deduped.push(r);
    }
    if (deduped.length) {
      rooms.length = 0;
      rooms.push(...deduped);
    }

    // Collect full interior plate (inside envelope, not solid walls) and fill blanks.
    const interiorCells: number[] = [];
    for (let i = 0; i < outside.length; i++) {
      if (!outside[i] && !baseWalls[i]) interiorCells.push(i);
    }
    const filled = fillResidualInterior(rooms, interiorCells, cols, res, minX, minY, labels);
    const filledCopy = filled === rooms ? rooms.slice() : filled;
    rooms.length = 0;
    rooms.push(...filledCopy);

    // Outdoor labels (lanai / porch / entry) often sit outside the sealed envelope.
    const outdoor = roomsFromOutdoorLabels(labels, rooms, {
      minX: minX + pad,
      minY: minY + pad,
      maxX: maxX - pad,
      maxY: maxY - pad,
    });
    if (outdoor.length) {
      rooms.push(...outdoor);
      warnings.push(`Added ${outdoor.length} outdoor space(s) from labels (lanai/porch/entry).`);
    }

    // Coverage of wall bbox — AABB sum (gate-compatible) + union raster (honest plate fill).
    const roomArea = rooms.reduce((s, r) => s + r.w * r.h, 0);
    const wallSpanX = maxX - minX - 2 * pad;
    const wallSpanY = maxY - minY - 2 * pad;
    const wallBBox = Math.max(1, wallSpanX * wallSpanY);
    const coverage = roomArea / wallBBox;
    warnings.push(
      `Detected ${rooms.length} enclosed room(s) via sealed-envelope flood-fill (${Math.round(coverage * 100)}% wall-bbox coverage).`,
    );
    {
      const coverRes = Math.max(res, 0.5);
      const conditioned = rooms.filter((r) => r.roomType !== 'Outdoor');
      const spanRooms = conditioned.length ? conditioned : rooms;
      const painted = new Set<number>();
      const cCols = Math.max(1, Math.ceil(wallSpanX / coverRes));
      const cRows = Math.max(1, Math.ceil(wallSpanY / coverRes));
      for (const room of spanRooms) {
        const pts =
          room.pointsFt && room.pointsFt.length >= 3
            ? room.pointsFt
            : [
                { x: room.x, y: room.y },
                { x: room.x + room.w, y: room.y },
                { x: room.x + room.w, y: room.y + room.h },
                { x: room.x, y: room.y + room.h },
              ];
        const c0 = Math.max(0, Math.floor((room.x - (minX + pad)) / coverRes));
        const c1 = Math.min(cCols, Math.ceil((room.x + room.w - (minX + pad)) / coverRes));
        const r0 = Math.max(0, Math.floor((room.y - (minY + pad)) / coverRes));
        const r1 = Math.min(cRows, Math.ceil((room.y + room.h - (minY + pad)) / coverRes));
        for (let rr = r0; rr < r1; rr++) {
          for (let cc = c0; cc < c1; cc++) {
            const cx = minX + pad + (cc + 0.5) * coverRes;
            const cy = minY + pad + (rr + 0.5) * coverRes;
            if (pointInPoly(cx, cy, pts)) painted.add(rr * cCols + cc);
          }
        }
      }
      const unionPct = (painted.size * coverRes * coverRes) / wallBBox;
      warnings.push(`Union floor coverage ${Math.round(unionPct * 100)}% of wall bbox.`);
    }
  }
  return { rooms, warnings };
}

export type ScaleResult = { segments: Seg[]; scale: number; unitNote: string };

/** Scale DXF coordinates to feet using $INSUNITS or magnitude heuristics. */
export function scaleSegmentsToFeet(segments: Seg[], insUnits?: number): ScaleResult {
  if (!segments.length) return { segments, scale: 1, unitNote: 'No geometry to scale.' };
  const sample = segments.slice(0, 80).flatMap((s) => [s.x1, s.y1, s.x2, s.y2]);
  const maxAbs = sample.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const xs = segments.flatMap((s) => [s.x1, s.x2]);
  const ys = segments.flatMap((s) => [s.y1, s.y2]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));

  let scale = 1;
  let unitNote = 'Assumed drawing units are feet.';

  if (insUnits === 1) {
    scale = 1 / 12;
    unitNote = 'Scaled inches → feet ($INSUNITS=1).';
  } else if (insUnits === 4) {
    scale = 1 / 304.8;
    unitNote = 'Scaled mm → feet ($INSUNITS=4).';
  } else if (insUnits === 5) {
    scale = 1 / 30.48;
    unitNote = 'Scaled cm → feet ($INSUNITS=5).';
  } else if (insUnits === 6) {
    scale = 1 / 0.3048;
    unitNote = 'Scaled m → feet ($INSUNITS=6).';
  } else if (insUnits === 2) {
    scale = 1;
    unitNote = 'Drawing units are feet ($INSUNITS=2).';
  } else if (span > 5000 || maxAbs > 5000) {
    scale = 1 / 304.8;
    unitNote = 'Heuristic: large coordinates treated as mm → feet.';
  } else if (span > 200 && span < 5000 && maxAbs > 200) {
    scale = 1 / 12;
    unitNote = 'Heuristic: mid-range coordinates treated as inches → feet.';
  }

  if (scale === 1) return { segments, scale, unitNote };
  return {
    scale,
    unitNote,
    segments: segments.map((s) => ({
      ...s,
      x1: s.x1 * scale,
      y1: s.y1 * scale,
      x2: s.x2 * scale,
      y2: s.y2 * scale,
    })),
  };
}

export function readInsUnits(dxfText: string): number | undefined {
  const m = dxfText.match(/\$INSUNITS\s*\n\s*70\s*\n\s*(\d+)/i);
  if (!m) return undefined;
  return Number(m[1]);
}

/**
 * Legacy rectangular cell detector (kept as fallback when flood-fill finds ≤1 room).
 * Expects segments already in feet.
 */
export function segmentsToOrthogonalRoomsLegacy(segments: Seg[]): {
  rooms: PlanRoomRect[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const ortho = segments.filter(isNearOrtho).map(snapOrtho);
  if (ortho.length < segments.length) {
    warnings.push(`${segments.length - ortho.length} non-orthogonal segment(s) ignored (legacy).`);
  }
  const xs = [...new Set(ortho.flatMap((s) => [s.x1, s.x2]).map((v) => Math.round(v / FT_EPS) * FT_EPS))].sort(
    (a, b) => a - b,
  );
  const ys = [...new Set(ortho.flatMap((s) => [s.y1, s.y2]).map((v) => Math.round(v / FT_EPS) * FT_EPS))].sort(
    (a, b) => a - b,
  );
  if (xs.length < 2 || ys.length < 2) {
    warnings.push('Could not infer a room grid from DXF segments.');
    return { rooms: [], warnings };
  }

  const tol = FT_EPS * 1.5;
  const hasH = (x1: number, x2: number, y: number) =>
    ortho.some(
      (s) =>
        Math.abs(s.y1 - y) < tol &&
        Math.abs(s.y2 - y) < tol &&
        Math.min(s.x1, s.x2) <= Math.min(x1, x2) + tol &&
        Math.max(s.x1, s.x2) >= Math.max(x1, x2) - tol,
    );
  const hasV = (y1: number, y2: number, x: number) =>
    ortho.some(
      (s) =>
        Math.abs(s.x1 - x) < tol &&
        Math.abs(s.x2 - x) < tol &&
        Math.min(s.y1, s.y2) <= Math.min(y1, y2) + tol &&
        Math.max(s.y1, s.y2) >= Math.max(y1, y2) - tol,
    );

  const rooms: PlanRoomRect[] = [];
  let n = 1;
  for (let yi = 0; yi < ys.length - 1; yi++) {
    for (let xi = 0; xi < xs.length - 1; xi++) {
      const x0 = xs[xi]!;
      const x1 = xs[xi + 1]!;
      const y0 = ys[yi]!;
      const y1 = ys[yi + 1]!;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < MIN_ROOM_FT || h < MIN_ROOM_FT) continue;
      if (hasH(x0, x1, y0) && hasH(x0, x1, y1) && hasV(y0, y1, x0) && hasV(y0, y1, x1)) {
        rooms.push(room(`Room ${n}`, 'Living room', x0, y0, w, h, 9));
        n++;
      }
    }
  }
  if (!rooms.length) {
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    rooms.push(room('Imported space', 'Living room', minX, minY, maxX - minX, maxY - minY, 9));
    warnings.push('No closed rectangular cells detected — created a single bounding room.');
  }
  return { rooms, warnings };
}

/**
 * Ortho snap → cluster → keep dense double-line walls (plus gap close) → flood-fill.
 * Centerlines are still computed for diagnostics, but flood-fill uses the denser
 * wall paint so the building envelope does not fall apart at openings.
 */
export function segmentsToRoomsAccurate(
  rawSegments: Seg[],
  opts?: { labels?: RoomLabel[]; insUnits?: number; softPartitions?: Seg[] },
): {
  rooms: PlanRoomRect[];
  warnings: string[];
  scaledSegments: Seg[];
  wallCenterlines: Seg[];
} {
  const warnings: string[] = [];
  const { segments: scaled, unitNote, scale } = scaleSegmentsToFeet(rawSegments, opts?.insUnits);
  warnings.push(unitNote);

  const ortho = scaled.filter(isNearOrtho).map(snapOrtho);
  if (ortho.length < scaled.length) {
    warnings.push(`${scaled.length - ortho.length} non-orthogonal segment(s) ignored.`);
  }
  if (!ortho.length) {
    return {
      rooms: [],
      warnings: [...warnings, 'No orthogonal wall segments.'],
      scaledSegments: scaled,
      wallCenterlines: [],
    };
  }

  const xs = ortho.flatMap((s) => [s.x1, s.x2]);
  const ys = ortho.flatMap((s) => [s.y1, s.y2]);
  const xMap = clusterValues(xs);
  const yMap = clusterValues(ys);
  const snapped = ortho.map((s) => snapSeg(s, xMap, yMap));

  // Dense walls: merge colinear faces, bridge door-sized gaps. Morphological
  // close in flood-fill handles larger garage / patio openings.
  const denseWalls = closeSmallGaps(mergeColinear(snapped), 3.5);
  const centers = centerlinesFromDoubleWalls(snapped);
  warnings.push(
    `Wall segments for fill: ${denseWalls.length} dense / ${centers.length} centerlines (from ${ortho.length} ortho).`,
  );

  const scaledLabels = (opts?.labels ?? []).map((l) => ({
    x: l.x * scale,
    y: l.y * scale,
    text: l.text,
  }));

  const softScaled = (opts?.softPartitions ?? []).length
    ? scaleSegmentsToFeet(opts!.softPartitions!, opts?.insUnits).segments
    : [];

  const { rooms, warnings: w2 } = roomsFromFloodFill(denseWalls, scaledLabels, {
    softPartitions: softScaled,
  });
  warnings.push(...w2);
  const wallCenterlines = wallCenterlinesFromSegments(denseWalls);
  warnings.push(`CAD wall centerlines for scene: ${wallCenterlines.length}.`);
  return { rooms, warnings, scaledSegments: denseWalls, wallCenterlines };
}
