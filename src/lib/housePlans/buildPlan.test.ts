import { describe, expect, it } from 'vitest';
import { buildFloorFromRooms, buildHouse, livingAreaSqFt, planRoomSizeFeet, proposedRoomOverlaps, rebuildFromPlanRooms, row, shapedRoomPoints, splitPlanRoomPoints, squareRoomPoints, attachSquareRoomPoints, attachSideBlocked, nudgePlanRoomsByWall } from './buildPlan';
import { WORLD_ORIGIN } from '../geometry/placement';
import { assertPlanCatalog, getHousePlan, listHousePlanNames, olsenHousePlans } from './olsenPlans';
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

  it('attaches a matching-size room flush to a host side', () => {
    const host = squareRoomPoints(WORLD_ORIGIN, 12, 10);
    const right = attachSquareRoomPoints(host, 'right');
    const size = planRoomSizeFeet(right);
    expect(size.widthFt).toBeCloseTo(12, 1);
    expect(size.depthFt).toBeCloseTo(10, 1);
    expect(attachSideBlocked('h', 'right', [{ id: 'h', points: host }])).toBe(false);
  });

  it('nudges a vertical wall to change room width', () => {
    const pts = squareRoomPoints(WORLD_ORIGIN, 12, 12);
    const wall = { start: pts[1]!, end: pts[2]! }; // right edge
    const before = planRoomSizeFeet(pts);
    const next = nudgePlanRoomsByWall(wall, [{ id: 'r', name: 'R', roomType: 'Bedroom', points: pts }], 80, 0);
    expect(next).toBeTruthy();
    const after = planRoomSizeFeet(next![0]!.points);
    expect(after.widthFt).toBeGreaterThan(before.widthFt + 2);
    expect(after.depthFt).toBeCloseTo(before.depthFt, 1);
  });

  it('keeps plate origin fixed when centerFt is locked during rebuild', () => {
    const rooms = row(0, 12, [
      { name: 'A', roomType: 'Bedroom', w: 12 },
      { name: 'B', roomType: 'Bedroom', w: 12 },
    ]);
    const locked = { cx: 12, cy: 6 };
    const a = buildFloorFromRooms({ id: 'lock', name: 'Lock', rooms }, { openings: 'shared-only', centerFt: locked });
    const rightWall = a.scene.walls.find((w) => Math.abs(w.start.x - w.end.x) < 1 && (w.start.x + w.end.x) / 2 > 0);
    expect(rightWall).toBeTruthy();
    const midBefore = ((rightWall!.start.x + rightWall!.end.x) / 2 + (rightWall!.start.y + rightWall!.end.y) / 2) / 2;
    void midBefore;
    const wider = rooms.map((r, i) => (i === rooms.length - 1 ? { ...r, w: r.w + 4 } : r));
    const b = buildFloorFromRooms({ id: 'lock', name: 'Lock', rooms: wider }, { openings: 'shared-only', centerFt: locked });
    const leftA = Math.min(...a.roomPolygons[0]!.points.map((p) => p.x));
    const leftB = Math.min(...b.roomPolygons[0]!.points.map((p) => p.x));
    // Left room should not slide when the right room grows under a locked center.
    expect(leftB).toBeCloseTo(leftA, 0);
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
        expect(floor.roomPolygons.length).toBeGreaterThan(2);
        expect(livingAreaSqFt(floor.rooms)).toBeGreaterThan(200);
      }
    }
  });

  it('matches published flyer room sizes for Largo, Islamorada, and St. Thomas', () => {
    const byName = (planId: string, name: string) => {
      const plan = olsenHousePlans.find((p) => p.id === planId)!;
      const found = plan.floors[0]!.rooms.find((r) => r.name === name);
      expect(found).toBeTruthy();
      return found!;
    };
    // Largo flyer
    let r = byName('largo', 'Garage');
    expect(r.w).toBeCloseTo(23 + 4 / 12, 1);
    expect(r.h).toBeCloseTo(30 + 4 / 12, 1);
    r = byName('largo', 'Great Room');
    expect(r.w).toBeCloseTo(22 + 5 / 12, 1);
    expect(r.h).toBeCloseTo(23, 1);
    r = byName('largo', "Owner's Suite");
    expect(r.w).toBeCloseTo(15 + 6 / 12, 1);
    expect(r.h).toBeCloseTo(21 + 4 / 12, 1);
    // Islamorada flyer
    r = byName('islamorada', 'Family Room');
    expect(r.w).toBeCloseTo(19 + 11 / 12, 0);
    expect(r.h).toBeCloseTo(28 + 8 / 12, 0);
    r = byName('islamorada', 'Garage');
    expect(r.w).toBeCloseTo(24, 1);
    expect(r.h).toBeCloseTo(32 + 9 / 12, 1);
    // St. Thomas flyer
    r = byName('st-thomas', 'Great Room');
    expect(r.w).toBeCloseTo(23 + 6 / 12, 1);
    expect(r.h).toBeCloseTo(24 + 4 / 12, 1);
    r = byName('st-thomas', 'Kitchen');
    expect(r.w).toBeCloseTo(18 + 4 / 12, 1);
    expect(r.h).toBeCloseTo(16, 1);
  });

  it('uses two stories for Captiva / Coral Sands / Key Biscayne / St. Croix per flyers', () => {
    for (const id of ['captiva', 'coral-sands', 'key-biscayne', 'st-croix', 'sanibel']) {
      expect(getHousePlan(id)?.stories).toBe(2);
    }
    expect(getHousePlan('st-thomas')?.beds).toBe(4);
    expect(getHousePlan('st-croix')?.livingSqFt).toBe(2781);
  });

  it('matches Sandbridge flyer envelope and C-courtyard topology', () => {
    const plan = getHousePlan('sandbridge')!;
    expect(plan.beds).toBe(4);
    expect(plan.baths).toBe(4);
    expect(plan.livingSqFt).toBe(4874);
    expect(plan.totalUnderRoofSqFt).toBe(6773);
    const rooms = plan.floors[0]!.rooms;
    const names = rooms.map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining(['Den', 'Garage', 'Great Room', 'Lanai', 'Club Room', "Owner's Suite", 'Gallery', 'Breakfast']),
    );
    expect(names.filter((n) => /^Bedroom \d/.test(n) || n === "Owner's Suite")).toHaveLength(4);

    const maxX = Math.max(...rooms.map((r) => r.x + r.w));
    const maxY = Math.max(...rooms.map((r) => r.y + r.h));
    expect(maxX).toBeCloseTo(70, 0);
    expect(maxY).toBeCloseTo(115, 0);

    const garage = rooms.find((r) => r.name === 'Garage')!;
    expect(garage.x).toBeGreaterThan(30); // front-right, not left strip
    expect(garage.w * garage.h).toBeCloseTo(1033, -1);

    const lanai = rooms.find((r) => r.name === 'Lanai')!;
    expect(lanai.pointsFt?.length).toBeGreaterThan(4);
    // Lanai sits in the crook with an angled rear edge
    expect(lanai.w).toBeLessThan(40);
    expect(lanai.x).toBeGreaterThan(10);

    const gallery = rooms.find((r) => r.name === 'Gallery')!;
    expect(gallery.pointsFt).toHaveLength(8);
    const breakfast = rooms.find((r) => r.name === 'Breakfast')!;
    expect(breakfast.pointsFt).toHaveLength(8);

    const built = buildHouse(plan);
    const polys = built.floors[0]!.roomPolygons;
    expect(polys.find((p) => p.name === 'Gallery')!.points.length).toBe(8);
    const diagonalWall = built.floors[0]!.scene.walls.some((w) => {
      const dx = Math.abs(w.end.x - w.start.x);
      const dy = Math.abs(w.end.y - w.start.y);
      return dx > 1 && dy > 1;
    });
    expect(diagonalWall).toBe(true);
  });

  it('preserves non-rectangular room polygons when rebuilding from plan labels', () => {
    const plan = getHousePlan('sandbridge')!;
    const built = buildHouse(plan);
    const labels = built.floors[0]!.roomPolygons;
    const gallery = labels.find((p) => p.name === 'Gallery')!;
    expect(gallery.points.length).toBe(8);
    const rebuilt = rebuildFromPlanRooms(labels, 'sandbridge-1', 2.74);
    const again = rebuilt.roomPolygons.find((p) => p.name === 'Gallery')!;
    expect(again.points.length).toBe(8);
  });

  it('confirms published brochure stats and flyer URLs for every Olsen plan', () => {
    const brochure: Record<string, { living: number; total: number; beds: number; baths: number; stories: 1 | 2 }> = {
      'coral-sands': { living: 3721, total: 5481, beds: 4, baths: 4, stories: 2 },
      islamorada: { living: 2638, total: 3864, beds: 4, baths: 3, stories: 1 },
      largo: { living: 2907, total: 4163, beds: 3, baths: 3, stories: 1 },
      captiva: { living: 2997, total: 4065, beds: 3, baths: 3, stories: 2 },
      'key-biscayne': { living: 3894, total: 5703, beds: 4, baths: 4, stories: 2 },
      sanibel: { living: 2997, total: 3822, beds: 3, baths: 4, stories: 2 },
      'st-croix': { living: 2781, total: 3953, beds: 4, baths: 4, stories: 2 },
      'st-thomas': { living: 2568, total: 3402, beds: 4, baths: 3, stories: 1 },
      'st-johns': { living: 2663, total: 3410, beds: 4, baths: 2.5, stories: 2 },
      ravello: { living: 2622, total: 3471, beds: 4, baths: 3.5, stories: 2 },
      tradewinds: { living: 3110, total: 4739, beds: 3, baths: 3, stories: 1 },
      driftwood: { living: 2947, total: 4211, beds: 3, baths: 3.5, stories: 1 },
      'oyster-bay': { living: 3299, total: 5115, beds: 3, baths: 3.5, stories: 1 },
      sandbridge: { living: 4874, total: 6773, beds: 4, baths: 4, stories: 1 },
      marbella: { living: 2683, total: 3582, beds: 4, baths: 3, stories: 1 },
      verona: { living: 3261, total: 4747, beds: 4, baths: 3.5, stories: 1 },
      'villa-della-dolce-vita': { living: 4176, total: 6670, beds: 4, baths: 4, stories: 2 },
      portofino: { living: 4272, total: 6528, beds: 4, baths: 3.5, stories: 2 },
      tidelands: { living: 3560, total: 5353, beds: 4, baths: 4, stories: 1 },
      capri: { living: 2767, total: 3920, beds: 3, baths: 3.5, stories: 1 },
      granada: { living: 2565, total: 3531, beds: 4, baths: 2.5, stories: 2 },
      santorini: { living: 3505, total: 5220, beds: 4, baths: 4, stories: 1 },
    };
    expect(Object.keys(brochure).sort()).toEqual(olsenHousePlans.map((p) => p.id).sort());
    for (const plan of olsenHousePlans) {
      const expected = brochure[plan.id]!;
      expect(plan.livingSqFt).toBe(expected.living);
      expect(plan.totalUnderRoofSqFt).toBe(expected.total);
      expect(plan.beds).toBe(expected.beds);
      expect(plan.baths).toBe(expected.baths);
      expect(plan.stories).toBe(expected.stories);
      expect(plan.flyerUrl).toMatch(/^https:\/\/olsencustomhomes\.com\/wp-content\/uploads\/.+\.pdf$/);
      expect(buildHouse(plan).floors.length).toBe(expected.stories);
    }
  });

  it('uses polygon footprints for non-rectangular brochure features', () => {
    const isAxisAlignedRect = (pts: { x: number; y: number }[]) => {
      if (pts.length !== 4) return false;
      const xs = new Set(pts.map((p) => Math.round(p.x * 1000)));
      const ys = new Set(pts.map((p) => Math.round(p.y * 1000)));
      return xs.size === 2 && ys.size === 2;
    };

    const oyster = getHousePlan('oyster-bay')!;
    const garage = oyster.floors[0]!.rooms.find((r) => r.name === 'Garage')!;
    expect(garage.pointsFt).toBeTruthy();
    expect(isAxisAlignedRect(garage.pointsFt!)).toBe(false);
    expect(oyster.floors[0]!.rooms.find((r) => r.name === 'Breakfast')!.pointsFt!.length).toBeGreaterThan(4);
    const maxX = Math.max(...oyster.floors[0]!.rooms.map((r) => r.x + r.w));
    const maxY = Math.max(...oyster.floors[0]!.rooms.map((r) => r.y + r.h));
    expect(maxX).toBeCloseTo(89, 0);
    expect(maxY).toBeCloseTo(90, 0);

    const driftwood = getHousePlan('driftwood')!;
    expect(driftwood.floors[0]!.rooms.find((r) => r.name === 'Great Room')!.pointsFt!.length).toBeGreaterThan(4);
    expect(driftwood.floors[0]!.rooms.find((r) => r.name === 'Lanai')!.pointsFt!.length).toBeGreaterThan(4);

    const tidelands = getHousePlan('tidelands')!;
    expect(tidelands.floors[0]!.rooms.find((r) => r.name === 'Lanai')!.pointsFt!.length).toBeGreaterThan(4);

    const santorini = getHousePlan('santorini')!;
    expect(santorini.floors[0]!.rooms.find((r) => r.name === 'Family Room')!.pointsFt).toHaveLength(8);
    expect(santorini.floors[0]!.rooms.find((r) => r.name === 'Dinette')!.pointsFt!.length).toBeGreaterThan(4);

    for (const id of ['oyster-bay', 'driftwood', 'santorini', 'sandbridge']) {
      const built = buildHouse(getHousePlan(id)!);
      const hasDiagonal = built.floors[0]!.scene.walls.some((w) => {
        const dx = Math.abs(w.end.x - w.start.x);
        const dy = Math.abs(w.end.y - w.start.y);
        return dx > 1 && dy > 1;
      });
      expect(hasDiagonal).toBe(true);
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
