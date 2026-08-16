import { describe, expect, it } from 'vitest';
import {
  buildOpeningSchedule,
  buildPlanDxf,
  describePlanScale,
  openingMetersFromOffset,
  openingOffsetFromMeters,
  planPointToCad,
  SHEET_DPI,
  wallLengthM,
} from './drawFloorPlan';
import type { Opening, PlanRoomLabel, Wall } from '../../types';
import { WORLD_ORIGIN } from '../geometry/placement';
import { PIXELS_PER_METER } from '../geometry/snapping';

const wall: Wall = {
  id: 'w1',
  start: { x: WORLD_ORIGIN.x, y: WORLD_ORIGIN.y },
  end: { x: WORLD_ORIGIN.x + 4 * PIXELS_PER_METER, y: WORLD_ORIGIN.y },
  thickness: 0.15,
  height: 2.7,
};

const wall2: Wall = {
  id: 'w2',
  start: { x: WORLD_ORIGIN.x + 4 * PIXELS_PER_METER, y: WORLD_ORIGIN.y },
  end: { x: WORLD_ORIGIN.x + 4 * PIXELS_PER_METER, y: WORLD_ORIGIN.y + 3 * PIXELS_PER_METER },
  thickness: 0.15,
  height: 2.7,
};

const room: PlanRoomLabel = {
  id: 'r1',
  name: 'Living',
  roomType: 'Living room',
  points: [
    { x: WORLD_ORIGIN.x, y: WORLD_ORIGIN.y },
    { x: WORLD_ORIGIN.x + 4 * PIXELS_PER_METER, y: WORLD_ORIGIN.y },
    { x: WORLD_ORIGIN.x + 4 * PIXELS_PER_METER, y: WORLD_ORIGIN.y + 3 * PIXELS_PER_METER },
    { x: WORLD_ORIGIN.x, y: WORLD_ORIGIN.y + 3 * PIXELS_PER_METER },
  ],
};

const openings: Opening[] = [
  { id: 'o1', wallId: 'w1', type: 'door', offset: 0.4, width: 0.9, height: 2.1, sill: 0 },
  { id: 'o2', wallId: 'w2', type: 'window', offset: 0.5, width: 1.2, height: 1.2, sill: 0.9 },
];

describe('opening offset helpers', () => {
  it('reports wall length in meters', () => {
    expect(wallLengthM(wall)).toBeCloseTo(4, 5);
  });

  it('converts meters to normalized offset along the wall', () => {
    expect(openingOffsetFromMeters(2, wall)).toBeCloseTo(0.5, 5);
    expect(openingOffsetFromMeters(0, wall)).toBeGreaterThanOrEqual(0.03);
    expect(openingOffsetFromMeters(40, wall)).toBeLessThanOrEqual(0.97);
  });

  it('converts offset back to meters', () => {
    expect(openingMetersFromOffset(0.25, wall)).toBeCloseTo(1, 5);
  });
});

describe('scaled sheet helpers', () => {
  it('picks a nearby architectural scale for imperial sheets', () => {
    // 1/4" = 1'-0" → inPerFt = 0.25 → pxPerMeter = 0.25 * dpi / 0.3048
    const px = (0.25 * SHEET_DPI) / 0.3048;
    expect(describePlanScale(px, SHEET_DPI, 'imperial').label).toBe('1/4" = 1\'-0"');
  });

  it('picks a nearby metric ratio', () => {
    // 1:100 → 10 mm paper per world meter → px = 10/25.4 * dpi
    const px = (10 / 25.4) * SHEET_DPI;
    expect(describePlanScale(px, SHEET_DPI, 'metric').label).toBe('1:100');
  });

  it('marks openings in schedule order', () => {
    const rows = buildOpeningSchedule(openings);
    expect(rows.map((r) => r.mark)).toEqual(['D1', 'W1']);
  });
});

describe('CAD DXF export', () => {
  it('writes layers, units, rooms, openings, and walls', () => {
    const dxf = buildPlanDxf({
      name: 'Test',
      walls: [wall, wall2],
      openings,
      planRooms: [room],
      unitSystem: 'imperial',
    });
    expect(dxf).toContain('$INSUNITS');
    expect(dxf).toContain('WALLS');
    expect(dxf).toContain('ROOMS');
    expect(dxf).toContain('OPENINGS');
    expect(dxf).toContain('DIMS');
    expect(dxf).toContain('LWPOLYLINE');
    expect(dxf).toContain('Living');
    expect(dxf).toContain('D1');
    expect(dxf).toContain('W1');
  });

  it('uses millimeters when metric', () => {
    const dxf = buildPlanDxf({
      walls: [wall],
      openings: [],
      planRooms: [room],
      unitSystem: 'metric',
    });
    // $INSUNITS 4 = millimeters
    expect(dxf).toMatch(/\$INSUNITS\n70\n4/);
    const cad = planPointToCad(wall.end, wall.start, 'metric');
    expect(cad.x).toBeCloseTo(4, 5);
    expect(cad.y).toBeCloseTo(0, 5);
  });

  it('converts plan pixels to inches for imperial CAD', () => {
    const cad = planPointToCad(wall.end, wall.start, 'imperial');
    expect(cad.x).toBeCloseTo(4 * 39.37007874, 3);
  });
});
