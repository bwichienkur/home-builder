import { beforeEach, describe, expect, it } from 'vitest';
import { useInventoryStore } from '../../store/inventoryStore';
import {
  catalogIdForInventory,
  dimensionToMeters,
  inventoryRecordToCatalogItem,
  syncInventoryToCatalog,
} from './inventoryCatalogBridge';
import type { InventoryRecord } from './types';

function installMemoryLocalStorage() {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => {
        map.set(k, String(v));
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => map.clear(),
    },
    configurable: true,
  });
}

function sample(partial: Partial<InventoryRecord> = {}): InventoryRecord {
  return {
    id: 'inv-1',
    sku: 'TILE-01',
    name: 'Stone Tile',
    vendorName: 'ITS',
    brand: 'International Tile',
    model: '18x18',
    category: 'Tile',
    subcategory: 'Travertine',
    description: 'Floor tile',
    note: 'Tap room to fill',
    width: 18,
    depth: 0.5,
    height: 18,
    unit: 'in',
    color: '#cdb58d',
    mountingType: 'floor',
    placementSurfaces: ['floor'],
    placementMode: 'floor-fill',
    roomTypes: ['Kitchen', 'Bathroom'],
    tags: ['tile', 'floor'],
    price: 12.5,
    priceUnit: 'sq ft',
    currency: 'USD',
    sellable: true,
    placeholderOnly: false,
    active: true,
    finish: 'Honed',
    material: 'Travertine',
    variantGroup: '',
    variantName: '',
    availability: 'In stock',
    thumbnailUrl: '/catalog/thumbs/floor-tile.svg',
    textureUrl: '/catalog/floors/tile-hex-stone.svg',
    textureRepeat: 0.45,
    modelUrl: '',
    lowPolyModelUrl: '',
    emoji: '▦',
    sourceUrl: '',
    sourceLabel: '',
    customFields: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archived: false,
    ...partial,
  };
}

describe('inventoryCatalogBridge', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    useInventoryStore.getState().clear();
  });

  it('converts inches to meters for builder dims', () => {
    expect(dimensionToMeters(18, 'in')).toBeCloseTo(0.4572, 4);
  });

  it('maps CRM inventory into CatalogItem placement fields', () => {
    const item = inventoryRecordToCatalogItem(sample());
    expect(item.id).toBe(catalogIdForInventory(sample()));
    expect(item.placementMode).toBe('floor-fill');
    expect(item.priceUnit).toBe('sq ft');
    expect(item.roomTypes).toEqual(['Kitchen', 'Bathroom']);
    expect(item.dims[0]).toBeCloseTo(0.4572, 4);
    expect(item.textureUrl).toContain('tile-hex');
    expect(item.mountingType).toBe('floor');
  });

  it('syncs active inventory into the Build catalog store', () => {
    syncInventoryToCatalog(sample());
    const items = useInventoryStore.getState().items;
    expect(items.some((i) => i.sku === 'TILE-01' && i.placementMode === 'floor-fill')).toBe(true);
  });

  it('removes archived inventory from the Build catalog store', () => {
    syncInventoryToCatalog(sample());
    syncInventoryToCatalog(sample({ archived: true }));
    expect(useInventoryStore.getState().items.some((i) => i.sku === 'TILE-01')).toBe(false);
  });
});
