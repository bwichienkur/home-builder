type PickObject = {
  userData?: Record<string, unknown>;
  parent?: PickObject | null;
};

export type ScenePickHit = { object: PickObject };

export function hasUserDataFlag(object: PickObject | null | undefined, key: string) {
  let o: PickObject | null | undefined = object;
  while (o) {
    if (o.userData?.[key]) return true;
    o = o.parent;
  }
  return false;
}

export type ScenePickState = {
  pendingPlacement?: unknown;
  cameraMode?: string;
  planWallTool?: boolean;
  tool?: string;
};

/**
 * R3F events.filter: keep room floors clickable on Plan, and furniture
 * clickable through dollhouse cutaway wall proxies.
 */
export function preferInteriorPicks<T extends ScenePickHit>(hits: T[], state: ScenePickState): T[] {
  if (!hits.length) return hits;
  if (state.pendingPlacement) {
    const plane = hits.filter((h) => hasUserDataFlag(h.object, 'placementPlane'));
    if (plane.length) return plane;
    return hits.filter((h) => !hasUserDataFlag(h.object, 'furniturePick'));
  }
  const wallPriority =
    state.planWallTool || state.tool === 'door' || state.tool === 'window' || state.tool === 'passage';
  if (state.cameraMode === 'top') {
    if (wallPriority) {
      const wallPlan = hits.filter((h) => hasUserDataFlag(h.object, 'wallPlanPick'));
      if (wallPlan.length) return wallPlan;
    } else {
      const furniture = hits.filter((h) => hasUserDataFlag(h.object, 'furniturePick'));
      if (furniture.length) {
        const firstFurniture = hits.findIndex((h) => hasUserDataFlag(h.object, 'furniturePick'));
        const firstCutaway = hits.findIndex((h) => hasUserDataFlag(h.object, 'wallCutawayPick'));
        if (firstCutaway >= 0 && (firstFurniture < 0 || firstCutaway < firstFurniture)) return furniture;
        return hits;
      }
      const rooms = hits.filter((h) => hasUserDataFlag(h.object, 'roomPick'));
      if (rooms.length) return rooms;
    }
  }
  const furniture = hits.filter((h) => hasUserDataFlag(h.object, 'furniturePick'));
  if (!furniture.length) return hits;
  const firstFurniture = hits.findIndex((h) => hasUserDataFlag(h.object, 'furniturePick'));
  const firstCutaway = hits.findIndex((h) => hasUserDataFlag(h.object, 'wallCutawayPick'));
  if (firstCutaway >= 0 && (firstFurniture < 0 || firstCutaway < firstFurniture)) return furniture;
  return hits;
}
