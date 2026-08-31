/**
 * Plan Engine v1 — canonical plan document.
 *
 * Import → NormalizedPlanDocument → buildFromPlanDocument → BuiltHouse.
 * Stable room IDs (name + centroid) survive re-import so RoomConfiguration can attach.
 */
import type { HousePlan, HousePlanFloor, PlanRoomRect, BuiltHouse } from './buildPlan';
import { buildHouse } from './buildPlan';

export type PlanFloorDocument = HousePlanFloor;
export type PlanRoomDocument = PlanRoomRect;

export type PlanDocumentMeta = {
  revision: number;
  sourceFile?: string;
  importedAt?: string;
  engineVersion: 1;
};

/** Canonical plan after import — HousePlan plus engine metadata. */
export type NormalizedPlanDocument = HousePlan & {
  meta?: PlanDocumentMeta;
};

/** Per-room configuration attached by stable room id (survives re-import). */
export type RoomConfiguration = {
  roomId: string;
  floorColor?: string;
  floorCatalogId?: string;
  floorName?: string;
  wallColor?: string;
  ceilingColor?: string;
  wallCatalogId?: string;
  ceilingCatalogId?: string;
};

/** Stable id from room name + centroid (feet). */
export function stableRoomId(name: string, cx: number, cy: number): string {
  const slug = name.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'room';
  return `${slug}-${Math.round(cx * 2)}-${Math.round(cy * 2)}`;
}

export function roomCentroidFt(room: PlanRoomRect): { x: number; y: number } {
  if (room.pointsFt && room.pointsFt.length >= 3) {
    const n = room.pointsFt.length;
    const sx = room.pointsFt.reduce((s, p) => s + p.x, 0);
    const sy = room.pointsFt.reduce((s, p) => s + p.y, 0);
    return { x: sx / n, y: sy / n };
  }
  return { x: room.x + room.w / 2, y: room.y + room.h / 2 };
}

/** Re-stamp room ids to the stable scheme (call after import finalize). */
export function assignStableRoomIds(rooms: PlanRoomRect[]): PlanRoomRect[] {
  const used = new Set<string>();
  return rooms.map((r) => {
    const c = roomCentroidFt(r);
    let id = stableRoomId(r.name, c.x, c.y);
    let n = 2;
    while (used.has(id)) {
      id = `${stableRoomId(r.name, c.x, c.y)}-${n++}`;
    }
    used.add(id);
    return { ...r, id };
  });
}

/**
 * Map finishes from a previous plan onto a re-imported plan by matching
 * stable name+centroid (or fuzzy name within 8 ft).
 */
export function mergeRoomConfigurations(
  previous: PlanRoomRect[],
  next: PlanRoomRect[],
  configs: RoomConfiguration[],
): RoomConfiguration[] {
  const byId = new Map(configs.map((c) => [c.roomId, c]));
  const out: RoomConfiguration[] = [];
  for (const room of next) {
    const c = roomCentroidFt(room);
    let prev =
      previous.find((p) => p.id === room.id) ??
      previous.find((p) => {
        if (p.name.replace(/\s+/g, ' ').trim().toUpperCase() !== room.name.replace(/\s+/g, ' ').trim().toUpperCase()) {
          return false;
        }
        const pc = roomCentroidFt(p);
        return Math.hypot(pc.x - c.x, pc.y - c.y) < 8;
      });
    if (!prev) continue;
    const cfg = byId.get(prev.id);
    if (cfg) out.push({ ...cfg, roomId: room.id });
  }
  return out;
}

export function asPlanDocument(
  plan: HousePlan,
  opts?: { sourceFile?: string; revision?: number },
): NormalizedPlanDocument {
  const floors = plan.floors.map((f) => ({
    ...f,
    rooms: assignStableRoomIds(f.rooms),
  }));
  return {
    ...plan,
    floors,
    meta: {
      revision: opts?.revision ?? 1,
      sourceFile: opts?.sourceFile ?? plan.sourceUrl,
      importedAt: new Date().toISOString(),
      engineVersion: 1,
    },
  };
}

export function planDocumentFloors(doc: NormalizedPlanDocument): PlanFloorDocument[] {
  return doc.floors;
}

export function planDocumentRooms(doc: NormalizedPlanDocument, floorIndex = 0): PlanRoomDocument[] {
  return doc.floors[floorIndex]?.rooms ?? [];
}

/** Single entry point: Plan document → BuiltHouse for the planner. */
export function buildFromPlanDocument(doc: NormalizedPlanDocument): BuiltHouse {
  return buildHouse(doc);
}
