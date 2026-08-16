import type { CatalogItem } from '../components/catalog/catalogData';
import { roomArea } from './geometry/rooms';
import type { FurnitureItem, PlanRoomLabel } from '../types';

const M_TO_FT = 1 / 0.3048;

type BomRow = {
  key: string;
  name: string;
  brand?: string;
  sku?: string;
  category: string;
  qty: number;
  unit?: string;
  price?: number;
};

function lineQty(item: FurnitureItem, product?: CatalogItem) {
  if (product?.priceUnit === 'linear ft' || item.placementKind === 'perimeter-trim') {
    return item.width * M_TO_FT;
  }
  return 1;
}

function formatQty(qty: number, unit?: string) {
  if (unit === 'linear ft' || unit === 'sq ft') return qty.toFixed(1);
  return String(Math.round(qty * 100) / 100);
}

type DesignFloorLike = {
  planRooms?: PlanRoomLabel[];
  scene?: { furniture?: FurnitureItem[]; planRooms?: PlanRoomLabel[] };
};

/** Accept saved-build payloads whose floors are typed loosely (`unknown[]`). */
type DesignPayloadLike = { floors?: DesignFloorLike[] | unknown[] };

function collectFromPayload(payload: DesignPayloadLike) {
  const items: FurnitureItem[] = [];
  const planRooms: PlanRoomLabel[] = [];
  for (const floor of (payload.floors ?? []) as DesignFloorLike[]) {
    items.push(...(floor.scene?.furniture ?? []));
    planRooms.push(...(floor.planRooms ?? floor.scene?.planRooms ?? []));
  }
  return { items, planRooms };
}

export function buildShoppingListRows(payload: DesignPayloadLike, catalog: CatalogItem[]): BomRow[] {
  const { items, planRooms } = collectFromPayload(payload);

  const productRows = Object.values(
    items.reduce<Record<string, BomRow>>((all, item) => {
      const product = catalog.find((p) => p.id === item.catalogId);
      const add = lineQty(item, product);
      const row = all[item.catalogId];
      if (row) row.qty += add;
      else
        all[item.catalogId] = {
          key: item.catalogId,
          name: item.name,
          brand: product?.brand,
          sku: product?.sku ?? item.catalogId,
          category: item.category,
          qty: add,
          unit: product?.priceUnit ?? 'each',
          price: product?.price,
        };
      return all;
    }, {}),
  );

  const floorRows: BomRow[] = [];
  for (const room of planRooms.filter((r) => r.floorCatalogId || r.floorName)) {
    const product = catalog.find((p) => p.id === room.floorCatalogId);
    if (!product && !room.floorName) continue;
    const areaM2 = roomArea(room.points);
    floorRows.push({
      key: `floor-${room.id}-${room.floorCatalogId ?? 'custom'}`,
      name: room.floorName ?? product?.name ?? 'Floor finish',
      brand: product?.brand,
      sku: product?.sku ?? room.floorCatalogId,
      category: product?.category ?? 'Surfaces',
      qty: areaM2 * M_TO_FT * M_TO_FT,
      unit: product?.priceUnit ?? 'sq ft',
      price: product?.price,
    });
  }

  return [...productRows, ...floorRows];
}

export function shoppingListCsvFromDesign(payload: DesignPayloadLike, catalog: CatalogItem[]) {
  const rows = buildShoppingListRows(payload, catalog);
  return [
    'Vendor,SKU,Product,Category,Quantity,Unit,Unit price,Subtotal,Price status',
    ...rows.map((row) =>
      [
        row.brand ?? '',
        row.sku ?? row.key,
        row.name,
        row.category,
        formatQty(row.qty, row.unit),
        row.unit ?? 'each',
        row.price ?? '',
        row.price != null ? (row.price * row.qty).toFixed(2) : '',
        row.price == null ? 'Quote required' : 'Reference price',
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(','),
    ),
  ].join('\n');
}

export function downloadTextFile(filename: string, contents: string, mime = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contents], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
