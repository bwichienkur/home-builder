import type { HousePlan, PlanRoomRect } from './buildPlan';
import { roomPointsFt } from './buildPlan';

const ROOM_FILL: Record<string, string> = {
  Bedroom: '#e4d4c0',
  'Living room': '#d5e3cf',
  Kitchen: '#f0dcc4',
  'Dining room': '#ead7b8',
  Bathroom: '#cfe0ea',
  Hallway: '#e6e2d8',
  Laundry: '#ddd4c8',
  Office: '#d9dce6',
  Outdoor: '#c9d9c4',
  'Storage / wardrobe': '#d8cfc4',
  'Children’s room': '#e8d0c8',
};

export type HousePlanThumbRoom = {
  id: string;
  name: string;
  fill: string;
  d: string;
  labelX: number;
  labelY: number;
};

export type HousePlanThumbLayout = {
  viewBox: string;
  width: number;
  height: number;
  rooms: HousePlanThumbRoom[];
};

function roomFill(room: PlanRoomRect) {
  return ROOM_FILL[room.roomType] ?? '#ddd8ce';
}

/** SVG layout for the first (or given) story — same role as a material swatch. */
export function housePlanThumbLayout(plan: HousePlan, floorIndex = 0): HousePlanThumbLayout {
  const rooms = plan.floors[floorIndex]?.rooms ?? plan.floors[0]?.rooms ?? [];
  const pts = rooms.flatMap((r) => roomPointsFt(r));
  if (!pts.length) {
    return { viewBox: '0 0 120 90', width: 120, height: 90, rooms: [] };
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const pad = 1.2;
  const width = Math.max(8, maxX - minX + pad * 2);
  const height = Math.max(8, maxY - minY + pad * 2);
  const mapped = rooms.map((room) => {
    const poly = roomPointsFt(room);
    const d = poly
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x - minX + pad} ${p.y - minY + pad}`)
      .join(' ') + ' Z';
    const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
    return {
      id: room.id,
      name: room.name,
      fill: roomFill(room),
      d,
      labelX: cx - minX + pad,
      labelY: cy - minY + pad,
    };
  });
  return { viewBox: `0 0 ${width} ${height}`, width, height, rooms: mapped };
}

