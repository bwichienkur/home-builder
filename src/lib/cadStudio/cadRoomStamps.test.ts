import { describe, expect, it } from 'vitest';
import { detectCadRoomStamps, formatDraftLength, formatRoomAreaSqFt } from './cadRoomStamps';
import { addOpeningHint, demoCadPlate, extrudeCadPlate } from './index';

describe('cadRoomStamps', () => {
  it('formats draft length and room area', () => {
    expect(formatDraftLength({ x1: 0, y1: 0, x2: 12, y2: 0 })).toBe(`12'-0"`);
    expect(formatRoomAreaSqFt(182.4)).toBe('182 sq ft');
  });

  it('detects rooms with names and areas on the demo ranch plate', () => {
    const stamps = detectCadRoomStamps(demoCadPlate());
    expect(stamps.length).toBeGreaterThanOrEqual(2);
    expect(stamps.some((s) => /KITCHEN|BEDROOM|GREAT|Room/i.test(s.name))).toBe(true);
    expect(stamps.every((s) => s.areaSqFt >= 18)).toBe(true);
  });

  it('stores window sill on place and extrudes with that sill', () => {
    let plate = demoCadPlate();
    plate = addOpeningHint(plate, 2, 0, 5, 0, 'window', 4);
    const hint = plate.openingHints[plate.openingHints.length - 1]!;
    expect(hint.kind).toBe('window');
    expect(hint.sillFt).toBe(4);
    const extrusion = extrudeCadPlate(plate);
    const win = extrusion.openings.find((o) => o.type === 'window' && Math.abs(o.sill - 4 * 0.3048) < 0.05);
    expect(win).toBeTruthy();
  });
});
