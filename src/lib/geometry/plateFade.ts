import type { CameraMode } from '../../types';
import { cutawayEase } from './wallCutaway';

function clamp01(t: number) {
  return Math.min(1, Math.max(0, t));
}

/**
 * Continuous ceiling opacity for dollhouse orbit — no boolean pop when the
 * camera crosses mid-height or dips under the floor.
 */
export function orbitCeilingOpacity(
  cameraY: number,
  ceilingHeight: number,
  opts: { mode: CameraMode; selected?: boolean },
) {
  if (opts.mode === 'walk') return 0.95;
  if (opts.mode === 'top') return opts.selected ? 0.55 : 0;

  const soft = opts.selected ? 0.55 : 0.22;
  const solid = 0.94;
  const under = 0.12;

  // High camera (looking into the room) → soft; low camera (looking up) → solid.
  const high = ceilingHeight * 0.72;
  const low = ceilingHeight * 0.18;
  const lookUp = cutawayEase(1 - clamp01((cameraY - low) / Math.max(0.2, high - low)));
  let opacity = soft + (solid - soft) * lookUp;

  // Ease toward a faint underside reading as the camera dips below the plate.
  const underStart = 0.3;
  const underEnd = -0.55;
  const underT = cutawayEase(1 - clamp01((cameraY - underEnd) / Math.max(0.2, underStart - underEnd)));
  opacity = opacity * (1 - underT) + under * underT;
  return opacity;
}

/** Floor softens when the camera orbits under the plate. */
export function orbitFloorOpacity(cameraY: number, mode: CameraMode) {
  if (mode !== 'orbit') return 1;
  const underStart = 0.25;
  const underEnd = -0.5;
  const underT = cutawayEase(1 - clamp01((cameraY - underEnd) / Math.max(0.2, underStart - underEnd)));
  return 1 + (0.28 - 1) * underT;
}
