import { describe, expect, it } from 'vitest';
import { evaluateBuildingChecks, WALL_ASSEMBLY_PRESETS } from './buildingChecks';
import { stairsCuttingFloor } from './geometry/stairCutouts';
import type { FurnitureItem } from '../types';

describe('buildingChecks', () => {
  it('flags tall stair risers', () => {
    const furniture: FurnitureItem[] = [
      {
        id: 's1',
        catalogId: 'stair',
        name: 'Stair',
        category: 'Circulation',
        x: 0,
        y: 0,
        z: 0,
        rotation: 0,
        color: '#8b7355',
        width: 1.1,
        depth: 2.5,
        height: 2.7,
        placementKind: 'stair',
        stair: { fromFloorId: 'a', toFloorId: 'b', runM: 2.2, riseM: 2.7, steps: 10 },
      },
    ];
    const checks = evaluateBuildingChecks({
      walls: [],
      furniture,
      siteSetback: { frontM: 6, sideM: 1.5, rearM: 6 },
    });
    expect(checks.some((c) => c.id.startsWith('stair-riser'))).toBe(true);
  });

  it('exposes wall assembly presets', () => {
    expect(WALL_ASSEMBLY_PRESETS.exterior.thicknessM).toBeGreaterThan(WALL_ASSEMBLY_PRESETS.interior.thicknessM);
  });
});

describe('stairsCuttingFloor', () => {
  it('includes stairs that land on the target floor', () => {
    const stair: FurnitureItem = {
      id: 's1',
      catalogId: 'stair',
      name: 'Stair',
      category: 'Circulation',
      x: 1,
      y: 0,
      z: 1,
      rotation: 0,
      color: '#8b7355',
      width: 1,
      depth: 2.5,
      height: 2.7,
      placementKind: 'stair',
      stair: { fromFloorId: 'ground', toFloorId: 'upper', runM: 2.4, riseM: 2.7, steps: 14 },
    };
    const floors = [
      { id: 'ground', scene: { furniture: [stair] } },
      { id: 'upper', scene: { furniture: [] } },
    ];
    const cutting = stairsCuttingFloor('upper', floors, 'ground', [stair]);
    expect(cutting.map((s) => s.id)).toContain('s1');
  });
});
