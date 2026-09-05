import { formatWallLengthFt, segLengthFt } from './editCadPlate';
import type { CadLabelFt, CadPlate, CadWallCenterlineFt } from './types';

export type CadRoomStamp = {
  id: string;
  x: number;
  y: number;
  name: string;
  areaSqFt: number;
  points: { x: number; y: number }[];
  /** Plate label consumed for this stamp name — hide that label in the editor. */
  sourceLabelIndex?: number;
};

const SNAP_FT = 0.35;
const ON_EDGE_FT = 0.4;
const MIN_AREA_SQ_FT = 18;
const MAX_AREA_SQ_FT = 12_000;

function snapKey(x: number, y: number): string {
  return `${Math.round(x / SNAP_FT)},${Math.round(y / SNAP_FT)}`;
}

function polygonAreaSqFt(points: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function signedArea(points: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function centroid(points: { x: number; y: number }[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, points.length);
  return { x: x / n, y: y / n };
}

function projectT(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { t: number; dist: number; x: number; y: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return { t: 0, dist: Math.hypot(px - x1, py - y1), x: x1, y: y1 };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  return { t, dist: Math.hypot(px - x, py - y), x, y };
}

/** Split wall runs at T-junctions so interior partitions form closed graph faces. */
export function splitWallsAtJunctions(
  walls: CadWallCenterlineFt[],
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const raw = walls.filter((w) => segLengthFt(w) >= 0.75);
  const endpoints: { x: number; y: number }[] = [];
  for (const w of raw) {
    endpoints.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
  }

  const out: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (const w of raw) {
    const cuts: number[] = [0, 1];
    for (const p of endpoints) {
      const hit = projectT(p.x, p.y, w.x1, w.y1, w.x2, w.y2);
      if (hit.dist <= ON_EDGE_FT && hit.t > 0.02 && hit.t < 0.98) cuts.push(hit.t);
    }
    cuts.sort((a, b) => a - b);
    const uniq: number[] = [];
    for (const t of cuts) {
      if (!uniq.length || Math.abs(uniq[uniq.length - 1]! - t) > 0.01) uniq.push(t);
    }
    for (let i = 0; i < uniq.length - 1; i++) {
      const t0 = uniq[i]!;
      const t1 = uniq[i + 1]!;
      out.push({
        x1: w.x1 + (w.x2 - w.x1) * t0,
        y1: w.y1 + (w.y2 - w.y1) * t0,
        x2: w.x1 + (w.x2 - w.x1) * t1,
        y2: w.y1 + (w.y2 - w.y1) * t1,
      });
    }
  }
  return out.filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) >= 0.5);
}

type Node = { x: number; y: number; key: string };

/**
 * Detect enclosed rooms from wall centerlines (plan feet) and stamp name + area.
 */
export function detectCadRoomStamps(plate: CadPlate): CadRoomStamp[] {
  const segs = splitWallsAtJunctions(plate.wallCenterlines);
  if (segs.length < 3) return [];

  const nodes = new Map<string, Node>();
  const ensure = (x: number, y: number): Node => {
    const key = snapKey(x, y);
    const existing = nodes.get(key);
    if (existing) return existing;
    const n = { x, y, key };
    nodes.set(key, n);
    return n;
  };

  const adj = new Map<string, string[]>();
  const addAdj = (a: string, b: string) => {
    if (a === b) return;
    const list = adj.get(a) ?? [];
    if (!list.includes(b)) list.push(b);
    adj.set(a, list);
  };

  for (const s of segs) {
    const a = ensure(s.x1, s.y1);
    const b = ensure(s.x2, s.y2);
    addAdj(a.key, b.key);
    addAdj(b.key, a.key);
  }

  const halfKeys: string[] = [];
  const halfSeen = new Set<string>();
  for (const [a, nbrs] of adj) {
    for (const b of nbrs) {
      const dk = `${a}>${b}`;
      if (halfSeen.has(dk)) continue;
      halfSeen.add(dk);
      halfKeys.push(dk);
    }
  }

  const usedDir = new Set<string>();
  const faces: { x: number; y: number }[][] = [];

  const angleFrom = (from: string, to: string) => {
    const a = nodes.get(from)!;
    const b = nodes.get(to)!;
    return Math.atan2(b.y - a.y, b.x - a.x);
  };

  /** Next neighbor around `cur` in CCW order after arriving from `prev`. */
  const nextLeft = (prev: string, cur: string): string | null => {
    const nbrs = adj.get(cur) ?? [];
    if (!nbrs.length) return null;
    const ranked = nbrs
      .map((n) => ({ n, ang: angleFrom(cur, n) }))
      .sort((a, b) => a.ang - b.ang);
    const prevAng = angleFrom(cur, prev);
    let idx = ranked.findIndex((r) => r.n === prev);
    if (idx < 0) {
      // Snap to nearest angle if key mismatch.
      let best = 0;
      let bestDiff = Infinity;
      ranked.forEach((r, i) => {
        let d = Math.abs(r.ang - prevAng);
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d < bestDiff) {
          bestDiff = d;
          best = i;
        }
      });
      idx = best;
    }
    const next = ranked[(idx + 1) % ranked.length];
    return next?.n ?? null;
  };

  for (const start of halfKeys) {
    if (usedDir.has(start)) continue;
    const [startA, startB] = start.split('>') as [string, string];
    const path = [startA, startB];
    usedDir.add(start);
    let prev = startA;
    let cur = startB;
    let closed = false;
    for (let guard = 0; guard < halfKeys.length + 2; guard++) {
      const nxt = nextLeft(prev, cur);
      if (!nxt) break;
      const dk = `${cur}>${nxt}`;
      if (usedDir.has(dk)) {
        if (nxt === startA && path.length >= 3) closed = true;
        break;
      }
      usedDir.add(dk);
      if (nxt === startA) {
        closed = path.length >= 3;
        break;
      }
      path.push(nxt);
      prev = cur;
      cur = nxt;
    }
    if (!closed) continue;
    const points = path.map((k) => {
      const n = nodes.get(k)!;
      return { x: n.x, y: n.y };
    });
    const area = polygonAreaSqFt(points);
    if (area < MIN_AREA_SQ_FT || area > MAX_AREA_SQ_FT) continue;
    // Normalize winding to CCW for stable centroids / area labels.
    if (signedArea(points) < 0) points.reverse();
    faces.push(points);
  }

  if (faces.length > 1) {
    faces.sort((a, b) => polygonAreaSqFt(b) - polygonAreaSqFt(a));
    const largest = polygonAreaSqFt(faces[0]!);
    const plateArea =
      Math.max(1, plate.bounds.maxX - plate.bounds.minX) *
      Math.max(1, plate.bounds.maxY - plate.bounds.minY);
    if (largest > plateArea * 0.92) faces.shift();
  }

  const unique: { x: number; y: number }[][] = [];
  for (const loop of faces.sort((a, b) => polygonAreaSqFt(a) - polygonAreaSqFt(b))) {
    const c = centroid(loop);
    const area = polygonAreaSqFt(loop);
    const dup = unique.some((u) => {
      const cu = centroid(u);
      return Math.hypot(cu.x - c.x, cu.y - c.y) < 1.5 && Math.abs(polygonAreaSqFt(u) - area) < 8;
    });
    if (!dup) unique.push(loop);
  }

  const labels = plate.labels ?? [];
  const usedLabels = new Set<number>();
  const stamps: CadRoomStamp[] = [];
  let anon = 1;
  for (const points of unique) {
    const c = centroid(points);
    const area = polygonAreaSqFt(points);
    let name: string | null = null;
    // Room labels can sit off-centroid (e.g. kitchen name near a wall); keep generous.
    let bestD = 14;
    let bestIdx = -1;
    labels.forEach((label, i) => {
      if (usedLabels.has(i)) return;
      const d = Math.hypot(label.x - c.x, label.y - c.y);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
        name = label.text;
      }
    });
    if (bestIdx >= 0) usedLabels.add(bestIdx);
    if (!name) {
      name = `Room ${anon}`;
      anon += 1;
    }
    stamps.push({
      id: `room-${stamps.length}`,
      x: c.x,
      y: c.y,
      name,
      areaSqFt: Math.round(area),
      points,
      sourceLabelIndex: bestIdx >= 0 ? bestIdx : undefined,
    });
  }
  return stamps;
}

export function formatRoomAreaSqFt(areaSqFt: number): string {
  if (!Number.isFinite(areaSqFt)) return '';
  return `${Math.round(areaSqFt).toLocaleString('en-US')} sq ft`;
}

export function formatDraftLength(wall: Pick<CadWallCenterlineFt, 'x1' | 'y1' | 'x2' | 'y2'>): string {
  return formatWallLengthFt(segLengthFt(wall));
}

export function nearestLabel(labels: CadLabelFt[], x: number, y: number, tolFt = 6): CadLabelFt | null {
  let best: CadLabelFt | null = null;
  let bestD = tolFt;
  for (const l of labels) {
    const d = Math.hypot(l.x - x, l.y - y);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best;
}
