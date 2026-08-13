/// <reference lib="webworker" />

type Item = { id: string; x: number; y?: number; z: number; width: number; depth: number; height: number };

self.onmessage = (event: MessageEvent) => {
  const { type, payload, requestId } = event.data as { type: string; payload: any; requestId?: number };
  if (type === 'collisions') {
    const items = payload.items as Item[];
    const collisions: string[][] = [];
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
    self.postMessage({ type: 'collisions', requestId, collisions });
  } else if (type === 'extrude') {
    self.postMessage({ type: 'extrude', requestId, walls: payload.walls });
  }
};
