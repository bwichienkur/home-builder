import type { CadMassing, CadPlate } from './types';
import type { PlanOpeningHintFt } from '../housePlans/dxfCadBuild';

/** Map front-elevation window/door segments onto plan coordinates for 3D openings. */
export function elevationOpeningHintsFt(plate: CadPlate, massing: CadMassing): PlanOpeningHintFt[] {
  const front = plate.elevationFront;
  if (!front) return [];

  const b = massing.planBounds;
  const widthFt = Math.max(1, front.bounds.maxX - front.bounds.minX);
  const planWidthFt = Math.max(1, b.maxX - b.minX);
  const planDepthFt = Math.max(1, b.maxY - b.minY);
  const xOffset =
    massing.frontFace === 'south' || massing.frontFace === 'north'
      ? b.minX + (planWidthFt - widthFt) / 2
      : 0;
  const yOffset =
    massing.frontFace === 'east' || massing.frontFace === 'west'
      ? b.minY + (planDepthFt - widthFt) / 2
      : 0;

  const hints: PlanOpeningHintFt[] = [];
  for (const s of front.segments) {
    if (s.role !== 'opening' && !/WINDOW|DOOR|GLAZ|OPEN|GARAGE/i.test(s.layer)) continue;
    const len = Math.hypot(s.x2Ft - s.x1Ft, s.y2Ft - s.y1Ft);
    if (len < 1 || len > 16) continue;
    const kind = /DOOR|GARAGE|OPEN/i.test(s.layer) && !/WINDOW|GLAZ/i.test(s.layer) ? 'door' : 'window';
    const cx = (s.x1Ft + s.x2Ft) / 2;
    const half = len / 2;

    switch (massing.frontFace) {
      case 'south':
        hints.push({
          x1: xOffset + cx - half,
          y1: b.minY,
          x2: xOffset + cx + half,
          y2: b.minY,
          kind,
          layer: s.layer,
        });
        break;
      case 'north':
        hints.push({
          x1: xOffset + cx - half,
          y1: b.maxY,
          x2: xOffset + cx + half,
          y2: b.maxY,
          kind,
          layer: s.layer,
        });
        break;
      case 'east':
        hints.push({
          x1: b.maxX,
          y1: yOffset + cx - half,
          x2: b.maxX,
          y2: yOffset + cx + half,
          kind,
          layer: s.layer,
        });
        break;
      case 'west':
        hints.push({
          x1: b.minX,
          y1: yOffset + cx - half,
          x2: b.minX,
          y2: yOffset + cx + half,
          kind,
          layer: s.layer,
        });
        break;
    }
  }
  return hints;
}
