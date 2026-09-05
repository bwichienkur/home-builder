import { describe, expect, it } from 'vitest';
import { demoCadPlate } from './demoCadPlate';
import { hostedOpeningGeom, placeHostedOpening, previewHostedOpening } from './cadWallModify';

describe('hosted opening place preview (Plan7-style)', () => {
  it('previewHostedOpening tracks along a wall near the cursor', () => {
    const plate = demoCadPlate();
    const w = plate.wallCenterlines[0]!;
    const mx = (w.x1 + w.x2) / 2;
    const my = (w.y1 + w.y2) / 2;
    const preview = previewHostedOpening(plate, mx, my, 'door', 3, 3);
    expect(preview).not.toBeNull();
    expect(preview!.wallIndex).toBe(0);
    expect(preview!.t).toBeGreaterThan(0.3);
    expect(preview!.t).toBeLessThan(0.7);
    expect(preview!.widthFt).toBeCloseTo(3, 1);
  });

  it('preview returns null when cursor is far from walls', () => {
    const plate = demoCadPlate();
    const preview = previewHostedOpening(plate, 1e6, 1e6, 'window', 4, 2.5);
    expect(preview).toBeNull();
  });

  it('placeHostedOpening accepts swing/face from preview', () => {
    let plate = demoCadPlate();
    const w = plate.wallCenterlines[0]!;
    const mx = (w.x1 + w.x2) / 2;
    const my = (w.y1 + w.y2) / 2;
    const preview = previewHostedOpening(plate, mx + 0.5, my + 0.5, 'door', 3, 3)!;
    plate = placeHostedOpening(
      plate,
      preview.wallIndex,
      preview.t,
      preview.widthFt,
      'door',
      0,
      { swing: preview.swing, face: preview.face },
    );
    const o = plate.openingHints[plate.openingHints.length - 1]!;
    expect(o.hostWallIndex).toBe(preview.wallIndex);
    expect(o.hostT).toBeCloseTo(preview.t, 3);
    expect(o.swing).toBe(preview.swing);
    expect(o.face).toBe(preview.face);
  });

  it('hostedOpeningGeom clamps t so the opening stays on the wall', () => {
    const plate = demoCadPlate();
    const nearEnd = hostedOpeningGeom(plate, 0, 0.01, 3, 'door');
    expect(nearEnd).not.toBeNull();
    expect(nearEnd!.t).toBeGreaterThan(0.05);
    const nearOther = hostedOpeningGeom(plate, 0, 0.99, 3, 'window');
    expect(nearOther).not.toBeNull();
    expect(nearOther!.t).toBeLessThan(0.95);
  });
});
