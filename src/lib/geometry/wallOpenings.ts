import type { Opening, Wall } from '../../types';

/** Solid wall box in wall-local meters (along extended run + height). */
export type WallSolidBox = {
  along0: number;
  along1: number;
  y0: number;
  y1: number;
};

/**
 * Build wall solids as horizontal bands so lintels / sills span the full run
 * and stay continuous with the rest of the wall (not isolated opening caps).
 */
export function wallSolidBoxes(
  wallHeight: number,
  extendedLength: number,
  origLen: number,
  extend: number,
  openings: Opening[],
): WallSolidBox[] {
  const ys = new Set<number>([0, Math.max(wallHeight, 0.1)]);
  for (const o of openings) {
    ys.add(clamp(o.sill, 0, wallHeight));
    ys.add(clamp(o.sill + o.height, 0, wallHeight));
  }
  const levels = [...ys].sort((a, b) => a - b);
  const boxes: WallSolidBox[] = [];
  for (let i = 0; i < levels.length - 1; i++) {
    const y0 = levels[i]!;
    const y1 = levels[i + 1]!;
    if (y1 - y0 < 0.015) continue;
    const holes = openings
      .filter((o) => o.sill < y1 - 0.01 && o.sill + o.height > y0 + 0.01)
      .map((o) => {
        const center = extend + o.offset * origLen;
        return [center - o.width / 2, center + o.width / 2] as [number, number];
      })
      .sort((a, b) => a[0] - b[0]);
    let ranges: [number, number][] = [[0, extendedLength]];
    for (const [a, b] of holes) {
      ranges = ranges.flatMap(([r1, r2]) => {
        if (b <= r1 || a >= r2) return [[r1, r2] as [number, number]];
        return (
          [
            [r1, Math.max(r1, a)],
            [Math.min(r2, b), r2],
          ] as [number, number][]
        ).filter((r) => r[1] - r[0] > 0.015);
      });
    }
    for (const [along0, along1] of ranges) {
      boxes.push({ along0, along1, y0, y1 });
    }
  }
  return boxes;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Project a world XZ point onto a wall run → normalized offset along the original segment. */
export function wallOffsetFromWorldPoint(
  wall: Wall,
  worldX: number,
  worldZ: number,
  worldOrigin: { x: number; y: number },
  pixelsPerMeter: number,
): number {
  const sx = (wall.start.x - worldOrigin.x) / pixelsPerMeter;
  const sz = (wall.start.y - worldOrigin.y) / pixelsPerMeter;
  const ex = (wall.end.x - worldOrigin.x) / pixelsPerMeter;
  const ez = (wall.end.y - worldOrigin.y) / pixelsPerMeter;
  const dx = ex - sx;
  const dz = ez - sz;
  const len2 = dx * dx + dz * dz || 1;
  const t = ((worldX - sx) * dx + (worldZ - sz) * dz) / len2;
  return Math.max(0.03, Math.min(0.97, t));
}

/** World XZ center of an opening — same along-wall basis as `wallSolidBoxes` holes. */
export function openingCenterOnWall(
  wall: Wall,
  offset: number,
  worldOrigin: { x: number; y: number },
  pixelsPerMeter: number,
): { x: number; z: number; length: number; angle: number } {
  const sx = (wall.start.x - worldOrigin.x) / pixelsPerMeter;
  const sz = (wall.start.y - worldOrigin.y) / pixelsPerMeter;
  const ex = (wall.end.x - worldOrigin.x) / pixelsPerMeter;
  const ez = (wall.end.y - worldOrigin.y) / pixelsPerMeter;
  const length = Math.hypot(ex - sx, ez - sz) || 1;
  const t = Math.max(0, Math.min(1, offset));
  return {
    x: sx + (ex - sx) * t,
    z: sz + (ez - sz) * t,
    length,
    angle: -Math.atan2(ez - sz, ex - sx),
  };
}

/** Keep an opening on-wall and clear of neighbors; returns a safe offset. */
export function clampOpeningOffset(candidate: Opening, openings: Opening[], wallLengthM: number): number {
  const half = candidate.width / 2;
  const minT = half / wallLengthM + 0.02;
  const maxT = 1 - half / wallLengthM - 0.02;
  let offset = Math.max(minT, Math.min(maxT, candidate.offset));
  const others = openings.filter((o) => o.wallId === candidate.wallId && o.id !== candidate.id);
  // Nudge away from overlaps (simple iterative push).
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (const o of others) {
      const a0 = offset * wallLengthM - half;
      const a1 = offset * wallLengthM + half;
      const b0 = o.offset * wallLengthM - o.width / 2;
      const b1 = o.offset * wallLengthM + o.width / 2;
      if (a0 >= b1 - 0.02 || b0 >= a1 - 0.02) continue;
      const midA = offset * wallLengthM;
      const midB = o.offset * wallLengthM;
      const gap = half + o.width / 2 + 0.04;
      const target = midB + (midA >= midB ? gap : -gap);
      offset = Math.max(minT, Math.min(maxT, target / wallLengthM));
      moved = true;
    }
    if (!moved) break;
  }
  return offset;
}
