import { buildFloorFromCadWalls } from '../housePlans/dxfCadBuild';
import type { HousePlanFloor } from '../housePlans/buildPlan';
import { buildCadMassing } from './buildCadMassing';
import { detectCadFixtures } from './detectCadFixtures';
import { elevationOpeningHintsFt } from './elevationOpenings';
import type { CadExtrusion, CadPlate } from './types';

const DEFAULT_HEIGHT_M = 2.74;

/**
 * Extrude 3D walls + openings + procedural fixtures from a CAD plate.
 * Fixtures are never walls — counters/sinks/toilets are separate meshes.
 */
export function extrudeCadPlate(plate: CadPlate, opts?: { heightM?: number }): CadExtrusion {
  const heightM = opts?.heightM ?? DEFAULT_HEIGHT_M;
  const ceilingFt = heightM / 0.3048;
  const centerFt = {
    cx: (plate.bounds.minX + plate.bounds.maxX) / 2,
    cy: (plate.bounds.minY + plate.bounds.maxY) / 2,
  };

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

  const massing = buildCadMassing(plate, heightM);
  const elevHints = elevationOpeningHintsFt(plate, massing);
  const allHints = [...plate.openingHints, ...elevHints];

  const floorWithHints: HousePlanFloor = {
    ...floor,
    openingHintsFt: allHints.map((h) => ({
      x1: h.x1,
      y1: h.y1,
      x2: h.x2,
      y2: h.y2,
      kind: h.kind,
      layer: h.layer,
    })),
  };

  const builtWithOpenings = buildFloorFromCadWalls(floorWithHints, { centerFt });
  const fixtures = detectCadFixtures(plate);
  const wallSegmentsFt = plate.wallCenterlines.map((s) => ({
    x1: s.x1,
    y1: s.y1,
    x2: s.x2,
    y2: s.y2,
    exterior: s.exterior,
  }));

  return {
    walls: builtWithOpenings.scene.walls,
    openings: builtWithOpenings.scene.openings,
    fixtures,
    centerFt,
    heightM,
    massing,
    wallSegmentsFt,
  };
}
