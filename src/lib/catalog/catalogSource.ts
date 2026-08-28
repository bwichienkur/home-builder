import type { CatalogItem, CatalogPlacementMode, PriceUnit } from '../../components/catalog/catalogData';
import olsenSeed from './olsenCatalogSeed.json';

export type ApiCatalogProduct = {
  id: string;
  vendorId?: string;
  brand?: string;
  sku?: string;
  name: string;
  category: string;
  subcategory?: string;
  dimensions?: { width?: number; depth?: number; height?: number; unit?: string };
  color?: string;
  finish?: string;
  material?: string;
  sellable?: boolean;
  placeholderOnly?: boolean;
  mountingType?: string;
  placementSurfaces?: string[];
  placementMode?: string;
  level?: string;
  sourceTab?: string;
  section?: string;
  textureUrl?: string;
  roughnessMapUrl?: string;
  normalMapUrl?: string;
  textureRepeat?: number;
  roughness?: number;
  sourceUrl?: string;
  price?: number;
  currency?: string;
  priceUnit?: string;
  priceVerifiedAt?: string;
  thumbnailUrl?: string;
  modelUrl?: string;
  lowPolyModelUrl?: string;
  roomTypes?: string[];
};

const METER_UNITS = new Set(['m', 'meter', 'meters']);

function toMeters(value: number, unit?: string) {
  const u = String(unit ?? 'm').toLowerCase();
  if (u === 'in' || u === 'inch' || u === 'inches') return value * 0.0254;
  if (u === 'ft' || u === 'feet') return value * 0.3048;
  if (u === 'cm') return value / 100;
  if (u === 'mm') return value / 1000;
  return value;
}

export function mapApiProductToCatalogItem(row: ApiCatalogProduct): CatalogItem {
  const dims = row.dimensions ?? {};
  const unit = dims.unit ?? 'm';
  const width = dims.width ?? 0.6;
  const depth = dims.depth ?? 0.6;
  const height = dims.height ?? 0.6;
  const inMeters = METER_UNITS.has(unit.toLowerCase());
  const w = inMeters ? width : toMeters(width, unit);
  const d = inMeters ? depth : toMeters(depth, unit);
  const h = inMeters ? height : toMeters(height, unit);

  return {
    id: row.id,
    sku: row.sku,
    vendorId: row.vendorId,
    name: row.name,
    brand: row.brand,
    category: row.category,
    subcategory: row.subcategory,
    roomTypes: row.roomTypes,
    dims: [w, d, h],
    color: row.color ?? '#b9b9b2',
    price: row.price,
    cost: row.price,
    currency: row.currency ?? 'USD',
    priceUnit: (row.priceUnit ?? 'each') as PriceUnit,
    priceVerifiedAt: row.priceVerifiedAt,
    sellable: row.sellable ?? true,
    placeholderOnly: row.placeholderOnly ?? !row.modelUrl,
    mountingType: row.mountingType ?? 'floor',
    placementSurfaces: row.placementSurfaces ?? ['floor'],
    placementMode: row.placementMode as CatalogItem['placementMode'],
    level: row.level,
    sourceTab: row.sourceTab,
    section: row.section,
    textureUrl: row.textureUrl,
    roughnessMapUrl: row.roughnessMapUrl,
    normalMapUrl: row.normalMapUrl,
    textureRepeat: row.textureRepeat,
    roughness: row.roughness,
    finish: row.finish,
    material: row.material,
    thumbnailUrl: row.thumbnailUrl,
    modelUrl: row.modelUrl,
    lowPolyModelUrl: row.lowPolyModelUrl,
    sourceUrl: row.sourceUrl,
    emoji: '▧',
  };
}

/** Baked Olsen selections from Cost Library (offline / no DATABASE_URL). */
export function getOlsenCatalogSeed(): CatalogItem[] {
  return olsenSeed as CatalogItem[];
}

export function mergeCatalogItems(base: CatalogItem[], overlay: CatalogItem[]): CatalogItem[] {
  const byKey = new Map(base.map((item) => [catalogMergeKey(item), item]));
  for (const item of overlay) {
    byKey.set(catalogMergeKey(item), { ...byKey.get(catalogMergeKey(item)), ...item });
  }
  return Array.from(byKey.values());
}

export function catalogMergeKey(item: Pick<CatalogItem, 'id' | 'vendorId' | 'sku'>): string {
  if (item.vendorId && item.sku) return `${item.vendorId}|${item.sku}`;
  return item.id;
}

/** Resolve merged catalog: seed → API overlay → local inventory. */
export function buildCatalogView(
  seed: CatalogItem[],
  apiItems: CatalogItem[],
  inventory: CatalogItem[],
): CatalogItem[] {
  let items = seed.length ? [...seed] : [];
  if (apiItems.length) items = mergeCatalogItems(items, apiItems);
  if (inventory.length) {
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const item of inventory) byId.set(item.id, item);
    items = Array.from(byId.values());
  }
  return items;
}

export type CatalogCategory =
  | 'All'
  | 'Flooring'
  | 'Appliances'
  | 'Cabinetry'
  | 'Surfaces'
  | 'Tile'
  | 'Plumbing'
  | 'Paneling'
  | 'Trim'
  | 'Seating'
  | 'Tables'
  | 'Storage'
  | 'Bedroom'
  | 'Lighting'
  | 'Decor'
  | 'Textiles'
  | 'Doors'
  | 'Windows'
  | 'Exterior'
  | 'Specialties';

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  'All',
  'Flooring',
  'Appliances',
  'Cabinetry',
  'Surfaces',
  'Tile',
  'Plumbing',
  'Paneling',
  'Trim',
  'Doors',
  'Windows',
  'Exterior',
  'Specialties',
  'Seating',
  'Tables',
  'Storage',
  'Bedroom',
  'Lighting',
  'Decor',
  'Textiles',
];

export const DEFAULT_PLACEMENT_BY_CATEGORY: Partial<
  Record<string, { placementMode?: CatalogPlacementMode; mountingType?: string; surfaces?: string[] }>
> = {
  Tile: { placementMode: 'floor-fill', mountingType: 'floor', surfaces: ['floor'] },
  Surfaces: { placementMode: 'floor-fill', mountingType: 'floor', surfaces: ['floor'] },
  Trim: { placementMode: 'floor-perimeter', mountingType: 'floor', surfaces: ['floor'] },
};
