import * as XLSX from 'xlsx';
import type { CatalogItem } from '../../components/catalog/catalogData';
import type { FurnitureItem, PlanRoomLabel } from '../../types';
import { roomArea } from '../geometry/rooms';
import type { ContractSnapshot, SelectionProject } from './contractTypes';
import { baseItemName, formatCatalogPrice } from './deltaPricing';

const M2_TO_SQFT = (1 / 0.3048) ** 2;

export type CofSelectionRow = {
  area: string;
  type: string;
  detail?: string;
  productName: string;
  level?: string;
  included?: boolean;
  qty: number;
  unit: string;
  unitPrice?: number;
  total?: number;
  includedAmount?: number;
  difference?: number;
  chargeHomeowner?: number;
  notes?: string;
};

export type CofExportInput = {
  project: SelectionProject;
  contract: ContractSnapshot;
  catalog: CatalogItem[];
  furniture: FurnitureItem[];
  planRooms: PlanRoomLabel[];
};

function tabToCofSheet(sourceTab?: string): string | null {
  const map: Record<string, string> = {
    Countertops: 'Countertops',
    'Tile-Floor': 'Tile-Floor',
    'Tile-Wall': 'Tile-Wall',
    'Tile - Backsplash': 'Tile-Floor',
    'Tile - Pan': 'Tile-Floor',
    Plumbing: 'Plumbing',
    'Shaker Drs': 'Cabinets',
    'Upgrade Shaker Drs': 'Cabinets',
    'Interior Doors': 'Options',
    'PGT Windows': 'Options',
    'Summer Kitchen': 'Summer Kitchen',
    Pavers: 'Pavers',
    Stone: 'Stone',
    'Stone-Eldorado': 'Stone',
    'Trim Material': 'Trim',
  };
  return sourceTab ? map[sourceTab] ?? 'Options' : null;
}

function aggregateProductRows(
  furniture: FurnitureItem[],
  catalog: CatalogItem[],
  contract: ContractSnapshot,
): CofSelectionRow[] {
  const byKey = new Map<string, CofSelectionRow>();
  for (const item of furniture.filter((f) => f.placementKind !== 'stair')) {
    const product = catalog.find((p) => p.id === item.catalogId);
    if (!product) continue;
    const key = product.id;
    const qty = 1;
    const priceView = formatCatalogPrice(product, catalog, contract, 'designer');
    const unitPrice = product.price ?? product.cost;
    const existing = byKey.get(key);
    if (existing) {
      existing.qty += qty;
      if (unitPrice != null) existing.total = (existing.total ?? 0) + unitPrice * qty;
      if (priceView.delta) existing.difference = (existing.difference ?? 0) + priceView.delta * qty;
    } else {
      byKey.set(key, {
        area: product.roomTypes?.[0] ?? 'Selection',
        type: product.subcategory ?? product.category,
        detail: product.section,
        productName: baseItemName(product.name),
        level: product.level,
        included: priceView.included,
        qty,
        unit: product.priceUnit ?? 'each',
        unitPrice: unitPrice ?? undefined,
        total: unitPrice != null ? unitPrice * qty : undefined,
        difference: priceView.delta != null ? priceView.delta * qty : priceView.included ? 0 : undefined,
        chargeHomeowner: priceView.included ? 0 : priceView.delta,
        notes: product.sku,
      });
    }
  }
  return Array.from(byKey.values());
}

function floorRows(planRooms: PlanRoomLabel[], catalog: CatalogItem[], contract: ContractSnapshot): CofSelectionRow[] {
  const rows: CofSelectionRow[] = [];
  for (const room of planRooms) {
    if (!room.floorCatalogId) continue;
    const product = catalog.find((p) => p.id === room.floorCatalogId);
    if (!product) continue;
    const qty = roomArea(room.points) * M2_TO_SQFT;
    const priceView = formatCatalogPrice(product, catalog, contract, 'designer');
    const unitPrice = product.price ?? product.cost;
    rows.push({
      area: room.name || room.roomType || 'Room',
      type: product.subcategory ?? 'Floor tile',
      productName: baseItemName(product.name),
      level: product.level,
      included: priceView.included,
      qty: Math.round(qty * 10) / 10,
      unit: product.priceUnit ?? 'sq ft',
      unitPrice: unitPrice ?? undefined,
      total: unitPrice != null ? Math.round(unitPrice * qty * 100) / 100 : undefined,
      difference: priceView.delta != null ? Math.round(priceView.delta * qty * 100) / 100 : priceView.included ? 0 : undefined,
      chargeHomeowner: priceView.included ? 0 : priceView.delta,
      notes: product.sku,
    });
  }
  return rows;
}

export function buildCofRows(input: CofExportInput): Record<string, CofSelectionRow[]> {
  const productRows = aggregateProductRows(input.furniture, input.catalog, input.contract);
  const floors = floorRows(input.planRooms, input.catalog, input.contract);
  const sheets: Record<string, CofSelectionRow[]> = {};

  for (const row of [...productRows, ...floors]) {
    const product = input.catalog.find((p) => p.sku === row.notes || baseItemName(p.name) === row.productName);
    const sheet = tabToCofSheet(product?.sourceTab) ?? 'Options';
    if (!sheets[sheet]) sheets[sheet] = [];
    sheets[sheet].push(row);
  }
  return sheets;
}

function sheetHeaderRows(project: SelectionProject, sheetName: string): unknown[][] {
  return [
    [project.name, '', '', ''],
    [project.lotRef ?? project.planRef, '', '', ''],
    ['', '', '', ''],
    ['Customer Option Form — exported from RoomCraft', '', '', ''],
    ['Sheet', sheetName, 'Contract', project.contract.baseline],
    ['', '', '', ''],
  ];
}

function countertopsHeader(): string[] {
  return ['', 'Area', 'Type', 'Detail', 'Product Name', 'Level', 'Included?', 'Notes', 'Qty', 'Units', '$ / Unit', 'Olsen Total', 'Included', 'Difference', 'Charge HO'];
}

function tileFloorHeader(): string[] {
  return ['Area/Room', 'Type', 'Level', 'Product Name', 'Notes', 'Qty', 'Units', '$ / Unit', 'Olsen Total', 'Included', 'Difference', 'Charge HO'];
}

function optionsHeader(): string[] {
  return ['', 'Category', 'Description', 'Level', 'Final price', 'Difference', 'Included?', 'SKU'];
}

function rowToCountertops(row: CofSelectionRow): unknown[] {
  return ['', row.area, row.type, row.detail ?? '', row.productName, row.level ?? '', row.included ? 'Yes' : 'No', row.notes ?? '', row.qty, row.unit, row.unitPrice ?? '', row.total ?? '', row.included ? row.total ?? 0 : '', row.difference ?? '', row.chargeHomeowner ?? ''];
}

function rowToTileFloor(row: CofSelectionRow): unknown[] {
  return [row.area, row.type, row.level ?? '', row.productName, row.notes ?? '', row.qty, row.unit, row.unitPrice ?? '', row.total ?? '', row.included ? row.total ?? 0 : '', row.difference ?? '', row.chargeHomeowner ?? ''];
}

function rowToOptions(row: CofSelectionRow): unknown[] {
  return ['', row.type, row.productName, row.level ?? '', row.total ?? '', row.difference ?? '', row.included ? 'Yes' : 'No', row.notes ?? ''];
}

export function buildCofWorkbook(input: CofExportInput): XLSX.WorkBook {
  const sheets = buildCofRows(input);
  const wb = XLSX.utils.book_new();

  const addSheet = (name: string, header: string[], mapRow: (row: CofSelectionRow) => unknown[]) => {
    const rows = sheets[name] ?? [];
    const aoa: unknown[][] = [
      ...sheetHeaderRows(input.project, name),
      header,
      ...rows.map(mapRow),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  };

  addSheet('Countertops', countertopsHeader(), rowToCountertops);
  addSheet('Tile-Floor', tileFloorHeader(), rowToTileFloor);
  addSheet('Options', optionsHeader(), rowToOptions);

  for (const [name, rows] of Object.entries(sheets)) {
    if (['Countertops', 'Tile-Floor', 'Options'].includes(name) || !rows.length) continue;
    addSheet(name, optionsHeader(), rowToOptions);
  }

  return wb;
}

export function downloadCofExcel(input: CofExportInput, filename = 'customer-option-form.xlsx') {
  const wb = buildCofWorkbook(input);
  XLSX.writeFile(wb, filename);
}

export function cofWorkbookToArrayBuffer(input: CofExportInput): ArrayBuffer {
  const wb = buildCofWorkbook(input);
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}
