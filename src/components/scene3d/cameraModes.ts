import type { CameraMode } from '../../types';

/** Eye-height orbit (legacy `walk` + renamed `eyeOrbit`). */
export function isEyeOrbit(mode: CameraMode) {
  return mode === 'walk' || mode === 'eyeOrbit';
}

export function isFirstPerson(mode: CameraMode) {
  return mode === 'firstPerson';
}

export function isWalkLike(mode: CameraMode) {
  return isEyeOrbit(mode) || isFirstPerson(mode);
}
