import { describe, expect, it } from 'vitest';
import { buildFloorFromRooms, buildHouse, livingAreaSqFt, row } from './buildPlan';
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
  });
});
