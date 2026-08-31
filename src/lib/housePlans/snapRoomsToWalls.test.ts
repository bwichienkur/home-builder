import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  medianSolidEdgeRegistrationFt,
  snapRoomsToWallSegments,
} from './snapRoomsToWalls';
import { importDxfDrawingPackage } from './dxfDrawingImport';
import { STILLWATER_SOURCE } from './stillwaterFidelityExpectations';
import { poly } from './planFactories';

describe('snapRoomsToWallSegments', () => {
  it('pulls parallel inset edges onto nearby walls', () => {
    const walls = [
      { x1: 0, y1: 0, x2: 20, y2: 0 },
      { x1: 20, y1: 0, x2: 20, y2: 12 },
      { x1: 20, y1: 12, x2: 0, y2: 12 },
      { x1: 0, y1: 12, x2: 0, y2: 0 },
    ];
    // Room inset ~0.6 ft from walls (flood-fill grid artifact).
    const rooms = [
      poly('Great', 'Living room', [
        { x: 0.6, y: 0.6 },
        { x: 19.4, y: 0.6 },
        { x: 19.4, y: 11.4 },
        { x: 0.6, y: 11.4 },
      ]),
    ];
    const before = medianSolidEdgeRegistrationFt(rooms, walls);
    const snapped = snapRoomsToWallSegments(rooms, walls, 1.35);
    const after = medianSolidEdgeRegistrationFt(snapped, walls);
    expect(before).toBeGreaterThan(0.4);
    expect(after).toBeLessThan(0.12);
    expect(snapped[0]!.x).toBeCloseTo(0, 1);
    expect(snapped[0]!.y).toBeCloseTo(0, 1);
  });

  it('leaves soft open-plan edges free when no parallel wall exists', () => {
    const walls = [
      { x1: 0, y1: 0, x2: 30, y2: 0 },
      { x1: 30, y1: 0, x2: 30, y2: 16 },
      { x1: 30, y1: 16, x2: 0, y2: 16 },
      { x1: 0, y1: 16, x2: 0, y2: 0 },
    ];
    // Shared soft edge at x=15 (no wall).
    const kitchen = poly('Kitchen', 'Kitchen', [
      { x: 0.5, y: 0.5 },
      { x: 15, y: 0.5 },
      { x: 15, y: 15.5 },
      { x: 0.5, y: 15.5 },
    ]);
    const snapped = snapRoomsToWallSegments([kitchen], walls, 1.35);
    const softX = snapped[0]!.pointsFt!.filter((p) => Math.abs(p.x - 15) < 0.2);
    expect(softX.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Stillwater CAD registration', () => {
  it('keeps median solid-edge↔wall distance under 0.85 ft after snap', () => {
    const dxfPath = join(process.cwd(), STILLWATER_SOURCE.dxf);
    if (!existsSync(dxfPath)) return;
    const { plan } = importDxfDrawingPackage(readFileSync(dxfPath, 'utf8'), 'MODEL.dwg', 'Stillwater');
    const floor = plan.floors[0]!;
    const walls = [
      ...(floor.wallSegmentsFt ?? []),
      ...(floor.cadPlanVectorsFt ?? [])
        .filter((v) => v.role === 'wall')
        .map((v) => ({ x1: v.x1, y1: v.y1, x2: v.x2, y2: v.y2 })),
    ];
    const median = medianSolidEdgeRegistrationFt(floor.rooms, walls);
    expect(median).toBeLessThan(0.85);
  });
});
