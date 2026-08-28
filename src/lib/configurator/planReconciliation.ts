import { roomArea } from '../geometry/rooms';
import type { PlanRoomLabel } from '../../types';
import type { PricingCategory } from './contractTypes';
import type { TakeoffLine, TakeoffSnapshot } from './projectTypes';

export type ReconciliationRow = {
  roomId?: string;
  roomName: string;
  category: PricingCategory | string;
  importedQty?: number;
  geometryQty?: number;
  unit: string;
  delta: number;
  status: 'match' | 'review' | 'missing';
};

const M2_TO_SQFT = (1 / 0.3048) ** 2;

export function reconcileTakeoffWithGeometry(
  takeoff: TakeoffSnapshot | undefined,
  planRooms: PlanRoomLabel[],
): ReconciliationRow[] {
  const rows: ReconciliationRow[] = [];
  const categories: (PricingCategory | string)[] = ['floor-tile', 'countertops-kitchen', 'countertops-bath', 'wall-tile-shower', 'backsplash'];

  for (const room of planRooms) {
    const roomName = room.name || room.roomType || 'Room';
    const floorSqFt = roomArea(room.points) * M2_TO_SQFT;

    for (const category of categories) {
      const imported = takeoff?.lines
        .filter(
          (l) =>
            l.category === category &&
            ((l.room ?? '').toLowerCase().includes(roomName.toLowerCase()) ||
              roomName.toLowerCase().includes((l.room ?? '').toLowerCase()) ||
              l.description.toLowerCase().includes(roomName.toLowerCase())),
        )
        .reduce((sum, l) => sum + l.qty, 0);

      let geometryQty: number | undefined;
      if (category === 'floor-tile') geometryQty = Math.round(floorSqFt * 10) / 10;

      if (imported == null && geometryQty == null) continue;
      const imp = imported ?? 0;
      const geo = geometryQty ?? 0;
      const delta = Math.round((imp - geo) * 10) / 10;
      rows.push({
        roomId: room.id,
        roomName,
        category,
        importedQty: imported,
        geometryQty: geometryQty,
        unit: 'sq ft',
        delta,
        status: Math.abs(delta) <= 5 ? 'match' : imported && geometryQty ? 'review' : 'missing',
      });
    }
  }

  return rows;
}

export function importedLinesSummary(takeoff: TakeoffSnapshot): { sheet: string; count: number }[] {
  const map = new Map<string, number>();
  for (const line of takeoff.lines) map.set(line.sheet, (map.get(line.sheet) ?? 0) + 1);
  return Array.from(map.entries()).map(([sheet, count]) => ({ sheet, count }));
}
