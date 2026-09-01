import { describe, expect, it } from 'vitest';
import { buildCadMassing, demoCadPlate, extrudeCadPlate } from './index';

describe('cad massing fidelity', () => {
  it('orients gable ridge along plan depth for south front elevation', () => {
    const plate = demoCadPlate();
    const massing = buildCadMassing(plate, 2.74);
    expect(massing.frontFace).toBe('south');
    expect(massing.roof.ridgeAlongX).toBe(false);
    expect(massing.facadeHeightFt).toBeGreaterThan(9);
    expect(massing.planBounds.maxX - massing.planBounds.minX).toBe(40);
  });

  it('extrusion massing includes plan bounds and elevation height', () => {
    const extrusion = extrudeCadPlate(demoCadPlate());
    expect(extrusion.massing.facadeHeightFt).toBeGreaterThan(0);
    expect(extrusion.massing.planBounds.minX).toBe(0);
    expect(extrusion.massing.storyHeightM).toBeGreaterThanOrEqual(2.74);
  });
});
