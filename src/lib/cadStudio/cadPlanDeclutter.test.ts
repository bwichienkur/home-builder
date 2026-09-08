import { describe, expect, it } from 'vitest';
import { demoCadPlate } from './demoCadPlate';
import { assignOpeningMarks } from './cadMarks';
import { layoutOpeningMarks } from './cadMarkLayout';
import {
  consolidateOpeningHints,
  orientPlanGarageBottom,
  shouldDrawOpeningSegment,
} from './cadOpeningCleanup';
import { openingPlanFrame, showsDoorSwing } from './cadOpeningSymbols';
import { flipPlan } from './cadPlanOps';
import { hitTestOpening } from './editCadPlate';
import type { CadOpeningHintFt, CadPlate } from './types';

function opening(
  partial: Partial<CadOpeningHintFt> & Pick<CadOpeningHintFt, 'x1' | 'y1' | 'x2' | 'y2' | 'kind'>,
): CadOpeningHintFt {
  return { layer: 'DOORS', ...partial };
}

describe('cad plan declutter / doors / orientation', () => {
  it('merges near-duplicate opening fragments into one hint', () => {
    let plate = demoCadPlate();
    plate = {
      ...plate,
      openingHints: [
        opening({ x1: 10, y1: 0, x2: 13, y2: 0, kind: 'window', layer: 'WINDOWS' }),
        opening({ x1: 10.2, y1: 0.05, x2: 12.8, y2: 0.05, kind: 'window', layer: 'WINDOWS' }),
        opening({ x1: 10.1, y1: -0.05, x2: 12.9, y2: -0.02, kind: 'window', layer: 'WINDOWS' }),
      ],
    };
    const next = consolidateOpeningHints(plate);
    expect(next.openingHints.length).toBe(1);
    expect(next.openingHints[0]!.kind).toBe('window');
  });

  it('reclassifies wide doors as garage with no swing', () => {
    let plate = demoCadPlate();
    plate = {
      ...plate,
      openingHints: [opening({ x1: 0, y1: 0, x2: 16, y2: 0, kind: 'door', layer: 'DOORS' })],
    };
    const next = consolidateOpeningHints(plate);
    expect(next.openingHints[0]!.kind).toBe('garage');
    expect(next.openingHints[0]!.swing).toBe('none');
    expect(showsDoorSwing('garage', 'none')).toBe(false);
  });

  it('staggers overlapping marks so labels are not identical', () => {
    const openings = [
      opening({ x1: 0, y1: 0, x2: 3, y2: 0, kind: 'window', mark: 'W1', layer: 'WINDOWS' }),
      opening({ x1: 0.2, y1: 0, x2: 3.2, y2: 0, kind: 'window', mark: 'W2', layer: 'WINDOWS' }),
      opening({ x1: 0.4, y1: 0, x2: 3.4, y2: 0, kind: 'window', mark: 'W3', layer: 'WINDOWS' }),
    ];
    const layouts = layoutOpeningMarks(openings, { fontFt: 1, viewSpanFt: 40 });
    const keys = layouts.map((l) => `${l.labelLocalX.toFixed(2)},${l.labelLocalY.toFixed(2)}`);
    expect(new Set(keys).size).toBeGreaterThan(1);
    expect(layouts.every((l) => l.visible)).toBe(true);
  });

  it('hides marks when zoomed far out', () => {
    const openings = [
      opening({ x1: 0, y1: 0, x2: 3, y2: 0, kind: 'door', mark: 'D1' }),
    ];
    const layouts = layoutOpeningMarks(openings, { fontFt: 1, viewSpanFt: 140 });
    expect(layouts[0]!.visible).toBe(false);
  });

  it('builds Plan7 door leaf tip off the hinge', () => {
    const g = openingPlanFrame({
      x1: 0,
      y1: 0,
      x2: 3,
      y2: 0,
      kind: 'door',
      swing: 'left',
      face: 'out',
    });
    expect(g.hingeX).toBe(0);
    expect(g.leafTipY).not.toBe(0);
    expect(Math.hypot(g.leafTipX - g.hingeX, g.leafTipY - g.hingeY)).toBeCloseTo(g.swingR, 5);
  });

  it('hit-tests along the opening span and swing leaf', () => {
    const plate: CadPlate = {
      ...demoCadPlate(),
      openingHints: [
        opening({
          x1: 0,
          y1: 0,
          x2: 3,
          y2: 0,
          kind: 'door',
          swing: 'left',
          face: 'out',
        }),
      ],
    };
    expect(hitTestOpening(plate, 1.5, 0, 0.6)).toBe(0);
    expect(hitTestOpening(plate, 0, 2.5, 0.8)).toBe(0);
  });

  it('hides long opening-layer segments that outline rooms', () => {
    const openings = [opening({ x1: 0, y1: 0, x2: 3, y2: 0, kind: 'door' })];
    expect(
      shouldDrawOpeningSegment(
        { x1: 0, y1: 0, x2: 40, y2: 0, layer: 'DOORS', role: 'opening' },
        openings,
      ),
    ).toBe(false);
    expect(
      shouldDrawOpeningSegment(
        { x1: 10, y1: 10, x2: 13, y2: 10, layer: 'DOORS', role: 'opening' },
        openings,
      ),
    ).toBe(true);
  });

  it('orients garage toward the bottom of the plan', () => {
    let plate = demoCadPlate();
    let maxWallY = -Infinity;
    let minWallY = Infinity;
    for (const w of plate.wallCenterlines) {
      maxWallY = Math.max(maxWallY, w.y1, w.y2);
      minWallY = Math.min(minWallY, w.y1, w.y2);
    }
    plate = {
      ...plate,
      labels: [
        {
          x: (plate.bounds.minX + plate.bounds.maxX) / 2,
          y: maxWallY - 0.5,
          text: '3-CAR GARAGE',
          layer: 'TEXT',
        },
      ],
    };
    const next = orientPlanGarageBottom(plate);
    const g = next.labels.find((l) => /GARAGE/i.test(l.text))!;
    const mid = (minWallY + maxWallY) / 2;
    // After flip about plate bounds center, garage should sit in the lower half of walls.
    expect(g.y).toBeLessThan(mid + 2);
    expect(orientPlanGarageBottom(next).labels.find((l) => /GARAGE/i.test(l.text))!.y).toBeCloseTo(
      g.y,
      5,
    );
  });

  it('flipPlan y mirrors labels', () => {
    const plate = assignOpeningMarks(demoCadPlate());
    const cy = (plate.bounds.minY + plate.bounds.maxY) / 2;
    const flipped = flipPlan(plate, 'y');
    if (plate.labels[0]) {
      expect(flipped.labels[0]!.y).toBeCloseTo(2 * cy - plate.labels[0].y, 5);
    }
  });
});
