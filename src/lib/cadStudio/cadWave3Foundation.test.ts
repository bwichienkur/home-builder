import { describe, expect, it } from 'vitest';
import {
  applyAutoFoundation,
  clearAutoFoundation,
  buildAutoFoundationSlabs,
} from './buildCadFoundation';
import { demoCadPlate } from './demoCadPlate';
import { addSlab } from './editCadPlate';
import { exportCadPlateDxf } from './exportCadPlate';
import { extrudeCadPlate } from './extrudeCadPlate';

describe('cad wave3 foundations + plot', () => {
  it('demo ranch includes auto foundation slabs and a plot boundary', () => {
    const plate = demoCadPlate();
    expect(plate.foundation?.enabled).toBe(true);
    expect(plate.slabs.some((s) => s.kind === 'foundation' && s.auto)).toBe(true);
    expect(plate.slabs.some((s) => s.kind === 'footing' && s.auto)).toBe(true);
    expect(plate.slabs.some((s) => s.kind === 'plot')).toBe(true);
  });

  it('demo ranch plot fully contains house and detached garage with setback', () => {
    const plate = demoCadPlate();
    const plot = plate.slabs.find((s) => s.kind === 'plot');
    expect(plot).toBeTruthy();
    const xs = plot!.points.map((p) => p.x);
    const ys = plot!.points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    // Main house 0–40 × 0–28; garage 52–68 × 4–20 — need clear setback on all sides.
    expect(minX).toBeLessThanOrEqual(-24);
    expect(maxX).toBeGreaterThanOrEqual(90);
    expect(minY).toBeLessThanOrEqual(-28);
    expect(maxY).toBeGreaterThanOrEqual(50);
    expect(plate.bounds.minX).toBeLessThanOrEqual(minX);
    expect(plate.bounds.maxX).toBeGreaterThanOrEqual(maxX);
    for (const w of plate.wallCenterlines) {
      for (const [x, y] of [
        [w.x1, w.y1],
        [w.x2, w.y2],
      ] as const) {
        expect(x).toBeGreaterThan(minX);
        expect(x).toBeLessThan(maxX);
        expect(y).toBeGreaterThan(minY);
        expect(y).toBeLessThan(maxY);
      }
    }
  });

  it('applyAutoFoundation rebuilds footing strips without removing terrace', () => {
    let plate = clearAutoFoundation(demoCadPlate());
    expect(plate.slabs.every((s) => !s.auto)).toBe(true);
    const terraceCount = plate.slabs.filter((s) => s.kind === 'terrace').length;
    plate = applyAutoFoundation(plate, { enabled: true, mode: 'footing' });
    expect(plate.slabs.filter((s) => s.kind === 'terrace').length).toBe(terraceCount);
    expect(plate.slabs.filter((s) => s.auto && s.kind === 'footing').length).toBeGreaterThanOrEqual(3);
  });

  it('buildAutoFoundationSlabs returns empty when disabled', () => {
    const plate = demoCadPlate();
    expect(buildAutoFoundationSlabs(plate, { ...plate.foundation!, enabled: false })).toEqual([]);
  });

  it('addSlab plot and DXF export include site/foundation layers', () => {
    let plate = clearAutoFoundation(demoCadPlate());
    plate = addSlab(plate, 'plot', [
      { x: -10, y: -10 },
      { x: 50, y: -10 },
      { x: 50, y: 40 },
      { x: -10, y: 40 },
    ]);
    plate = applyAutoFoundation(plate, { enabled: true, mode: 'slab' });
    const dxf = exportCadPlateDxf(plate);
    expect(dxf).toContain('A-SITE-PLOT');
    expect(dxf).toContain('A-FND-SLAB');
  });

  it('extrude includes foundation and footing meshes via slabs', () => {
    const ext = extrudeCadPlate(demoCadPlate());
    expect(ext.slabs.some((s) => s.kind === 'foundation')).toBe(true);
    expect(ext.slabs.some((s) => s.kind === 'footing')).toBe(true);
  });
});
