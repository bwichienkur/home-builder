import { syncWallSegments, segLengthFt } from './editCadPlate';
import { flipPlan } from './cadPlanOps';
import type { CadOpeningHintFt, CadPlate, CadSegmentFt } from './types';

const MERGE_MID_FT = 1.35;
const MERGE_DIR_DOT = 0.85;
/** Typical swinging door max clear; wider → garage / overhead. */
const GARAGE_WIDTH_FT = 8;

function heightForKind(kind: CadOpeningHintFt['kind']): number {
  if (kind === 'window') return 4;
  if (kind === 'garage') return 7;
  return 6 + 8 / 12;
}

function unit(o: { x1: number; y1: number; x2: number; y2: number }) {
  const len = Math.hypot(o.x2 - o.x1, o.y2 - o.y1) || 1;
  return { ux: (o.x2 - o.x1) / len, uy: (o.y2 - o.y1) / len, len };
}

function mid(o: { x1: number; y1: number; x2: number; y2: number }) {
  return { x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2 };
}

function sameOpeningFamily(a: CadOpeningHintFt['kind'], b: CadOpeningHintFt['kind']): boolean {
  if (a === 'window' || b === 'window') return a === 'window' && b === 'window';
  return true; // door / garage / passage share family for merge
}

function classifyKind(o: CadOpeningHintFt): CadOpeningHintFt['kind'] {
  const layer = (o.layer ?? '').toUpperCase();
  if (/WINDOW|GLAZ|WIND/.test(layer)) return 'window';
  if (/GARAGE/.test(layer)) return 'garage';
  const width = o.widthFt ?? segLengthFt(o);
  if (o.kind !== 'window' && o.kind !== 'passage' && width >= GARAGE_WIDTH_FT) return 'garage';
  if (o.kind === 'passage') return 'passage';
  if (o.kind === 'window') return 'window';
  if (o.kind === 'garage') return 'garage';
  return 'door';
}

/**
 * Merge near-duplicate opening hints (common DXF fragmentation) and
 * reclassify wide / garage-layer openings so they don't get swing arcs.
 */
export function consolidateOpeningHints(plate: CadPlate): CadPlate {
  const src = plate.openingHints;
  if (src.length < 2) {
    return refineOpeningKinds(plate);
  }

  const kept: CadOpeningHintFt[] = [];
  const used = new Set<number>();

  for (let i = 0; i < src.length; i++) {
    if (used.has(i)) continue;
    let best = src[i]!;
    let bestLen = segLengthFt(best);
    const bi = unit(best);
    const bm = mid(best);
    used.add(i);

    for (let j = i + 1; j < src.length; j++) {
      if (used.has(j)) continue;
      const other = src[j]!;
      if (!sameOpeningFamily(classifyKind(best), classifyKind(other))) continue;
      const om = mid(other);
      if (Math.hypot(bm.x - om.x, bm.y - om.y) > MERGE_MID_FT) continue;
      const oj = unit(other);
      const dot = Math.abs(bi.ux * oj.ux + bi.uy * oj.uy);
      if (dot < MERGE_DIR_DOT) continue;
      used.add(j);
      const otherLen = segLengthFt(other);
      if (otherLen > bestLen) {
        best = other;
        bestLen = otherLen;
      }
    }
    kept.push(best);
  }

  if (kept.length === src.length) return refineOpeningKinds(plate);
  return refineOpeningKinds(syncWallSegments({ ...plate, openingHints: kept }));
}

/** Apply garage/window/door kind + swing defaults after merge or import. */
export function refineOpeningKinds(plate: CadPlate): CadPlate {
  let changed = false;
  const openingHints = plate.openingHints.map((o) => {
    const kind = classifyKind(o);
    const patch: Partial<CadOpeningHintFt> = {};
    if (kind !== o.kind) {
      patch.kind = kind;
      changed = true;
    }
    if (kind === 'garage' && o.swing !== 'none') {
      patch.swing = 'none';
      changed = true;
    }
    if (kind === 'window' && o.swing !== 'none') {
      patch.swing = 'none';
      changed = true;
    }
    if (kind === 'door' && o.swing == null) {
      patch.swing = 'left';
      changed = true;
    }
    if (o.heightFt == null) {
      patch.heightFt = heightForKind(kind);
      changed = true;
    }
    if (kind === 'window' && o.sillFt == null) {
      patch.sillFt = 3;
      changed = true;
    }
    if (o.widthFt == null) {
      patch.widthFt = segLengthFt(o);
      changed = true;
    }
    return Object.keys(patch).length ? { ...o, ...patch } : o;
  });
  if (!changed) return plate;
  return { ...plate, openingHints };
}

/**
 * Drop DXF opening-layer segments that duplicate hosted hints or form
 * room-scale orange outlines (e.g. garage perimeter on a DOORS layer).
 */
export function shouldDrawOpeningSegment(
  seg: CadSegmentFt,
  openings: CadOpeningHintFt[],
): boolean {
  if (seg.role !== 'opening') return true;
  const len = segLengthFt(seg);
  // Room-sized loops / long chords on opening layers — hide (hints own the symbol).
  if (len > 14) return false;
  if (len < 0.45) return false;
  const mx = (seg.x1 + seg.x2) / 2;
  const my = (seg.y1 + seg.y2) / 2;
  for (const o of openings) {
    const { ux, uy, len: olen } = unit(o);
    const t = Math.max(0, Math.min(1, ((mx - o.x1) * ux + (my - o.y1) * uy) / olen));
    const qx = o.x1 + ux * olen * t;
    const qy = o.y1 + uy * olen * t;
    if (Math.hypot(mx - qx, my - qy) < 1.75) return false;
  }
  return true;
}

/**
 * If a GARAGE / 3-CAR label sits clearly in the top half of the wall envelope,
 * flip Y so the garage reads toward the bottom (sheet orientation).
 * Uses wall bounds (not lot/foundation) so pad slabs don't skew the midpoint.
 */
export function orientPlanGarageBottom(plate: CadPlate): CadPlate {
  const garage = plate.labels.find((l) => /GARAGE/i.test(l.text));
  if (!garage) return plate;

  let minY = Infinity;
  let maxY = -Infinity;
  for (const w of plate.wallCenterlines) {
    minY = Math.min(minY, w.y1, w.y2);
    maxY = Math.max(maxY, w.y1, w.y2);
  }
  if (!Number.isFinite(minY) || maxY - minY < 8) {
    minY = plate.bounds.minY;
    maxY = plate.bounds.maxY;
  }
  const midY = (minY + maxY) / 2;
  // Require clearly above mid (top ~45%) so mid-plan garage labels don't flip.
  if (garage.y <= midY + (maxY - minY) * 0.05) return plate;
  const flipped = flipPlan(plate, 'y');
  return {
    ...flipped,
    warnings: [
      ...flipped.warnings,
      'Flipped plan Y so garage / sheet orientation matches the floor sheet (garage toward bottom).',
    ],
  };
}
