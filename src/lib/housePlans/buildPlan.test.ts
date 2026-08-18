import { describe, expect, it } from 'vitest';
import type { RoomType } from '../../types';
import { buildHouse, livingAreaSqFt, insertPlanRoomVertexPoints, movePlanRoomVertexPoints, removePlanRoomVertexPoints, resizePlanRoomPoints, planRoomSizeFeet } from './buildPlan';
import { assertPlanCatalog, getHousePlan, listBuiltinHousePlans } from './planRegistry';
import { importDxfHousePlan } from './dxfImport';
import { usePlannerStore } from '../../store/plannerStore';
import { WORLD_ORIGIN } from '../geometry/placement';
import { PIXELS_PER_METER } from '../geometry/snapping';

const ROOM_TYPES = new Set<RoomType>([
  'Bedroom',
  'Living room',
  'Bathroom',
  'Kitchen',
  'Dining room',
  'Office',
  'Children’s room',
  'Laundry',
  'Hallway',
  'Storage / wardrobe',
  'Outdoor',
]);

describe('sample house plans', () => {
  it('ships Olsen flyer layouts plus measured samples', () => {
    assertPlanCatalog();
    const plans = listBuiltinHousePlans();
    expect(plans.length).toBeGreaterThanOrEqual(20);
    expect(plans.some((p) => p.id === 'driftwood')).toBe(true);
    expect(plans.some((p) => p.id === 'oyster-bay')).toBe(true);
    expect(plans.some((p) => p.id === 'sandbridge')).toBe(true);
    expect(plans.some((p) => p.id === 'sample-ranch-36x28')).toBe(true);
    for (const plan of plans) {
      expect(plan.floors.length).toBe(plan.stories);
      for (const floor of plan.floors) {
        for (const room of floor.rooms) {
          expect(ROOM_TYPES.has(room.roomType), `${plan.id} ${room.name}`).toBe(true);
        }
      }
      const built = buildHouse(plan);
      expect(built.floors.length).toBe(plan.stories);
      expect(built.floors[0]!.scene.walls.length).toBeGreaterThan(3);
      expect(built.floors[0]!.roomPolygons.length).toBe(plan.floors[0]!.rooms.length);
    }
  });

  it('keeps non-rectangular Olsen flyer rooms as polygons', () => {
    const sandbridge = getHousePlan('sandbridge')!;
    expect(sandbridge.floors[0]!.rooms.some((room) => (room.pointsFt?.length ?? 0) > 4)).toBe(true);
    const driftwood = getHousePlan('driftwood')!;
    expect(driftwood.floors[0]!.rooms.some((room) => (room.pointsFt?.length ?? 0) >= 4)).toBe(true);
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

  it('opens an Olsen flyer plan in the planner store', () => {
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
    expect(usePlannerStore.getState().applyHousePlan('driftwood')).toBe(true);
    expect(usePlannerStore.getState().housePlanId).toBe('driftwood');
    expect(usePlannerStore.getState().housePlanName).toBe('Driftwood');
    expect(usePlannerStore.getState().walls.length).toBeGreaterThan(0);
    expect(usePlannerStore.getState().planRooms.length).toBeGreaterThan(4);
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

describe('polygon vertex edit', () => {
  const origin = { x: 420, y: 330 };
  const ppm = 80;
  const ft = (n: number) => n * 0.3048 * ppm;
  const square = [
    { x: origin.x, y: origin.y },
    { x: origin.x + ft(12), y: origin.y },
    { x: origin.x + ft(12), y: origin.y + ft(12) },
    { x: origin.x, y: origin.y + ft(12) },
  ];

  it('moves a vertex without collapsing the room', () => {
    const next = movePlanRoomVertexPoints(square, 1, { x: origin.x + ft(14), y: origin.y - ft(2) });
    expect(next).not.toBeNull();
    expect(next![1]!.x).toBeCloseTo(origin.x + ft(14));
    expect(next!.length).toBe(4);
  });

  it('rejects moves that shrink below 3 ft', () => {
    const triangle = [
      { x: origin.x, y: origin.y },
      { x: origin.x + ft(12), y: origin.y },
      { x: origin.x + ft(6), y: origin.y + ft(12) },
    ];
    const next = movePlanRoomVertexPoints(triangle, 2, { x: origin.x + ft(6), y: origin.y + ft(1) });
    expect(next).toBeNull();
  });

  it('rejects an out-of-range vertex index', () => {
    expect(movePlanRoomVertexPoints(square, 9, { x: origin.x, y: origin.y })).toBeNull();
  });

  it('inserts a midpoint vertex on an edge', () => {
    const next = insertPlanRoomVertexPoints(square, 0);
    expect(next).not.toBeNull();
    expect(next!.length).toBe(5);
    expect(next![1]!.x).toBeCloseTo(origin.x + ft(6));
  });

  it('inserts a vertex at a given t along the edge', () => {
    const next = insertPlanRoomVertexPoints(square, 0, 0.25);
    expect(next).not.toBeNull();
    expect(next!.length).toBe(5);
    expect(next![1]!.x).toBeCloseTo(origin.x + ft(3));
    expect(next![1]!.y).toBeCloseTo(origin.y);
  });

  it('removes a vertex when four or more remain', () => {
    const five = insertPlanRoomVertexPoints(square, 0)!;
    const next = removePlanRoomVertexPoints(five, 1);
    expect(next).not.toBeNull();
    expect(next!.length).toBe(4);
  });

  it('refuses to remove below three corners', () => {
    const triangle = square.slice(0, 3);
    expect(removePlanRoomVertexPoints(triangle, 0)).toBeNull();
  });

  it('scales L-shaped rooms without collapsing to a rectangle', () => {
    const ppm = 80;
    const ft = (n: number) => n * 0.3048 * ppm;
    const lShape = [
      { x: WORLD_ORIGIN.x, y: WORLD_ORIGIN.y },
      { x: WORLD_ORIGIN.x + ft(16), y: WORLD_ORIGIN.y },
      { x: WORLD_ORIGIN.x + ft(16), y: WORLD_ORIGIN.y + ft(8) },
      { x: WORLD_ORIGIN.x + ft(8), y: WORLD_ORIGIN.y + ft(8) },
      { x: WORLD_ORIGIN.x + ft(8), y: WORLD_ORIGIN.y + ft(14) },
      { x: WORLD_ORIGIN.x, y: WORLD_ORIGIN.y + ft(14) },
    ];
    const next = resizePlanRoomPoints(lShape, 20, 18);
    expect(next.length).toBe(6);
    const size = planRoomSizeFeet(next);
    expect(size.widthFt).toBeCloseTo(20, 1);
    expect(size.depthFt).toBeCloseTo(18, 1);
  });
});
