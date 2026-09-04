import { describe, expect, it } from 'vitest';
import { buildCadMassing, DEFAULT_ROOF_OVERRIDES, setPlateRoof } from './buildCadMassing';
import { computeInteriorDims } from './cadExteriorDims';
import { defaultWallThicknessFt, snapCadDraftPoint } from './cadDrawSnap';
import { demoCadPlate } from './demoCadPlate';
import {
  addGuideline,
  addOpeningHint,
  setWallThickness,
} from './editCadPlate';
import { extrudeCadPlate } from './extrudeCadPlate';

describe('cad wave1 next', () => {
  it('snaps draft points to wall endpoints when snap enabled', () => {
    const plate = demoCadPlate();
    const hit = snapCadDraftPoint(plate, 0.2, 0.15, { enabled: true });
    expect(hit.kind).toBe('endpoint');
    expect(hit.x).toBeCloseTo(0, 1);
    expect(hit.y).toBeCloseTo(0, 1);
  });

  it('setWallThickness changes extruded wall thickness', () => {
    let plate = demoCadPlate();
    plate = setWallThickness(plate, 0, 0.75);
    expect(defaultWallThicknessFt(plate.wallCenterlines[0]!)).toBeCloseTo(0.75, 3);
    const ext = extrudeCadPlate(plate);
    expect(ext.walls[0]!.thickness).toBeCloseTo(0.75 * 0.3048, 3);
  });

  it('passage openings extrude as passage type', () => {
    let plate = demoCadPlate();
    plate = addOpeningHint(plate, 20, 14, 23, 14, 'passage');
    const ext = extrudeCadPlate(plate);
    expect(ext.openings.some((o) => o.type === 'passage')).toBe(true);
  });

  it('roof overrides switch flat / gable / shed', () => {
    const base = demoCadPlate();
    const flat = buildCadMassing(setPlateRoof(base, { kind: 'flat', forceProcedural: true }), 2.74);
    expect(flat.roof.kind).toBe('flat');
    const shed = buildCadMassing(
      setPlateRoof(base, { ...DEFAULT_ROOF_OVERRIDES, kind: 'shed', forceProcedural: true, pitchRise12: 4 }),
      2.74,
    );
    expect(shed.roof.kind).toBe('shed');
    const gable = buildCadMassing(
      setPlateRoof(base, { kind: 'gable', forceProcedural: true, pitchRise12: 8 }),
      2.74,
    );
    expect(gable.roof.kind).toBe('gable');
    expect(gable.roof.ridgeHeightM).toBeGreaterThan(gable.storyHeightM);
  });

  it('guidelines are stored and used as snap targets', () => {
    let plate = demoCadPlate();
    plate = addGuideline(plate, 50, 0, 50, 30);
    expect(plate.guidelines?.length).toBe(1);
    const hit = snapCadDraftPoint(plate, 50.2, 12, { enabled: true });
    expect(hit.kind).toBe('guide');
    expect(hit.x).toBeCloseTo(50, 1);
  });

  it('interior dims return interior wall labels', () => {
    const dims = computeInteriorDims(demoCadPlate());
    expect(dims.length).toBeGreaterThan(0);
    expect(dims.every((d) => d.id.startsWith('int-'))).toBe(true);
  });

  it('demo balcony slab has railing', () => {
    const balcony = demoCadPlate().slabs.find((s) => s.kind === 'balcony');
    expect(balcony?.railing).toBe(true);
  });
});
