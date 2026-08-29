import { describe, expect, it } from 'vitest';
import { catalog } from '../../components/catalog/catalogData';
import { getOlsenCatalogSeed } from './catalogSource';
import meta from './olsenCatalogMeta.json';

describe('Olsen catalog seed', () => {
  it('loads baked inventory from Master Catalog package + Cost Library selection tabs', () => {
    const seed = getOlsenCatalogSeed();
    expect(seed.length).toBeGreaterThan(500);
    expect(seed.filter((i) => i.sourceLabel !== 'Kit stub').every((i) => i.id.startsWith('olsen-'))).toBe(true);
    expect(meta.sourcePackage).toBe('Olsen_Inventory_Images_and_Master_Catalog');
    expect(meta.counts.moenVariants).toBeGreaterThan(50);
  });

  it('includes Moen SKUs, roofing/pavers, and inventory product photos', () => {
    const items = getOlsenCatalogSeed();
    expect(items.some((i) => i.vendorId === 'moen' && i.sku)).toBe(true);
    expect(items.some((i) => i.subcategory === 'Roofing')).toBe(true);
    expect(items.some((i) => i.sourceTab === 'Pavers' && i.brand === 'Tremron')).toBe(true);
    expect(items.filter((i) => i.thumbnailUrl?.includes('/catalog/olsen/inventory/')).length).toBeGreaterThan(100);
  });

  it('keeps tiered countertop and tile rows for COF pricing', () => {
    const items = getOlsenCatalogSeed();
    const counter = items.find((i) => i.sourceTab === 'Countertops' && i.level === 'Level 5');
    const tile = items.find((i) => i.sourceTab === 'Tile-Floor' && i.placementMode === 'floor-fill');
    expect(counter?.priceUnit).toBe('sq ft');
    expect(counter?.cost).toBeGreaterThan(0);
    expect(tile?.textureUrl).toMatch(/^\/catalog\/floors\/pbr\//);
  });

  it('is the default exported catalog', () => {
    expect(catalog.length).toBe(getOlsenCatalogSeed().length);
  });
});
