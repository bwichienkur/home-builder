import { syncWallSegments } from './editCadPlate';
import type { CadPlate } from './types';

/** Mirror the whole plan about the plate bounds center on X or Y (scheme flip). */
export function flipPlan(plate: CadPlate, axis: 'x' | 'y'): CadPlate {
  const { minX, maxX, minY, maxY } = plate.bounds;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const fx = (x: number) => (axis === 'x' ? 2 * cx - x : x);
  const fy = (y: number) => (axis === 'y' ? 2 * cy - y : y);

  const flipSeg = <T extends { x1: number; y1: number; x2: number; y2: number }>(s: T): T => ({
    ...s,
    x1: fx(s.x1),
    y1: fy(s.y1),
    x2: fx(s.x2),
    y2: fy(s.y2),
  });

  const next: CadPlate = {
    ...plate,
    segments: plate.segments.map(flipSeg),
    wallCenterlines: plate.wallCenterlines.map(flipSeg),
    openingHints: plate.openingHints.map(flipSeg),
    labels: plate.labels.map((l) => ({ ...l, x: fx(l.x), y: fy(l.y) })),
    fixtureHints: plate.fixtureHints.map((f) => ({ ...f, xFt: fx(f.xFt), yFt: fy(f.yFt) })),
    slabs: (plate.slabs ?? []).map((s) => ({
      ...s,
      points: s.points.map((p) => ({ x: fx(p.x), y: fy(p.y) })),
    })),
    stairs: (plate.stairs ?? []).map((st) => ({
      ...st,
      xFt: fx(st.xFt),
      yFt: fy(st.yFt),
      rotationDeg: axis === 'x' ? 180 - st.rotationDeg : -st.rotationDeg,
    })),
    guidelines: (plate.guidelines ?? []).map(flipSeg),
    sectionCuts: (plate.sectionCuts ?? []).map(flipSeg),
    dormers: (plate.dormers ?? []).map((d) => ({
      ...d,
      xFt: fx(d.xFt),
      yFt: fy(d.yFt),
    })),
    underlay: plate.underlay
      ? {
          ...plate.underlay,
          xFt: fx(plate.underlay.xFt + plate.underlay.widthFt) - plate.underlay.widthFt,
          yFt: fy(plate.underlay.yFt + plate.underlay.heightFt) - plate.underlay.heightFt,
        }
      : undefined,
    annotativeDims: (plate.annotativeDims ?? []).map((d) => ({
      ...d,
      x1: fx(d.x1),
      y1: fy(d.y1),
      x2: fx(d.x2),
      y2: fy(d.y2),
      labelX: fx(d.labelX),
      labelY: fy(d.labelY),
    })),
  };

  return syncWallSegments(next);
}
