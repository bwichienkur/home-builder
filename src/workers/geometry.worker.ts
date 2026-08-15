/// <reference lib="webworker" />

type Item = {
  id: string;
  x: number;
  y?: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotation?: number;
  placementKind?: string;
  mountingType?: string;
};

function planOverlap(a: Item, b: Item) {
  const rotA = a.rotation ?? 0;
  const rotB = b.rotation ?? 0;
  const ca = Math.abs(Math.cos(rotA));
  const sa = Math.abs(Math.sin(rotA));
  const cb = Math.abs(Math.cos(rotB));
  const sb = Math.abs(Math.sin(rotB));
  const halfWa = (a.width * ca + a.depth * sa) / 2;
  const halfDa = (a.width * sa + a.depth * ca) / 2;
  const halfWb = (b.width * cb + b.depth * sb) / 2;
  const halfDb = (b.width * sb + b.depth * cb) / 2;
  return !(a.x + halfWa < b.x - halfWb || a.x - halfWa > b.x + halfWb || a.z + halfDa < b.z - halfDb || a.z - halfDa > b.z + halfDb);
}

function blocks(a: Item, b: Item) {
  if (a.placementKind === 'perimeter-trim' || b.placementKind === 'perimeter-trim') return false;
  const aMount = a.mountingType ?? 'floor';
  const bMount = b.mountingType ?? 'floor';
  if (aMount === 'ceiling' && bMount !== 'ceiling') return false;
  if (bMount === 'ceiling' && aMount !== 'ceiling') return false;
  if (aMount === 'wall' && bMount === 'floor') return false;
  if (bMount === 'wall' && aMount === 'floor') return false;
  const ay = a.y ?? 0;
  const by = b.y ?? 0;
  if (Math.abs(ay - by) >= (a.height + b.height) / 2 - 0.02) return false;
  return planOverlap(a, b);
}

self.onmessage = (event: MessageEvent) => {
  const { type, payload, requestId } = event.data as { type: string; payload: any; requestId?: number };
  if (type === 'collisions') {
    const items = payload.items as Item[];
    const collisions: string[][] = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (blocks(items[i]!, items[j]!)) collisions.push([items[i]!.id, items[j]!.id]);
      }
    }
    self.postMessage({ type: 'collisions', requestId, collisions });
  } else if (type === 'extrude') {
    self.postMessage({ type: 'extrude', requestId, walls: payload.walls });
  }
};
