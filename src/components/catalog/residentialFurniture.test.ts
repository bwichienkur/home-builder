import { describe, expect, it } from 'vitest';
import { catalog, starterInventoryItems } from './catalogData';
import { residentialFurniture } from './residentialFurniture';

describe('residential furniture pack', () => {
  it('includes beds, dining, cabinets, counters, consoles, and trim', () => {
    const ids = new Set(residentialFurniture.map((i) => i.id));
    for (const id of [
      'king-platform-bed',
      'dining-table-six',
      'dining-side-chair',
      'console-entry',
      'base-cab-36',
      'counter-run-8ft',
      'crown-molding-classic',
      'sofa-three-seat',
      'media-console',
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('uses positive metric dimensions in realistic ranges', () => {
    for (const item of residentialFurniture) {
      const [w, d, h] = item.dims;
      expect(w).toBeGreaterThan(0.01);
      expect(d).toBeGreaterThan(0.01);
      expect(h).toBeGreaterThan(0.01);
      // Nothing larger than a big sectional / island footprint
      expect(w).toBeLessThan(6);
      expect(d).toBeLessThan(5);
      expect(h).toBeLessThan(3.5);
    }
  });

  it('is merged into the placeable catalog', () => {
    expect(catalog.some((i) => i.id === 'dining-table-eight')).toBe(true);
    expect(catalog.length).toBeGreaterThan(100);
  });

  it('seeds inventory with Roomcraft Home vendor metadata', () => {
    const starter = starterInventoryItems();
    expect(starter.length).toBe(residentialFurniture.length);
    expect(starter.every((i) => i.vendorId === 'roomcraft-home')).toBe(true);
    expect(starter.every((i) => i.sku)).toBe(true);
  });
});
