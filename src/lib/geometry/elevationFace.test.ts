import { describe, expect, it } from 'vitest';
import { nearestElevationFace, nextElevationFace } from './elevationFace';

describe('elevation face', () => {
  it('maps cardinal azimuths to faces', () => {
    expect(nearestElevationFace(0)).toBe('back');
    expect(nearestElevationFace(Math.PI)).toBe('front');
    expect(nearestElevationFace(Math.PI / 2)).toBe('left');
    expect(nearestElevationFace(-Math.PI / 2)).toBe('right');
  });

  it('snaps in-between angles to the nearest wall', () => {
    expect(nearestElevationFace(0.2)).toBe('back');
    expect(nearestElevationFace(Math.PI - 0.2)).toBe('front');
  });

  it('cycles faces around the house', () => {
    expect(nextElevationFace('front', 1)).toBe('right');
    expect(nextElevationFace('right', 1)).toBe('back');
    expect(nextElevationFace('back', 1)).toBe('left');
    expect(nextElevationFace('left', 1)).toBe('front');
    expect(nextElevationFace('front', -1)).toBe('left');
  });
});
