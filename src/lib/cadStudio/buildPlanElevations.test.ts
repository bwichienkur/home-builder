import { describe, expect, it } from 'vitest';
import { dimLabelChipWidth } from '../../features/cad/cadDimSvg';
import { demoCadPlate } from './demoCadPlate';
import { buildPlanElevation, ensureFourElevations } from './buildPlanElevations';
import { renderCadElevationSvg } from './renderCadElevationSvg';

describe('buildPlanElevations', () => {
  it('builds all four faces from plan walls', () => {
    const plate = demoCadPlate();
    const front = buildPlanElevation(plate, 'front');
    const rear = buildPlanElevation(plate, 'rear');
    const left = buildPlanElevation(plate, 'side');
    const right = buildPlanElevation(plate, 'right');
    expect(front.segments.length).toBeGreaterThan(4);
    expect(rear.segments.length).toBeGreaterThan(4);
    expect(left.segments.length).toBeGreaterThan(4);
    expect(right.segments.length).toBeGreaterThan(4);
    expect(front.face).toBe('front');
    expect(rear.face).toBe('rear');
    expect(right.face).toBe('right');
  });

  it('ensureFourElevations fills missing faces without wiping DXF front', () => {
    const plate = demoCadPlate();
    const frontSegs = plate.elevationFront?.segments.length ?? 0;
    const next = ensureFourElevations({
      ...plate,
      elevationRear: undefined,
      elevationRight: undefined,
    });
    expect(next.elevationFront?.segments.length).toBe(frontSegs);
    expect(next.elevationRear?.segments.length).toBeGreaterThan(0);
    expect(next.elevationRight?.segments.length).toBeGreaterThan(0);
  });

  it('elevation SVG title uses plan-scale font size (not absolute 18)', () => {
    const plate = ensureFourElevations(demoCadPlate());
    const svg = renderCadElevationSvg(plate.elevationFront!, {
      title: 'SHT. 2 FRONT ELEVATION',
    });
    expect(svg).not.toMatch(/font-size="18"/);
    expect(svg).toMatch(/FRONT ELEVATION/);
    // Must not emit a giant absolute-size title that only shows "SH"
    expect(svg).not.toMatch(/font-size="18"/);
  });
});

describe('cadDimSvg stroke scale', () => {
  it('chip width grows with label length', () => {
    expect(dimLabelChipWidth("42'-0\"", 1)).toBeGreaterThan(dimLabelChipWidth("8'-0\"", 1));
  });
});
