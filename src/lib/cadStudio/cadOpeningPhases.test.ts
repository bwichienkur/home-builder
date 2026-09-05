import { describe, expect, it } from 'vitest';
import {
  applyAssociativeExteriorDim,
  applyTempDimEdit,
  buildTempDimsForSelection,
} from './cadDimEdit';
import {
  applyOpeningPreset,
  convertSegmentToOpening,
  copySelectionToStory,
  detectOpeningClashes,
  normalizeOpeningDefaults,
  restoreDesignSnapshot,
  saveDesignSnapshot,
  setDistanceBetweenOpenings,
  setOpeningHeight,
  setOpeningOffsetFromStart,
  slideOpeningAlongWall,
} from './cadOpeningEdit';
import { placeHostedOpening } from './cadWallModify';
import { demoCadPlate } from './demoCadPlate';
import { addOpeningHint, addWallCenterline, segLengthFt } from './editCadPlate';
import { ensureDefaultStories, addStory } from './cadStories';

describe('CAD opening O1–O5', () => {
  it('slideOpeningAlongWall keeps host and updates hostT', () => {
    let plate = demoCadPlate();
    const wallIndex = 0;
    const w = plate.wallCenterlines[wallIndex]!;
    plate = placeHostedOpening(plate, wallIndex, 0.3, 3, 'door', 0);
    const oi = plate.openingHints.length - 1;
    const midX = (w.x1 + w.x2) / 2;
    const midY = (w.y1 + w.y2) / 2;
    plate = slideOpeningAlongWall(plate, oi, midX, midY);
    expect(plate.openingHints[oi]!.hostWallIndex).toBe(wallIndex);
    expect(plate.openingHints[oi]!.hostT).toBeGreaterThan(0.35);
    expect(plate.openingHints[oi]!.hostT).toBeLessThan(0.65);
  });

  it('temp dims include width, height, and sill for windows', () => {
    let plate = normalizeOpeningDefaults(demoCadPlate());
    plate = placeHostedOpening(plate, 0, 0.5, 3, 'window', 3);
    const oi = plate.openingHints.length - 1;
    plate = setOpeningHeight(plate, oi, 4);
    const dims = buildTempDimsForSelection(plate, { kind: 'opening', index: oi });
    expect(dims.some((d) => d.kind === 'opening-width')).toBe(true);
    expect(dims.some((d) => d.kind === 'opening-height')).toBe(true);
    expect(dims.some((d) => d.kind === 'opening-sill')).toBe(true);
    const hDim = dims.find((d) => d.kind === 'opening-height')!;
    plate = applyTempDimEdit(plate, hDim, 5);
    expect(plate.openingHints[oi]!.heightFt).toBeCloseTo(5, 5);
  });

  it('setOpeningOffsetFromStart moves near jamb', () => {
    let plate = demoCadPlate();
    plate = placeHostedOpening(plate, 0, 0.5, 3, 'door', 0);
    const oi = plate.openingHints.length - 1;
    plate = setOpeningOffsetFromStart(plate, oi, 2);
    const w = plate.wallCenterlines[0]!;
    const len = segLengthFt(w);
    const t = plate.openingHints[oi]!.hostT!;
    const near = t * len - 1.5;
    expect(near).toBeCloseTo(2, 1);
  });

  it('applyOpeningPreset sets Olsen door size', () => {
    let plate = demoCadPlate();
    plate = placeHostedOpening(plate, 0, 0.4, 3, 'door', 0);
    const oi = plate.openingHints.length - 1;
    plate = applyOpeningPreset(plate, oi, 'd-2868');
    expect(plate.openingHints[oi]!.widthFt).toBeCloseTo(2 + 8 / 12, 3);
    expect(plate.openingHints[oi]!.heightFt).toBeCloseTo(6 + 8 / 12, 3);
  });

  it('detectOpeningClashes finds near-corner openings', () => {
    let plate = demoCadPlate();
    plate = placeHostedOpening(plate, 0, 0.05, 3, 'door', 0);
    const clashes = detectOpeningClashes(plate, 1);
    expect(clashes.some((c) => c.kind === 'near-corner')).toBe(true);
  });

  it('setDistanceBetweenOpenings adjusts gap on shared wall', () => {
    let plate = demoCadPlate();
    plate = placeHostedOpening(plate, 0, 0.3, 3, 'door', 0);
    const a = plate.openingHints.length - 1;
    plate = placeHostedOpening(plate, 0, 0.7, 3, 'door', 0);
    const b = plate.openingHints.length - 1;
    plate = setDistanceBetweenOpenings(plate, a, b, 4);
    const w = plate.wallCenterlines[0]!;
    const len = segLengthFt(w);
    const oa = plate.openingHints[a]!;
    const ob = plate.openingHints[b]!;
    const aEdge = (oa.hostT ?? 0) * len + (oa.widthFt ?? 3) / 2;
    const bEdge = (ob.hostT ?? 0) * len - (ob.widthFt ?? 3) / 2;
    expect(Math.abs(bEdge - aEdge)).toBeCloseTo(4, 1);
  });

  it('convertSegmentToOpening creates hosted opening from segment', () => {
    let plate = demoCadPlate();
    const w = plate.wallCenterlines[0]!;
    const mx = (w.x1 + w.x2) / 2;
    const my = (w.y1 + w.y2) / 2;
    const ux = (w.x2 - w.x1) / (segLengthFt(w) || 1);
    const uy = (w.y2 - w.y1) / (segLengthFt(w) || 1);
    plate = {
      ...plate,
      segments: [
        ...plate.segments,
        {
          x1: mx - ux * 1.5,
          y1: my - uy * 1.5,
          x2: mx + ux * 1.5,
          y2: my + uy * 1.5,
          layer: 'DOORS',
          role: 'opening',
        },
      ],
    };
    const segIndex = plate.segments.length - 1;
    const before = plate.openingHints.length;
    plate = convertSegmentToOpening(plate, segIndex, 'door');
    expect(plate.openingHints.length).toBe(before + 1);
    expect(plate.openingHints[plate.openingHints.length - 1]!.hostWallIndex).toBeDefined();
  });

  it('save/restore design snapshot round-trips walls', () => {
    let plate = demoCadPlate();
    const n = plate.wallCenterlines.length;
    plate = saveDesignSnapshot(plate, 'Scheme A');
    plate = addWallCenterline(plate, 0, 80, 10, 80, 'WALLS');
    expect(plate.wallCenterlines.length).toBe(n + 1);
    const id = plate.designSnapshots![0]!.id;
    plate = restoreDesignSnapshot(plate, id);
    expect(plate.wallCenterlines.length).toBe(n);
    expect(plate.designSnapshots?.length).toBe(1);
  });

  it('copySelectionToStory duplicates walls onto plate', () => {
    let plate = ensureDefaultStories(demoCadPlate());
    plate = addStory(plate, 'Level 2', 10);
    const story2 = plate.stories!.find((s) => s.name === 'Level 2')!;
    const before = plate.wallCenterlines.length;
    plate = copySelectionToStory(plate, story2.id, [0], []);
    expect(plate.wallCenterlines.length).toBe(before + 1);
    expect(plate.activeStoryId).toBe(story2.id);
  });

  it('applyAssociativeExteriorDim overall-w widens plate', () => {
    let plate = demoCadPlate();
    let minX = Infinity;
    let maxX = -Infinity;
    for (const w of plate.wallCenterlines) {
      minX = Math.min(minX, w.x1, w.x2);
      maxX = Math.max(maxX, w.x1, w.x2);
    }
    const cur = maxX - minX;
    plate = applyAssociativeExteriorDim(plate, 'overall-w', cur + 4);
    let maxX2 = -Infinity;
    let minX2 = Infinity;
    for (const w of plate.wallCenterlines) {
      minX2 = Math.min(minX2, w.x1, w.x2);
      maxX2 = Math.max(maxX2, w.x1, w.x2);
    }
    expect(maxX2 - minX2).toBeCloseTo(cur + 4, 1);
  });
});
