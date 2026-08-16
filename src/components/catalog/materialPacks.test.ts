import { describe, expect, it } from 'vitest';
import { catalog } from './catalogData';
import { enrichCatalogSurfaces, MODEL_PACKS, SURFACE_PACKS } from './materialPacks';
import { residentialFurniture } from './residentialFurniture';

describe('materialPacks / realistic inventory', () => {
  it('ships CC0 surface and model pack paths', () => {
    expect(SURFACE_PACKS.oak.textureUrl).toMatch(/\/catalog\/materials\/pbr\/oak\//);
    expect(MODEL_PACKS.sofa.modelUrl).toMatch(/\/catalog\/models\/sofa\//);
  });

  it('attaches painted PBR maps to crown and baseboard', () => {
    const crown = catalog.find((i) => i.id === 'crown-molding-classic' || i.id === 'crown-molding');
    const base = catalog.find((i) => i.id === 'baseboard' || i.id === 'baseboard-tall');
    expect(crown?.textureUrl).toContain('/catalog/materials/pbr/painted/');
    expect(base?.roughnessMapUrl).toContain('painted');
  });

  it('attaches cabinet / counter materials and hero furniture GLBs', () => {
    const cab = residentialFurniture.find((i) => i.id === 'base-cab-36');
    const counter = residentialFurniture.find((i) => i.id === 'counter-run-8ft');
    const sofa = residentialFurniture.find((i) => i.id === 'sofa-three-seat');
    const table = residentialFurniture.find((i) => i.id === 'dining-table-six');
    expect(cab?.textureUrl).toMatch(/\/catalog\/materials\/pbr\//);
    expect(counter?.textureUrl).toMatch(/marble|quartz/);
    expect(sofa?.modelUrl).toBe(MODEL_PACKS.sofa.modelUrl);
    expect(table?.modelUrl).toBe(MODEL_PACKS.diningTable.modelUrl);
  });

  it('wires Quaternius bathroom fixtures and porcelain shower bases', () => {
    const toilet = residentialFurniture.find((i) => i.id === 'toilet-standard');
    const tub = residentialFurniture.find((i) => i.id === 'freestanding-tub');
    const sink = residentialFurniture.find((i) => i.id === 'bathroom-pedestal-sink');
    const enclosure = residentialFurniture.find((i) => i.id === 'shower-enclosure-36');
    const base = residentialFurniture.find((i) => i.id === 'shower-base-36');
    expect(toilet?.modelUrl).toBe(MODEL_PACKS.toilet.modelUrl);
    expect(tub?.modelUrl).toBe(MODEL_PACKS.bathtub.modelUrl);
    expect(sink?.modelUrl).toBe(MODEL_PACKS.sink.modelUrl);
    expect(enclosure?.modelUrl).toBe(MODEL_PACKS.shower.modelUrl);
    expect(base?.textureUrl).toContain('/catalog/materials/pbr/porcelain/');
  });

  it('does not overwrite an existing textureUrl', () => {
    const item = enrichCatalogSurfaces([
      {
        id: 'base-cab-36',
        name: 'Base Cabinet',
        category: 'Cabinetry',
        color: '#ffffff',
        textureUrl: '/custom/keep.jpg',
      },
    ])[0];
    expect(item.textureUrl).toBe('/custom/keep.jpg');
  });
});
