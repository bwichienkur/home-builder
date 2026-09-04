import { describe, expect, it } from 'vitest';
import {
  createCadHistory,
  pushCadHistory,
  redoCadHistory,
  undoCadHistory,
} from './cadHistory';
import { parseArchitecturalLength, parseAngleDeg } from './cadLengthParse';
import { softToggleLayer } from './cadLayerVisibility';
import {
  autoJoinWallEndpoints,
  breakWallAt,
  placeHostedOpening,
  setOpeningWidth,
  setWallAngle,
  setWallLength,
  trimWallTo,
} from './cadWallModify';
import { demoCadPlate } from './demoCadPlate';
import { addWallCenterline } from './editCadPlate';
import { extrudeCadPlate } from './extrudeCadPlate';

describe('cad 2d edit foundation', () => {
  it('parses architectural lengths and angles', () => {
    expect(parseArchitecturalLength(`12'-6"`)).toBeCloseTo(12.5, 5);
    expect(parseArchitecturalLength('8')).toBe(8);
    expect(parseArchitecturalLength(`18"`)).toBeCloseTo(1.5, 5);
    expect(parseAngleDeg('90')).toBe(90);
    expect(parseAngleDeg('270')).toBe(-90);
  });

  it('setWallLength and setWallAngle resize/rotate a wall', () => {
    let plate = demoCadPlate();
    const i = 0;
    plate = setWallLength(plate, i, 20, 'start');
    expect(Math.hypot(
      plate.wallCenterlines[i]!.x2 - plate.wallCenterlines[i]!.x1,
      plate.wallCenterlines[i]!.y2 - plate.wallCenterlines[i]!.y1,
    )).toBeCloseTo(20, 5);
    plate = setWallAngle(plate, i, 90, 'start');
    const w = plate.wallCenterlines[i]!;
    expect(Math.abs(w.x2 - w.x1)).toBeLessThan(0.01);
    expect(w.y2 - w.y1).toBeCloseTo(20, 4);
  });

  it('trim and break walls', () => {
    let plate = demoCadPlate();
    // Horizontal wall from 0,10 to 40,10 and vertical cutter
    plate = addWallCenterline(plate, 0, 10, 40, 10, 'WALLS INT');
    const hi = plate.wallCenterlines.length - 1;
    plate = addWallCenterline(plate, 20, 0, 20, 28, 'WALLS INT');
    const vi = plate.wallCenterlines.length - 1;
    plate = trimWallTo(plate, hi, vi);
    const trimmed = plate.wallCenterlines[hi]!;
    expect(segLen(trimmed)).toBeLessThan(40);
    expect(segLen(trimmed)).toBeGreaterThan(5);

    plate = breakWallAt(plate, vi, 20, 14);
    expect(plate.wallCenterlines.length).toBeGreaterThan(vi + 1);
  });

  it('auto-joins nearby endpoints', () => {
    let plate = demoCadPlate();
    plate = addWallCenterline(plate, 0.2, 0.2, 10, 0.2, 'WALLS EXT');
    const i = plate.wallCenterlines.length - 1;
    plate = autoJoinWallEndpoints(plate, i, 0.5);
    const w = plate.wallCenterlines[i]!;
    // Should snap start near existing (0,0) corner of demo
    expect(Math.hypot(w.x1, w.y1)).toBeLessThan(0.35);
  });

  it('hosted opening width edit', () => {
    let plate = demoCadPlate();
    plate = placeHostedOpening(plate, 0, 0.5, 3, 'door');
    const oi = plate.openingHints.length - 1;
    expect(plate.openingHints[oi]!.hostWallIndex).toBe(0);
    plate = setOpeningWidth(plate, oi, 5);
    const o = plate.openingHints[oi]!;
    expect(Math.hypot(o.x2 - o.x1, o.y2 - o.y1)).toBeCloseTo(5, 4);
  });

  it('soft layer toggle hides geometry in extrude but keeps centerlines', () => {
    let plate = demoCadPlate();
    const wallLayer = plate.wallCenterlines[0]!.layer ?? 'WALLS EXT';
    const beforeWalls = extrudeCadPlate(plate).walls.length;
    expect(beforeWalls).toBeGreaterThan(0);
    plate = softToggleLayer(plate, wallLayer);
    // Layer off — wallCenterlines still present
    expect(plate.wallCenterlines.some((w) => (w.layer ?? '') === wallLayer)).toBe(true);
    const after = extrudeCadPlate(plate);
    expect(after.walls.length).toBeLessThan(beforeWalls);
  });

  it('undo/redo history', () => {
    let h = createCadHistory(demoCadPlate());
    const n0 = h.present.wallCenterlines.length;
    h = pushCadHistory(h, addWallCenterline(h.present, 1, 1, 5, 1));
    expect(h.present.wallCenterlines.length).toBe(n0 + 1);
    h = undoCadHistory(h);
    expect(h.present.wallCenterlines.length).toBe(n0);
    h = redoCadHistory(h);
    expect(h.present.wallCenterlines.length).toBe(n0 + 1);
  });
});

function segLen(w: { x1: number; y1: number; x2: number; y2: number }) {
  return Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
}
