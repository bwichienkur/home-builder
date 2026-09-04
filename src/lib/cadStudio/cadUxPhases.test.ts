import { describe, expect, it } from 'vitest';
import {
  applyTempDimEdit,
  buildTempDimsForSelection,
} from './cadDimEdit';
import { computeExteriorDims } from './cadExteriorDims';
import { assignOpeningMarks } from './cadMarks';
import { flipPlan } from './cadPlanOps';
import { ensureDefaultStories } from './cadStories';
import { calibrateUnderlay, setUnderlay } from './cadUnderlay';
import {
  autoHostOpenings,
  combineCollinearWalls,
  setDistanceBetweenWalls,
  signedWallDistanceFt,
  stretchSharedNode,
} from './cadWallGraph';
import { demoCadPlate } from './demoCadPlate';
import { addOpeningHint, addWallCenterline, segLengthFt } from './editCadPlate';

describe('CAD UX phases U2–U5 libraries', () => {
  it('applyTempDimEdit wall length resizes selected wall', () => {
    let plate = demoCadPlate();
    const dims = buildTempDimsForSelection(plate, { kind: 'wall', index: 0 });
    expect(dims).toHaveLength(1);
    expect(dims[0]!.kind).toBe('wall-length');
    plate = applyTempDimEdit(plate, dims[0]!, 22);
    expect(segLengthFt(plate.wallCenterlines[0]!)).toBeCloseTo(22, 5);
  });

  it('combineCollinearWalls merges abutting same-layer runs', () => {
    let plate = demoCadPlate();
    // Two collinear horizontal segments abutting at x=10 (far from demo walls)
    plate = addWallCenterline(plate, 0, 50, 10, 50, 'WALLS COMBINE');
    plate = addWallCenterline(plate, 10, 50, 25, 50, 'WALLS COMBINE');
    const before = plate.wallCenterlines.length;
    plate = combineCollinearWalls(plate, 0.5, 5);
    expect(plate.wallCenterlines.length).toBeLessThan(before);
    const merged = plate.wallCenterlines.find(
      (w) =>
        (w.layer ?? '') === 'WALLS COMBINE' &&
        Math.abs(w.y1 - 50) < 0.01 &&
        Math.abs(w.y2 - 50) < 0.01,
    );
    expect(merged).toBeTruthy();
    expect(segLengthFt(merged!)).toBeCloseTo(25, 4);
  });

  it('setDistanceBetweenWalls moves B to target centerline distance', () => {
    let plate = demoCadPlate();
    plate = addWallCenterline(plate, 0, 60, 20, 60, 'WALLS INT');
    const a = plate.wallCenterlines.length - 1;
    plate = addWallCenterline(plate, 0, 64, 20, 64, 'WALLS INT');
    const b = plate.wallCenterlines.length - 1;
    expect(
      Math.abs(signedWallDistanceFt(plate.wallCenterlines[a]!, plate.wallCenterlines[b]!)),
    ).toBeCloseTo(4, 4);
    plate = setDistanceBetweenWalls(plate, a, b, 6);
    expect(
      Math.abs(signedWallDistanceFt(plate.wallCenterlines[a]!, plate.wallCenterlines[b]!)),
    ).toBeCloseTo(6, 4);
    // A stays put
    expect(plate.wallCenterlines[a]!.y1).toBeCloseTo(60, 5);
  });

  it('autoHostOpenings attaches unhosted openings near a wall', () => {
    let plate = demoCadPlate();
    // Opening near bottom exterior wall (y=0), unhosted
    plate = addOpeningHint(plate, 10, 0.1, 13, 0.1, 'door');
    const oi = plate.openingHints.length - 1;
    expect(plate.openingHints[oi]!.hostWallIndex).toBeUndefined();
    plate = autoHostOpenings(plate, 2);
    expect(plate.openingHints[oi]!.hostWallIndex).toBeDefined();
    expect(plate.openingHints[oi]!.hostT).toBeGreaterThan(0);
    expect(plate.openingHints[oi]!.widthFt).toBeGreaterThan(0);
  });

  it('assignOpeningMarks fills D/W/G/P sequence when missing', () => {
    let plate = demoCadPlate();
    expect(plate.openingHints.some((o) => !o.mark)).toBe(true);
    plate = assignOpeningMarks(plate);
    const doors = plate.openingHints.filter((o) => o.kind === 'door').map((o) => o.mark);
    const windows = plate.openingHints.filter((o) => o.kind === 'window').map((o) => o.mark);
    expect(doors.every((m) => /^D\d+$/.test(m ?? ''))).toBe(true);
    expect(windows.every((m) => /^W\d+$/.test(m ?? ''))).toBe(true);
    expect(new Set(doors).size).toBe(doors.length);
  });

  it('ensureDefaultStories adds Level 1 at 0 when missing', () => {
    const plate = ensureDefaultStories(demoCadPlate());
    expect(plate.stories).toHaveLength(1);
    expect(plate.stories![0]!.name).toBe('Level 1');
    expect(plate.stories![0]!.levelFt).toBe(0);
    expect(plate.activeStoryId).toBe(plate.stories![0]!.id);
  });

  it('calibrateUnderlay scales width/height to known length', () => {
    let plate = demoCadPlate();
    plate = setUnderlay(plate, {
      id: 'u1',
      imageUrl: 'data:image/png;base64,xx',
      xFt: 0,
      yFt: 0,
      widthFt: 40,
      heightFt: 28,
      opacity: 0.5,
      locked: false,
    });
    // Measured span was 20 plan-ft; known real length is 40 ft → 2× scale
    plate = calibrateUnderlay(plate, 40, 20);
    expect(plate.underlay!.widthFt).toBeCloseTo(80, 5);
    expect(plate.underlay!.heightFt).toBeCloseTo(56, 5);
  });

  it('computeExteriorDims keeps annotative manuals and skips overlapping auto', () => {
    let plate = demoCadPlate();
    const auto = computeExteriorDims({ ...plate, annotativeDims: undefined });
    const overall = auto.find((d) => d.id === 'overall-w');
    expect(overall).toBeTruthy();
    plate = {
      ...plate,
      annotativeDims: [
        {
          id: 'manual-w',
          x1: overall!.x1,
          y1: overall!.y1,
          x2: overall!.x2,
          y2: overall!.y2,
          label: `KEEP`,
          labelX: overall!.labelX,
          labelY: overall!.labelY,
          valueFt: overall!.valueFt,
        },
      ],
    };
    const dims = computeExteriorDims(plate);
    expect(dims.some((d) => d.id === 'manual-w')).toBe(true);
    expect(dims.some((d) => d.id === 'overall-w')).toBe(false);
  });

  it('flipPlan mirrors wall endpoints about bounds center X', () => {
    let plate = demoCadPlate();
    const before = plate.wallCenterlines[0]!;
    const cx = (plate.bounds.minX + plate.bounds.maxX) / 2;
    plate = flipPlan(plate, 'x');
    const after = plate.wallCenterlines[0]!;
    expect(after.x1).toBeCloseTo(2 * cx - before.x1, 4);
    expect(after.x2).toBeCloseTo(2 * cx - before.x2, 4);
    expect(after.y1).toBeCloseTo(before.y1, 4);
  });

  it('stretchSharedNode moves connected wall endpoints together', () => {
    let plate = demoCadPlate();
    // Horizontal + vertical sharing (10, 0)
    plate = addWallCenterline(plate, 0, 0, 10, 0, 'WALLS JOIN');
    const h = plate.wallCenterlines.length - 1;
    plate = addWallCenterline(plate, 10, 0, 10, 8, 'WALLS JOIN');
    const v = plate.wallCenterlines.length - 1;
    plate = stretchSharedNode(plate, h, 'b', 12, 1, 0.6);
    expect(plate.wallCenterlines[h]!.x2).toBeCloseTo(12, 4);
    expect(plate.wallCenterlines[h]!.y2).toBeCloseTo(1, 4);
    expect(plate.wallCenterlines[v]!.x1).toBeCloseTo(12, 4);
    expect(plate.wallCenterlines[v]!.y1).toBeCloseTo(1, 4);
  });
});
