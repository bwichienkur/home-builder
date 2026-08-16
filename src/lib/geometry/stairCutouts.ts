import type { FurnitureItem } from '../../types';

type FloorLike = {
  id: string;
  scene: { furniture?: FurnitureItem[] };
};

/** Stairs whose footprint should cut the given floor plate (run on floor or landing into it). */
export function stairsCuttingFloor(
  floorId: string,
  floors: FloorLike[],
  activeFloorId: string,
  activeFurniture: FurnitureItem[],
): FurnitureItem[] {
  const byId = new Map<string, FurnitureItem>();

  const furnitureOn = (id: string) =>
    id === activeFloorId ? activeFurniture : floors.find((f) => f.id === id)?.scene.furniture ?? [];

  for (const floor of floors) {
    for (const item of furnitureOn(floor.id)) {
      if (item.placementKind !== 'stair' || !item.stair) continue;
      if (item.stair.fromFloorId === floorId || item.stair.toFloorId === floorId) {
        byId.set(item.id, item);
      }
    }
  }

  // Active furniture may not yet be mirrored into floors[].
  for (const item of activeFurniture) {
    if (item.placementKind !== 'stair' || !item.stair) continue;
    if (item.stair.fromFloorId === floorId || item.stair.toFloorId === floorId) {
      byId.set(item.id, item);
    }
  }

  return [...byId.values()];
}
