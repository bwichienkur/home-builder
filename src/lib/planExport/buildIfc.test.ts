import { describe, expect, it } from 'vitest';
import { buildPlanIfc, inspectIfc } from './buildIfc';
import type { Opening, PlanRoomLabel, Wall } from '../../types';
import { WORLD_ORIGIN } from '../geometry/placement';
import { PIXELS_PER_METER } from '../geometry/snapping';

const walls: Wall[] = [
  {
    id: 'w1',
    start: { x: WORLD_ORIGIN.x, y: WORLD_ORIGIN.y },
    end: { x: WORLD_ORIGIN.x + 4 * PIXELS_PER_METER, y: WORLD_ORIGIN.y },
    thickness: 0.18,
    height: 2.7,
    assembly: 'exterior',
  },
];

const openings: Opening[] = [
  { id: 'o1', wallId: 'w1', type: 'door', offset: 0.4, width: 0.9, height: 2.1, sill: 0 },
];

const rooms: PlanRoomLabel[] = [
  {
    id: 'r1',
    name: 'Living',
    roomType: 'Living room',
    points: [
      { x: WORLD_ORIGIN.x, y: WORLD_ORIGIN.y },
      { x: WORLD_ORIGIN.x + 4 * PIXELS_PER_METER, y: WORLD_ORIGIN.y },
      { x: WORLD_ORIGIN.x + 4 * PIXELS_PER_METER, y: WORLD_ORIGIN.y + 3 * PIXELS_PER_METER },
      { x: WORLD_ORIGIN.x, y: WORLD_ORIGIN.y + 3 * PIXELS_PER_METER },
    ],
  },
];

describe('IFC export', () => {
  it('emits walls, openings, and spaces', () => {
    const ifc = buildPlanIfc({ name: 'Demo', walls, openings, planRooms: rooms });
    expect(ifc).toContain('ISO-10303-21');
    expect(ifc).toContain('IFCWALLSTANDARDCASE');
    expect(ifc).toContain('IFCOPENINGELEMENT');
    expect(ifc).toContain('IFCSPACE');
    expect(ifc).toContain('Living');
  });

  it('inspects exported IFC text', () => {
    const ifc = buildPlanIfc({ walls, openings, planRooms: rooms });
    const info = inspectIfc(ifc);
    expect(info.ok).toBe(true);
    expect(info.walls).toBeGreaterThan(0);
    expect(info.spaces?.length).toBeGreaterThan(0);
  });
});
