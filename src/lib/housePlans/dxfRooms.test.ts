import { describe, expect, it } from 'vitest';
import {
  centerlinesFromDoubleWalls,
  clusterValues,
  isNearOrtho,
  roomsFromFloodFill,
  roomsFromOutdoorLabels,
  scaleSegmentsToFeet,
  segmentsToRoomsAccurate,
} from './dxfRooms';
import { importDxfHousePlan, finalizeImportedRooms } from './dxfImport';
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

  it('splits open-plan regions into labeled fills that cover the envelope', () => {
    const segs = [
      { x1: 0, y1: 0, x2: 40, y2: 0 },
      { x1: 40, y1: 0, x2: 40, y2: 24 },
      { x1: 40, y1: 24, x2: 0, y2: 24 },
      { x1: 0, y1: 24, x2: 0, y2: 0 },
    ];
    const { rooms } = roomsFromFloodFill(segs, [
      { x: 10, y: 12, text: 'KITCHEN' },
      { x: 30, y: 12, text: 'GREAT ROOM' },
    ]);
    expect(rooms.length).toBeGreaterThanOrEqual(2);
    const names = rooms.map((r) => r.name.toUpperCase());
    expect(names.some((n) => n.includes('KITCHEN'))).toBe(true);
    expect(names.some((n) => n.includes('GREAT'))).toBe(true);
    const great = rooms.find((r) => /GREAT/i.test(r.name));
    const kitchen = rooms.find((r) => /KITCHEN/i.test(r.name));
    // Cell-nearest fills should claim a real share of the ~960 sq ft plate — not tiny label boxes.
    expect((great?.w ?? 0) * (great?.h ?? 0)).toBeGreaterThan(150);
    expect((kitchen?.w ?? 0) * (kitchen?.h ?? 0)).toBeGreaterThan(150);
  });

  it('uses soft/dashed wall partitions to separate open-plan rooms', () => {
    const walls = [
      { x1: 0, y1: 0, x2: 40, y2: 0 },
      { x1: 40, y1: 0, x2: 40, y2: 24 },
      { x1: 40, y1: 24, x2: 0, y2: 24 },
      { x1: 0, y1: 24, x2: 0, y2: 0 },
    ];
    const soft = [{ x1: 20, y1: 1, x2: 20, y2: 23, linetype: 'DASHED', layer: 'WALLS INT' }];
    const { rooms, warnings } = roomsFromFloodFill(
      walls,
      [
        { x: 10, y: 12, text: 'KITCHEN' },
        { x: 30, y: 12, text: 'GREAT ROOM' },
      ],
      { softPartitions: soft },
    );
    expect(warnings.some((w) => /soft space-boundary/i.test(w))).toBe(true);
    expect(rooms.length).toBeGreaterThanOrEqual(2);
  });

  it('fills residual interior so open plates are not left blank', () => {
    const segs = [
      { x1: 0, y1: 0, x2: 40, y2: 0 },
      { x1: 40, y1: 0, x2: 40, y2: 24 },
      { x1: 40, y1: 24, x2: 0, y2: 24 },
      { x1: 0, y1: 24, x2: 0, y2: 0 },
    ];
    // Only label one side — residual fill should claim the rest.
    const { rooms } = roomsFromFloodFill(segs, [{ x: 10, y: 12, text: 'KITCHEN' }]);
    const covered = rooms.reduce((s, r) => s + r.w * r.h, 0);
    // ~960 sq ft plate — expect most of it filled after residual pass.
    expect(covered).toBeGreaterThan(500);
  });

  it('creates outdoor lanai from labels outside the sealed envelope', () => {
    const outdoor = roomsFromOutdoorLabels(
      [{ x: 50, y: -5, text: 'LANAI' }],
      [],
      { minX: 0, minY: -10, maxX: 80, maxY: 40 },
    );
    expect(outdoor.length).toBe(1);
    expect(outdoor[0]!.roomType).toBe('Outdoor');
    expect(/LANAI/i.test(outdoor[0]!.name)).toBe(true);
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

describe('imported room finalize', () => {
  it('translates to origin and snaps shared edges', () => {
    const rooms = finalizeImportedRooms([
      { id: 'a', name: 'Kitchen', roomType: 'Kitchen', x: 0, y: 0, w: 10, h: 12, ceilingFt: 9 },
      { id: 'b', name: 'Pantry', roomType: 'Kitchen', x: 10.4, y: 0.3, w: 8, h: 12, ceilingFt: 9 },
    ]);
    expect(rooms[0]!.x).toBe(0);
    expect(rooms[1]!.x).toBeCloseTo(rooms[0]!.w, 0);
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
    expect(looksLikeRoomName('GREAT ROOM')).toBe(true);
    expect(looksLikeRoomName('seat')).toBe(false);
    expect(looksLikeRoomName('ACCESS')).toBe(false);
    expect(looksLikeRoomName('TECH. CAB.')).toBe(false);
  });

  it('decodes underlined MTEXT room names', async () => {
    const { parseDxfEntitiesToSegments } = await import('./dxfParse');
    const dxf = `0
SECTION
2
ENTITIES
0
MTEXT
8
TEXT ROOM
10
10
20
10
1
{\\fSansSerif|b0|i0|c2|p2;\\H1.333x;\\LKITCHEN}
0
ENDSEC
0
EOF
`;
    const { labels } = parseDxfEntitiesToSegments(dxf);
    expect(labels.some((l) => /KITCHEN/i.test(l.text))).toBe(true);
    expect(labels[0]!.text).toMatch(/^KITCHEN$/i);
  });
});
