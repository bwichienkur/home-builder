import { describe, expect, it } from 'vitest';
import { computeExteriorDims } from './cadExteriorDims';
import { demoCadPlate } from './demoCadPlate';
import {
  addSlab,
  deleteSelection,
  moveSlab,
  updateSlab,
} from './editCadPlate';
import { extrudeCadPlate } from './extrudeCadPlate';

describe('cad slabs and exterior dims', () => {
  it('demo ranch includes a terrace slab', () => {
    const plate = demoCadPlate();
    expect(plate.slabs.length).toBeGreaterThanOrEqual(1);
    expect(plate.slabs[0]!.kind).toBe('terrace');
    expect(plate.bounds.minY).toBeLessThan(0);
  });

  it('addSlab appends a closed polygon plate', () => {
    const plate = demoCadPlate();
    const before = plate.slabs.length;
    const next = addSlab(plate, 'driveway', [
      { x: 40, y: 5 },
      { x: 52, y: 5 },
      { x: 52, y: 20 },
      { x: 40, y: 20 },
    ]);
    expect(next.slabs.length).toBe(before + 1);
    const slab = next.slabs[next.slabs.length - 1]!;
    expect(slab.kind).toBe('driveway');
    expect(slab.points).toHaveLength(4);
    expect(next.bounds.maxX).toBeGreaterThanOrEqual(52);
  });

  it('updateSlab and moveSlab mutate thickness and position', () => {
    let plate = demoCadPlate();
    const idx = 0;
    plate = updateSlab(plate, idx, { thicknessFt: 0.75, elevationFt: 0.5 });
    expect(plate.slabs[idx]!.thicknessFt).toBe(0.75);
    expect(plate.slabs[idx]!.elevationFt).toBe(0.5);
    const x0 = plate.slabs[idx]!.points[0]!.x;
    plate = moveSlab(plate, idx, 2, -1);
    expect(plate.slabs[idx]!.points[0]!.x).toBeCloseTo(x0 + 2, 5);
  });

  it('deleteSelection removes a slab', () => {
    const plate = demoCadPlate();
    const next = deleteSelection(plate, { kind: 'slab', index: 0 });
    expect(next.slabs.length).toBe(plate.slabs.length - 1);
  });

  it('extrudeCadPlate forwards slabs to extrusion', () => {
    const plate = demoCadPlate();
    const ext = extrudeCadPlate(plate);
    expect(ext.slabs.length).toBe(plate.slabs.length);
    expect(ext.slabs[0]!.id).toBe(plate.slabs[0]!.id);
  });

  it('computeExteriorDims returns overall and segment dims', () => {
    const dims = computeExteriorDims(demoCadPlate());
    expect(dims.some((d) => d.id === 'overall-w')).toBe(true);
    expect(dims.some((d) => d.id === 'overall-d')).toBe(true);
    expect(dims.length).toBeGreaterThan(2);
    const overallW = dims.find((d) => d.id === 'overall-w')!;
    expect(overallW.valueFt ?? 0).toBeGreaterThan(10);
    expect(overallW.label.length).toBeGreaterThan(0);
  });
});
