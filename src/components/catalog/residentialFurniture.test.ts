import { describe, expect, it } from 'vitest';
import { catalog, starterInventoryItems } from './catalogData';
import { residentialFlooring } from './residentialFlooring';
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

  it('wires CC0 models or materials on hero residential SKUs', () => {
    const sofa = residentialFurniture.find((i) => i.id === 'sofa-three-seat');
    const cab = residentialFurniture.find((i) => i.id === 'base-cab-36');
    expect(sofa?.modelUrl).toMatch(/\/catalog\/models\//);
    expect(cab?.modelUrl).toMatch(/\/catalog\/models\/quaternius\//);
  });

  it('includes floor-fill flooring finishes with visible textures', () => {
    const floors = residentialFlooring.filter((i) => i.category === 'Flooring' && i.placementMode === 'floor-fill');
    expect(floors.length).toBeGreaterThanOrEqual(8);
    for (const id of ['floor-oak-hardwood', 'floor-ash-laminate', 'floor-concrete-polished', 'floor-tile-ceramic-white']) {
      const item = residentialFlooring.find((i) => i.id === id);
      expect(item?.textureUrl).toMatch(/^\/catalog\/floors\/pbr\/.+\.jpe?g$/i);
      expect(item?.roughnessMapUrl).toMatch(/^\/catalog\/floors\/pbr\//);
      expect(item?.thumbnailUrl).toBeTruthy();
      expect(item?.priceUnit).toBe('sq ft');
    }
    const oak = residentialFlooring.find((i) => i.id === 'floor-oak-hardwood');
    expect(oak?.normalMapUrl).toMatch(/oak-normal/);
  });

  it('uses positive metric dimensions in realistic ranges', () => {
    for (const item of residentialFurniture) {
      const [w, d, h] = item.dims;
      expect(w).toBeGreaterThan(0.01);
      expect(d).toBeGreaterThan(0.01);
      expect(h).toBeGreaterThan(0.01);
      expect(w).toBeLessThan(6);
      expect(d).toBeLessThan(5);
      expect(h).toBeLessThan(3.5);
    }
  });

  it('exposes the Olsen catalog as the default Build catalog', () => {
    expect(catalog.some((i) => i.id.startsWith('olsen-'))).toBe(true);
    expect(catalog.some((i) => i.level?.startsWith('Level'))).toBe(true);
    expect(catalog.length).toBeGreaterThan(500);
  });

  it('no longer auto-seeds legacy Roomcraft Home inventory', () => {
    expect(starterInventoryItems()).toEqual([]);
  });
});
