import type { FurnitureItem } from '../types';

export type CollisionPair = [string, string];

type Collidable = Pick<FurnitureItem, 'id' | 'x' | 'y' | 'z' | 'width' | 'depth' | 'height' | 'rotation' | 'placementKind' | 'mountingType'>;

/** Rotation-aware plan AABB. */
export function furniturePlanAabb(item: Pick<FurnitureItem, 'x' | 'z' | 'width' | 'depth' | 'rotation'>) {
  const c = Math.abs(Math.cos(item.rotation ?? 0));
  const s = Math.abs(Math.sin(item.rotation ?? 0));
  const halfW = (item.width * c + item.depth * s) / 2;
  const halfD = (item.width * s + item.depth * c) / 2;
  return {
    minX: item.x - halfW,
    maxX: item.x + halfW,
    minZ: item.z - halfD,
    maxZ: item.z + halfD,
  };
}

function planOverlap(
  a: Pick<FurnitureItem, 'x' | 'z' | 'width' | 'depth' | 'rotation'>,
  b: Pick<FurnitureItem, 'x' | 'z' | 'width' | 'depth' | 'rotation'>,
) {
  const aa = furniturePlanAabb(a);
  const bb = furniturePlanAabb(b);
  return !(aa.maxX < bb.minX || aa.minX > bb.maxX || aa.maxZ < bb.minZ || aa.minZ > bb.maxZ);
}

function verticalOverlap(a: Collidable, b: Collidable) {
  const ay = a.y ?? 0;
  const by = b.y ?? 0;
  return Math.abs(ay - by) < (a.height + b.height) / 2 - 0.02;
}

/** True when two placeable items occupy the same space (stacking / overlap). */
export function furnitureBlocks(a: Collidable, b: Collidable) {
  if (a.id === b.id) return false;
  if (a.placementKind === 'perimeter-trim' || b.placementKind === 'perimeter-trim') return false;
  // Ceiling vs floor never stack into each other.
  const aMount = a.mountingType ?? 'floor';
  const bMount = b.mountingType ?? 'floor';
  if (aMount === 'ceiling' && bMount !== 'ceiling') return false;
  if (bMount === 'ceiling' && aMount !== 'ceiling') return false;
  if (aMount === 'wall' && bMount === 'floor') return false;
  if (bMount === 'wall' && aMount === 'floor') return false;
  return planOverlap(a, b) && verticalOverlap(a, b);
}

export function findCollisions(items: Collidable[]): CollisionPair[] {
  const collisions: CollisionPair[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      if (furnitureBlocks(a, b)) collisions.push([a.id, b.id]);
    }
  }
  return collisions;
}

/** Whether `candidate` would overlap any other placeable item. */
export function wouldOverlapFurniture(
  candidate: Collidable,
  others: Collidable[],
): boolean {
  return others.some((o) => furnitureBlocks(candidate, o));
}

/**
 * Spiral out from `start` until a footprint clears other furniture (and optional
 * extra blockers like door swings). Used so new/cloned ghosts don’t land on top
 * of existing products where they can’t be clicked.
 */
export function findClearPlacementSpot(
  start: { x: number; z: number },
  size: Pick<Collidable, 'width' | 'depth' | 'height'> &
    Partial<Pick<Collidable, 'y' | 'rotation' | 'mountingType'>>,
  others: Collidable[],
  isBlocked?: (x: number, z: number) => boolean,
  opts?: { step?: number; maxRings?: number },
): { x: number; z: number } {
  const step = opts?.step ?? 0.4;
  const maxRings = opts?.maxRings ?? 14;
  const probeAt = (x: number, z: number) => {
    const candidate: Collidable = {
      id: '__clear-spot__',
      x,
      y: size.y ?? 0,
      z,
      width: size.width,
      depth: size.depth,
      height: size.height,
      rotation: size.rotation ?? 0,
      mountingType: size.mountingType,
    };
    if (wouldOverlapFurniture(candidate, others)) return false;
    if (isBlocked?.(x, z)) return false;
    return true;
  };
  if (probeAt(start.x, start.z)) return start;
  for (let ring = 1; ring <= maxRings; ring++) {
    for (let i = -ring; i <= ring; i++) {
      const candidates = [
        { x: start.x + i * step, z: start.z - ring * step },
        { x: start.x + i * step, z: start.z + ring * step },
        { x: start.x - ring * step, z: start.z + i * step },
        { x: start.x + ring * step, z: start.z + i * step },
      ];
      for (const c of candidates) {
        if (probeAt(c.x, c.z)) return c;
      }
    }
  }
  return start;
}

type WorkerResponse = { type: 'collisions'; collisions: CollisionPair[] };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (pairs: CollisionPair[]) => void>();

function getWorker() {
  if (typeof Worker === 'undefined') return null;
  if (!worker) {
    worker = new Worker(new URL('../workers/geometry.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse & { requestId?: number }>) => {
      if (event.data.type !== 'collisions') return;
      const resolve = pending.get(event.data.requestId ?? -1);
      if (resolve) {
        pending.delete(event.data.requestId ?? -1);
        resolve(event.data.collisions);
      }
    };
  }
  return worker;
}

export function collisionsAsync(items: Collidable[]) {
  const w = getWorker();
  if (!w) return Promise.resolve(findCollisions(items));
  const requestId = ++seq;
  return new Promise<CollisionPair[]>((resolve) => {
    pending.set(requestId, resolve);
    w.postMessage({ type: 'collisions', requestId, payload: { items } });
    window.setTimeout(() => {
      if (pending.has(requestId)) {
        pending.delete(requestId);
        resolve(findCollisions(items));
      }
    }, 120);
  });
}
