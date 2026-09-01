import { fixtureKindFromBlockName } from '../housePlans/dxfFixtureGeometry';
import type { CadFixtureHintFt, CadFixtureInstance, CadFixtureKind, CadPlate, CadSegmentFt } from './types';

const FT_EPS = 0.35;
const COUNTER_HEIGHT_M = 0.91; // 36"
const SINK_HEIGHT_M = 0.36;
const TOILET_HEIGHT_M = 0.4;
const TUB_HEIGHT_M = 0.55;
const APPLIANCE_HEIGHT_M = 0.9;

function segLen(s: CadSegmentFt): number {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
}

function heightForKind(kind: CadFixtureKind): number {
  switch (kind) {
    case 'counter':
    case 'island':
      return COUNTER_HEIGHT_M;
    case 'sink':
      return SINK_HEIGHT_M;
    case 'toilet':
      return TOILET_HEIGHT_M;
    case 'tub':
      return TUB_HEIGHT_M;
    case 'appliance':
      return APPLIANCE_HEIGHT_M;
    default:
      return 0.5;
  }
}

/** Union-find cluster segments that share endpoints within FT_EPS. */
function clusterSegments(segs: CadSegmentFt[]): CadSegmentFt[][] {
  const n = segs.length;
  if (!n) return [];
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (a: number): number => {
    let x = a;
    while (parent[x] !== x) x = parent[x]!;
    return x;
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const ends = segs.map((s) => [
    { x: s.x1, y: s.y1 },
    { x: s.x2, y: s.y2 },
  ]);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let near = false;
      for (const a of ends[i]!) {
        for (const b of ends[j]!) {
          if (Math.hypot(a.x - b.x, a.y - b.y) <= FT_EPS) {
            near = true;
            break;
          }
        }
        if (near) break;
      }
      if (near) unite(i, j);
    }
  }
  const groups = new Map<number, CadSegmentFt[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(segs[i]!);
    groups.set(root, list);
  }
  return [...groups.values()];
}

function aabbOf(segs: CadSegmentFt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of segs) {
    minX = Math.min(minX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxX = Math.max(maxX, s.x1, s.x2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }
  return { minX, minY, maxX, maxY };
}

function countersFromSegments(segs: CadSegmentFt[]): CadFixtureInstance[] {
  const counterSegs = segs.filter((s) => s.role === 'fixture' && /COUNTER/i.test(s.layer));
  const clusters = clusterSegments(counterSegs);
  const out: CadFixtureInstance[] = [];
  let i = 0;
  for (const cluster of clusters) {
    if (cluster.length < 3) continue;
    const totalLen = cluster.reduce((s, g) => s + segLen(g), 0);
    if (totalLen < 4) continue;
    const box = aabbOf(cluster);
    const w = box.maxX - box.minX;
    const d = box.maxY - box.minY;
    if (w < 1 || d < 1) continue;
    if (w > 25 || d > 25) continue;
    if (w * d < 2) continue;
    const kind: CadFixtureKind = w >= 2.5 && d >= 2.5 ? 'island' : 'counter';
    out.push({
      id: `counter-${i++}`,
      kind,
      xFt: (box.minX + box.maxX) / 2,
      yFt: (box.minY + box.maxY) / 2,
      widthFt: w,
      depthFt: d,
      heightM: heightForKind(kind),
      rotationRad: 0,
      layer: 'COUNTER',
    });
  }
  return out;
}

function instancesFromHints(hints: CadFixtureHintFt[]): CadFixtureInstance[] {
  return hints.map((h, i) => {
    const kind: CadFixtureKind =
      h.kind ?? (h.blockName ? fixtureKindFromBlockName(h.blockName) : 'other');
    const widthFt = h.widthFt ?? (h.radiusFt != null ? h.radiusFt * 2 : 1.5);
    const depthFt = h.depthFt ?? (h.radiusFt != null ? h.radiusFt * 2 : 1.5);
    return {
      id: `hint-${i}-${kind}`,
      kind,
      xFt: h.xFt,
      yFt: h.yFt,
      widthFt: Math.max(0.8, Math.min(widthFt, 8)),
      depthFt: Math.max(0.8, Math.min(depthFt, 8)),
      heightM: heightForKind(kind),
      rotationRad: ((h.rotationDeg ?? 0) * Math.PI) / 180,
      layer: h.layer,
      blockName: h.blockName,
    };
  });
}

/** Compact FIXTURES clusters that look like bowls / toilets (when INSERT hints are sparse). */
function compactFixturesFromSegments(segs: CadSegmentFt[], existing: CadFixtureInstance[]): CadFixtureInstance[] {
  const fixtureSegs = segs.filter((s) => s.role === 'fixture' && /FIXTURE|PLUMB/i.test(s.layer));
  const clusters = clusterSegments(fixtureSegs);
  const out: CadFixtureInstance[] = [];
  let i = 0;
  for (const cluster of clusters) {
    if (cluster.length < 4) continue;
    const box = aabbOf(cluster);
    const w = box.maxX - box.minX;
    const d = box.maxY - box.minY;
    if (w < 0.7 || d < 0.7 || w > 5 || d > 5) continue;
    const aspect = Math.max(w, d) / Math.max(0.01, Math.min(w, d));
    if (aspect > 2.2) continue; // elongated = cabinet run, skip
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    // Skip if an INSERT hint already covers this spot
    if (existing.some((e) => Math.hypot(e.xFt - cx, e.yFt - cy) < 1.5)) continue;
    const kind: CadFixtureKind = Math.max(w, d) >= 2.2 ? 'toilet' : 'sink';
    out.push({
      id: `compact-${i++}`,
      kind,
      xFt: cx,
      yFt: cy,
      widthFt: w,
      depthFt: d,
      heightM: heightForKind(kind),
      rotationRad: 0,
      layer: cluster[0]?.layer,
    });
  }
  return out;
}

/** Build procedural fixture instances for Extrude 3D from a CAD plate. */
export function detectCadFixtures(plate: CadPlate): CadFixtureInstance[] {
  const fromHints = instancesFromHints(plate.fixtureHints ?? []);
  const counters = countersFromSegments(plate.segments);
  const compact = compactFixturesFromSegments(plate.segments, [...fromHints, ...counters]);
  // Prefer INSERT hints over compact clusters at the same place; keep all counters.
  return [...counters, ...fromHints, ...compact].slice(0, 400);
}

export { fixtureKindFromBlockName as kindFromBlockName, heightForKind };
