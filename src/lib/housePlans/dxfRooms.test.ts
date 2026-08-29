import { describe, expect, it } from 'vitest';
import {
  centerlinesFromDoubleWalls,
  clusterValues,
  isNearOrtho,
  roomsFromFloodFill,
  scaleSegmentsToFeet,
  segmentsToRoomsAccurate,
} from './dxfRooms';
import { importDxfHousePlan } from './dxfImport';
import { isRoomWallLayer } from './dxfDrawingImport';

describe('dxf room accuracy helpers', () => {
  it('treats nearly-horizontal segments as ortho', () => {
    expect(isNearOrtho({ x1: 0, y1: 0, x2: 10, y2: 0.01 })).toBe(true);
    expect(isNearOrtho({ x1: 0, y1: 0, x2: 10, y2: 5 })).toBe(false);
  });

  it('clusters nearby coordinates', () => {
    const map = clusterValues([0, 0.02, 0.04, 10, 10.05], 0.08);
    expect(map.get(0)).toBeCloseTo(map.get(0.04)!, 2);
    expect(Math.abs((map.get(0) ?? 0) - (map.get(10) ?? 10))).toBeGreaterThan(1);
  });

  it('collapses double-line walls to a centerline', () => {
    const segs = [
      { x1: 0, y1: 0, x2: 12, y2: 0 },
      { x1: 0, y1: 0.5, x2: 12, y2: 0.5 },
      { x1: 0, y1: 0, x2: 0, y2: 10 },
      { x1: 0.5, y1: 0, x2: 0.5, y2: 10 },
    ];
    const centers = centerlinesFromDoubleWalls(segs);
    expect(centers.length).toBeLessThan(segs.length);
    expect(centers.some((s) => Math.abs((s.y1 + s.y2) / 2 - 0.25) < 0.05)).toBe(true);
  });

  it('scales inch drawings to feet', () => {
    const segs = [
      { x1: 0, y1: 0, x2: 288, y2: 0 },
      { x1: 288, y1: 0, x2: 288, y2: 192 },
      { x1: 288, y1: 192, x2: 0, y2: 192 },
      { x1: 0, y1: 192, x2: 0, y2: 0 },
    ];
    const { scale, segments } = scaleSegmentsToFeet(segs, 1);
    expect(scale).toBeCloseTo(1 / 12);
    expect(segments[0]!.x2).toBeCloseTo(24);
  });

  it('flood-fills two enclosed rooms from a simple floor plate', () => {
    // Outer 24x16 with a mid wall at x=12
    const segs = [
      { x1: 0, y1: 0, x2: 24, y2: 0 },
      { x1: 24, y1: 0, x2: 24, y2: 16 },
      { x1: 24, y1: 16, x2: 0, y2: 16 },
      { x1: 0, y1: 16, x2: 0, y2: 0 },
      { x1: 12, y1: 0, x2: 12, y2: 16 },
    ];
    const { rooms } = roomsFromFloodFill(segs, [
      { x: 6, y: 8, text: 'GARAGE' },
      { x: 18, y: 8, text: 'KITCHEN' },
    ]);
    expect(rooms.length).toBeGreaterThanOrEqual(2);
    const names = rooms.map((r) => r.name.toUpperCase());
    expect(names.some((n) => n.includes('GARAGE'))).toBe(true);
    expect(names.some((n) => n.includes('KITCHEN'))).toBe(true);
  });

  it('imports a closed rectangle DXF into at least one room with sane size', () => {
    const dxf = `0
SECTION
2
HEADER
9
$INSUNITS
70
2
0
ENDSEC
0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
WALLS INT
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
WALLS INT
10
12
20
0
11
12
21
16
0
ENDSEC
0
EOF
`;
    const result = importDxfHousePlan(dxf, 'Two bay', {
      labels: [
        { x: 6, y: 8, text: 'Left' },
        { x: 18, y: 8, text: 'Right' },
      ],
    });
    expect(result.plan.floors[0]!.rooms.length).toBeGreaterThanOrEqual(2);
    expect(result.plan.livingSqFt).toBeGreaterThan(100);
    expect(result.plan.livingSqFt).toBeLessThan(600);
  });
});

describe('room wall layer matching', () => {
  it('accepts common wall layer names and rejects doors', () => {
    expect(isRoomWallLayer('WALLS INT')).toBe(true);
    expect(isRoomWallLayer('A-WALL')).toBe(true);
    expect(isRoomWallLayer('DOORS')).toBe(false);
    expect(isRoomWallLayer('doors-window')).toBe(false);
  });
});

describe('end-to-end accuracy pipeline', () => {
  it('segmentsToRoomsAccurate returns multiple rooms for a double-wall box', () => {
    // Double-line outer walls + partition (feet)
    const thick = 0.4;
    const raw = [
      // bottom pair
      { x1: 0, y1: 0, x2: 30, y2: 0 },
      { x1: 0, y1: thick, x2: 30, y2: thick },
      // top pair
      { x1: 0, y1: 20, x2: 30, y2: 20 },
      { x1: 0, y1: 20 - thick, x2: 30, y2: 20 - thick },
      // left pair
      { x1: 0, y1: 0, x2: 0, y2: 20 },
      { x1: thick, y1: 0, x2: thick, y2: 20 },
      // right pair
      { x1: 30, y1: 0, x2: 30, y2: 20 },
      { x1: 30 - thick, y1: 0, x2: 30 - thick, y2: 20 },
      // partition
      { x1: 15, y1: thick, x2: 15, y2: 20 - thick },
      { x1: 15 + thick, y1: thick, x2: 15 + thick, y2: 20 - thick },
    ];
    const { rooms } = segmentsToRoomsAccurate(raw, {
      insUnits: 2,
      labels: [
        { x: 7, y: 10, text: 'BEDROOM' },
        { x: 22, y: 10, text: 'BATH' },
      ],
    });
    expect(rooms.length).toBeGreaterThanOrEqual(2);
  });
});

describe('room name heuristics', () => {
  it('rejects ceiling notes as room names', async () => {
    const { looksLikeRoomName } = await import('./dxfParse');
    expect(looksLikeRoomName('KITCHEN')).toBe(true);
    expect(looksLikeRoomName("10'-0\" CLG.")).toBe(false);
    expect(looksLikeRoomName('3-CAR GARAGE')).toBe(true);
  });
});
