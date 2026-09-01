import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCadPlateFromDxf, extrudeCadPlate } from './index';

describe('stillwater extrude fixtures', () => {
  it('detects Extrude fixtures on Stillwater MODEL.dxf', () => {
    const dxf = readFileSync('plans/source/183-stillwater/MODEL.dxf', 'utf8');
    const plate = buildCadPlateFromDxf(dxf, 'MODEL.dxf');
    const extrusion = extrudeCadPlate(plate);
    const byKind = extrusion.fixtures.reduce<Record<string, number>>((acc, f) => {
      acc[f.kind] = (acc[f.kind] ?? 0) + 1;
      return acc;
    }, {});
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          walls: extrusion.walls.length,
          fixtures: extrusion.fixtures.length,
          hints: plate.fixtureHints.length,
          byKind,
          warnings: plate.warnings,
        },
        null,
        2,
      ),
    );
    expect(extrusion.fixtures.length).toBeGreaterThan(5);
    expect(extrusion.fixtures.some((f) => f.kind === 'counter' || f.kind === 'island')).toBe(true);
  }, 120_000);
});
