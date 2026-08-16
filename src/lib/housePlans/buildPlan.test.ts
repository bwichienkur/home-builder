import { describe, expect, it } from 'vitest';
import { buildFloorFromRooms, buildHouse, livingAreaSqFt, planRoomSizeFeet, proposedRoomOverlaps, row, shapedRoomPoints, splitPlanRoomPoints, squareRoomPoints, attachSquareRoomPoints, attachSideBlocked } from './buildPlan';
import { WORLD_ORIGIN } from '../geometry/placement';
import { assertPlanCatalog, listHousePlanNames, olsenHousePlans } from './olsenPlans';
import { usePlannerStore } from '../../store/plannerStore';

describe('house plan builder', () => {
  it('builds walls and openings from adjacent room rectangles', () => {
    const rooms = [
      ...row(0, 12, [
        { name: 'Garage', roomType: 'Storage / wardrobe', w: 20 },
        { name: 'Foyer', roomType: 'Hallway', w: 10 },
        { name: 'Living', roomType: 'Living room', w: 18 },
      ]),
      ...row(12, 12, [
        { name: 'Bed', roomType: 'Bedroom', w: 14 },
        { name: 'Bath', roomType: 'Bathroom', w: 8 },
        { name: 'Kitchen', roomType: 'Kitchen', w: 14 },
      ]),
    ];
    const built = buildFloorFromRooms({ id: 't1', name: 'Test', rooms });
    expect(built.scene.walls.length).toBeGreaterThan(8);
    expect(built.scene.openings.some((o) => o.type === 'door' || o.type === 'passage')).toBe(true);
    expect(built.scene.openings.some((o) => o.type === 'window')).toBe(true);
    expect(built.roomPolygons).toHaveLength(rooms.length);
  });

  it('interactive rebuilds start with no exterior openings and only shared passages', () => {
    const rooms = [
      ...row(0, 12, [
        { name: 'A', roomType: 'Bedroom', w: 12 },
        { name: 'B', roomType: 'Bedroom', w: 12 },
      ]),
    ];
    const catalog = buildFloorFromRooms({ id: 'c1', name: 'Catalog', rooms });
    expect(catalog.scene.openings.some((o) => o.type === 'window')).toBe(true);
    const shared = buildFloorFromRooms({ id: 's1', name: 'Shared', rooms }, { openings: 'shared-only' });
    expect(shared.scene.openings.every((o) => o.type === 'passage')).toBe(true);
    expect(shared.scene.openings.some((o) => o.type === 'window')).toBe(false);
    const alone = buildFloorFromRooms(
      { id: 'a1', name: 'Alone', rooms: row(0, 12, [{ name: 'Solo', roomType: 'Bedroom', w: 12 }]) },
      { openings: 'shared-only' },
    );
    expect(alone.scene.openings).toHaveLength(0);
  });

  it('attaches a square room flush to a host side', () => {
    const host = squareRoomPoints(WORLD_ORIGIN, 12, 10);
    const right = attachSquareRoomPoints(host, 'right');
    const size = planRoomSizeFeet(right);
    expect(size.widthFt).toBeCloseTo(10, 1);
    expect(size.depthFt).toBeCloseTo(10, 1);
    expect(attachSideBlocked('h', 'right', [{ id: 'h', points: host }])).toBe(false);
  });

  it('covers every Olsen-named plan from the New Smyrna floor-plans page', () => {
    const expected = [
      'Coral Sands',
      'Islamorada',
      'Largo',
      'Captiva',
      'Key Biscayne',
      'Sanibel',
      'St. Croix',
      'St. Thomas',
      'St. Johns',
      'Ravello',
      'Tradewinds',
      'Driftwood',
      'Oyster Bay',
      'Sandbridge',
      'Marbella',
      'Verona',
      'Villa Della Dolce Vita',
      'Portofino',
      'Tidelands',
      'Capri',
      'Granada',
      'Santorini',
    ];
    expect(listHousePlanNames().sort()).toEqual([...expected].sort());
    expect(olsenHousePlans).toHaveLength(22);

    for (const plan of olsenHousePlans) {
      const built = buildHouse(plan);
      expect(built.floors.length).toBe(plan.stories);
      for (const floor of built.floors) {
        expect(floor.scene.walls.length).toBeGreaterThan(3);
        expect(floor.roomPolygons.length).toBeGreaterThan(3);
        expect(livingAreaSqFt(floor.rooms)).toBeGreaterThan(200);
      }
    }
  });

  it('applies a house plan into the planner store with floors', () => {
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
    const ok = usePlannerStore.getState().applyHousePlan('largo');
    expect(ok).toBe(true);
    const state = usePlannerStore.getState();
    expect(state.housePlanId).toBe('largo');
    expect(state.housePlanName).toBe('Largo');
    expect(state.walls.length).toBeGreaterThan(10);
    expect(state.planRooms.length).toBeGreaterThan(5);
    expect(state.unitSystem).toBe('imperial');
    expect(assertPlanCatalog().find((p) => p.id === 'largo')).toBeTruthy();

    const room = state.planRooms[0];
    usePlannerStore.getState().selectRoom(room.id);
    usePlannerStore.getState().updatePlanRoom(room.id, { name: 'Edited Room', floorColor: '#7d5c43' });
    const edited = usePlannerStore.getState().planRooms.find((r) => r.id === room.id)!;
    expect(edited.name).toBe('Edited Room');
    expect(edited.floorColor).toBe('#7d5c43');
    expect(usePlannerStore.getState().selectedRoomId).toBe(room.id);
    expect(usePlannerStore.getState().workflowStage).toBe('house');
    usePlannerStore.getState().enterRoom(room.id);
    expect(usePlannerStore.getState().workflowStage).toBe('room');
    usePlannerStore.getState().exitRoom();
    expect(usePlannerStore.getState().workflowStage).toBe('house');
    expect(usePlannerStore.getState().selectedRoomId).toBeNull();

    if (state.floors.length > 1) {
      const second = state.floors[1];
      usePlannerStore.getState().switchFloor(second.id);
      const switched = usePlannerStore.getState();
      expect(switched.activeFloorId).toBe(second.id);
      expect(switched.cameraMode).toBe('top');
      expect(switched.workflowStage).toBe('house');
      expect(switched.selectedRoomId).toBeNull();
    }
  });

  it('creates square room polygons and splits them', () => {
    const pts = squareRoomPoints(WORLD_ORIGIN, 12, 10);
    const size = planRoomSizeFeet(pts);
    expect(size.widthFt).toBeCloseTo(12, 1);
    expect(size.depthFt).toBeCloseTo(10, 1);
    const [a, b] = splitPlanRoomPoints(pts, 'x');
    expect(planRoomSizeFeet(a).widthFt).toBeCloseTo(6, 1);
    expect(planRoomSizeFeet(b).widthFt).toBeCloseTo(6, 1);
  });

  it('blocks nesting a room inside another but allows edge-flush neighbors', () => {
    const existing = [{ points: squareRoomPoints(WORLD_ORIGIN, 12, 12) }];
    expect(proposedRoomOverlaps(WORLD_ORIGIN, 'rectangle', existing)).toBe(true);
    const widthPx = existing[0].points[1].x - existing[0].points[0].x;
    const neighborCenter = { x: WORLD_ORIGIN.x + widthPx, y: WORLD_ORIGIN.y };
    expect(proposedRoomOverlaps(neighborCenter, 'rectangle', existing)).toBe(false);
    expect(shapedRoomPoints('rectangle', neighborCenter)).toHaveLength(4);
  });

  it('adds a square room and isolates on enter', () => {
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
      workflowStage: 'house',
    } as any);
    const id = usePlannerStore.getState().addSquareRoom(WORLD_ORIGIN, 12, 12, 'Studio');
    expect(id).toBeTruthy();
    const state = usePlannerStore.getState();
    expect(state.planRooms).toHaveLength(1);
    expect(state.walls.length).toBe(4);
    expect(state.workflowStage).toBe('house');
    expect(state.selectedRoomId).toBe(id);
    usePlannerStore.getState().splitPlanRoom(id!);
    expect(usePlannerStore.getState().planRooms).toHaveLength(2);
  });

  it('switches stories into centered top view and can add a blank story', () => {
    expect(usePlannerStore.getState().applyHousePlan('captiva')).toBe(true);
    const floors = usePlannerStore.getState().floors;
    expect(floors.length).toBe(2);
    usePlannerStore.getState().switchFloor(floors[1].id);
    expect(usePlannerStore.getState().activeFloorId).toBe(floors[1].id);
    expect(usePlannerStore.getState().cameraMode).toBe('top');
    expect(usePlannerStore.getState().workflowStage).toBe('house');
    usePlannerStore.getState().addFloor();
    expect(usePlannerStore.getState().floors).toHaveLength(3);
    expect(usePlannerStore.getState().floors[2].name).toBe('Story 3');
    expect(usePlannerStore.getState().walls).toHaveLength(0);
  });
});
