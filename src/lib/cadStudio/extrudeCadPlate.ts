import { buildFloorFromCadWalls } from '../housePlans/dxfCadBuild';
import type { HousePlanFloor } from '../housePlans/buildPlan';
import { buildCadMassing } from './buildCadMassing';
import {
  visibleFixtures,
  visibleOpeningHints,
  visibleSlabs,
  visibleStairs,
  visibleWallCenterlines,
} from './cadLayerVisibility';
import { detectCadFixtures } from './detectCadFixtures';
import { elevationOpeningHintsFt } from './elevationOpenings';
import type { CadExtrusion, CadPlate } from './types';

const DEFAULT_HEIGHT_M = 2.74;

/**
 * Extrude 3D walls + openings + procedural fixtures from a CAD plate.
 * Respects layer visibility and building visibility toggles.
 */
export function extrudeCadPlate(plate: CadPlate, opts?: { heightM?: number }): CadExtrusion {
  const heightM = opts?.heightM ?? DEFAULT_HEIGHT_M;
  const ceilingFt = heightM / 0.3048;
  const centerFt = {
    cx: (plate.bounds.minX + plate.bounds.maxX) / 2,
    cy: (plate.bounds.minY + plate.bounds.maxY) / 2,
  };

  const hiddenBuildings = new Set(
    (plate.buildings ?? []).filter((b) => !b.visible).map((b) => b.id),
  );
  const wallCenterlines = visibleWallCenterlines(plate).filter(
    (w) => !w.buildingId || !hiddenBuildings.has(w.buildingId),
  );
  const openingHints = visibleOpeningHints(plate);
  const slabs = visibleSlabs(plate);
  const stairs = visibleStairs(plate);

  const floor: HousePlanFloor = {
    id: `${plate.id}-floor`,
    name: 'CAD plate',
    rooms: wallCenterlines.length
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
    wallSegmentsFt: wallCenterlines.map((s) => ({
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      layer: s.layer,
      exterior: s.exterior,
      thicknessFt: s.thicknessFt,
      materialId: s.materialId,
    })),
    openingHintsFt: openingHints.map((h) => ({
      x1: h.x1,
      y1: h.y1,
      x2: h.x2,
      y2: h.y2,
      kind: h.kind,
      layer: h.layer,
      sillFt: h.sillFt,
      heightFt: h.heightFt,
      swing: h.swing,
    })),
  };

  const massing = buildCadMassing(plate, heightM);
  const elevHints = elevationOpeningHintsFt(plate, massing);
  const allHints = [...openingHints, ...elevHints];

  const floorWithHints: HousePlanFloor = {
    ...floor,
    openingHintsFt: allHints.map((h) => ({
      x1: h.x1,
      y1: h.y1,
      x2: h.x2,
      y2: h.y2,
      kind: h.kind,
      layer: h.layer,
      sillFt: 'sillFt' in h ? h.sillFt : undefined,
      heightFt: 'heightFt' in h ? (h as { heightFt?: number }).heightFt : undefined,
      swing: 'swing' in h ? (h as { swing?: 'left' | 'right' | 'none' }).swing : undefined,
    })),
  };

  const builtWithOpenings = buildFloorFromCadWalls(floorWithHints, { centerFt });
  const fixtures = detectCadFixtures({
    ...plate,
    fixtureHints: visibleFixtures(plate),
  });

  const wallSegmentsFt = wallCenterlines.map((s) => ({
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
    slabs,
    stairs,
    centerFt,
    heightM,
    massing,
    wallSegmentsFt,
  };
}
