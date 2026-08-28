import { describe, expect, it } from 'vitest';
import { getOlsenCatalogSeed } from '../catalog/catalogSource';
import { enrichOlsenCatalog, enrichOlsenCatalogItem, heroModelsForOlsenItem } from './olsenHeroModels';

describe('olsen hero models', () => {
  it('assigns bathroom fixtures for plumbing tab rows', () => {
    const seed = getOlsenCatalogSeed();
    const plumbing = seed.filter((i) => i.sourceTab === 'Plumbing');
    expect(plumbing.length).toBeGreaterThan(0);
    const tub = plumbing.find((i) => /tub|bath/i.test(i.name));
    if (tub) {
      const hero = heroModelsForOlsenItem(tub);
      expect(hero?.modelUrl).toContain('/catalog/models/bathroom/');
    }
  });

  it('assigns cabinet GLBs to shaker-like rows without floor-fill', () => {
    const sample = {
      name: 'Maple raised panel base cabinet',
      category: 'Cabinetry',
      sourceTab: 'Shaker Drs',
      subcategory: 'Shaker doors',
    };
    const hero = heroModelsForOlsenItem(sample);
    expect(hero?.modelUrl).toMatch(/quaternius\/cabinet/);
  });

  it('does not add models to floor-fill tile rows', () => {
    const seed = getOlsenCatalogSeed();
    const tile = seed.find((i) => i.sourceTab === 'Tile-Floor' && i.placementMode === 'floor-fill');
    expect(tile).toBeTruthy();
    const enriched = enrichOlsenCatalogItem(tile!);
    expect(enriched.modelUrl).toBeUndefined();
  });
});
