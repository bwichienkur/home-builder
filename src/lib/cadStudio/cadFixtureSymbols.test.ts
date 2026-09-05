import { describe, expect, it } from 'vitest';
import { wallFootprintQuad } from './cadWallFootprint';
import { fixtureKindFromBlockName } from '../housePlans/dxfFixtureGeometry';
import { addFixtureHint } from './editCadPlate';
import { demoCadPlate } from './demoCadPlate';

describe('cad wall footprint + fixture kinds', () => {
  it('builds a thickness quad around a horizontal wall', () => {
    const quad = wallFootprintQuad({
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 0,
      exterior: true,
      thicknessFt: 0.5,
    });
    expect(quad[0]!.y).toBeCloseTo(0.25, 5);
    expect(quad[3]!.y).toBeCloseTo(-0.25, 5);
    expect(quad[1]!.x).toBeCloseTo(10, 5);
  });

  it('classifies mirror / stove / counter block names', () => {
    expect(fixtureKindFromBlockName('MIRROR_24')).toBe('mirror');
    expect(fixtureKindFromBlockName('STOVE')).toBe('appliance');
    expect(fixtureKindFromBlockName('KITCHEN_COUNTER')).toBe('counter');
    expect(fixtureKindFromBlockName('ISLAND_A')).toBe('island');
  });

  it('demo plate includes recognizable fixture kinds', () => {
    const plate = demoCadPlate();
    const kinds = new Set(plate.fixtureHints.map((f) => f.kind));
    expect(kinds.has('toilet')).toBe(true);
    expect(kinds.has('tub')).toBe(true);
    expect(kinds.has('counter')).toBe(true);
    expect(kinds.has('appliance')).toBe(true);
    expect(kinds.has('mirror')).toBe(true);
  });

  it('addFixtureHint places a mirror with thin depth', () => {
    const plate = addFixtureHint(demoCadPlate(), 'mirror', 5, 5);
    const f = plate.fixtureHints[plate.fixtureHints.length - 1]!;
    expect(f.kind).toBe('mirror');
    expect(f.depthFt ?? 1).toBeLessThan(1);
  });
});
