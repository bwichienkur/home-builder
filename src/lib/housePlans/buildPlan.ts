import type { Opening, Point, RoomType, SceneSnapshot, Wall } from '../../types';
import { WORLD_ORIGIN } from '../geometry/placement';
import { PIXELS_PER_METER } from '../geometry/snapping';

export type PlanRoomRect = {
  id: string;
  name: string;
  roomType: RoomType;
  /** Feet — plan X grows right, Y grows “down” the page (south). */
  x: number;
  y: number;
  w: number;
  h: number;
  ceilingFt?: number;
};

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
  /** Clarifies these are Roomcraft layouts, not copied Olsen drawings. */
  note: string;
  floors: HousePlanFloor[];
};

export type BuiltFloor = {
  id: string;
  name: string;
  scene: SceneSnapshot;
  rooms: PlanRoomRect[];
  /** Room polygons in plan-pixel space (same as wall coordinates). */
  roomPolygons: { id: string; name: string; roomType: RoomType; points: Point[] }[];
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
    add(r.x, r.y, r.x + r.w, r.y, r.id);
    add(r.x + r.w, r.y, r.x + r.w, r.y + r.h, r.id);
    add(r.x + r.w, r.y + r.h, r.x, r.y + r.h, r.id);
    add(r.x, r.y + r.h, r.x, r.y, r.id);
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

/** Convert a floor of room rectangles into walls + openings centered on WORLD_ORIGIN. */
export function buildFloorFromRooms(floor: HousePlanFloor): BuiltFloor {
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

  const minX = Math.min(...rooms.map((r) => r.x));
  const minY = Math.min(...rooms.map((r) => r.y));
  const maxX = Math.max(...rooms.map((r) => r.x + r.w));
  const maxY = Math.max(...rooms.map((r) => r.y + r.h));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const toPoint = (xFt: number, yFt: number): Point => ({
    x: WORLD_ORIGIN.x + ftToPx(xFt - cx),
    y: WORLD_ORIGIN.y + ftToPx(yFt - cy),
  });

  const roomPolygons = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    roomType: r.roomType,
    points: [toPoint(r.x, r.y), toPoint(r.x + r.w, r.y), toPoint(r.x + r.w, r.y + r.h), toPoint(r.x, r.y + r.h)],
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
    };
    walls.push(wall);

    if (edge.exterior) {
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
      const a = roomById(rooms, edge.rooms[0]);
      const b = roomById(rooms, edge.rooms[1]);
      if (wantsDoorBetween(a, b)) {
        const len = Math.hypot(edge.x2 - edge.x1, edge.y2 - edge.y1);
        if (len >= 2.5) {
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
    .reduce((sum, r) => sum + r.w * r.h, 0);
}
