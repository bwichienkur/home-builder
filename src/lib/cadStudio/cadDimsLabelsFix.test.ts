import { describe, expect, it } from 'vitest';
import { computeExteriorDims } from './cadExteriorDims';
import { detectCadRoomStamps } from './cadRoomStamps';
import { demoCadPlate } from './demoCadPlate';

describe('dims and room label de-dupe', () => {
  it('does not emit duplicate full-depth dims on the left', () => {
    const dims = computeExteriorDims(demoCadPlate());
    const left28 = dims.filter((d) => {
      const vert = Math.abs(d.x2 - d.x1) < Math.abs(d.y2 - d.y1);
      const midX = (d.x1 + d.x2) / 2;
      return vert && Math.abs((d.valueFt ?? 0) - 28) < 0.1 && midX < 5;
    });
    expect(left28).toHaveLength(1);
    expect(left28[0]!.id).toBe('overall-d');
  });

  it('keeps distinct house-width segment dims separate from overall lot width', () => {
    const dims = computeExteriorDims(demoCadPlate());
    expect(dims.some((d) => d.id === 'overall-w' && Math.abs((d.valueFt ?? 0) - 68) < 0.1)).toBe(
      true,
    );
    expect(dims.some((d) => d.id.startsWith('ext-') && Math.abs((d.valueFt ?? 0) - 40) < 0.1)).toBe(
      true,
    );
  });

  it('marks source labels so kitchen is not drawn twice', () => {
    const plate = demoCadPlate();
    const stamps = detectCadRoomStamps(plate);
    const kitchen = stamps.find((s) => /kitchen/i.test(s.name));
    expect(kitchen).toBeTruthy();
    expect(kitchen!.sourceLabelIndex).toBeTypeOf('number');
    const kitchenLabelIdx = plate.labels.findIndex((l) => /kitchen/i.test(l.text));
    expect(kitchen!.sourceLabelIndex).toBe(kitchenLabelIdx);
    // Editor suppress rule: consumed label index or same name within 16'
    const covered = stamps.some(
      (r) =>
        r.sourceLabelIndex === kitchenLabelIdx ||
        (r.name.trim().toLowerCase() === plate.labels[kitchenLabelIdx]!.text.trim().toLowerCase() &&
          Math.hypot(r.x - plate.labels[kitchenLabelIdx]!.x, r.y - plate.labels[kitchenLabelIdx]!.y) <
            16),
    );
    expect(covered).toBe(true);
  });
});
