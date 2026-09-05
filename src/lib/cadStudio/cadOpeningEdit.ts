import { nearestWallHost, formatWallLengthFt, segLengthFt, syncWallSegments } from './editCadPlate';
import { placeHostedOpening, setOpeningWidth } from './cadWallModify';
import { ensureDefaultStories, setActiveStory } from './cadStories';
import type {
  CadDesignSnapshot,
  CadOpeningHintFt,
  CadPlate,
  CadSegmentFt,
  CadWallCenterlineFt,
} from './types';

const FT_TO_M = 0.3048;

export type OlsenOpeningPreset = {
  id: string;
  label: string;
  kind: CadOpeningHintFt['kind'];
  widthFt: number;
  heightFt: number;
  sillFt: number;
};

/** Common Olsen / residential clear sizes. */
export const OLSEN_OPENING_PRESETS: OlsenOpeningPreset[] = [
  { id: 'd-3068', label: 'Door 3/0 × 6/8', kind: 'door', widthFt: 3, heightFt: 6 + 8 / 12, sillFt: 0 },
  { id: 'd-2868', label: 'Door 2/8 × 6/8', kind: 'door', widthFt: 2 + 8 / 12, heightFt: 6 + 8 / 12, sillFt: 0 },
  { id: 'd-2668', label: 'Door 2/6 × 6/8', kind: 'door', widthFt: 2.5, heightFt: 6 + 8 / 12, sillFt: 0 },
  { id: 'w-3050', label: 'Window 3/0 × 5/0', kind: 'window', widthFt: 3, heightFt: 5, sillFt: 3 },
  { id: 'w-3040', label: 'Window 3/0 × 4/0', kind: 'window', widthFt: 3, heightFt: 4, sillFt: 3.5 },
  { id: 'w-2040', label: 'Window 2/0 × 4/0', kind: 'window', widthFt: 2, heightFt: 4, sillFt: 3.5 },
  { id: 'g-1607', label: 'Garage 16 × 7', kind: 'garage', widthFt: 16, heightFt: 7, sillFt: 0 },
  { id: 'g-1807', label: 'Garage 18 × 7', kind: 'garage', widthFt: 18, heightFt: 7, sillFt: 0 },
  { id: 'p-3068', label: 'Passage 3/0 × 6/8', kind: 'passage', widthFt: 3, heightFt: 6 + 8 / 12, sillFt: 0 },
];

export function defaultOpeningHeightFt(kind: CadOpeningHintFt['kind']): number {
  if (kind === 'window') return 4;
  if (kind === 'garage') return 7;
  return 6 + 8 / 12;
}

function wallUnit(w: CadWallCenterlineFt) {
  const len = segLengthFt(w) || 1;
  const ux = (w.x2 - w.x1) / len;
  const uy = (w.y2 - w.y1) / len;
  return { ux, uy, nx: -uy, ny: ux, len };
}

function reseatOnHost(
  o: CadOpeningHintFt,
  w: CadWallCenterlineFt,
  hostT: number,
  widthFt: number,
): CadOpeningHintFt {
  const { ux, uy, len } = wallUnit(w);
  const half = Math.min(Math.max(0.5, widthFt) / 2, len * 0.45);
  const tMin = half / len + 0.02;
  const tMax = 1 - half / len - 0.02;
  const tt = Math.max(tMin, Math.min(tMax, hostT));
  const cx = w.x1 + ux * len * tt;
  const cy = w.y1 + uy * len * tt;
  return {
    ...o,
    hostT: tt,
    widthFt: half * 2,
    x1: cx - ux * half,
    y1: cy - uy * half,
    x2: cx + ux * half,
    y2: cy + uy * half,
  };
}

/** Slide a hosted opening along its wall (or re-host if free). */
export function slideOpeningAlongWall(
  plate: CadPlate,
  index: number,
  planX: number,
  planY: number,
  opts?: { freeMove?: boolean; rehostTolFt?: number },
): CadPlate {
  const o = plate.openingHints[index];
  if (!o) return plate;
  const width = o.widthFt ?? segLengthFt(o);

  if (!opts?.freeMove && o.hostWallIndex != null && plate.wallCenterlines[o.hostWallIndex]) {
    const w = plate.wallCenterlines[o.hostWallIndex]!;
    const { ux, uy, len } = wallUnit(w);
    const t = ((planX - w.x1) * ux + (planY - w.y1) * uy) / len;
    const next = reseatOnHost({ ...o, hostWallIndex: o.hostWallIndex }, w, t, width);
    const openingHints = plate.openingHints.map((h, i) => (i === index ? next : h));
    return syncWallSegments({ ...plate, openingHints });
  }

  // Free move: try re-host nearby
  const host = nearestWallHost(plate, planX, planY, opts?.rehostTolFt ?? 2.5);
  if (host) {
    const w = plate.wallCenterlines[host.wallIndex]!;
    const next = reseatOnHost(
      { ...o, hostWallIndex: host.wallIndex },
      w,
      host.t,
      width,
    );
    const openingHints = plate.openingHints.map((h, i) => (i === index ? next : h));
    return syncWallSegments({ ...plate, openingHints });
  }

  // Unhosted free translate
  const { ux, uy } = wallUnit({
    x1: o.x1,
    y1: o.y1,
    x2: o.x2,
    y2: o.y2,
  });
  const half = width / 2;
  const updated: CadOpeningHintFt = {
    ...o,
    hostWallIndex: undefined,
    hostT: undefined,
    x1: planX - ux * half,
    y1: planY - uy * half,
    x2: planX + ux * half,
    y2: planY + uy * half,
    widthFt: width,
  };
  const openingHints = plate.openingHints.map((h, i) => (i === index ? updated : h));
  return syncWallSegments({ ...plate, openingHints });
}

/** Set clear opening height (feet). */
export function setOpeningHeight(plate: CadPlate, index: number, heightFt: number): CadPlate {
  const o = plate.openingHints[index];
  if (!o) return plate;
  const h = Math.max(0.5, Math.min(12, heightFt));
  const openingHints = plate.openingHints.map((op, i) =>
    i === index ? { ...op, heightFt: h } : op,
  );
  return { ...plate, openingHints };
}

/** Distance from wall start (end A) to near jamb of opening. */
export function openingOffsetFromStartFt(plate: CadPlate, index: number): number | null {
  const o = plate.openingHints[index];
  if (!o || o.hostWallIndex == null) return null;
  const w = plate.wallCenterlines[o.hostWallIndex];
  if (!w || o.hostT == null) return null;
  const width = o.widthFt ?? segLengthFt(o);
  return o.hostT * segLengthFt(w) - width / 2;
}

/** Move hosted opening so near jamb is `offsetFt` from wall start. */
export function setOpeningOffsetFromStart(
  plate: CadPlate,
  index: number,
  offsetFt: number,
): CadPlate {
  const o = plate.openingHints[index];
  if (!o || o.hostWallIndex == null) return plate;
  const w = plate.wallCenterlines[o.hostWallIndex];
  if (!w) return plate;
  const width = o.widthFt ?? segLengthFt(o);
  const len = segLengthFt(w) || 1;
  const t = (Math.max(0, offsetFt) + width / 2) / len;
  const next = reseatOnHost(o, w, t, width);
  const openingHints = plate.openingHints.map((h, i) => (i === index ? next : h));
  return syncWallSegments({ ...plate, openingHints });
}

export function setOpeningSwing(
  plate: CadPlate,
  index: number,
  swing: CadOpeningHintFt['swing'],
): CadPlate {
  const openingHints = plate.openingHints.map((h, i) =>
    i === index ? { ...h, swing: swing ?? 'left' } : h,
  );
  return { ...plate, openingHints };
}

export function applyOpeningPreset(
  plate: CadPlate,
  index: number,
  presetId: string,
): CadPlate {
  const preset = OLSEN_OPENING_PRESETS.find((p) => p.id === presetId);
  const o = plate.openingHints[index];
  if (!preset || !o) return plate;
  let next = setOpeningWidth(
    { ...plate, openingHints: plate.openingHints.map((h, i) =>
      i === index
        ? {
            ...h,
            kind: preset.kind,
            sillFt: preset.kind === 'window' ? preset.sillFt : 0,
            heightFt: preset.heightFt,
          }
        : h,
    )},
    index,
    preset.widthFt,
  );
  next = setOpeningHeight(next, index, preset.heightFt);
  return next;
}

/** Convert a soft/opening role segment into a hosted opening. */
export function convertSegmentToOpening(
  plate: CadPlate,
  segmentIndex: number,
  kind: CadOpeningHintFt['kind'] = 'door',
): CadPlate {
  const seg = plate.segments[segmentIndex];
  if (!seg) return plate;
  const cx = (seg.x1 + seg.x2) / 2;
  const cy = (seg.y1 + seg.y2) / 2;
  const width = Math.max(2, segLengthFt(seg));
  const host = nearestWallHost(plate, cx, cy, 3);
  if (!host) {
    const hint: CadOpeningHintFt = {
      x1: seg.x1,
      y1: seg.y1,
      x2: seg.x2,
      y2: seg.y2,
      kind,
      layer: seg.layer,
      widthFt: width,
      sillFt: kind === 'window' ? 3 : 0,
      heightFt: defaultOpeningHeightFt(kind),
      swing: kind === 'door' ? 'left' : 'none',
    };
    return syncWallSegments({
      ...plate,
      openingHints: [...plate.openingHints, hint],
    });
  }
  return placeHostedOpening(
    plate,
    host.wallIndex,
    host.t,
    width,
    kind,
    kind === 'window' ? 3 : 0,
  );
}

export type OpeningClash = {
  kind: 'overlap' | 'near-corner';
  openingIndex: number;
  otherIndex?: number;
  message: string;
};

/** Soft checks: overlapping openings on same wall, too close to corner. */
export function detectOpeningClashes(plate: CadPlate, cornerTolFt = 0.5): OpeningClash[] {
  const clashes: OpeningClash[] = [];
  const byWall = new Map<number, number[]>();
  plate.openingHints.forEach((o, i) => {
    if (o.hostWallIndex == null) return;
    const list = byWall.get(o.hostWallIndex) ?? [];
    list.push(i);
    byWall.set(o.hostWallIndex, list);
  });

  for (const [wallIndex, indices] of byWall) {
    const w = plate.wallCenterlines[wallIndex];
    if (!w) continue;
    const len = segLengthFt(w);
    for (let a = 0; a < indices.length; a++) {
      const ia = indices[a]!;
      const oa = plate.openingHints[ia]!;
      const wa = oa.widthFt ?? segLengthFt(oa);
      const ta = oa.hostT ?? 0.5;
      const a0 = ta * len - wa / 2;
      const a1 = ta * len + wa / 2;
      if (a0 < cornerTolFt || a1 > len - cornerTolFt) {
        clashes.push({
          kind: 'near-corner',
          openingIndex: ia,
          message: `${oa.mark ?? `Opening ${ia + 1}`} is within ${cornerTolFt}' of a wall end`,
        });
      }
      for (let b = a + 1; b < indices.length; b++) {
        const ib = indices[b]!;
        const ob = plate.openingHints[ib]!;
        const wb = ob.widthFt ?? segLengthFt(ob);
        const tb = ob.hostT ?? 0.5;
        const b0 = tb * len - wb / 2;
        const b1 = tb * len + wb / 2;
        if (a0 < b1 && b0 < a1) {
          clashes.push({
            kind: 'overlap',
            openingIndex: ia,
            otherIndex: ib,
            message: `${oa.mark ?? `O${ia + 1}`} overlaps ${ob.mark ?? `O${ib + 1}`}`,
          });
        }
      }
    }
  }
  return clashes;
}

export type UnhostedOpeningRow = {
  index: number;
  kind: CadOpeningHintFt['kind'];
  mark?: string;
  widthFt: number;
  nearWall: boolean;
};

export function listUnhostedOpenings(plate: CadPlate, tolFt = 2.5): UnhostedOpeningRow[] {
  const rows: UnhostedOpeningRow[] = [];
  plate.openingHints.forEach((o, index) => {
    if (o.hostWallIndex != null) return;
    const cx = (o.x1 + o.x2) / 2;
    const cy = (o.y1 + o.y2) / 2;
    const host = nearestWallHost(plate, cx, cy, tolFt);
    rows.push({
      index,
      kind: o.kind,
      mark: o.mark,
      widthFt: o.widthFt ?? segLengthFt(o),
      nearWall: Boolean(host),
    });
  });
  return rows;
}

/** Candidate DXF segments that look like doors/windows but aren't hosted hints. */
export function listConvertibleOpeningSegments(plate: CadPlate): Array<{
  segmentIndex: number;
  layer: string;
  lengthFt: number;
}> {
  const out: Array<{ segmentIndex: number; layer: string; lengthFt: number }> = [];
  plate.segments.forEach((s, segmentIndex) => {
    if (s.role !== 'opening' && s.role !== 'soft') return;
    const lengthFt = segLengthFt(s);
    if (lengthFt < 1.5 || lengthFt > 18) return;
    // Skip if already covered by an opening hint mid
    const mx = (s.x1 + s.x2) / 2;
    const my = (s.y1 + s.y2) / 2;
    const covered = plate.openingHints.some((o) => {
      const ox = (o.x1 + o.x2) / 2;
      const oy = (o.y1 + o.y2) / 2;
      return Math.hypot(ox - mx, oy - my) < 1.5;
    });
    if (covered) return;
    out.push({ segmentIndex, layer: s.layer, lengthFt });
  });
  return out.slice(0, 40);
}

/** Copy walls + openings into active story metadata (stores a plate snapshot label). */
export function copySelectionToStory(
  plate: CadPlate,
  targetStoryId: string,
  wallIndices: number[],
  openingIndices: number[],
): CadPlate {
  const withStories = ensureDefaultStories(plate);
  const target = withStories.stories?.find((s) => s.id === targetStoryId);
  if (!target) return withStories;

  // Duplicate selected walls/openings (same plan — story is metadata until multi-plate stories exist)
  let next = withStories;
  const wallMap = new Map<number, number>();
  for (const wi of wallIndices) {
    const w = next.wallCenterlines[wi];
    if (!w) continue;
    const walls = [...next.wallCenterlines, { ...w }];
    wallMap.set(wi, walls.length - 1);
    next = syncWallSegments({ ...next, wallCenterlines: walls });
  }
  for (const oi of openingIndices) {
    const o = withStories.openingHints[oi];
    if (!o) continue;
    let copy: CadOpeningHintFt = { ...o };
    if (o.hostWallIndex != null && wallMap.has(o.hostWallIndex)) {
      copy = { ...copy, hostWallIndex: wallMap.get(o.hostWallIndex) };
    }
    next = syncWallSegments({
      ...next,
      openingHints: [...next.openingHints, copy],
    });
  }
  return setActiveStory(next, targetStoryId);
}

export function saveDesignSnapshot(plate: CadPlate, name: string): CadPlate {
  const { designSnapshots: _drop, ...rest } = plate;
  const snap: CadDesignSnapshot = {
    id: `snap-${Date.now().toString(36)}`,
    name: name.trim() || `Scheme ${(plate.designSnapshots?.length ?? 0) + 1}`,
    createdAt: new Date().toISOString(),
    plate: structuredClone(rest),
  };
  return {
    ...plate,
    designSnapshots: [...(plate.designSnapshots ?? []), snap],
  };
}

export function restoreDesignSnapshot(plate: CadPlate, snapshotId: string): CadPlate {
  const snap = plate.designSnapshots?.find((s) => s.id === snapshotId);
  if (!snap) return plate;
  return {
    ...snap.plate,
    designSnapshots: plate.designSnapshots,
    id: plate.id,
  };
}

/** Opening height in meters for extrusion (uses heightFt when set). */
export function openingHeightM(
  o: Pick<CadOpeningHintFt, 'kind' | 'heightFt'>,
  storyHeightM: number,
): number {
  if (o.heightFt != null && Number.isFinite(o.heightFt)) {
    return Math.min(storyHeightM * 0.98, Math.max(0.4, o.heightFt * FT_TO_M));
  }
  if (o.kind === 'window') return Math.min(1.4, storyHeightM * 0.45);
  if (o.kind === 'garage') return Math.min(2.4, storyHeightM * 0.92);
  return Math.min(2.1, storyHeightM * 0.95);
}

/** Build between-openings dim along a shared host wall. */
export function buildBetweenOpeningsDim(
  plate: CadPlate,
  indexA: number,
  indexB: number,
): {
  id: string;
  kind: 'between-openings';
  openingIndexA: number;
  openingIndexB: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  valueFt: number;
  label: string;
} | null {
  const a = plate.openingHints[indexA];
  const b = plate.openingHints[indexB];
  if (!a || !b) return null;
  if (a.hostWallIndex == null || a.hostWallIndex !== b.hostWallIndex) return null;
  const w = plate.wallCenterlines[a.hostWallIndex];
  if (!w) return null;
  const { ux, uy, nx, ny, len } = wallUnit(w);
  const wa = a.widthFt ?? segLengthFt(a);
  const wb = b.widthFt ?? segLengthFt(b);
  const ta = a.hostT ?? 0.5;
  const tb = b.hostT ?? 0.5;
  // Near-edge facing each other
  const aEdge = ta < tb ? ta * len + wa / 2 : ta * len - wa / 2;
  const bEdge = tb < ta ? tb * len + wb / 2 : tb * len - wb / 2;
  const dist = Math.abs(bEdge - aEdge);
  const mid = (aEdge + bEdge) / 2;
  const ox = nx * 1.6;
  const oy = ny * 1.6;
  return {
    id: `temp-between-open-${indexA}-${indexB}`,
    kind: 'between-openings',
    openingIndexA: indexA,
    openingIndexB: indexB,
    x1: w.x1 + ux * aEdge + ox,
    y1: w.y1 + uy * aEdge + oy,
    x2: w.x1 + ux * bEdge + ox,
    y2: w.y1 + uy * bEdge + oy,
    valueFt: dist,
    label: formatWallLengthFt(dist),
  };
}

export function setDistanceBetweenOpenings(
  plate: CadPlate,
  indexA: number,
  indexB: number,
  distanceFt: number,
): CadPlate {
  const a = plate.openingHints[indexA];
  const b = plate.openingHints[indexB];
  if (!a || !b || a.hostWallIndex == null || a.hostWallIndex !== b.hostWallIndex) return plate;
  const w = plate.wallCenterlines[a.hostWallIndex];
  if (!w || a.hostT == null || b.hostT == null) return plate;
  const len = segLengthFt(w);
  const wa = a.widthFt ?? segLengthFt(a);
  const wb = b.widthFt ?? segLengthFt(b);
  // Keep A fixed; move B so clear gap equals distance
  const aRight = a.hostT * len + wa / 2;
  const aLeft = a.hostT * len - wa / 2;
  let targetCenter: number;
  if (b.hostT >= a.hostT) {
    targetCenter = aRight + Math.max(0, distanceFt) + wb / 2;
  } else {
    targetCenter = aLeft - Math.max(0, distanceFt) - wb / 2;
  }
  const t = targetCenter / len;
  const next = reseatOnHost(b, w, t, wb);
  const openingHints = plate.openingHints.map((h, i) => (i === indexB ? next : h));
  return syncWallSegments({ ...plate, openingHints });
}

/** Pick nearest opening by plan point (for 3D→2D selection bridge). */
export function pickOpeningAtPoint(
  plate: CadPlate,
  x: number,
  y: number,
  tolFt = 2,
): number | null {
  let best: number | null = null;
  let bestD = tolFt;
  plate.openingHints.forEach((o, i) => {
    const cx = (o.x1 + o.x2) / 2;
    const cy = (o.y1 + o.y2) / 2;
    const d = Math.hypot(cx - x, cy - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export function pickWallAtPoint(
  plate: CadPlate,
  x: number,
  y: number,
  tolFt = 1.5,
): number | null {
  let best: number | null = null;
  let bestD = tolFt;
  plate.wallCenterlines.forEach((w, i) => {
    const { ux, uy, len } = wallUnit(w);
    const t = Math.max(0, Math.min(1, ((x - w.x1) * ux + (y - w.y1) * uy) / len));
    const qx = w.x1 + ux * len * t;
    const qy = w.y1 + uy * len * t;
    const d = Math.hypot(x - qx, y - qy);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Ensure openings have height + swing defaults. */
export function normalizeOpeningDefaults(plate: CadPlate): CadPlate {
  let changed = false;
  const openingHints = plate.openingHints.map((o) => {
    const patch: Partial<CadOpeningHintFt> = {};
    if (o.heightFt == null) {
      patch.heightFt = defaultOpeningHeightFt(o.kind);
      changed = true;
    }
    if (o.swing == null && o.kind === 'door') {
      patch.swing = 'left';
      changed = true;
    }
    if (o.kind === 'window' && o.sillFt == null) {
      patch.sillFt = 3;
      changed = true;
    }
    return Object.keys(patch).length ? { ...o, ...patch } : o;
  });
  if (!changed) return plate;
  return { ...plate, openingHints };
}

export type { CadSegmentFt };
