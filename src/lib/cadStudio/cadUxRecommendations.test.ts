
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { demoCadPlate } from './demoCadPlate';
import { snapCadDraftPoint, snapToGridFt } from './cadDrawSnap';
import {
  addFixtureHint,
  alignFixtureHintToWall,
  rotateFixtureHint,
  setFixtureHintRotation,
  addWallCenterline,
} from './editCadPlate';
import {
  clearCadAutosave,
  loadCadAutosave,
  saveCadAutosave,
} from './cadAutosave';
import { exportCadRoomScheduleCsv } from './exportCadPlate';
import { exportDoorWindowScheduleCsv, assignOpeningMarks } from './cadMarks';

describe('CAD UX recommendations', () => {
  it('snapToGridFt quantizes to 1 foot', () => {
    expect(snapToGridFt(12.4, 7.6, 1)).toEqual({ x: 12, y: 8 });
    expect(snapToGridFt(-0.4, 0.6, 1)).toEqual({ x: 0, y: 1 });
  });

  it('snapCadDraftPoint grid snaps when free', () => {
    const plate = demoCadPlate();
    const r = snapCadDraftPoint(plate, 100.4, 80.6, { enabled: true, grid: 1 });
    // Far from demo geometry → grid
    expect(r.kind).toBe('grid');
    expect(r.x).toBe(100);
    expect(r.y).toBe(81);
  });

  it('endpoint snap still beats grid', () => {
    let plate = demoCadPlate();
    plate = addWallCenterline(plate, 0, 0, 10, 0, 'WALLS');
    const ep = plate.wallCenterlines[plate.wallCenterlines.length - 1]!;
    const r = snapCadDraftPoint(plate, ep.x1 + 0.2, ep.y1 + 0.1, { enabled: true, grid: 1 });
    expect(r.kind).toBe('endpoint');
    expect(r.x).toBeCloseTo(ep.x1, 5);
  });

  it('addFixtureHint aligns to nearby wall and stores rotation', () => {
    let plate = demoCadPlate();
    plate = addWallCenterline(plate, 0, 0, 20, 0, 'WALLS');
    plate = addFixtureHint(plate, 'toilet', 10, 0.5, { alignToWall: true });
    const f = plate.fixtureHints[plate.fixtureHints.length - 1]!;
    expect(f.rotationDeg).toBeDefined();
    expect(Math.abs(f.yFt)).toBeGreaterThan(0.1);
  });

  it('rotateFixtureHint and setFixtureHintRotation update pose', () => {
    let plate = addFixtureHint(demoCadPlate(), 'sink', 5, 5, { alignToWall: false, rotationDeg: 0 });
    const i = plate.fixtureHints.length - 1;
    plate = rotateFixtureHint(plate, i, 45);
    expect(plate.fixtureHints[i]!.rotationDeg).toBe(45);
    plate = setFixtureHintRotation(plate, i, 90);
    expect(plate.fixtureHints[i]!.rotationDeg).toBe(90);
  });

  it('alignFixtureHintToWall orients fixture to host wall', () => {
    let plate = demoCadPlate();
    plate = addWallCenterline(plate, 0, 10, 30, 10, 'WALLS');
    plate = addFixtureHint(plate, 'tub', 15, 12, { alignToWall: false, rotationDeg: 15 });
    const i = plate.fixtureHints.length - 1;
    plate = alignFixtureHintToWall(plate, i, 5);
    expect(plate.fixtureHints[i]!.rotationDeg).not.toBe(15);
  });

  it('room and opening CSV exports are non-empty', () => {
    const plate = assignOpeningMarks(demoCadPlate());
    const rooms = exportCadRoomScheduleCsv(plate);
    const openings = exportDoorWindowScheduleCsv(plate);
    expect(rooms.split('\n').length).toBeGreaterThan(1);
    expect(openings.split('\n').length).toBeGreaterThan(1);
  });
});

describe('CAD autosave', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips a plate through localStorage', () => {
    const plate = demoCadPlate();
    expect(saveCadAutosave(plate)).toBe(true);
    const loaded = loadCadAutosave();
    expect(loaded?.plate.sourceFileName).toBe(plate.sourceFileName);
    expect(loaded?.plate.wallCenterlines.length).toBe(plate.wallCenterlines.length);
    clearCadAutosave();
    expect(loadCadAutosave()).toBeNull();
  });
});
