import { describe, expect, it } from 'vitest';
import type { Wall } from '../../types';
import { framingFromWalls, topViewHeight } from './planFraming';

const rect: Wall[] = [
  { id: 'w1', start: { x: 180, y: 150 }, end: { x: 660, y: 150 }, thickness: 0.15, height: 2.7 },
  { id: 'w2', start: { x: 660, y: 150 }, end: { x: 660, y: 510 }, thickness: 0.15, height: 2.7 },
  { id: 'w3', start: { x: 660, y: 510 }, end: { x: 180, y: 510 }, thickness: 0.15, height: 2.7 },
  { id: 'w4', start: { x: 180, y: 510 }, end: { x: 180, y: 150 }, thickness: 0.15, height: 2.7 },
];

describe('plan framing', () => {
  it('frames a room high enough to see the whole plate', () => {
    const framing = framingFromWalls(rect);
    expect(framing.span).toBeGreaterThan(4);
    expect(framing.topHeight).toBeGreaterThan(framing.span);
    expect(framing.topPose[1]).toBe(framing.topHeight);
    // Not dead-center above target (avoids lookAt singularity / blank view).
    expect(framing.topPose[2]).not.toBe(framing.center[2]);
  });

  it('scales height with span for large house plans', () => {
    const small = topViewHeight(8);
    const large = topViewHeight(40);
    expect(large).toBeGreaterThan(small * 3);
    expect(large).toBeGreaterThan(70); // beyond the old fog far-plane that blanked plans
  });
});
