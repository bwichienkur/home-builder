import { exteriorContourBounds } from './buildCadMassing';
import type { CadFoundationOverrides, CadPlate, CadSlabFt } from './types';

export const DEFAULT_FOUNDATION: CadFoundationOverrides = {
  enabled: false,
  mode: 'slab+footing',
  offsetFt: 0.5,
  slabThicknessFt: 0.67,
  footingWidthFt: 2,
  footingDepthFt: 1,
};

function rectPoints(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Array<{ x: number; y: number }> {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

/** Build auto foundation slabs from exterior wall contour (AABB + offset). */
export function buildAutoFoundationSlabs(
  plate: CadPlate,
  opts: CadFoundationOverrides,
): CadSlabFt[] {
  if (!opts.enabled) return [];
  const contour = exteriorContourBounds(plate);
  const o = Math.max(0, opts.offsetFt);
  const minX = contour.minX - o;
  const minY = contour.minY - o;
  const maxX = contour.maxX + o;
  const maxY = contour.maxY + o;
  if (maxX - minX < 2 || maxY - minY < 2) return [];

  const out: CadSlabFt[] = [];
  const wantSlab = opts.mode === 'slab' || opts.mode === 'slab+footing';
  const wantFooting = opts.mode === 'footing' || opts.mode === 'slab+footing';

  if (wantSlab) {
    const thick = Math.max(0.25, opts.slabThicknessFt);
    out.push({
      id: 'auto-fnd-slab',
      kind: 'foundation',
      points: rectPoints(minX, minY, maxX, maxY),
      thicknessFt: thick,
      elevationFt: -thick,
      layer: 'A-FND-SLAB',
      railing: false,
      auto: true,
    });
  }

  if (wantFooting) {
    const w = Math.max(0.75, opts.footingWidthFt);
    const depth = Math.max(0.5, opts.footingDepthFt);
    const elev = -(opts.slabThicknessFt || 0) - depth;
    const strips: Array<{ id: string; pts: Array<{ x: number; y: number }> }> = [
      { id: 'auto-fnd-ftg-s', pts: rectPoints(minX, minY, maxX, minY + w) },
      { id: 'auto-fnd-ftg-n', pts: rectPoints(minX, maxY - w, maxX, maxY) },
      { id: 'auto-fnd-ftg-w', pts: rectPoints(minX, minY + w, minX + w, maxY - w) },
      { id: 'auto-fnd-ftg-e', pts: rectPoints(maxX - w, minY + w, maxX, maxY - w) },
    ];
    for (const s of strips) {
      if (s.pts[2]!.x - s.pts[0]!.x < 0.2 || s.pts[2]!.y - s.pts[0]!.y < 0.2) continue;
      out.push({
        id: s.id,
        kind: 'footing',
        points: s.pts,
        thicknessFt: depth,
        elevationFt: elev,
        layer: 'A-FND-FTG',
        railing: false,
        auto: true,
      });
    }
  }

  return out;
}

/** Replace auto foundation slabs; preserve user site slabs (terrace, plot, etc.). */
export function applyAutoFoundation(
  plate: CadPlate,
  patch?: Partial<CadFoundationOverrides>,
): CadPlate {
  const foundation: CadFoundationOverrides = {
    ...(plate.foundation ?? DEFAULT_FOUNDATION),
    ...patch,
  };
  const keep = (plate.slabs ?? []).filter((s) => !s.auto);
  const auto = buildAutoFoundationSlabs({ ...plate, foundation }, foundation);
  const slabs = [...keep, ...auto];
  return {
    ...plate,
    foundation,
    slabs,
    bounds: (() => {
      // defer to editCadPlate recompute via sync pattern — compute inline
      const pts = [
        ...plate.wallCenterlines.flatMap((w) => [
          { x: w.x1, y: w.y1 },
          { x: w.x2, y: w.y2 },
        ]),
        ...slabs.flatMap((s) => s.points),
      ];
      if (!pts.length) return plate.bounds;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      return { minX, minY, maxX, maxY };
    })(),
  };
}

export function clearAutoFoundation(plate: CadPlate): CadPlate {
  return applyAutoFoundation(plate, { enabled: false });
}
