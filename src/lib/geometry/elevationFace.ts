import type { ElevationFace } from '../../types';

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
