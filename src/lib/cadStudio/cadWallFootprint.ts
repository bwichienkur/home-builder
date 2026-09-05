import type { CadWallCenterlineFt } from './types';
import { defaultWallThicknessFt } from './cadDrawSnap';

export type WallFootprintQuad = [
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
];

/** Axis-aligned thickness footprint for a wall centerline (plan feet). */
export function wallFootprintQuad(
  wall: Pick<CadWallCenterlineFt, 'x1' | 'y1' | 'x2' | 'y2' | 'thicknessFt' | 'exterior' | 'layer'>,
  thicknessFt?: number,
): WallFootprintQuad {
  const t =
    thicknessFt ??
    wall.thicknessFt ??
    defaultWallThicknessFt({ exterior: wall.exterior, layer: wall.layer });
  const half = Math.max(0.08, t) / 2;
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * half;
  const ny = (dx / len) * half;
  return [
    { x: wall.x1 + nx, y: wall.y1 + ny },
    { x: wall.x2 + nx, y: wall.y2 + ny },
    { x: wall.x2 - nx, y: wall.y2 - ny },
    { x: wall.x1 - nx, y: wall.y1 - ny },
  ];
}

export function wallFootprintPointsAttr(quad: WallFootprintQuad): string {
  return quad.map((p) => `${p.x},${p.y}`).join(' ');
}
