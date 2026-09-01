import { buildFloorFromCadWalls } from '../housePlans/dxfCadBuild';
import type { HousePlanFloor } from '../housePlans/buildPlan';
import type { CadExtrusion, CadPlate } from './types';

const DEFAULT_HEIGHT_M = 2.74;

/**
 * Extrude 3D walls + openings from CAD plate wall centerlines.
 * Does not synthesize walls from room boxes — plate linework is the source of truth.
 */
export function extrudeCadPlate(plate: CadPlate, opts?: { heightM?: number }): CadExtrusion {
  const heightM = opts?.heightM ?? DEFAULT_HEIGHT_M;
  const ceilingFt = heightM / 0.3048;

  const floor: HousePlanFloor = {
    id: `${plate.id}-floor`,
    name: 'CAD plate',
    rooms: plate.wallCenterlines.length
      ? [
          {
            id: 'cad-envelope',
            name: 'CAD envelope',
            roomType: 'Hallway',
            x: plate.bounds.minX,
            y: plate.bounds.minY,
            w: Math.max(1, plate.bounds.maxX - plate.bounds.minX),
            h: Math.max(1, plate.bounds.maxY - plate.bounds.minY),
            ceilingFt,
          },
        ]
      : [],
    wallSegmentsFt: plate.wallCenterlines.map((s) => ({
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      layer: s.layer,
      exterior: s.exterior,
    })),
    openingHintsFt: plate.openingHints.map((h) => ({
      x1: h.x1,
      y1: h.y1,
      x2: h.x2,
      y2: h.y2,
      kind: h.kind,
      layer: h.layer,
    })),
  };

  const built = buildFloorFromCadWalls(floor);
  return {
    walls: built.scene.walls,
    openings: built.scene.openings,
    centerFt: {
      cx: (plate.bounds.minX + plate.bounds.maxX) / 2,
      cy: (plate.bounds.minY + plate.bounds.maxY) / 2,
    },
    heightM,
  };
}
