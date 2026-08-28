import type { CatalogItem } from '../../components/catalog/catalogData';
import type { FurnitureItem, PlanRoomLabel } from '../../types';
import type { ExtendedSelectionProject } from './projectTypes';
import { baseItemName, formatCatalogPrice, pricingCategoryForItem } from './deltaPricing';
import { computeProjectRollup } from './roomRollups';

export type BtSelectionRow = {
  trade: string;
  room: string;
  title: string;
  description: string;
  sku?: string;
  qty: number;
  unit: string;
  clientPrice?: number;
  status: 'pending' | 'approved' | 'declined';
  notes?: string;
};

const TAB_TO_TRADE: Record<string, string> = {
  Countertops: 'Countertops',
  'Tile-Floor': 'Tile',
  'Tile-Wall': 'Tile',
  'Tile - Backsplash': 'Tile',
  'Tile - Pan': 'Tile',
  Plumbing: 'Plumbing',
  'Shaker Drs': 'Cabinetry',
  'Interior Doors': 'Doors',
  'PGT Windows': 'Windows',
  'Trim Material': 'Trim',
  Stone: 'Masonry',
  'Stone-Eldorado': 'Masonry',
  Pavers: 'Hardscape',
  'Summer Kitchen': 'Outdoor',
};

export function buildBtSelectionRows(input: {
  project: ExtendedSelectionProject;
  catalog: CatalogItem[];
  furniture: FurnitureItem[];
  planRooms: PlanRoomLabel[];
}): BtSelectionRow[] {
  const rollup = computeProjectRollup({
    catalog: input.catalog,
    contract: input.project.contract,
    furniture: input.furniture,
    planRooms: input.planRooms,
    takeoff: input.project.takeoff,
    allowances: input.project.allowances,
    levelOverrides: input.project.levelOverrides,
    role: 'designer',
  });

  const rows: BtSelectionRow[] = [];
  for (const line of rollup.roomLines) {
    const product = input.catalog.find((p) => baseItemName(p.name) === line.description);
    rows.push({
      trade: TAB_TO_TRADE[product?.sourceTab ?? ''] ?? String(line.category),
      room: line.roomName,
      title: line.description,
      description: product?.note ?? line.description,
      sku: product?.sku,
      qty: line.qty,
      unit: line.unit,
      clientPrice: line.included ? 0 : line.lineDelta,
      status: 'pending',
    });
  }
  return rows.sort((a, b) => a.trade.localeCompare(b.trade) || a.room.localeCompare(b.room));
}

export function btSelectionsCsv(rows: BtSelectionRow[]): string {
  const header = 'Trade,Room,Title,Description,SKU,Qty,Unit,Client upgrade $,Status';
  const body = rows.map((r) =>
    [r.trade, r.room, r.title, r.description, r.sku ?? '', r.qty, r.unit, r.clientPrice ?? '', r.status]
      .map((v) => `"${String(v).replaceAll('"', '""')}"`)
      .join(','),
  );
  return [header, ...body].join('\n');
}

export function downloadBtSelectionsCsv(rows: BtSelectionRow[], filename = 'buildertrend-selections.csv') {
  const blob = new Blob([btSelectionsCsv(rows)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function tradeGroupedSummary(rows: BtSelectionRow[]): { trade: string; count: number; upgradeTotal: number }[] {
  const map = new Map<string, { trade: string; count: number; upgradeTotal: number }>();
  for (const row of rows) {
    const prev = map.get(row.trade) ?? { trade: row.trade, count: 0, upgradeTotal: 0 };
    prev.count += 1;
    prev.upgradeTotal += row.clientPrice ?? 0;
    map.set(row.trade, prev);
  }
  return Array.from(map.values());
}
