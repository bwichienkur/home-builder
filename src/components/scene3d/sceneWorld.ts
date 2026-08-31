import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';

/** Plan pixel → world XZ meters. */
export const world = (x: number, y: number): [number, number] => [
  (x - WORLD_ORIGIN.x) / PIXELS_PER_METER,
  (y - WORLD_ORIGIN.y) / PIXELS_PER_METER,
];

export const isCoarsePointer = () =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
