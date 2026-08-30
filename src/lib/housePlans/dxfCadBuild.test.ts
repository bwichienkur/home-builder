import { describe, expect, it } from 'vitest';
import {
  buildFloorFromCadWalls,
  openingsFromCadHints,
  translateRoomsAndWalls,
} from './dxfCadBuild';
import { rebuildFromPlanRooms } from './buildPlan';
import { poly } from './planFactories';
import { isOpeningLayer, openingKindFromLayer } from './dxfDrawingImport';
import { WORLD_ORIGIN } from '../geometry/placement';
import { PIXELS_PER_METER } from '../geometry/snapping';

const FT_TO_M = 0.3048;

describe('CAD-faithful DXF build', () => {
  it('builds walls from centerlines, not room box edges', () => {
    const rooms = [
      poly(
        'Great Room',
        'Living room',
        [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 15 },
          { x: 0, y: 15 },
        ],
        9,
      ),
      poly(
        'Kitchen',
        'Kitchen',
        [
          { x: 20, y: 0 },
          { x: 32, y: 0 },
          { x: 32, y: 12 },
          { x: 20, y: 12 },
        ],
        9,
      ),
    ];
    const wallSegmentsFt = [
      { x1: 0, y1: 0, x2: 32, y2: 0, exterior: true },
      { x1: 32, y1: 0, x2: 32, y2: 15, exterior: true },
      { x1: 0, y1: 15, x2: 20, y2: 15 },
      { x1: 20, y1: 0, x2: 20, y2: 12 },
    ];
    const built = buildFloorFromCadWalls(
      { id: 'f1', name: 'First', rooms, wallSegmentsFt },
      { wallSegmentsFt },
    );
    expect(built.scene.walls.length).toBe(4);
    expect(built.roomPolygons.length).toBe(2);
    const sharedX20 = built.scene.walls.filter((w) => {
      const x1 = (w.start.x + w.end.x) / 2;
      return Math.abs(x1) < 1;
    });
    expect(sharedX20.length).toBeLessThanOrEqual(1);
  });

  it('translateRoomsAndWalls moves rooms, walls, and openings to local origin', () => {
    const { rooms, walls, openings } = translateRoomsAndWalls(
      [poly('Bed', 'Bedroom', [{ x: 100, y: 50 }, { x: 112, y: 50 }, { x: 112, y: 62 }, { x: 100, y: 62 }])],
      [{ x1: 100, y1: 50, x2: 112, y2: 50 }],
      [{ x1: 104, y1: 50, x2: 107, y2: 50, kind: 'door' }],
    );
    expect(rooms[0]!.x).toBe(0);
    expect(walls[0]!.x1).toBe(0);
    expect(openings[0]!.x1).toBe(4);
  });

  it('creates door openings from DXF opening hints on nearest wall', () => {
    const wallSegmentsFt = [
      { x1: 0, y1: 0, x2: 20, y2: 0, exterior: true },
      { x1: 0, y1: 0, x2: 0, y2: 12 },
    ];
    const rooms = [
      poly('Hall', 'Hallway', [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 12 },
        { x: 0, y: 12 },
      ]),
    ];
    const built = buildFloorFromCadWalls(
      {
        id: 'f1',
        name: 'First',
        rooms,
        wallSegmentsFt,
        openingHintsFt: [{ x1: 8, y1: 0.2, x2: 11, y2: 0.2, kind: 'door', layer: 'DOORS' }],
      },
      { wallSegmentsFt },
    );
    expect(built.scene.openings.length).toBeGreaterThanOrEqual(1);
    expect(built.scene.openings.some((o) => o.type === 'door')).toBe(true);
    expect(built.scene.openings[0]!.wallId).toBe(built.scene.walls[0]!.id);
  });

  it('creates openings from colinear wall gaps', () => {
    const walls = [
      {
        id: 'w0',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        thickness: 0.12,
        height: 2.74,
      },
      {
        id: 'w1',
        start: { x: 130, y: 0 },
        end: { x: 220, y: 0 },
        thickness: 0.12,
        height: 2.74,
      },
    ];
    // Gap of 3 ft between x=10 and x=13 on same horizontal line.
    const segments = [
      { x1: 0, y1: 0, x2: 10, y2: 0 },
      { x1: 13, y1: 0, x2: 22, y2: 0 },
    ];
    const openings = openingsFromCadHints(walls, segments, [], 2.74);
    expect(openings.some((o) => o.type === 'door')).toBe(true);
  });

  it('rebuildFromPlanRooms keeps CAD wall count when wallSegmentsFt provided', () => {
    const wallSegmentsFt = [
      { x1: 0, y1: 0, x2: 30, y2: 0, exterior: true },
      { x1: 30, y1: 0, x2: 30, y2: 20, exterior: true },
      { x1: 0, y1: 20, x2: 30, y2: 20, exterior: true },
      { x1: 0, y1: 0, x2: 0, y2: 20, exterior: true },
      { x1: 15, y1: 0, x2: 15, y2: 12 },
    ];
    const cadCenter = { cx: 15, cy: 10 };
    const toPx = (xFt: number, yFt: number) => ({
      x: WORLD_ORIGIN.x + ((xFt - cadCenter.cx) * FT_TO_M * PIXELS_PER_METER),
      y: WORLD_ORIGIN.y + ((yFt - cadCenter.cy) * FT_TO_M * PIXELS_PER_METER),
    });
    const labels = [
      {
        id: 'r1',
        name: 'Living',
        roomType: 'Living room' as const,
        points: [toPx(0, 0), toPx(15, 0), toPx(15, 20), toPx(0, 20)],
      },
      {
        id: 'r2',
        name: 'Kitchen',
        roomType: 'Kitchen' as const,
        points: [toPx(15, 0), toPx(30, 0), toPx(30, 12), toPx(15, 12)],
      },
    ];
    const rebuilt = rebuildFromPlanRooms(labels, 'f1', 2.74, {
      wallSegmentsFt,
      cadBuildCenterFt: cadCenter,
    });
    expect(rebuilt.scene.walls.length).toBe(5);
    expect(rebuilt.scene.walls.every((w) => w.id.includes('-cad-'))).toBe(true);
    expect(rebuilt.roomPolygons.length).toBe(2);
  });
});

describe('opening layer helpers', () => {
  it('classifies door/window layers', () => {
    expect(isOpeningLayer('DOORS')).toBe(true);
    expect(isOpeningLayer('WINDOWS')).toBe(true);
    expect(isOpeningLayer('A-GLAZ')).toBe(true);
    expect(isOpeningLayer('WALLS INT')).toBe(false);
    expect(openingKindFromLayer('WINDOWS')).toBe('window');
    expect(openingKindFromLayer('DOORS')).toBe('door');
  });
});
