import type { CatalogItem, CatalogPlacementMode, PriceUnit } from '../../components/catalog/catalogData';
import { useInventoryStore } from '../../store/inventoryStore';
import { inventoryRecordSchema, type InventoryRecord } from './types';

export function slugId(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'crm';
}

export function dimensionToMeters(value: number, unit: string): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  switch (unit.toLowerCase()) {
    case 'in':
    case 'inch':
    case 'inches':
      return value * 0.0254;
    case 'ft':
    case 'feet':
      return value * 0.3048;
    case 'cm':
      return value / 100;
    case 'mm':
      return value / 1000;
    default:
      return value;
  }
}

export function catalogIdForInventory(
  row: Pick<InventoryRecord, 'sku' | 'vendorName' | 'brand'> & {
    customFields?: InventoryRecord['customFields'];
  },
): string {
  const fromCatalog = row.customFields?.catalogId;
  if (typeof fromCatalog === 'string' && fromCatalog.trim()) return fromCatalog.trim();
  const vendorId = slugId(row.vendorName || row.brand || 'crm');
  return `${vendorId}-${slugId(row.sku)}`;
}

function catalogKey(item: Pick<CatalogItem, 'id' | 'sku'>): string {
  return (item.sku ?? item.id).trim() || item.id;
}

function inventoryMatchKeys(row: InventoryRecord): string[] {
  const keys = [row.sku, row.id];
  const catalogId = row.customFields?.catalogId;
  if (typeof catalogId === 'string' && catalogId.trim()) keys.push(catalogId.trim());
  return keys.map((k) => k.toLowerCase()).filter(Boolean);
}

/** Map a Build shop CatalogItem into a Materials inventory row. */
export function catalogItemToInventoryRecord(item: CatalogItem): InventoryRecord {
  const sku = catalogKey(item);
  const stamp = new Date().toISOString();
  const [width, depth, height] = item.dims;
  return inventoryRecordSchema.parse({
    id: `inv-cat-${item.id}`,
    sku,
    name: item.name,
    vendorName: item.brand || item.vendorId || 'Build shop',
    brand: item.brand ?? '',
    model: item.model ?? '',
    category: item.category || 'other',
    subcategory: item.subcategory ?? '',
    description: item.note ?? '',
    note: item.note ?? '',
    width: width ?? 0,
    depth: depth ?? 0,
    height: height ?? 0,
    unit: 'm',
    color: item.color || '#b9b9b2',
    mountingType: item.mountingType || 'floor',
    placementSurfaces: item.placementSurfaces?.length ? item.placementSurfaces : ['floor'],
    placementMode: item.placementMode,
    roomTypes: item.roomTypes ?? [],
    tags: item.tags ?? [],
    price: item.price,
    priceUnit: item.priceUnit || 'each',
    currency: item.currency || 'USD',
    msrp: item.msrp,
    cost: item.cost,
    laborCost: item.laborCost,
    priceVerifiedAt: item.priceVerifiedAt ?? '',
    sellable: item.sellable ?? true,
    placeholderOnly: item.placeholderOnly ?? false,
    active: true,
    finish: item.finish ?? '',
    material: item.material ?? '',
    variantGroup: item.variantGroup ?? '',
    variantName: item.variantName ?? '',
    availability: item.availability ?? '',
    leadTimeDays: item.leadTimeDays,
    thumbnailUrl: item.thumbnailUrl ?? '',
    textureUrl: item.textureUrl ?? '',
    roughnessMapUrl: item.roughnessMapUrl ?? '',
    normalMapUrl: item.normalMapUrl ?? '',
    metalnessMapUrl: item.metalnessMapUrl ?? '',
    textureRepeat: item.textureRepeat && item.textureRepeat > 0 ? item.textureRepeat : undefined,
    roughness:
      item.roughness == null ? undefined : Math.min(1, Math.max(0, item.roughness)),
    modelUrl: item.modelUrl ?? '',
    lowPolyModelUrl: item.lowPolyModelUrl ?? '',
    emoji: item.emoji || '▧',
    sourceUrl: item.sourceUrl ?? '',
    sourceLabel: item.sourceLabel ?? '',
    customFields: { catalogId: item.id },
    createdAt: stamp,
    updatedAt: stamp,
    archived: false,
  });
}

/**
 * Add Build shop catalog items that are not already in Materials.
 * Matches on SKU, catalog id, or a previously seeded `inv-cat-*` row.
 * Does not overwrite existing CRM rows (including archived SKUs).
 */
export function mergeMissingCatalogIntoInventory(
  inventory: InventoryRecord[],
  catalogItems: CatalogItem[],
): InventoryRecord[] {
  const seen = new Set<string>();
  for (const row of inventory) {
    for (const key of inventoryMatchKeys(row)) seen.add(key);
  }
  const added: InventoryRecord[] = [];
  for (const item of catalogItems) {
    const sku = catalogKey(item);
    if (!sku) continue;
    const candidates = [sku, item.id, `inv-cat-${item.id}`].map((k) => k.toLowerCase());
    if (candidates.some((key) => seen.has(key))) continue;
    let rec: InventoryRecord;
    try {
      rec = catalogItemToInventoryRecord(item);
    } catch {
      continue;
    }
    added.push(rec);
    for (const key of inventoryMatchKeys(rec)) seen.add(key);
  }
  if (!added.length) return inventory;
  return [...inventory, ...added];
}

/** Map a CRM inventory record into the plan/room builder CatalogItem shape. */
export function inventoryRecordToCatalogItem(row: InventoryRecord): CatalogItem {
  const brand = row.brand || row.vendorName || undefined;
  const vendorId = slugId(row.vendorName || row.brand || 'crm');
  const width = dimensionToMeters(row.width ?? 0, row.unit || 'm');
  const depth = dimensionToMeters(row.depth ?? 0, row.unit || 'm');
  const height = dimensionToMeters(row.height ?? 0, row.unit || 'm');
  const note = row.note || row.description || undefined;
  const roomTypes = row.roomTypes ?? [];
  const tags = row.tags ?? [];
  const surfaces = row.placementSurfaces ?? [];

  return {
    id: catalogIdForInventory(row),
    sku: row.sku,
    vendorId,
    name: row.name,
    brand,
    model: row.model || undefined,
    category: row.category,
    subcategory: row.subcategory || undefined,
    roomTypes: roomTypes.length ? roomTypes : undefined,
    tags: tags.length ? tags : undefined,
    dims: [width || 0.4, depth || 0.4, height || 0.4],
    color: row.color || '#b9b9b2',
    price: row.price,
    msrp: row.msrp,
    cost: row.cost,
    laborCost: row.laborCost,
    currency: row.currency || 'USD',
    priceUnit: (row.priceUnit || 'each') as PriceUnit,
    priceVerifiedAt: row.priceVerifiedAt || undefined,
    sellable: (row.sellable ?? true) && (row.active ?? true) && !row.archived,
    placeholderOnly: row.placeholderOnly || !row.modelUrl,
    mountingType: row.mountingType || 'floor',
    placementSurfaces: surfaces.length ? surfaces : ['floor'],
    placementMode: row.placementMode as CatalogPlacementMode | undefined,
    finish: row.finish || undefined,
    material: row.material || undefined,
    variantGroup: row.variantGroup || undefined,
    variantName: row.variantName || undefined,
    availability: row.availability || undefined,
    leadTimeDays: row.leadTimeDays,
    thumbnailUrl: row.thumbnailUrl || undefined,
    textureUrl: row.textureUrl || undefined,
    roughnessMapUrl: row.roughnessMapUrl || undefined,
    normalMapUrl: row.normalMapUrl || undefined,
    metalnessMapUrl: row.metalnessMapUrl || undefined,
    textureRepeat: row.textureRepeat,
    roughness: row.roughness,
    modelUrl: row.modelUrl || undefined,
    lowPolyModelUrl: row.lowPolyModelUrl || undefined,
    emoji: row.emoji || '▧',
    sourceUrl: row.sourceUrl || undefined,
    sourceLabel: row.sourceLabel || (brand ? `${brand} product` : undefined),
    note,
  };
}

export function syncInventoryToCatalog(row: InventoryRecord): void {
  const catalogItem = inventoryRecordToCatalogItem(row);
  if (row.archived || !row.active) {
    useInventoryStore.getState().removeIds([catalogItem.id]);
    return;
  }
  useInventoryStore.getState().upsert([catalogItem], 'create-update');
}

export function removeInventoryFromCatalog(row: InventoryRecord): void {
  useInventoryStore.getState().removeIds([catalogIdForInventory(row)]);
}

export function syncAllInventoryToCatalog(rows: InventoryRecord[]): void {
  const active = rows.filter((r) => !r.archived && r.active).map(inventoryRecordToCatalogItem);
  const inactiveIds = rows
    .filter((r) => r.archived || !r.active)
    .map((r) => catalogIdForInventory(r));
  if (inactiveIds.length) useInventoryStore.getState().removeIds(inactiveIds);
  if (active.length) useInventoryStore.getState().upsert(active, 'create-update');
}

export function splitListField(value: string | undefined | null): string[] {
  if (!value?.trim()) return [];
  return value
    .split(/[|,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function optionalNumber(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') return undefined;
  const n = Number(String(value).replace(/[$,%]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  return !['false', 'no', 'n', '0'].includes(value.trim().toLowerCase());
}
