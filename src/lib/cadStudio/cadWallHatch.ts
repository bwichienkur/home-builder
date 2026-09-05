import type { CadWallCenterlineFt, CadWallTypeId } from './types';
import { CAD_WALL_TYPES, wallTypeById } from './cadModelKernel';

/** Drafting hatch styles for Plan7-style wall type fills. */
export type CadWallHatchStyle = {
  id: CadWallTypeId;
  label: string;
  /** Solid fill behind hatch. */
  fill: string;
  /** Hatch stroke color. */
  stroke: string;
  /** Pattern id used in SVG <defs>. */
  patternId: string;
  /** Diagonal hatch spacing in plan feet. */
  spacingFt: number;
  angleDeg: number;
};

export const CAD_WALL_HATCH_STYLES: CadWallHatchStyle[] = [
  {
    id: 'wall-ext-2x6',
    label: 'Load-bearing exterior',
    fill: '#dcfce7',
    stroke: '#15803d',
    patternId: 'cad-hatch-ext-2x6',
    spacingFt: 0.35,
    angleDeg: 45,
  },
  {
    id: 'wall-ext-2x4',
    label: 'Exterior 2×4',
    fill: '#bbf7d0',
    stroke: '#166534',
    patternId: 'cad-hatch-ext-2x4',
    spacingFt: 0.4,
    angleDeg: -45,
  },
  {
    id: 'wall-int-2x4',
    label: 'Interior walls',
    fill: '#dbeafe',
    stroke: '#1d4ed8',
    patternId: 'cad-hatch-int-2x4',
    spacingFt: 0.45,
    angleDeg: 45,
  },
  {
    id: 'wall-int-partition',
    label: 'Partitions / chases',
    fill: '#fee2e2',
    stroke: '#b91c1c',
    patternId: 'cad-hatch-partition',
    spacingFt: 0.3,
    angleDeg: 0,
  },
];

export function wallHatchStyleForWall(wall: CadWallCenterlineFt): CadWallHatchStyle {
  const typeId =
    wall.typeId ??
    (wall.exterior ? 'wall-ext-2x6' : 'wall-int-2x4');
  return CAD_WALL_HATCH_STYLES.find((s) => s.id === typeId) ?? CAD_WALL_HATCH_STYLES[2]!;
}

export function wallHatchStyleByTypeId(typeId: CadWallTypeId | undefined): CadWallHatchStyle {
  if (!typeId) return CAD_WALL_HATCH_STYLES[2]!;
  return CAD_WALL_HATCH_STYLES.find((s) => s.id === typeId) ?? CAD_WALL_HATCH_STYLES[2]!;
}

/** SVG <defs> block with hatch patterns (userSpaceOnUse, plan feet). */
export function cadWallHatchPatternDefs(): string {
  return CAD_WALL_HATCH_STYLES.map((s) => {
    const sp = s.spacingFt;
    if (s.angleDeg === 0) {
      return `<pattern id="${s.patternId}" width="${sp}" height="${sp}" patternUnits="userSpaceOnUse">
  <rect width="${sp}" height="${sp}" fill="${s.fill}"/>
  <path d="M 0 ${sp / 2} H ${sp}" stroke="${s.stroke}" stroke-width="0.04"/>
</pattern>`;
    }
    const rad = (s.angleDeg * Math.PI) / 180;
    const dx = Math.cos(rad) * sp * 4;
    const dy = Math.sin(rad) * sp * 4;
    return `<pattern id="${s.patternId}" width="${sp}" height="${sp}" patternUnits="userSpaceOnUse" patternTransform="rotate(${s.angleDeg})">
  <rect width="${sp}" height="${sp}" fill="${s.fill}"/>
  <path d="M 0 0 L 0 ${sp}" stroke="${s.stroke}" stroke-width="0.045"/>
  <!-- ${dx.toFixed(2)},${dy.toFixed(2)} -->
</pattern>`;
  }).join('\n');
}

/** Legend entries present on a plate (unique wall types in use). */
export function wallHatchLegendForPlate(walls: CadWallCenterlineFt[]): CadWallHatchStyle[] {
  const ids = new Set<CadWallTypeId>();
  for (const w of walls) {
    const id =
      w.typeId ??
      (w.exterior ? ('wall-ext-2x6' as CadWallTypeId) : ('wall-int-2x4' as CadWallTypeId));
    ids.add(id);
    void wallTypeById(id);
  }
  if (!ids.size) return CAD_WALL_HATCH_STYLES.slice(0, 3);
  return CAD_WALL_HATCH_STYLES.filter((s) => ids.has(s.id));
}

/** Catalog labels aligned with hatch styles (for UI copy). */
export function wallTypeLegendLabel(typeId: CadWallTypeId): string {
  return wallTypeById(typeId)?.label ?? CAD_WALL_TYPES.find((t) => t.id === typeId)?.label ?? typeId;
}
