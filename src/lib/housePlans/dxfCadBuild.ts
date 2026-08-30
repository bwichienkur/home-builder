/**
 * CAD-faithful DXF build: walls from imported segments, room floors as polygons
 * (open edges allowed — walls are not synthesized from room boxes).
 */
import type { Opening, Point, Wall } from '../../types';
import { WORLD_ORIGIN } from '../geometry/placement';
import { PIXELS_PER_METER } from '../geometry/snapping';
import type { BuiltFloor, HousePlanFloor, PlanPointFt, PlanRoomRect } from './buildPlan';
import { polygonAreaFt, roomPointsFt } from './buildPlan';
import type { Seg } from './dxfRooms';

const FT_TO_M = 0.3048;
const EDGE_EPS = 0.15;

export type PlanWallSegmentFt = Seg & { exterior?: boolean };

function ftToPx(ft: number) {
  return ft * FT_TO_M * PIXELS_PER_METER;
}

function segLen(s: { x1: number; y1: number; x2: number; y2: number }) {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
}

function translatePoint(p: PlanPointFt, dx: number, dy: number): PlanPointFt {
  return { x: p.x - dx, y: p.y - dy };
}

export function translateRoomsAndWalls(
  rooms: PlanRoomRect[],
  walls: PlanWallSegmentFt[],
): { rooms: PlanRoomRect[]; walls: PlanWallSegmentFt[]; origin: PlanPointFt } {
  const allX = [
    ...rooms.flatMap((r) => roomPointsFt(r).map((p) => p.x)),
    ...walls.flatMap((s) => [s.x1, s.x2]),
  ];
  const allY = [
    ...rooms.flatMap((r) => roomPointsFt(r).map((p) => p.y)),
    ...walls.flatMap((s) => [s.y1, s.y2]),
  ];
  if (!allX.length) return { rooms, walls, origin: { x: 0, y: 0 } };
  const ox = Math.min(...allX);
  const oy = Math.min(...allY);
  return {
    origin: { x: ox, y: oy },
    rooms: rooms.map((r) => ({
      ...r,
      x: r.x - ox,
      y: r.y - oy,
      pointsFt: r.pointsFt?.map((p) => translatePoint(p, ox, oy)),
    })),
    walls: walls.map((s) => ({
      ...s,
      x1: s.x1 - ox,
      y1: s.y1 - oy,
      x2: s.x2 - ox,
      y2: s.y2 - oy,
    })),
  };
}

function ceilingMeters(rooms: PlanRoomRect[], fallback = 2.74) {
  const vals = rooms.map((r) => (r.ceilingFt ?? 9) * FT_TO_M);
  return vals.length ? Math.max(...vals) : fallback;
}

/** Insert passage openings at small gaps between colinear wall centerlines. */
function openingsFromWallGaps(
  walls: Wall[],
  segments: PlanWallSegmentFt[],
  height: number,
): Opening[] {
  void walls;
  void segments;
  void height;
  // Door/window gaps are already missing segments in CAD centerlines — no synthetic openings.
  return [];
}

/** Build scene walls from CAD centerlines; room polygons are floor-only (no box walls). */
export function buildFloorFromCadWalls(
  floor: HousePlanFloor,
  opts?: { centerFt?: { cx: number; cy: number }; wallSegmentsFt?: PlanWallSegmentFt[] },
): BuiltFloor {
  const rooms = floor.rooms;
  const segments = opts?.wallSegmentsFt ?? floor.wallSegmentsFt ?? [];
  if (!rooms.length && !segments.length) {
    return {
      id: floor.id,
      name: floor.name,
      rooms: [],
      roomPolygons: [],
      scene: { walls: [], openings: [], furniture: [], floorColor: '#c9b18f', wallColor: '#f3f0e9', ceilingColor: '#f4f6f8' },
    };
  }

  const allPts = [
    ...rooms.flatMap((r) => roomPointsFt(r)),
    ...segments.flatMap((s) => [
      { x: s.x1, y: s.y1 },
      { x: s.x2, y: s.y2 },
    ]),
  ];
  const minX = Math.min(...allPts.map((p) => p.x));
  const minY = Math.min(...allPts.map((p) => p.y));
  const maxX = Math.max(...allPts.map((p) => p.x));
  const maxY = Math.max(...allPts.map((p) => p.y));
  const cx = opts?.centerFt?.cx ?? (minX + maxX) / 2;
  const cy = opts?.centerFt?.cy ?? (minY + maxY) / 2;

  const toPoint = (xFt: number, yFt: number): Point => ({
    x: WORLD_ORIGIN.x + ftToPx(xFt - cx),
    y: WORLD_ORIGIN.y + ftToPx(yFt - cy),
  });

  const roomPolygons = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    roomType: r.roomType,
    points: roomPointsFt(r).map((p) => toPoint(p.x, p.y)),
  }));

  const height = ceilingMeters(rooms);
  const walls: Wall[] = segments.map((s, i) => ({
    id: `${floor.id}-cad-${i}`,
    start: toPoint(s.x1, s.y1),
    end: toPoint(s.x2, s.y2),
    thickness: s.exterior ? 0.18 : 0.12,
    height,
    assembly: s.exterior ? 'exterior' : 'interior',
  }));

  const openings = openingsFromWallGaps(walls, segments, height);

  return {
    id: floor.id,
    name: floor.name,
    rooms,
    roomPolygons,
    scene: {
      walls,
      openings,
      furniture: [],
      floorColor: '#c9b18f',
      wallColor: '#f3f0e9',
      ceilingColor: '#f4f6f8',
    },
  };
}
