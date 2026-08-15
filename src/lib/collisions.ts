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
