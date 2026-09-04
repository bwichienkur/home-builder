import { describe, expect, it } from 'vitest';
import { demoCadPlate } from './demoCadPlate';
import {
  addOpeningHint,
  addStair,
  setWallMaterial,
} from './editCadPlate';
import { exportCadPlateDxf, exportCadRoomScheduleCsv } from './exportCadPlate';
import { extrudeCadPlate } from './extrudeCadPlate';

describe('cad wave2', () => {
  it('garage opening extrudes as garage', () => {
    let plate = demoCadPlate();
    plate = addOpeningHint(plate, 2, 0, 18, 0, 'garage');
    const ext = extrudeCadPlate(plate);
    expect(ext.openings.some((o) => o.type === 'garage')).toBe(true);
  });

  it('addStair appends a stair to the plate', () => {
    let plate = demoCadPlate();
    const before = plate.stairs?.length ?? 0;
    plate = addStair(plate, 12, 8, { runFt: 9, steps: 12 });
    expect(plate.stairs?.length).toBe(before + 1);
    const last = plate.stairs![plate.stairs!.length - 1]!;
    expect(last.xFt).toBe(12);
    expect(last.yFt).toBe(8);
    expect(last.runFt).toBe(9);
    expect(last.steps).toBe(12);
    const ext = extrudeCadPlate(plate);
    expect(ext.stairs.length).toBe(plate.stairs!.length);
  });

  it('exportCadPlateDxf contains A-WALL layers', () => {
    const dxf = exportCadPlateDxf(demoCadPlate());
    expect(dxf).toContain('A-WALL');
    expect(dxf).toMatch(/A-WALL-(EXT|INT)/);
  });

  it('room schedule CSV has TOTAL row', () => {
    const csv = exportCadRoomScheduleCsv(demoCadPlate());
    expect(csv).toContain('TOTAL');
    expect(csv.split('\n')[0]).toContain('Name');
  });

  it('setWallMaterial sticks on the wall centerline', () => {
    let plate = demoCadPlate();
    expect(plate.wallCenterlines.length).toBeGreaterThan(0);
    plate = setWallMaterial(plate, 0, 'brick');
    expect(plate.wallCenterlines[0]!.materialId).toBe('brick');
    plate = setWallMaterial(plate, 0, 'stone');
    expect(plate.wallCenterlines[0]!.materialId).toBe('stone');
  });
});
