/**
 * Accurate-ish room extraction from architectural DXF wall segments.
 * Handles double-line walls, soft orthogonality, unit scaling, and flood-fill rooms.
 */
import type { PlanRoomRect } from './buildPlan';
import { room } from './planFactories';
import type { RoomType } from '../../types';
import { looksLikeRoomName } from './dxfParse';

export type Seg = { x1: number; y1: number; x2: number; y2: number; layer?: string };
export type RoomLabel = { x: number; y: number; text: string };

const FT_EPS = 0.08; // ~1" snap cluster
const ORTHO_RATIO = 0.04; // |min(dx,dy)|/|max| below this ⇒ treat as ortho
const MIN_ROOM_FT = 3;
const MIN_ROOM_AREA = 20; // sq ft
const WALL_THICK_MIN = 0.2; // ft (~2.5")
const WALL_THICK_MAX = 1.2; // ft (~14")
const RASTER_RES = 0.35; // ft per cell (~4")

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

/** Collapse parallel double-line walls to centerlines. */
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
  for (let i = 0; i < horiz.length; i++) if (!usedH.has(i)) out.push(horiz[i]!);

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
  for (let i = 0; i < vert.length; i++) if (!usedV.has(i)) out.push(vert[i]!);

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
  if (/kitchen|pantry/.test(n)) return 'Kitchen';
  if (/bath|powder|toilet|w\.?\s*c/.test(n)) return 'Bathroom';
  if (/bed|suite|owner|master|guest/.test(n)) return 'Bedroom';
  if (/laundry|mud|utility|mech/.test(n)) return 'Utility';
  if (/dining/.test(n)) return 'Dining room';
  if (/office|study|flex/.test(n)) return 'Office';
  if (/closet|wardrobe/.test(n)) return 'Closet';
  if (/foyer|entry|hall|corridor/.test(n)) return 'Hallway';
  if (/great|living|family|lounge|den/.test(n)) return 'Living room';
  return 'Living room';
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
  let best: RoomLabel | null = null;
  let bestD = Infinity;
  for (const l of labels) {
    if (!looksLikeRoomName(l.text)) continue;
    if (l.x < x - 0.5 || l.x > x + w + 0.5 || l.y < y - 0.5 || l.y > y + h + 0.5) continue;
    const d = (l.x - cx) ** 2 + (l.y - cy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  if (!best) return fallback;
  return best.text.replace(/\s+/g, ' ').trim().slice(0, 40) || fallback;
}

/** Raster flood-fill room extraction. */
export function roomsFromFloodFill(
  segments: Seg[],
  labels: RoomLabel[] = [],
): { rooms: PlanRoomRect[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!segments.length) return { rooms: [], warnings: ['No wall segments for room fill.'] };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of segments) {
    minX = Math.min(minX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxX = Math.max(maxX, s.x1, s.x2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }
  const pad = 2;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;

  const res = RASTER_RES;
  const cols = Math.min(900, Math.max(8, Math.ceil((maxX - minX) / res) + 1));
  const rows = Math.min(900, Math.max(8, Math.ceil((maxY - minY) / res) + 1));

  const wall = new Uint8Array(cols * rows);
  const idx = (c: number, r: number) => r * cols + c;
  const toC = (x: number) => Math.max(0, Math.min(cols - 1, Math.round((x - minX) / res)));
  const toR = (y: number) => Math.max(0, Math.min(rows - 1, Math.round((y - minY) / res)));

  const paint = (c0: number, r0: number, c1: number, r1: number) => {
    const dc = Math.abs(c1 - c0);
    const dr = Math.abs(r1 - r0);
    const steps = Math.max(dc, dr, 1);
    for (let i = 0; i <= steps; i++) {
      const c = Math.round(c0 + ((c1 - c0) * i) / steps);
      const r = Math.round(r0 + ((r1 - r0) * i) / steps);
      wall[idx(c, r)] = 1;
      // Thicken so double-line gaps and raster aliasing don't leak exterior flood.
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc >= 0 && nr >= 0 && nc < cols && nr < rows) wall[idx(nc, nr)] = 1;
      }
    }
  };

  for (const s of segments) {
    paint(toC(s.x1), toR(s.y1), toC(s.x2), toR(s.y2));
  }

  const outside = new Uint8Array(cols * rows);
  const stack: number[] = [];
  const push = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const i = idx(c, r);
    if (wall[i] || outside[i]) return;
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

  const seen = new Uint8Array(cols * rows);
  const rooms: PlanRoomRect[] = [];
  let n = 1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = idx(c, r);
      if (wall[i] || outside[i] || seen[i]) continue;
      let minC = c;
      let maxC = c;
      let minR = r;
      let maxR = r;
      let area = 0;
      const q = [i];
      seen[i] = 1;
      for (let qi = 0; qi < q.length; qi++) {
        const cur = q[qi]!;
        const cc = cur % cols;
        const rr = (cur / cols) | 0;
        area++;
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
          if (wall[ni] || outside[ni] || seen[ni]) continue;
          seen[ni] = 1;
          q.push(ni);
        }
      }

      const wFt = (maxC - minC + 1) * res;
      const hFt = (maxR - minR + 1) * res;
      const areaFt = area * res * res;
      if (wFt < MIN_ROOM_FT || hFt < MIN_ROOM_FT || areaFt < MIN_ROOM_AREA) continue;
      const fillRatio = areaFt / (wFt * hFt);
      if (fillRatio < 0.35 && areaFt > 800) continue;

      const x = minX + minC * res;
      const y = minY + minR * res;
      const fallback = `Room ${n}`;
      const name = labelForRoom(labels, x, y, wFt, hFt, fallback);
      rooms.push(room(name, guessRoomType(name), x, y, wFt, hFt, 9));
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
    const strongName = /GARAGE|KITCHEN|BED|BATH|SUITE|GREAT|LIVING|DINING|FOYER|PANTRY|LAUNDRY|OFFICE|FAMILY|OWNER|MUD|CLOSET|HALL|ENTRY|NOOK|BONUS|FLEX/i;
    const filtered = rooms.filter((r) => {
      const area = r.w * r.h;
      if (area < MIN_ROOM_AREA) return false;
      // Huge unlabeled / weakly labeled blobs are usually porch/patio/yard.
      if (area > 1400 && !strongName.test(r.name)) return false;
      return true;
    });
    if (filtered.length) {
      rooms.length = 0;
      rooms.push(...filtered);
    }
    warnings.push(`Detected ${rooms.length} enclosed room(s) via wall flood-fill.`);
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

/** Ortho snap → cluster → double-wall centerlines → flood-fill rooms. */
export function segmentsToRoomsAccurate(
  rawSegments: Seg[],
  opts?: { labels?: RoomLabel[]; insUnits?: number },
): { rooms: PlanRoomRect[]; warnings: string[]; scaledSegments: Seg[] } {
  const warnings: string[] = [];
  const { segments: scaled, unitNote, scale } = scaleSegmentsToFeet(rawSegments, opts?.insUnits);
  warnings.push(unitNote);

  const ortho = scaled.filter(isNearOrtho).map(snapOrtho);
  if (ortho.length < scaled.length) {
    warnings.push(`${scaled.length - ortho.length} non-orthogonal segment(s) ignored.`);
  }
  if (!ortho.length) {
    return { rooms: [], warnings: [...warnings, 'No orthogonal wall segments.'], scaledSegments: scaled };
  }

  const xs = ortho.flatMap((s) => [s.x1, s.x2]);
  const ys = ortho.flatMap((s) => [s.y1, s.y2]);
  const xMap = clusterValues(xs);
  const yMap = clusterValues(ys);
  const snapped = ortho.map((s) => snapSeg(s, xMap, yMap));
  let centers = closeSmallGaps(centerlinesFromDoubleWalls(snapped), 4);
  // Seal the outer footprint so exterior flood cannot leak through porch/garage openings.
  if (centers.length) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of centers) {
      minX = Math.min(minX, s.x1, s.x2);
      minY = Math.min(minY, s.y1, s.y2);
      maxX = Math.max(maxX, s.x1, s.x2);
      maxY = Math.max(maxY, s.y1, s.y2);
    }
    centers = mergeColinear([
      ...centers,
      { x1: minX, y1: minY, x2: maxX, y2: minY },
      { x1: maxX, y1: minY, x2: maxX, y2: maxY },
      { x1: maxX, y1: maxY, x2: minX, y2: maxY },
      { x1: minX, y1: maxY, x2: minX, y2: minY },
    ]);
  }
  warnings.push(`Wall centerlines: ${centers.length} (from ${ortho.length} ortho segments).`);

  const scaledLabels = (opts?.labels ?? []).map((l) => ({
    x: l.x * scale,
    y: l.y * scale,
    text: l.text,
  }));

  const { rooms, warnings: w2 } = roomsFromFloodFill(centers, scaledLabels);
  warnings.push(...w2);
  return { rooms, warnings, scaledSegments: centers };
}
