import { buildFloorFromCadWalls } from '../housePlans/dxfCadBuild';
import type { HousePlanFloor } from '../housePlans/buildPlan';
import type { Opening, Wall } from '../../types';
import { buildCadMassing } from './buildCadMassing';
import {
  visibleFixtures,
  visibleOpeningHints,
  visibleSlabs,
  visibleStairs,
  visibleWallCenterlines,
} from './cadLayerVisibility';
import {
  ensureAllStoryFloorSlabs,
  ensureModelKernel,
  filterPlateToStory,
  storyHeightFt,
} from './cadModelKernel';
import { detectCadFixtures } from './detectCadFixtures';
import { elevationOpeningHintsFt } from './elevationOpenings';
import type { CadExtrusion, CadPlate } from './types';

const DEFAULT_HEIGHT_M = 2.74;
const FT_TO_M = 0.3048;

/** Encode story elevation into wall/opening ids for Extrude view to offset meshes. */
export function storyZFromEntityId(id: string): number {
  const m = /^z([0-9.]+)\|/.exec(id);
  return m ? Number(m[1]) : 0;
}

function tagStoryZ<T extends { id: string }>(items: T[], zOffsetM: number): T[] {
  const tag = zOffsetM.toFixed(3);
  return items.map((item) => ({ ...item, id: `z${tag}|${item.id}` }));
}

function extrudeOneStory(
  plate: CadPlate,
  heightM: number,
  zOffsetM: number,
): Pick<CadExtrusion, 'walls' | 'openings' | 'wallSegmentsFt'> {
  const ceilingFt = heightM / FT_TO_M;
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
      swing: h.swing === 'slider' ? 'none' : h.swing,
      id: h.id,
    })),
  };

  const massing = buildCadMassing(plate, heightM);
  const elevHints = elevationOpeningHintsFt(plate, massing);
  const allHints = [
    ...openingHints.map((h) => ({
      x1: h.x1,
      y1: h.y1,
      x2: h.x2,
      y2: h.y2,
      kind: h.kind,
      layer: h.layer,
      sillFt: h.sillFt,
      heightFt: h.heightFt,
      swing: h.swing === 'slider' ? ('none' as const) : h.swing,
      id: h.id,
    })),
    ...elevHints.map((h) => ({
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
  ];

  const floorWithHints: HousePlanFloor = {
    ...floor,
    openingHintsFt: allHints,
  };

  const built = buildFloorFromCadWalls(floorWithHints, { centerFt });
  const walls = tagStoryZ(built.scene.walls, zOffsetM).map((wall, i) => {
    const src = wallCenterlines[i];
    const hOverride = src?.heightFt != null ? src.heightFt * FT_TO_M : wall.height;
    return { ...wall, height: hOverride };
  });
  const openings = tagStoryZ(built.scene.openings, zOffsetM).map((o) => ({
    ...o,
    wallId: `z${zOffsetM.toFixed(3)}|${o.wallId.replace(/^z[0-9.]+\|/, '')}`,
  }));

  return {
    walls,
    openings,
    wallSegmentsFt: wallCenterlines.map((s) => ({
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      exterior: s.exterior,
    })),
  };
}

/**
 * Extrude 3D walls + openings + fixtures from a CAD plate.
 * Stacks stories when present (M3). Pass `{ activeStoryOnly: true }` to preview one level.
 */
export function extrudeCadPlate(
  plate: CadPlate,
  opts?: { heightM?: number; activeStoryOnly?: boolean },
): CadExtrusion {
  const kernel = ensureAllStoryFloorSlabs(ensureModelKernel(plate));
  const defaultHeightM = opts?.heightM ?? DEFAULT_HEIGHT_M;
  const centerFt = {
    cx: (kernel.bounds.minX + kernel.bounds.maxX) / 2,
    cy: (kernel.bounds.minY + kernel.bounds.maxY) / 2,
  };

  const stories = kernel.stories?.length
    ? [...kernel.stories].sort((a, b) => a.levelFt - b.levelFt)
    : [{ id: kernel.activeStoryId ?? 'story-1', name: 'Level 1', levelFt: 0 }];

  const storyList =
    opts?.activeStoryOnly === true
      ? stories.filter((s) => s.id === (kernel.activeStoryId ?? stories[0]!.id))
      : stories;

  const walls: Wall[] = [];
  const openings: Opening[] = [];
  const wallSegmentsFt: CadExtrusion['wallSegmentsFt'] = [];

  for (const story of storyList) {
    const storyPlate = filterPlateToStory(kernel, story.id);
    if (!storyPlate.wallCenterlines.length) continue;
    const heightFt = storyHeightFt(kernel, story.id, defaultHeightM / FT_TO_M);
    const heightM = heightFt * FT_TO_M;
    const zOffsetM = story.levelFt * FT_TO_M;
    const part = extrudeOneStory(storyPlate, heightM || defaultHeightM, zOffsetM);
    walls.push(...part.walls);
    openings.push(...part.openings);
    wallSegmentsFt.push(...part.wallSegmentsFt);
  }

  return {
    walls,
    openings,
    fixtures: detectCadFixtures({
      ...kernel,
      fixtureHints: visibleFixtures(kernel),
    }),
    slabs: visibleSlabs(kernel),
    stairs: visibleStairs(kernel),
    centerFt,
    heightM: defaultHeightM,
    massing: buildCadMassing(kernel, defaultHeightM),
    wallSegmentsFt,
  };
}
