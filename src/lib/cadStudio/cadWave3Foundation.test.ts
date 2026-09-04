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
