import type { FurnitureItem, Opening, PlanRoomLabel, Wall } from '../../types';
import { perimeterTrimSegments, type PerimeterTrimEdge } from './ceilingTrim';
import { WORLD_ORIGIN } from './placement';
import { pointInPlanRoom } from './roomWalls';
import { PIXELS_PER_METER } from './snapping';

export function roomCentroidWorld(room: PlanRoomLabel): { x: number; z: number } {
  const pts = room.points;
  if (!pts.length) return { x: 0, z: 0 };
  const x = pts.reduce((s, p) => s + (p.x - WORLD_ORIGIN.x) / PIXELS_PER_METER, 0) / pts.length;
  const z = pts.reduce((s, p) => s + (p.y - WORLD_ORIGIN.y) / PIXELS_PER_METER, 0) / pts.length;
  return { x, z };
}

function furnitureInRoom(item: Pick<FurnitureItem, 'x' | 'z'>, room: PlanRoomLabel) {
  const planX = item.x * PIXELS_PER_METER + WORLD_ORIGIN.x;
  const planY = item.z * PIXELS_PER_METER + WORLD_ORIGIN.y;
  return pointInPlanRoom(planX, planY, room);
}

function ownerRoom(item: Pick<FurnitureItem, 'x' | 'z'>, rooms: PlanRoomLabel[]): PlanRoomLabel | null {
  return rooms.find((r) => furnitureInRoom(item, r)) ?? null;
}

function roomDelta(
  prev: PlanRoomLabel | null,
  nextById: Map<string, PlanRoomLabel>,
  globalDx: number,
  globalDz: number,
): { dx: number; dz: number; dropped: boolean } {
  if (!prev) return { dx: globalDx, dz: globalDz, dropped: false };
  const next = nextById.get(prev.id);
  if (!next) return { dx: 0, dz: 0, dropped: true };
  const a = roomCentroidWorld(prev);
  const b = roomCentroidWorld(next);
  return { dx: b.x - a.x, dz: b.z - a.z, dropped: false };
}

/**
 * After walls/rooms are rebuilt (add/move/resize/delete), furniture must follow the
 * floor recenter and perimeter trim must be regenerated onto the new wall ids.
 */
export function remapFurnitureAfterPlanRebuild(
  prevRooms: PlanRoomLabel[],
  nextRooms: PlanRoomLabel[],
  nextWalls: Wall[],
  furniture: FurnitureItem[],
  openings: Opening[] = [],
): FurnitureItem[] {
  const nextById = new Map(nextRooms.map((r) => [r.id, r]));

  const prevCx =
    prevRooms.length > 0
      ? prevRooms.reduce((s, r) => s + roomCentroidWorld(r).x, 0) / prevRooms.length
      : 0;
  const prevCz =
    prevRooms.length > 0
      ? prevRooms.reduce((s, r) => s + roomCentroidWorld(r).z, 0) / prevRooms.length
      : 0;
  const nextCx =
    nextRooms.length > 0
      ? nextRooms.reduce((s, r) => s + roomCentroidWorld(r).x, 0) / nextRooms.length
      : 0;
  const nextCz =
    nextRooms.length > 0
      ? nextRooms.reduce((s, r) => s + roomCentroidWorld(r).z, 0) / nextRooms.length
      : 0;
  const globalDx = nextCx - prevCx;
  const globalDz = nextCz - prevCz;

  const trim = furniture.filter((f) => f.placementKind === 'perimeter-trim');
  const other = furniture.filter((f) => f.placementKind !== 'perimeter-trim');

  const remappedOther: FurnitureItem[] = [];
  for (const item of other) {
    const prev = ownerRoom(item, prevRooms);
    const { dx, dz, dropped } = roomDelta(prev, nextById, globalDx, globalDz);
    if (dropped) continue;
    remappedOther.push({ ...item, x: item.x + dx, z: item.z + dz });
  }

  const runs = new Map<string, FurnitureItem[]>();
  for (const strip of trim) {
    const key = strip.runId ?? strip.id;
    const list = runs.get(key) ?? [];
    list.push(strip);
    runs.set(key, list);
  }

  const remappedTrim: FurnitureItem[] = [];
  for (const strips of runs.values()) {
    const sample = strips[0]!;
    let owner =
      strips.map((s) => ownerRoom(s, prevRooms)).find((r): r is PlanRoomLabel => !!r) ?? null;
    if (!owner && prevRooms.length === 1) owner = prevRooms[0]!;
    if (!owner) continue;
    const nextRoom = nextById.get(owner.id);
    if (!nextRoom) continue;

    const edge = (sample.trimEdge ??
      (sample.mountingType === 'ceiling' ? 'ceiling' : 'floor')) as PerimeterTrimEdge;
    const segments = perimeterTrimSegments(nextRoom, nextWalls, {
      profileDepth: sample.depth,
      profileHeight: sample.height,
      edge,
      furniture: remappedOther,
      openings,
    });
    const runId = sample.runId ?? crypto.randomUUID();
    for (const seg of segments) {
      remappedTrim.push({
        ...sample,
        id: crypto.randomUUID(),
        x: seg.x,
        y: seg.y,
        z: seg.z,
        rotation: seg.rotation,
        width: seg.width,
        depth: seg.depth,
        height: seg.height,
        wallId: seg.wallId,
        wallOffset: seg.wallOffset,
        runId,
        trimEdge: edge,
        mountingType: edge === 'ceiling' ? 'ceiling' : 'floor',
        placementKind: 'perimeter-trim',
        showClearance: false,
      });
    }
  }

  return [...remappedOther, ...remappedTrim];
}
