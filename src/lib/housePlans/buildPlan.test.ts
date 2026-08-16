import { describe, expect, it } from 'vitest';
import { buildHouse, livingAreaSqFt } from './buildPlan';
import { assertPlanCatalog, getHousePlan, listBuiltinHousePlans } from './planRegistry';
import { importDxfHousePlan } from './dxfImport';
import { usePlannerStore } from '../../store/plannerStore';

describe('sample house plans', () => {
  it('ships measured sample plans (no proprietary brochure set)', () => {
    assertPlanCatalog();
    const plans = listBuiltinHousePlans();
    expect(plans.length).toBeGreaterThanOrEqual(3);
    for (const plan of plans) {
      expect(plan.floors.length).toBe(plan.stories);
      const built = buildHouse(plan);
      expect(built.floors.length).toBe(plan.stories);
      expect(built.floors[0]!.scene.walls.length).toBeGreaterThan(3);
    }
  });

  it('builds the ranch sample with contiguous rooms', () => {
    const plan = getHousePlan('sample-ranch-36x28')!;
    expect(plan.livingSqFt).toBe(1008);
    expect(livingAreaSqFt(plan.floors[0]!.rooms)).toBeGreaterThan(500);
    const built = buildHouse(plan);
    expect(built.floors[0]!.roomPolygons.length).toBe(plan.floors[0]!.rooms.length);
  });

  it('opens a sample plan in the planner store', () => {
    usePlannerStore.setState({
      walls: [],
      openings: [],
      furniture: [],
      floors: [{ id: 'ground', name: 'Ground floor', scene: { walls: [], openings: [], furniture: [], floorColor: '#c9b18f', wallColor: '#f3f0e9', ceilingColor: '#f4f6f8' } }],
      activeFloorId: 'ground',
      planRooms: [],
      housePlanId: null,
      housePlanName: null,
      selectedRoomId: null,
    } as any);
    expect(usePlannerStore.getState().applyHousePlan('sample-ranch-36x28')).toBe(true);
    expect(usePlannerStore.getState().housePlanId).toBe('sample-ranch-36x28');
    expect(usePlannerStore.getState().walls.length).toBeGreaterThan(0);
    expect(usePlannerStore.getState().cameraMode).toBe('top');
  });
});

describe('dxf import', () => {
  it('parses the sample rectangular DXF into rooms', () => {
    const dxf = `0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
0
90
4
70
1
10
0
20
0
10
24
20
0
10
24
20
16
10
0
20
16
0
LINE
8
0
10
12
20
0
11
12
21
16
0
LINE
8
0
10
0
20
8
11
24
21
8
0
ENDSEC
0
EOF
`;
    const result = importDxfHousePlan(dxf, 'Test DXF');
    expect(result.lineCount).toBeGreaterThan(0);
    expect(result.plan.floors[0]!.rooms.length).toBeGreaterThanOrEqual(1);
    const built = buildHouse(result.plan);
    expect(built.floors[0]!.scene.walls.length).toBeGreaterThan(0);
  });
});
