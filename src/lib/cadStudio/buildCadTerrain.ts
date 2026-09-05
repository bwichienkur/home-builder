import type { CadPlate, CadTerrainOverrides } from './types';

export const DEFAULT_TERRAIN: CadTerrainOverrides = {
  enabled: false,
  gradePercent: 4,
  directionDeg: 0,
  padFt: 12,
};

/** Height (ft) of terrain at plan point relative to finished floor (=0 at plate center). */
export function terrainHeightFt(
  terrain: CadTerrainOverrides | undefined,
  xFt: number,
  yFt: number,
  center: { cx: number; cy: number },
): number {
  if (!terrain?.enabled) return 0;
  const rad = (terrain.directionDeg * Math.PI) / 180;
  const dx = xFt - center.cx;
  const dy = yFt - center.cy;
  const along = dx * Math.cos(rad) + dy * Math.sin(rad);
  return (along * terrain.gradePercent) / 100;
}

/** Build a simple triangle grid for Extrude ground (meters, Y-up, centered). */
export function buildTerrainMeshData(
  plate: CadPlate,
  centerFt: { cx: number; cy: number },
): { positions: Float32Array; indices: Uint16Array } | null {
  const terrain = plate.terrain;
  if (!terrain?.enabled) return null;
  const FT_TO_M = 0.3048;
  const pad = terrain.padFt;
  // Prefer plot parcel extent so graded ground never reads smaller than the lot.
  const plot = plate.slabs?.find((s) => s.kind === 'plot');
  let minX = plate.bounds.minX;
  let maxX = plate.bounds.maxX;
  let minY = plate.bounds.minY;
  let maxY = plate.bounds.maxY;
  if (plot && plot.points.length >= 3) {
    minX = Math.min(...plot.points.map((p) => p.x));
    maxX = Math.max(...plot.points.map((p) => p.x));
    minY = Math.min(...plot.points.map((p) => p.y));
    maxY = Math.max(...plot.points.map((p) => p.y));
  }
  minX -= pad;
  maxX += pad;
  minY -= pad;
  maxY += pad;
  const div = 12;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= div; j++) {
    for (let i = 0; i <= div; i++) {
      const xFt = minX + ((maxX - minX) * i) / div;
      const yFt = minY + ((maxY - minY) * j) / div;
      const h = terrainHeightFt(terrain, xFt, yFt, centerFt);
      positions.push(
        (xFt - centerFt.cx) * FT_TO_M,
        h * FT_TO_M,
        (yFt - centerFt.cy) * FT_TO_M,
      );
    }
  }
  const stride = div + 1;
  for (let j = 0; j < div; j++) {
    for (let i = 0; i < div; i++) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint16Array(indices),
  };
}

export function setPlateTerrain(
  plate: CadPlate,
  patch: Partial<CadTerrainOverrides>,
): CadPlate {
  return {
    ...plate,
    terrain: { ...DEFAULT_TERRAIN, ...(plate.terrain ?? {}), ...patch },
  };
}
