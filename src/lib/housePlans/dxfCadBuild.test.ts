import { describe, expect, it } from 'vitest';
import { buildFloorFromCadWalls, translateRoomsAndWalls } from './dxfCadBuild';
import { poly } from './planFactories';

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
    // Open edge between great room and kitchen at x=20 has no wall spanning full room height.
    const sharedX20 = built.scene.walls.filter((w) => {
      const x1 = (w.start.x + w.end.x) / 2;
      return Math.abs(x1) < 1; // centered — rough check in pixel space
    });
    expect(sharedX20.length).toBeLessThanOrEqual(1);
  });

  it('translateRoomsAndWalls moves both to local origin', () => {
    const { rooms, walls } = translateRoomsAndWalls(
      [poly('Bed', 'Bedroom', [{ x: 100, y: 50 }, { x: 112, y: 50 }, { x: 112, y: 62 }, { x: 100, y: 62 }])],
      [{ x1: 100, y1: 50, x2: 112, y2: 50 }],
    );
    expect(rooms[0]!.x).toBe(0);
    expect(walls[0]!.x1).toBe(0);
  });
});
