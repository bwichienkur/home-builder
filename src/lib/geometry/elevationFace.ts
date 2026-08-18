import type { ElevationFace, PlanRoomLabel, Wall } from '../../types';
import { WORLD_ORIGIN } from './placement';
import { PIXELS_PER_METER } from './snapping';

const FACE_AZIMUTH: { id: ElevationFace; az: number }[] = [
  { id: 'back', az: 0 },
  { id: 'left', az: Math.PI / 2 },
  { id: 'front', az: Math.PI },
  { id: 'right', az: -Math.PI / 2 },
];

const FACE_ORDER: ElevationFace[] = ['front', 'right', 'back', 'left'];

/** Snap an OrbitControls azimuth (rad) to the nearest house face. */
export function nearestElevationFace(azimuth: number): ElevationFace {
  const twoPi = Math.PI * 2;
  const a = ((azimuth % twoPi) + twoPi) % twoPi;
  let best: ElevationFace = 'front';
  let bestDist = Infinity;
  for (const f of FACE_AZIMUTH) {
    const az = ((f.az % twoPi) + twoPi) % twoPi;
    let d = Math.abs(a - az);
    if (d > Math.PI) d = twoPi - d;
    if (d < bestDist) {
      bestDist = d;
      best = f.id;
    }
  }
  return best;
}

export function nextElevationFace(face: ElevationFace, dir: 1 | -1): ElevationFace {
  const i = FACE_ORDER.indexOf(face);
  return FACE_ORDER[(i + dir + FACE_ORDER.length) % FACE_ORDER.length]!;
}

function wallMidWorld(wall: Wall) {
  const sx = (wall.start.x - WORLD_ORIGIN.x) / PIXELS_PER_METER;
  const sz = (wall.start.y - WORLD_ORIGIN.y) / PIXELS_PER_METER;
  const ex = (wall.end.x - WORLD_ORIGIN.x) / PIXELS_PER_METER;
  const ez = (wall.end.y - WORLD_ORIGIN.y) / PIXELS_PER_METER;
  return {
    x: (sx + ex) / 2,
    z: (sz + ez) / 2,
    sx,
    sz,
    ex,
    ez,
    len: Math.hypot(ex - sx, ez - sz) || 0.01,
  };
}

/** Camera-space basis for an elevation face (XZ). `cam` points toward the camera. */
export function elevationFaceBasis(face: ElevationFace): { camX: number; camZ: number; rightX: number; rightZ: number } {
  switch (face) {
    case 'front':
      return { camX: 0, camZ: -1, rightX: 1, rightZ: 0 };
    case 'back':
      return { camX: 0, camZ: 1, rightX: -1, rightZ: 0 };
    case 'left':
      return { camX: 1, camZ: 0, rightX: 0, rightZ: 1 };
    case 'right':
      return { camX: -1, camZ: 0, rightX: 0, rightZ: -1 };
  }
}

function scoreWallForFace(midX: number, midZ: number, face: ElevationFace): number {
  switch (face) {
    case 'front':
      return -midZ;
    case 'back':
      return midZ;
    case 'left':
      return midX;
    case 'right':
      return -midX;
  }
}

/** The enclosure wall closest to the elevation camera. */
export function pickFacingWall(
  walls: Wall[],
  room: PlanRoomLabel | null | undefined,
  face: ElevationFace,
): Wall | null {
  if (!walls.length) return null;
  let best = walls[0]!;
  let bestScore = -Infinity;
  for (const w of walls) {
    const mid = wallMidWorld(w);
    if (room && room.points.length >= 3) {
      const cx = room.points.reduce((s, p) => s + (p.x - WORLD_ORIGIN.x) / PIXELS_PER_METER, 0) / room.points.length;
      const cz = room.points.reduce((s, p) => s + (p.y - WORLD_ORIGIN.y) / PIXELS_PER_METER, 0) / room.points.length;
      const dx = mid.x - cx;
      const dz = mid.z - cz;
      if (dx * dx + dz * dz < 1e-8) continue;
    }
    const s = scoreWallForFace(mid.x, mid.z, face);
    if (s > bestScore) {
      bestScore = s;
      best = w;
    }
  }
  return best;
}

export function wallWorldFrame(wall: Wall) {
  return wallMidWorld(wall);
}

/** World anchors for Front-view length/height pills — on the exterior, not on the wall body. */
export function elevationDimAnchors(wall: Wall, face: ElevationFace) {
  const frame = wallWorldFrame(wall);
  const b = elevationFaceBasis(face);
  const towardCam = 0.12;
  const pastEnd = 0.08;
  return {
    /** Midpoint of the wall base (floor line). CSS parks the pill below. */
    width: {
      x: frame.x + b.camX * towardCam,
      y: 0,
      z: frame.z + b.camZ * towardCam,
    },
    /** Mid-height on the LEFT end. CSS parks the pill further left. */
    height: {
      x: frame.x - b.rightX * (frame.len / 2 + pastEnd) + b.camX * towardCam,
      y: wall.height / 2,
      z: frame.z - b.rightZ * (frame.len / 2 + pastEnd) + b.camZ * towardCam,
    },
  };
}

/**
 * Ortho zoom so the facing wall plus exterior dim pills fit in the free plate
 * (page-centered, so padScale already reserves the black rail on both sides).
 */
export function elevationOrthoZoom(opts: {
  canvasW: number;
  canvasH: number;
  wallLen: number;
  wallH: number;
  padScale?: number;
}): number {
  const pad = Math.max(opts.padScale ?? 1, 1);
  const sideM = 0.85;
  const belowM = 0.7;
  const aboveM = 0.36;
  const visW = pad * (Math.max(opts.wallLen, 1.5) + sideM * 2);
  const visH = pad * (Math.max(opts.wallH, 1.5) + belowM + aboveM);
  const zoomW = Math.max(1, opts.canvasW) / visW;
  const zoomH = Math.max(1, opts.canvasH) / visH;
  return Math.max(8, Math.min(zoomW, zoomH));
}
