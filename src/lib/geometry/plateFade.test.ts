import { describe, expect, it } from 'vitest';
import { orbitCeilingOpacity, orbitFloorOpacity } from './plateFade';

describe('plate fade', () => {
  it('keeps the ceiling soft from a high orbit and solid when looking up', () => {
    const h = 2.7;
    const high = orbitCeilingOpacity(h * 0.9, h, { mode: 'orbit' });
    const mid = orbitCeilingOpacity(h * 0.45, h, { mode: 'orbit' });
    const low = orbitCeilingOpacity(h * 0.1, h, { mode: 'orbit' });
    expect(high).toBeLessThan(0.35);
    expect(low).toBeGreaterThan(0.85);
    expect(mid).toBeGreaterThan(high);
    expect(mid).toBeLessThan(low);
  });

  it('ramps ceiling and floor continuously under the plate', () => {
    const h = 2.7;
    const samples = Array.from({ length: 13 }, (_, i) => {
      const y = -0.8 + (i / 12) * 2.0; // -0.8 → 1.2
      return {
        y,
        ceiling: orbitCeilingOpacity(y, h, { mode: 'orbit' }),
        floor: orbitFloorOpacity(y, 'orbit'),
      };
    });
    // Floor eases down as we go under; ceiling stays faint under the plate.
    expect(samples[0].floor).toBeLessThan(samples[samples.length - 1].floor);
    expect(samples[0].ceiling).toBeLessThan(0.25);
    expect(samples[samples.length - 1].floor).toBeCloseTo(1, 2);
    // No binary jump between adjacent samples on a dense path.
    for (let i = 1; i < samples.length; i++) {
      expect(Math.abs(samples[i].ceiling - samples[i - 1].ceiling)).toBeLessThan(0.35);
      expect(Math.abs(samples[i].floor - samples[i - 1].floor)).toBeLessThan(0.35);
    }
  });

  it('respects walk and top modes', () => {
    expect(orbitCeilingOpacity(1, 2.7, { mode: 'walk' })).toBe(0.95);
    expect(orbitCeilingOpacity(1, 2.7, { mode: 'top' })).toBe(0);
    expect(orbitCeilingOpacity(1, 2.7, { mode: 'top', selected: true })).toBe(0.55);
    expect(orbitFloorOpacity(-1, 'top')).toBe(1);
  });
});
