import { describe, expect, it } from 'vitest';
import { flipPlanY, flipPlanLabels, importDxfHousePlan } from './dxfImport';
import { isPlanOverlayLayer, planVectorRole } from './dxfDrawingImport';

describe('plan-first CAD overlay import', () => {
  it('classifies overlay layers including fixtures', () => {
    expect(isPlanOverlayLayer('WALLS INT')).toBe(true);
    expect(isPlanOverlayLayer('DOORS')).toBe(true);
    expect(isPlanOverlayLayer('WINDOWS')).toBe(true);
    expect(isPlanOverlayLayer('FIXTURES')).toBe(true);
    expect(isPlanOverlayLayer('COUNTER')).toBe(true);
    expect(planVectorRole('WALLS EXT')).toBe('wall');
    expect(planVectorRole('DOORS')).toBe('opening');
    expect(planVectorRole('FIXTURES')).toBe('fixture');
    expect(planVectorRole('DIMS')).toBe('other');
  });

  it('flipPlanY mirrors sheet orientation', () => {
    const flipped = flipPlanY([{ x1: 0, y1: 10, x2: 5, y2: 20, layer: 'WALLS INT' }]);
    expect(flipped[0]!.y1).toBe(-10);
    expect(flipped[0]!.y2).toBe(-20);
    expect(flipPlanLabels([{ x: 1, y: 8, text: 'KITCHEN' }])[0]!.y).toBe(-8);
  });

  it('stores cadPlanVectorsFt alongside wallSegmentsFt including fixtures', () => {
    const { plan, warnings } = importDxfHousePlan('unused', 'Overlay test', {
      skipYFlip: true,
      segments: [
        { x1: 0, y1: 0, x2: 240, y2: 0, layer: 'WALLS INT' },
        { x1: 240, y1: 0, x2: 240, y2: 180, layer: 'WALLS INT' },
        { x1: 240, y1: 180, x2: 0, y2: 180, layer: 'WALLS INT' },
        { x1: 0, y1: 180, x2: 0, y2: 0, layer: 'WALLS INT' },
      ],
      openingSegments: [{ x1: 100, y1: 0, x2: 136, y2: 0, layer: 'DOORS' }],
      planVectors: [
        { x1: 0, y1: 0, x2: 240, y2: 0, layer: 'WALLS INT' },
        { x1: 240, y1: 0, x2: 240, y2: 180, layer: 'WALLS INT' },
        { x1: 240, y1: 180, x2: 0, y2: 180, layer: 'WALLS INT' },
        { x1: 0, y1: 180, x2: 0, y2: 0, layer: 'WALLS INT' },
        { x1: 100, y1: 0, x2: 136, y2: 0, layer: 'DOORS' },
        { x1: 40, y1: 40, x2: 55, y2: 40, layer: 'FIXTURES' },
        { x1: 60, y1: 50, x2: 90, y2: 50, layer: 'COUNTER' },
        { x1: 120, y1: 20, x2: 120, y2: 160, layer: 'WALLS INT', linetype: 'DASHED' },
        { x1: 10, y1: 90, x2: 100, y2: 90, layer: 'CEILING' },
      ],
    });
    const floor = plan.floors[0]!;
    expect(floor.wallSegmentsFt?.length).toBeGreaterThan(0);
    expect(floor.cadPlanVectorsFt?.length).toBeGreaterThanOrEqual(4);
    expect(floor.cadPlanVectorsFt?.some((v) => v.role === 'opening')).toBe(true);
    expect(floor.cadPlanVectorsFt?.some((v) => v.role === 'wall')).toBe(true);
    expect(floor.cadPlanVectorsFt?.some((v) => v.role === 'fixture')).toBe(true);
    expect(floor.cadPlanVectorsFt?.some((v) => v.role === 'soft')).toBe(true);
    expect(warnings.some((w) => /plan vector/i.test(w))).toBe(true);
  });
});
