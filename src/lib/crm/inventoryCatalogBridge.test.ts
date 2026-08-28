import { beforeEach, describe, expect, it } from 'vitest';
import { useInventoryStore } from '../../store/inventoryStore';
import { catalog, type CatalogItem } from '../../components/catalog/catalogData';
import {
  catalogIdForInventory,
  catalogItemToInventoryRecord,
  dimensionToMeters,
  inventoryRecordToCatalogItem,
  mergeMissingCatalogIntoInventory,
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
  const base: InventoryRecord = {
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
    priceVerifiedAt: '',
    sellable: true,
    placeholderOnly: false,
    active: true,
    finish: 'Honed',
    material: 'Travertine',
    variantGroup: '',
    variantName: '',
    availability: 'In stock',
    thumbnailUrl: '/catalog/thumbs/floor-tile.svg',
    textureUrl: '/catalog/floors/pbr/stone-tile-color.jpg',
    roughnessMapUrl: '/catalog/floors/pbr/stone-tile-rough.jpg',
    normalMapUrl: '/catalog/floors/pbr/stone-tile-normal.jpg',
    metalnessMapUrl: '',
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
  };
  return { ...base, ...partial };
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
    expect(item.textureUrl).toContain('stone-tile-color');
    expect(item.roughnessMapUrl).toContain('stone-tile-rough');
    expect(item.normalMapUrl).toContain('stone-tile-normal');
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

  it('maps a Build catalog item into a Materials inventory row', () => {
    const item: CatalogItem = {
      id: 'nord-chair',
      name: 'Nord Dining Chair',
      category: 'Seating',
      dims: [0.52, 0.56, 0.82],
      color: '#b26c45',
      price: 129,
      emoji: '🪑',
      mountingType: 'floor',
      placementSurfaces: ['floor'],
    };
    const row = catalogItemToInventoryRecord(item);
    expect(row.sku).toBe('nord-chair');
    expect(row.width).toBeCloseTo(0.52, 4);
    expect(row.unit).toBe('m');
    expect(row.customFields.catalogId).toBe('nord-chair');
    expect(catalogIdForInventory(row)).toBe('nord-chair');
  });

  it('seeds missing Build shop items into Materials without overwriting CRM edits', () => {
    const chair: CatalogItem = {
      id: 'nord-chair',
      sku: 'NORD-CHAIR',
      name: 'Nord Dining Chair',
      category: 'Seating',
      dims: [0.52, 0.56, 0.82],
      color: '#b26c45',
      emoji: '🪑',
    };
    const lamp: CatalogItem = {
      id: 'floor-lamp',
      name: 'Arc Floor Lamp',
      category: 'Lighting',
      dims: [0.45, 0.45, 1.75],
      color: '#333a36',
      emoji: '◉',
    };
    const existing = sample({ sku: 'NORD-CHAIR', name: 'Client chair — do not overwrite' });
    const merged = mergeMissingCatalogIntoInventory([existing], [chair, lamp]);
    expect(merged).toHaveLength(2);
    expect(merged[0].name).toBe('Client chair — do not overwrite');
    expect(merged[1].sku).toBe('floor-lamp');
    expect(merged[1].name).toBe('Arc Floor Lamp');
    expect(mergeMissingCatalogIntoInventory(merged, [chair, lamp])).toHaveLength(2);
  });

  it('does not re-seed an archived catalog SKU', () => {
    const chair: CatalogItem = {
      id: 'nord-chair',
      name: 'Nord Dining Chair',
      category: 'Seating',
      dims: [0.52, 0.56, 0.82],
      color: '#b26c45',
      emoji: '🪑',
    };
    const archived = sample({ sku: 'nord-chair', archived: true, name: 'Hidden chair' });
    const merged = mergeMissingCatalogIntoInventory([archived], [chair]);
    expect(merged).toHaveLength(1);
    expect(merged[0].archived).toBe(true);
  });

  it('seeds the built-in Olsen catalog into Materials', () => {
    const merged = mergeMissingCatalogIntoInventory([], catalog);
    expect(merged.length).toBe(catalog.length);
    expect(merged.some((row) => row.sku?.startsWith('C'))).toBe(true);
    expect(merged.some((row) => row.category === 'Tile' || row.category === 'Surfaces')).toBe(true);
  });
});
