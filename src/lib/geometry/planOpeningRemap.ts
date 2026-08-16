import type { Opening, Wall } from '../../types';
import { PIXELS_PER_METER } from './snapping';

function mid(wall: Wall) {
  return { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
}

function len(wall: Wall) {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) || 1;
}

function pointOnWall(wall: Wall, offset: number) {
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * offset,
    y: wall.start.y + (wall.end.y - wall.start.y) * offset,
  };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function offsetAlongWall(wall: Wall, p: { x: number; y: number }) {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = ((p.x - wall.start.x) * dx + (p.y - wall.start.y) * dy) / len2;
  return Math.max(0.03, Math.min(0.97, t));
}

/**
 * Re-attach user openings onto rebuilt walls by nearest edge geometry.
 * Falls back to rebuilt openings when no prior opening matches.
 */
export function remapOpeningsAfterPlanRebuild(
  prevWalls: Wall[],
  nextWalls: Wall[],
  prevOpenings: Opening[],
  rebuiltOpenings: Opening[],
  tolPx = 0.55 * PIXELS_PER_METER,
): Opening[] {
  if (!prevOpenings.length) return rebuiltOpenings;
  if (!nextWalls.length) return [];

  const remapped: Opening[] = [];
  const used = new Set<string>();

  for (const opening of prevOpenings) {
    const oldWall = prevWalls.find((w) => w.id === opening.wallId);
    if (!oldWall) continue;
    const anchor = pointOnWall(oldWall, opening.offset);
    let best: Wall | null = null;
    let bestDist = Infinity;
    for (const wall of nextWalls) {
      const t = offsetAlongWall(wall, anchor);
      const on = pointOnWall(wall, t);
      const d = dist(anchor, on);
      // Also prefer similar orientation / length.
      const orientPenalty =
        Math.abs(Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) -
          Math.atan2(oldWall.end.y - oldWall.start.y, oldWall.end.x - oldWall.start.x)) * 8;
      const score = d + orientPenalty;
      if (score < bestDist) {
        bestDist = score;
        best = wall;
      }
    }
    if (!best || bestDist > tolPx * 2) continue;
    const offset = offsetAlongWall(best, anchor);
    remapped.push({
      ...opening,
      wallId: best.id,
      offset,
    });
    used.add(opening.id);
  }

  // Keep rebuilt shared openings that weren't covering a remapped id.
  for (const o of rebuiltOpenings) {
    if (used.has(o.id)) continue;
    // Skip if we already placed a user opening near the same wall/offset.
    const clash = remapped.some(
      (r) => r.wallId === o.wallId && Math.abs(r.offset - o.offset) < 0.08 && r.type === o.type,
    );
    if (!clash) remapped.push(o);
  }

  return remapped;
}

export function wallMidpoint(wall: Wall) {
  return mid(wall);
}

export function wallLengthPx(wall: Wall) {
  return len(wall);
}
