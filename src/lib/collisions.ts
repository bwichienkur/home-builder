import type { FurnitureItem } from '../types';

export type CollisionPair = [string, string];

export function findCollisions(items: Pick<FurnitureItem, 'id' | 'x' | 'y' | 'z' | 'width' | 'depth' | 'height'>[]): CollisionPair[] {
  const collisions: CollisionPair[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (
        Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
        Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 &&
        Math.abs((a.y ?? 0) - (b.y ?? 0)) < (a.height + b.height) / 2
      ) {
        collisions.push([a.id, b.id]);
      }
    }
  }
  return collisions;
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

export function collisionsAsync(items: Pick<FurnitureItem, 'id' | 'x' | 'y' | 'z' | 'width' | 'depth' | 'height'>[]) {
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
