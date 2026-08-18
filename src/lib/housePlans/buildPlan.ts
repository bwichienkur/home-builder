import type { Opening, Point, RoomType, SceneSnapshot, Wall } from '../../types';
import { WORLD_ORIGIN } from '../geometry/placement';
import { PIXELS_PER_METER } from '../geometry/snapping';

export type PlanPointFt = { x: number; y: number };

export type PlanRoomRect = {
  id: string;
  name: string;
  roomType: RoomType;
  /** Feet — plan X grows right, Y grows “down” the page (south). AABB of the room. */
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Optional footprint polygon in plan feet (CCW or CW). When set, walls and
   * room meshes use these vertices instead of the axis-aligned x/y/w/h box.
   * x/y/w/h must still be the polygon’s axis-aligned bounds.
   */
  pointsFt?: PlanPointFt[];
  ceilingFt?: number;
};

/** Footprint vertices in feet (polygon when present, otherwise the AABB). */
export function roomPointsFt(room: PlanRoomRect): PlanPointFt[] {
  if (room.pointsFt && room.pointsFt.length >= 3) return room.pointsFt;
  return [
    { x: room.x, y: room.y },
    { x: room.x + room.w, y: room.y },
    { x: room.x + room.w, y: room.y + room.h },
    { x: room.x, y: room.y + room.h },
  ];
}

/** Shoelace area in square feet. */
export function polygonAreaFt(points: PlanPointFt[]) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export type HousePlanFloor = {
  id: string;
  name: string;
  rooms: PlanRoomRect[];
};

export type HousePlan = {
  id: string;
  name: string;
  stories: 1 | 2;
  beds: number;
  baths: number;
  livingSqFt: number;
  totalUnderRoofSqFt?: number;
  sourceUrl: string;
  /** Direct link to the published Olsen flyer / brochure PDF when known. */
  flyerUrl?: string;
  /** Clarifies these are flyer-derived layouts, not copied Olsen CAD drawings. */
  note: string;
  floors: HousePlanFloor[];
};

export type BuiltFloor = {
  id: string;
  name: string;
  scene: SceneSnapshot;
  rooms: PlanRoomRect[];
  /** Room polygons in plan-pixel space (same as wall coordinates). */
  roomPolygons: { id: string; name: string; roomType: RoomType; points: Point[]; floorColor?: string }[];
};

export type BuiltHouse = {
  planId: string;
  planName: string;
  floors: BuiltFloor[];
  activeFloorId: string;
};

const FT_TO_M = 0.3048;
const EDGE_EPS = 0.08; // feet — snap for shared edges

function ftToPx(ft: number) {
  return ft * FT_TO_M * PIXELS_PER_METER;
}

function roundKey(a: number, b: number) {
  return `${Math.round(a / EDGE_EPS) * EDGE_EPS},${Math.round(b / EDGE_EPS) * EDGE_EPS}`;
}

type Edge = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  rooms: string[];
  exterior: boolean;
};

function normalizeEdge(x1: number, y1: number, x2: number, y2: number): Omit<Edge, 'rooms' | 'exterior'> {
  if (x1 > x2 || (x1 === x2 && y1 > y2)) return { x1: x2, y1: y2, x2: x1, y2: y1 };
  return { x1, y1, x2, y2 };
}

function edgeKey(e: { x1: number; y1: number; x2: number; y2: number }) {
  return `${roundKey(e.x1, e.y1)}|${roundKey(e.x2, e.y2)}`;
}

function collectEdges(rooms: PlanRoomRect[]) {
  const map = new Map<string, Edge>();
  const add = (x1: number, y1: number, x2: number, y2: number, roomId: string) => {
    const n = normalizeEdge(x1, y1, x2, y2);
    if (Math.hypot(n.x2 - n.x1, n.y2 - n.y1) < EDGE_EPS) return;
    const key = edgeKey(n);
    const existing = map.get(key);
    if (existing) {
      existing.rooms.push(roomId);
      existing.exterior = false;
    } else {
      map.set(key, { ...n, rooms: [roomId], exterior: true });
    }
  };
  for (const r of rooms) {
    const pts = roomPointsFt(r);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      add(a.x, a.y, b.x, b.y, r.id);
    }
  }
  return [...map.values()];
}

function roomById(rooms: PlanRoomRect[], id: string) {
  return rooms.find((r) => r.id === id);
}

function wantsWindow(room?: PlanRoomRect) {
  if (!room) return false;
  const t = room.roomType;
  return t === 'Living room' || t === 'Bedroom' || t === 'Dining room' || t === 'Office' || t === 'Kitchen';
}

function wantsDoorBetween(a?: PlanRoomRect, b?: PlanRoomRect) {
  if (!a || !b) return false;
  const outdoor = new Set(['Outdoor']);
  if (outdoor.has(a.roomType) || outdoor.has(b.roomType)) return true;
  if (a.roomType === 'Bathroom' || b.roomType === 'Bathroom') return true;
  if (a.roomType === 'Storage / wardrobe' || b.roomType === 'Storage / wardrobe') return true;
  if (a.roomType === 'Laundry' || b.roomType === 'Laundry') return true;
  if (a.roomType === 'Hallway' || b.roomType === 'Hallway') return true;
  return true;
}

function ceilingMeters(rooms: PlanRoomRect[], fallback = 2.74) {
  const vals = rooms.map((r) => (r.ceilingFt ?? 9) * FT_TO_M);
  return vals.length ? Math.max(...vals) : fallback;
}

export type FloorOpeningsMode = 'catalog' | 'shared-only' | 'none';

export type BuildFloorOptions = {
  /**
   * `catalog` — house-plan defaults (windows + interior doors).
   * `shared-only` — no exterior openings; one mid-edge passage on each shared wall.
   * `none` — walls only.
   */
  openings?: FloorOpeningsMode;
  /**
   * Freeze the plate origin in feet during live edits (e.g. wall drag).
   * When omitted, the rooms' bbox center is used so the plate recenters on WORLD_ORIGIN.
   */
  centerFt?: { cx: number; cy: number };
};

/** Convert a floor of room rectangles (or polygons) into walls + openings centered on WORLD_ORIGIN. */
export function buildFloorFromRooms(floor: HousePlanFloor, opts?: BuildFloorOptions): BuiltFloor {
  const openingsMode: FloorOpeningsMode = opts?.openings ?? 'catalog';
  const rooms = floor.rooms;
  if (!rooms.length) {
    return {
      id: floor.id,
      name: floor.name,
      rooms: [],
      roomPolygons: [],
      scene: { walls: [], openings: [], furniture: [], floorColor: '#c9b18f', wallColor: '#f3f0e9', ceilingColor: '#f4f6f8' },
    };
  }

  const allPts = rooms.flatMap((r) => roomPointsFt(r));
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
  const edges = collectEdges(rooms);
  const walls: Wall[] = [];
  const openings: Opening[] = [];

  edges.forEach((edge, i) => {
    const id = `${floor.id}-w${i}`;
    const wall: Wall = {
      id,
      start: toPoint(edge.x1, edge.y1),
      end: toPoint(edge.x2, edge.y2),
      thickness: edge.exterior ? 0.18 : 0.12,
      height,
      assembly: edge.exterior ? 'exterior' : 'interior',
    };
    walls.push(wall);

    if (openingsMode === 'none') return;

    if (edge.exterior) {
      if (openingsMode !== 'catalog') return;
      const room = roomById(rooms, edge.rooms[0]);
      if (wantsWindow(room)) {
        const len = Math.hypot(edge.x2 - edge.x1, edge.y2 - edge.y1);
        if (len >= 6) {
          openings.push({
            id: `${id}-win`,
            wallId: id,
            type: 'window',
            offset: 0.5,
            width: Math.min(1.5, len * FT_TO_M * 0.35),
            height: 1.2,
            sill: 0.9,
          });
        }
      }
      // Garage / entry exterior openings
      if (room?.roomType === 'Outdoor' && room.name.toLowerCase().includes('entry')) {
        openings.push({
          id: `${id}-door`,
          wallId: id,
          type: 'door',
          offset: 0.5,
          width: 1.0,
          height: 2.1,
          sill: 0,
          swing: 'left',
        });
      }
      if (room?.name.toLowerCase().includes('garage')) {
        const len = Math.hypot(edge.x2 - edge.x1, edge.y2 - edge.y1);
        // Place garage door on the longer exterior edge facing “front” (smaller y).
        if (len >= 16 && Math.abs(edge.y1 - edge.y2) < EDGE_EPS && Math.abs(edge.y1 - room.y) < EDGE_EPS) {
          openings.push({
            id: `${id}-gar`,
            wallId: id,
            type: 'passage',
            offset: 0.5,
            width: Math.min(4.8, len * FT_TO_M * 0.7),
            height: 2.3,
            sill: 0,
          });
        }
      }
    } else if (edge.rooms.length >= 2) {
      const len = Math.hypot(edge.x2 - edge.x1, edge.y2 - edge.y1);
      if (len < 2.5) return;
      if (openingsMode === 'shared-only') {
        openings.push({
          id: `${id}-open`,
          wallId: id,
          type: 'passage',
          offset: 0.5,
          width: Math.min(1.2, len * FT_TO_M * 0.4),
          height: 2.1,
          sill: 0,
          swing: 'none',
        });
        return;
      }
      const a = roomById(rooms, edge.rooms[0]);
      const b = roomById(rooms, edge.rooms[1]);
      if (wantsDoorBetween(a, b)) {
        const passage =
          a?.roomType === 'Living room' ||
          b?.roomType === 'Living room' ||
          a?.roomType === 'Kitchen' ||
          b?.roomType === 'Kitchen' ||
          a?.roomType === 'Dining room' ||
          b?.roomType === 'Dining room' ||
          a?.roomType === 'Hallway' ||
          b?.roomType === 'Hallway';
        openings.push({
          id: `${id}-open`,
          wallId: id,
          type: passage ? 'passage' : 'door',
          offset: 0.5,
          width: passage ? Math.min(1.6, len * FT_TO_M * 0.55) : 0.9,
          height: 2.1,
          sill: 0,
          swing: passage ? 'none' : 'left',
        });
      }
    }
  });

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

export function buildHouse(plan: HousePlan): BuiltHouse {
  const floors = plan.floors.map((f) => buildFloorFromRooms(f));
  return {
    planId: plan.id,
    planName: plan.name,
    floors,
    activeFloorId: floors[0]?.id ?? 'ground',
  };
}

/** Pack a row of rooms left→right at a fixed y / height. */
export function row(
  y: number,
  h: number,
  items: Array<{ name: string; roomType: RoomType; w: number; ceilingFt?: number; id?: string }>,
  startX = 0,
): PlanRoomRect[] {
  let x = startX;
  return items.map((item, i) => {
    const room: PlanRoomRect = {
      id: item.id ?? `${item.name.toLowerCase().replace(/\W+/g, '-')}-${y}-${i}`,
      name: item.name,
      roomType: item.roomType,
      x,
      y,
      w: item.w,
      h,
      ceilingFt: item.ceilingFt,
    };
    x += item.w;
    return room;
  });
}

export function livingAreaSqFt(rooms: PlanRoomRect[]) {
  return rooms
    .filter((r) => r.roomType !== 'Outdoor' && !r.name.toLowerCase().includes('garage') && !r.name.toLowerCase().includes('lanai') && !r.name.toLowerCase().includes('entry') && !r.name.toLowerCase().includes('balcony') && !r.name.toLowerCase().includes('pool'))
    .reduce((sum, r) => sum + (r.pointsFt && r.pointsFt.length >= 3 ? polygonAreaFt(r.pointsFt) : r.w * r.h), 0);
}

/** Axis-aligned size of a plan-room polygon in feet. */
export function planRoomSizeFeet(points: Point[]) {
  const xs = points.map((p) => (p.x - WORLD_ORIGIN.x) / PIXELS_PER_METER / FT_TO_M);
  const ys = points.map((p) => (p.y - WORLD_ORIGIN.y) / PIXELS_PER_METER / FT_TO_M);
  return {
    widthFt: Math.max(0.5, Math.max(...xs) - Math.min(...xs)),
    depthFt: Math.max(0.5, Math.max(...ys) - Math.min(...ys)),
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

const MIN_ROOM_FT = 3;

/** Resize a room polygon in place, keeping its center fixed.
 * Scales about the AABB center so L-shapes and angled rooms keep their outline.
 */
export function resizePlanRoomPoints(points: Point[], widthFt: number, depthFt: number): Point[] {
  if (points.length < 3) return points;
  const size = planRoomSizeFeet(points);
  const cx = (size.minX + size.maxX) / 2;
  const cy = (size.minY + size.maxY) / 2;
  const w = Math.max(MIN_ROOM_FT, widthFt);
  const d = Math.max(MIN_ROOM_FT, depthFt);
  const sx = w / Math.max(0.5, size.widthFt);
  const sy = d / Math.max(0.5, size.depthFt);
  const toPoint = (xFt: number, yFt: number): Point => ({
    x: WORLD_ORIGIN.x + ftToPx(xFt),
    y: WORLD_ORIGIN.y + ftToPx(yFt),
  });
  return points.map((p) => {
    const xFt = (p.x - WORLD_ORIGIN.x) / PIXELS_PER_METER / FT_TO_M;
    const yFt = (p.y - WORLD_ORIGIN.y) / PIXELS_PER_METER / FT_TO_M;
    return toPoint(cx + (xFt - cx) * sx, cy + (yFt - cy) * sy);
  });
}

/** Move one polygon vertex in plan pixels; reject if room collapses below min size. */
export function movePlanRoomVertexPoints(points: Point[], index: number, next: Point): Point[] | null {
  if (points.length < 3 || index < 0 || index >= points.length) return null;
  if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) return null;
  const moved = points.map((p, i) => (i === index ? { x: next.x, y: next.y } : p));
  const size = planRoomSizeFeet(moved);
  if (size.widthFt < MIN_ROOM_FT || size.depthFt < MIN_ROOM_FT) return null;
  return moved;
}

/** Insert a vertex along edge `edgeIndex` → next at `t` (0–1, default midpoint). */
export function insertPlanRoomVertexPoints(points: Point[], edgeIndex: number, t = 0.5): Point[] | null {
  if (points.length < 3) return null;
  const i = ((edgeIndex % points.length) + points.length) % points.length;
  const a = points[i]!;
  const b = points[(i + 1) % points.length]!;
  const tt = Math.max(0.02, Math.min(0.98, Number.isFinite(t) ? t : 0.5));
  const inserted = { x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt };
  const next = [...points];
  next.splice(i + 1, 0, inserted);
  return next;
}

/** Remove a vertex if the room would still have ≥3 corners. */
export function removePlanRoomVertexPoints(points: Point[], index: number): Point[] | null {
  if (points.length <= 3 || index < 0 || index >= points.length) return null;
  const next = points.filter((_, i) => i !== index);
  const size = planRoomSizeFeet(next);
  if (size.widthFt < MIN_ROOM_FT || size.depthFt < MIN_ROOM_FT) return null;
  return next;
}

/** Axis-aligned square/rect room centered on a plan-pixel point. */
export function squareRoomPoints(center: Point, widthFt: number, depthFt: number): Point[] {
  const w = Math.max(3, widthFt);
  const d = Math.max(3, depthFt);
  const cxFt = (center.x - WORLD_ORIGIN.x) / PIXELS_PER_METER / FT_TO_M;
  const cyFt = (center.y - WORLD_ORIGIN.y) / PIXELS_PER_METER / FT_TO_M;
  const toPoint = (xFt: number, yFt: number): Point => ({
    x: WORLD_ORIGIN.x + ftToPx(xFt),
    y: WORLD_ORIGIN.y + ftToPx(yFt),
  });
  return [
    toPoint(cxFt - w / 2, cyFt - d / 2),
    toPoint(cxFt + w / 2, cyFt - d / 2),
    toPoint(cxFt + w / 2, cyFt + d / 2),
    toPoint(cxFt - w / 2, cyFt + d / 2),
  ];
}

export type PlanRoomShape = 'rectangle' | 'wide' | 'l-shape';

/** Default footprint (feet) for common plan room shapes. */
export function roomShapeSizeFt(shape: PlanRoomShape) {
  if (shape === 'wide') return { widthFt: 18, depthFt: 12 };
  if (shape === 'l-shape') return { widthFt: 16, depthFt: 14 };
  return { widthFt: 12, depthFt: 12 };
}

/** Polygon for a common room shape centered on a plan-pixel point. */
export function shapedRoomPoints(shape: PlanRoomShape, center: Point): Point[] {
  const cxFt = (center.x - WORLD_ORIGIN.x) / PIXELS_PER_METER / FT_TO_M;
  const cyFt = (center.y - WORLD_ORIGIN.y) / PIXELS_PER_METER / FT_TO_M;
  const toPoint = (xFt: number, yFt: number): Point => ({
    x: WORLD_ORIGIN.x + ftToPx(xFt),
    y: WORLD_ORIGIN.y + ftToPx(yFt),
  });
  if (shape === 'wide') {
    const w = 18;
    const d = 12;
    return [
      toPoint(cxFt - w / 2, cyFt - d / 2),
      toPoint(cxFt + w / 2, cyFt - d / 2),
      toPoint(cxFt + w / 2, cyFt + d / 2),
      toPoint(cxFt - w / 2, cyFt + d / 2),
    ];
  }
  if (shape === 'l-shape') {
    // 16×14 outer with a 8×8 notch from the SE corner.
    const w = 16;
    const d = 14;
    const cut = 8;
    return [
      toPoint(cxFt - w / 2, cyFt - d / 2),
      toPoint(cxFt + w / 2, cyFt - d / 2),
      toPoint(cxFt + w / 2, cyFt + d / 2 - cut),
      toPoint(cxFt + w / 2 - cut, cyFt + d / 2 - cut),
      toPoint(cxFt + w / 2 - cut, cyFt + d / 2),
      toPoint(cxFt - w / 2, cyFt + d / 2),
    ];
  }
  return squareRoomPoints(center, 12, 12);
}

type Aabb = { minX: number; minY: number; maxX: number; maxY: number };

function pointsAabb(points: Point[]): Aabb {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function overlap1d(a0: number, a1: number, b0: number, b1: number) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

/**
 * True when a proposed room footprint overlaps an existing room's interior
 * (edge-flush neighbors are allowed; nesting / covering is not).
 */
export function proposedRoomOverlaps(
  center: Point,
  shape: PlanRoomShape,
  existing: { points: Point[] }[],
  minOverlapPx = 0.25 * PIXELS_PER_METER,
): boolean {
  const proposed = pointsAabb(shapedRoomPoints(shape, center));
  for (const room of existing) {
    if (room.points.length < 3) continue;
    const other = pointsAabb(room.points);
    const xOverlap = overlap1d(proposed.minX, proposed.maxX, other.minX, other.maxX);
    const yOverlap = overlap1d(proposed.minY, proposed.maxY, other.minY, other.maxY);
    if (xOverlap > minOverlapPx && yOverlap > minOverlapPx) return true;
  }
  return false;
}

/**
 * True when room `id`'s polygon overlaps another room's interior
 * (edge-flush adjacency is allowed).
 */
export function planRoomLabelOverlaps(
  id: string,
  labels: { id: string; points: Point[] }[],
  minOverlapPx = 0.25 * PIXELS_PER_METER,
): boolean {
  const self = labels.find((r) => r.id === id);
  if (!self || self.points.length < 3) return false;
  const proposed = pointsAabb(self.points);
  for (const room of labels) {
    if (room.id === id || room.points.length < 3) continue;
    const other = pointsAabb(room.points);
    const xOverlap = overlap1d(proposed.minX, proposed.maxX, other.minX, other.maxX);
    const yOverlap = overlap1d(proposed.minY, proposed.maxY, other.minY, other.maxY);
    if (xOverlap > minOverlapPx && yOverlap > minOverlapPx) return true;
  }
  return false;
}

/**
 * Nudge a proposed room center so its AABB flushes against a nearby existing room.
 * Used while dragging new rooms at plan level.
 */
export function snapRoomCenterToNeighbors(
  center: Point,
  shape: PlanRoomShape,
  existing: { points: Point[] }[],
  thresholdPx = 0.55 * PIXELS_PER_METER,
): Point {
  if (!existing.length) return center;
  let cx = center.x;
  let cy = center.y;
  const size = roomShapeSizeFt(shape);
  const halfW = ftToPx(size.widthFt) / 2;
  const halfD = ftToPx(size.depthFt) / 2;

  for (let pass = 0; pass < 3; pass++) {
    const proposed: Aabb = { minX: cx - halfW, maxX: cx + halfW, minY: cy - halfD, maxY: cy + halfD };
    let bestDx = 0;
    let bestDy = 0;
    let bestScore = thresholdPx + 1;

    for (const room of existing) {
      if (room.points.length < 3) continue;
      const other = pointsAabb(room.points);
      const xOverlap = overlap1d(proposed.minX, proposed.maxX, other.minX, other.maxX);
      const yOverlap = overlap1d(proposed.minY, proposed.maxY, other.minY, other.maxY);

      if (yOverlap > 0.15 * PIXELS_PER_METER) {
        const gapRight = other.minX - proposed.maxX;
        const gapLeft = proposed.minX - other.maxX;
        if (Math.abs(gapRight) < bestScore) {
          bestScore = Math.abs(gapRight);
          bestDx = gapRight;
          bestDy = 0;
        }
        if (Math.abs(gapLeft) < bestScore) {
          bestScore = Math.abs(gapLeft);
          bestDx = -gapLeft;
          bestDy = 0;
        }
      }
      if (xOverlap > 0.15 * PIXELS_PER_METER) {
        const gapDown = other.minY - proposed.maxY;
        const gapUp = proposed.minY - other.maxY;
        if (Math.abs(gapDown) < bestScore) {
          bestScore = Math.abs(gapDown);
          bestDx = 0;
          bestDy = gapDown;
        }
        if (Math.abs(gapUp) < bestScore) {
          bestScore = Math.abs(gapUp);
          bestDx = 0;
          bestDy = -gapUp;
        }
      }
    }

    if (bestScore > thresholdPx) break;
    cx += bestDx;
    cy += bestDy;
  }

  return { x: cx, y: cy };
}

/**
 * Split an axis-aligned room into two rooms along its longer side
 * (or forced axis). Returns [left/top, right/bottom] polygons.
 */
export function splitPlanRoomPoints(points: Point[], axis?: 'x' | 'y'): [Point[], Point[]] {
  const size = planRoomSizeFeet(points);
  const splitAxis = axis ?? (size.widthFt >= size.depthFt ? 'x' : 'y');
  const toPoint = (xFt: number, yFt: number): Point => ({
    x: WORLD_ORIGIN.x + ftToPx(xFt),
    y: WORLD_ORIGIN.y + ftToPx(yFt),
  });
  if (splitAxis === 'x') {
    const mid = (size.minX + size.maxX) / 2;
    return [
      [toPoint(size.minX, size.minY), toPoint(mid, size.minY), toPoint(mid, size.maxY), toPoint(size.minX, size.maxY)],
      [toPoint(mid, size.minY), toPoint(size.maxX, size.minY), toPoint(size.maxX, size.maxY), toPoint(mid, size.maxY)],
    ];
  }
  const mid = (size.minY + size.maxY) / 2;
  return [
    [toPoint(size.minX, size.minY), toPoint(size.maxX, size.minY), toPoint(size.maxX, mid), toPoint(size.minX, mid)],
    [toPoint(size.minX, mid), toPoint(size.maxX, mid), toPoint(size.maxX, size.maxY), toPoint(size.minX, size.maxY)],
  ];
}

/**
 * Rebuild walls/openings from edited plan-room labels (pixel polygons).
 * Preserves per-room floor colors when ids match.
 * Interactive edits use shared-only openings (no starter windows/doors).
 */
export function rebuildFromPlanRooms(
  labels: { id: string; name: string; roomType: RoomType; points: Point[]; floorColor?: string }[],
  floorId = 'edited',
  ceilingHeightM = 2.74,
  opts?: { centerFt?: { cx: number; cy: number } },
) {
  const rooms: PlanRoomRect[] = labels.map((label) => {
    const pointsFt = label.points.map((p) => ({
      x: (p.x - WORLD_ORIGIN.x) / PIXELS_PER_METER / FT_TO_M,
      y: (p.y - WORLD_ORIGIN.y) / PIXELS_PER_METER / FT_TO_M,
    }));
    const size = planRoomSizeFeet(label.points);
    return {
      id: label.id,
      name: label.name,
      roomType: label.roomType,
      x: size.minX,
      y: size.minY,
      w: size.widthFt,
      h: size.depthFt,
      pointsFt,
      ceilingFt: ceilingHeightM / FT_TO_M,
    };
  });
  const built = buildFloorFromRooms(
    { id: floorId, name: 'Edited floor', rooms },
    { openings: 'shared-only', centerFt: opts?.centerFt },
  );
  built.roomPolygons = built.roomPolygons.map((poly) => ({
    ...poly,
    floorColor: labels.find((l) => l.id === poly.id)?.floorColor,
  }));
  // Keep existing furniture out of the rebuilt empty scene — caller merges.
  return built;
}

/** Axis-aligned plate center in feet from plan-room polygons. */
export function planRoomsCenterFt(labels: { points: Point[] }[]) {
  if (!labels.length) return { cx: 0, cy: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const room of labels) {
    if (room.points.length < 3) continue;
    const size = planRoomSizeFeet(room.points);
    minX = Math.min(minX, size.minX);
    minY = Math.min(minY, size.minY);
    maxX = Math.max(maxX, size.maxX);
    maxY = Math.max(maxY, size.maxY);
  }
  if (!Number.isFinite(minX)) return { cx: 0, cy: 0 };
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export type AttachSide = 'left' | 'right' | 'top' | 'bottom';

/**
 * Room flush to a host on `side`, matching the host width and depth.
 * Plan Y grows south — `top` is toward smaller Y, `bottom` toward larger Y.
 */
export function attachSquareRoomPoints(hostPoints: Point[], side: AttachSide): Point[] {
  const size = planRoomSizeFeet(hostPoints);
  const toPoint = (xFt: number, yFt: number): Point => ({
    x: WORLD_ORIGIN.x + ftToPx(xFt),
    y: WORLD_ORIGIN.y + ftToPx(yFt),
  });
  const w = size.widthFt;
  const h = size.depthFt;
  let x: number;
  let y: number;
  if (side === 'left' || side === 'right') {
    y = size.minY;
    x = side === 'left' ? size.minX - w : size.maxX;
  } else {
    x = size.minX;
    y = side === 'top' ? size.minY - h : size.maxY;
  }
  return [
    toPoint(x, y),
    toPoint(x + w, y),
    toPoint(x + w, y + h),
    toPoint(x, y + h),
  ];
}

/** True when attaching a square on `side` of `hostId` would overlap another room. */
export function attachSideBlocked(
  hostId: string,
  side: AttachSide,
  labels: { id: string; points: Point[] }[],
  minOverlapPx = 0.25 * PIXELS_PER_METER,
): boolean {
  const host = labels.find((r) => r.id === hostId);
  if (!host || host.points.length < 3) return true;
  const proposed = pointsAabb(attachSquareRoomPoints(host.points, side));
  for (const room of labels) {
    if (room.id === hostId || room.points.length < 3) continue;
    const other = pointsAabb(room.points);
    const xOverlap = overlap1d(proposed.minX, proposed.maxX, other.minX, other.maxX);
    const yOverlap = overlap1d(proposed.minY, proposed.maxY, other.minY, other.maxY);
    if (xOverlap > minOverlapPx && yOverlap > minOverlapPx) return true;
  }
  return false;
}

function pointNearWallSegment(
  p: Point,
  a: Point,
  b: Point,
  tol: number,
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const proj = { x: a.x + dx * t, y: a.y + dy * t };
  return Math.hypot(p.x - proj.x, p.y - proj.y) <= tol;
}

/**
 * Move plan-room corners that lie on `wall` by a plan-pixel delta constrained to the
 * wall’s normal (vertical wall → horizontal resize; horizontal wall → depth resize).
 * Returns null when the nudge would shrink a room below the minimum size.
 */
export function nudgePlanRoomsByWall(
  wall: { start: Point; end: Point },
  labels: { id: string; name: string; roomType: RoomType; points: Point[]; floorColor?: string }[],
  deltaPxX: number,
  deltaPxY: number,
  tol = 28,
  minFt = 3,
): typeof labels | null {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const vertical = Math.abs(dx) <= Math.abs(dy);
  const moveX = vertical ? deltaPxX : 0;
  const moveY = vertical ? 0 : deltaPxY;
  if (Math.abs(moveX) < 0.05 && Math.abs(moveY) < 0.05) return labels;

  const next = labels.map((room) => ({
    ...room,
    points: room.points.map((p) =>
      pointNearWallSegment(p, wall.start, wall.end, tol)
        ? { x: p.x + moveX, y: p.y + moveY }
        : p,
    ),
  }));

  for (const room of next) {
    if (room.points.length < 3) return null;
    const size = planRoomSizeFeet(room.points);
    if (size.widthFt < minFt || size.depthFt < minFt) return null;
  }
  return next;
}
