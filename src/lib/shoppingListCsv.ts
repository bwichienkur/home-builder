import type { CatalogItem } from '../components/catalog/catalogData';
import { roomArea } from './geometry/rooms';
import { PIXELS_PER_METER } from './geometry/snapping';
import type { FurnitureItem, PlanRoomLabel } from '../types';

const M_TO_FT = 1 / 0.3048;
const M2_TO_SQFT = M_TO_FT * M_TO_FT;

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
    items
      .filter((item) => item.placementKind !== 'stair')
      .reduce<Record<string, BomRow>>((all, item) => {
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

  const finishRows: BomRow[] = [];
  for (const room of planRooms.filter((r) => r.floorCatalogId || r.floorName)) {
    const product = catalog.find((p) => p.id === room.floorCatalogId);
    if (!product && !room.floorName) continue;
    const areaM2 = roomArea(room.points);
    finishRows.push({
      key: `floor-${room.id}-${room.floorCatalogId ?? 'custom'}`,
      name: room.floorName ?? product?.name ?? 'Floor finish',
      brand: product?.brand,
      sku: product?.sku ?? room.floorCatalogId,
      category: product?.category ?? 'Surfaces',
      qty: areaM2 * M2_TO_SQFT,
      unit: product?.priceUnit ?? 'sq ft',
      price: product?.price,
    });
  }

  for (const room of planRooms) {
    for (const [catalogId, kind, fallbackName] of [
      [room.wallCatalogId, 'wall', 'Wall finish'] as const,
      [room.ceilingCatalogId, 'ceiling', 'Ceiling finish'] as const,
    ]) {
      if (!catalogId) continue;
      const product = catalog.find((p) => p.id === catalogId);
      if (!product) continue;
      const areaM2 = roomArea(room.points);
      const perimeterM = room.points.reduce((sum, p, i) => {
        const q = room.points[(i + 1) % room.points.length]!;
        return sum + Math.hypot(q.x - p.x, q.y - p.y) / PIXELS_PER_METER;
      }, 0);
      const qty = kind === 'ceiling' ? areaM2 * M2_TO_SQFT : perimeterM * 2.74 * M2_TO_SQFT;
      finishRows.push({
        key: `${kind}-${room.id}-${catalogId}`,
        name: product.name || fallbackName,
        brand: product.brand,
        sku: product.sku ?? catalogId,
        category: product.category ?? (kind === 'ceiling' ? 'Ceiling' : 'Paint'),
        qty,
        unit: product.priceUnit ?? 'sq ft',
        price: product.price,
      });
    }
  }

  return [...productRows, ...finishRows];
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
