import { describe, expect, it } from 'vitest';
import { dimLabelAngleDeg, dimLabelChipWidth } from '../../features/cad/cadDimSvg';

describe('cadDimSvg helpers', () => {
  it('keeps horizontal labels upright', () => {
    expect(dimLabelAngleDeg(10, 0)).toBeCloseTo(0, 5);
    expect(dimLabelAngleDeg(-10, 0)).toBeCloseTo(0, 5);
  });

  it('keeps vertical labels readable (not upside-down)', () => {
    const up = dimLabelAngleDeg(0, 10);
    const down = dimLabelAngleDeg(0, -10);
    expect(Math.abs(up)).toBeLessThanOrEqual(90);
    expect(Math.abs(down)).toBeLessThanOrEqual(90);
  });

  it('sizes chips from label length', () => {
    const short = dimLabelChipWidth("8'-0\"", 1);
    const long = dimLabelChipWidth("42'-6\"", 1);
    expect(long).toBeGreaterThan(short);
    expect(short).toBeGreaterThan(2);
  });
});
