import { describe, expect, it } from 'vitest';
import { demoCadPlate } from './demoCadPlate';
import {
  addFixtureHint,
  addWallCenterline,
  deleteSelection,
  formatWallLengthFt,
  moveLabel,
  segLengthFt,
  syncWallSegments,
} from './editCadPlate';

describe('editCadPlate', () => {
  it('formatWallLengthFt shows feet and inches', () => {
    expect(formatWallLengthFt(12.5)).toBe("12'-6\"");
    expect(formatWallLengthFt(8)).toBe("8'-0\"");
  });

  it('addWallCenterline updates wallCenterlines and segments', () => {
    const plate = demoCadPlate();
    const before = plate.wallCenterlines.length;
    const next = addWallCenterline(plate, 0, 0, 10, 0);
    expect(next.wallCenterlines.length).toBe(before + 1);
    expect(next.segments.filter((s) => s.role === 'wall').length).toBe(next.wallCenterlines.length);
    const w = next.wallCenterlines[next.wallCenterlines.length - 1]!;
    expect(segLengthFt(w)).toBeCloseTo(10, 1);
  });

  it('moveLabel updates label position', () => {
    const plate = demoCadPlate();
    if (!plate.labels.length) return;
    const next = moveLabel(plate, 0, 99, 88);
    expect(next.labels[0]!.x).toBe(99);
    expect(next.labels[0]!.y).toBe(88);
  });

  it('deleteSelection removes a wall', () => {
    const plate = addWallCenterline(demoCadPlate(), 1, 1, 5, 1);
    const idx = plate.wallCenterlines.length - 1;
    const next = deleteSelection(plate, { kind: 'wall', index: idx });
    expect(next.wallCenterlines.length).toBe(plate.wallCenterlines.length - 1);
  });

  it('addFixtureHint adds fixture at position', () => {
    const plate = addFixtureHint(demoCadPlate(), 'toilet', 12, 8);
    const f = plate.fixtureHints[plate.fixtureHints.length - 1]!;
    expect(f.kind).toBe('toilet');
    expect(f.xFt).toBe(12);
  });

  it('syncWallSegments keeps wall segment count aligned', () => {
    const plate = syncWallSegments(demoCadPlate());
    expect(plate.segments.filter((s) => s.role === 'wall').length).toBe(plate.wallCenterlines.length);
  });
});
