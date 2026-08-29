import { describe, expect, it } from 'vitest';
import { catalog } from '../../components/catalog/catalogData';
import { getOlsenCatalogSeed } from './catalogSource';

describe('Olsen catalog seed', () => {
  it('loads baked selections from Cost Library', () => {
    const seed = getOlsenCatalogSeed();
    expect(seed.length).toBeGreaterThan(500);
    const costLibrary = seed.filter((i) => i.id.startsWith('olsen-'));
    const kitStubs = seed.filter((i) => i.id.startsWith('kit-'));
    expect(costLibrary.length).toBeGreaterThan(500);
    expect(kitStubs.length).toBeGreaterThan(0);
    expect(costLibrary.every((i) => i.sku?.startsWith('C'))).toBe(true);
    expect(kitStubs.every((i) => i.sku?.startsWith('KIT-'))).toBe(true);
  });

  it('includes tiered countertop and tile rows with placement metadata', () => {
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
