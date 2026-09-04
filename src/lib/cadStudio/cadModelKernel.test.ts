import { describe, expect, it } from 'vitest';
import { demoCadPlate } from './demoCadPlate';
import {
  applyOpeningType,
  applyWallType,
  ensureModelKernel,
  filterPlateToStory,
  setOpeningHeight,
  storyHeightFt,
} from './cadModelKernel';
import { addStory, ensureDefaultStories } from './cadStories';
import { placeHostedOpening, setWallLength } from './cadWallModify';
import { extrudeCadPlate, storyZFromEntityId } from './extrudeCadPlate';
import { segLengthFt } from './editCadPlate';

describe('cad model kernel M1–M5', () => {
  it('assigns stable ids, types, and hostWallId (M1/M2)', () => {
    let plate = ensureModelKernel(demoCadPlate());
    expect(plate.wallCenterlines.every((w) => !!w.id && !!w.typeId && !!w.storyId)).toBe(true);
    expect(plate.openingHints.every((o) => !!o.id && !!o.typeId)).toBe(true);

    const wi = 0;
    const before = plate.wallCenterlines[wi]!;
    plate = placeHostedOpening(plate, wi, 0.4, 3, 'door');
    plate = ensureModelKernel(plate);
    const opn = plate.openingHints[plate.openingHints.length - 1]!;
    expect(opn.hostWallId).toBe(before.id);
    expect(opn.hostT).toBeCloseTo(0.4, 2);

    const oldCx = (opn.x1 + opn.x2) / 2;
    plate = setWallLength(plate, wi, segLengthFt(before) + 4, 'start');
    const after = plate.openingHints.find((o) => o.id === opn.id)!;
    expect(after.hostWallId).toBe(before.id);
    const newCx = (after.x1 + after.x2) / 2;
    // hostT preserved → center moves with wall stretch from start
    expect(Math.abs(newCx - oldCx)).toBeGreaterThan(0.5);
  });

  it('applies wall/opening types and opening height (M1/M4)', () => {
    let plate = ensureModelKernel(demoCadPlate());
    plate = applyWallType(plate, 0, 'wall-ext-2x6');
    expect(plate.wallCenterlines[0]!.thicknessFt).toBeCloseTo(0.59, 2);
    expect(plate.wallCenterlines[0]!.exterior).toBe(true);

    plate = placeHostedOpening(plate, 0, 0.5, 3, 'window', 3);
    plate = ensureModelKernel(plate);
    const oi = plate.openingHints.length - 1;
    plate = applyOpeningType(plate, oi, 'window-6030');
    expect(plate.openingHints[oi]!.widthFt).toBeCloseTo(6, 1);
    expect(plate.openingHints[oi]!.heightFt).toBeCloseTo(3, 1);
    plate = setOpeningHeight(plate, oi, 5);
    expect(plate.openingHints[oi]!.heightFt).toBe(5);
    expect(plate.openingHints[oi]!.headFt).toBeCloseTo(8, 1);

    const ext = extrudeCadPlate(plate);
    const edited = plate.openingHints[oi]!;
    const win = ext.openings
      .filter((o) => o.type === 'window')
      .find((o) => Math.abs(o.height - 5 * 0.3048) < 0.05 || (edited.id && o.id.includes(edited.id)));
    expect(win || ext.openings.some((o) => Math.abs(o.height - 5 * 0.3048) < 0.05)).toBeTruthy();
    const tall = ext.openings.find((o) => Math.abs(o.height - 5 * 0.3048) < 0.05);
    expect(tall).toBeTruthy();
  });

  it('stacks stories in extrude and tags z offsets (M3)', () => {
    let plate = ensureDefaultStories(demoCadPlate());
    plate = addStory(plate, 'Level 2', 10);
    plate = ensureModelKernel(plate);
    const s1 = plate.stories![0]!.id;
    const s2 = plate.stories![1]!.id;
    // put half the walls on level 2 by copying story assignment
    plate = {
      ...plate,
      wallCenterlines: plate.wallCenterlines.map((w, i) =>
        i % 2 === 0 ? { ...w, storyId: s1 } : { ...w, storyId: s2 },
      ),
    };
    expect(storyHeightFt(plate, s1)).toBeCloseTo(10, 5);
    const level2 = filterPlateToStory(plate, s2);
    expect(level2.wallCenterlines.every((w) => w.storyId === s2)).toBe(true);

    const ext = extrudeCadPlate(plate);
    expect(ext.walls.some((w) => storyZFromEntityId(w.id) > 0)).toBe(true);
    expect(ext.slabs.some((s) => s.id.startsWith('floor-'))).toBe(true);
  });
});
