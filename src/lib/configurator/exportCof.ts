import * as XLSX from 'xlsx';
import type { CatalogItem } from '../../components/catalog/catalogData';
import type { FurnitureItem, PlanRoomLabel } from '../../types';
import { roomArea } from '../geometry/rooms';
import type { ContractSnapshot, SelectionProject } from './contractTypes';
import { baseItemName, formatCatalogPrice, pricingCategoryForItem } from './deltaPricing';
import type { AllowanceBudget, ContractLevelOverride, TakeoffSnapshot } from './projectTypes';
import { takeoffQtyForCategory } from './importTakeoff';

const M2_TO_SQFT = (1 / 0.3048) ** 2;
const HO_FACTOR = 0.65;
const QTY_PAD = 0.1;

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
  takeoff?: TakeoffSnapshot;
  levelOverrides?: ContractLevelOverride[];
  allowances?: AllowanceBudget[];
};

function tabToCofSheet(sourceTab?: string): string | null {
  const map: Record<string, string> = {
    Countertops: 'Countertops',
    'Tile-Floor': 'Tile-Floor',
    'Tile-Wall': 'Tile-Floor',
    'Tile - Backsplash': 'Tile-Floor',
    'Tile - Pan': 'Tile-Floor',
    Plumbing: 'Options',
    'Shaker Drs': 'Cabinets',
    'Upgrade Shaker Drs': 'Cabinets',
    'Interior Doors': 'Options',
    'PGT Windows': 'Options',
    'Summer Kitchen': 'Summer Kitchen',
    Pavers: 'Pavers',
    Stone: 'Stone',
    'Stone-Eldorado': 'Stone',
    'Trim Material': 'Options',
  };
  return sourceTab ? map[sourceTab] ?? 'Options' : null;
}

function withCharge(row: Omit<CofSelectionRow, 'chargeHomeowner'> & { chargeHomeowner?: number }): CofSelectionRow {
  const difference = row.difference ?? 0;
  const charge = row.included ? 0 : difference > 0 ? Math.round((difference / HO_FACTOR) * 100) / 100 : difference;
  return { ...row, chargeHomeowner: charge };
}

function aggregateProductRows(
  furniture: FurnitureItem[],
  catalog: CatalogItem[],
  contract: ContractSnapshot,
  takeoff?: TakeoffSnapshot,
  levelOverrides: ContractLevelOverride[] = [],
): CofSelectionRow[] {
  const byKey = new Map<string, CofSelectionRow>();
  for (const item of furniture.filter((f) => f.placementKind !== 'stair')) {
    const product = catalog.find((p) => p.id === item.catalogId);
    if (!product) continue;
    const key = product.id;
    const cat = pricingCategoryForItem(product);
    const importedQty = cat ? takeoffQtyForCategory(takeoff, cat, product.roomTypes?.[0]) : 0;
    const qty = importedQty > 0 ? importedQty : 1;
    const priceView = formatCatalogPrice(product, catalog, contract, 'designer', levelOverrides);
    const unitPrice = product.price ?? product.cost;
    const existing = byKey.get(key);
    if (existing) {
      existing.qty += qty;
      if (unitPrice != null) existing.total = (existing.total ?? 0) + unitPrice * qty;
      if (priceView.delta) existing.difference = (existing.difference ?? 0) + priceView.delta * qty;
    } else {
      byKey.set(
        key,
        withCharge({
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
          notes: product.sku,
        }),
      );
    }
  }
  return Array.from(byKey.values()).map((row) => withCharge(row));
}

function floorRows(
  planRooms: PlanRoomLabel[],
  catalog: CatalogItem[],
  contract: ContractSnapshot,
  takeoff?: TakeoffSnapshot,
  levelOverrides: ContractLevelOverride[] = [],
): CofSelectionRow[] {
  const rows: CofSelectionRow[] = [];
  for (const room of planRooms) {
    if (!room.floorCatalogId) continue;
    const product = catalog.find((p) => p.id === room.floorCatalogId);
    if (!product) continue;
    const cat = pricingCategoryForItem(product) ?? 'floor-tile';
    const importedQty = takeoffQtyForCategory(takeoff, cat, room.name || room.roomType);
    const qty = importedQty > 0 ? importedQty : roomArea(room.points) * M2_TO_SQFT;
    const priceView = formatCatalogPrice(product, catalog, contract, 'designer', levelOverrides);
    const unitPrice = product.price ?? product.cost;
    const difference = priceView.delta != null ? Math.round(priceView.delta * qty * 100) / 100 : priceView.included ? 0 : undefined;
    rows.push(
      withCharge({
        area: room.name || room.roomType || 'Room',
        type: product.subcategory ?? 'Floor tile',
        productName: baseItemName(product.name),
        level: product.level,
        included: priceView.included,
        qty: Math.round(qty * 10) / 10,
        unit: product.priceUnit ?? 'sq ft',
        unitPrice: unitPrice ?? undefined,
        total: unitPrice != null ? Math.round(unitPrice * qty * 100) / 100 : undefined,
        difference,
        notes: product.sku,
      }),
    );
  }
  return rows;
}

export function buildCofRows(input: CofExportInput): Record<string, CofSelectionRow[]> {
  const productRows = aggregateProductRows(
    input.furniture,
    input.catalog,
    input.contract,
    input.takeoff,
    input.levelOverrides,
  );
  const floors = floorRows(input.planRooms, input.catalog, input.contract, input.takeoff, input.levelOverrides);
  const sheets: Record<string, CofSelectionRow[]> = {};

  for (const row of [...productRows, ...floors]) {
    const product = input.catalog.find((p) => p.sku === row.notes || baseItemName(p.name) === row.productName);
    const sheet = tabToCofSheet(product?.sourceTab) ?? 'Options';
    if (!sheets[sheet]) sheets[sheet] = [];
    sheets[sheet].push(row);
  }
  return sheets;
}

function setCell(ws: XLSX.WorkSheet, addr: string, value: string | number | boolean) {
  const existing = ws[addr] as XLSX.CellObject | undefined;
  if (existing && existing.f) {
    // Keep formula; only seed cached value when empty.
    if (existing.v == null || existing.v === '') existing.v = value;
    return;
  }
  ws[addr] = { t: typeof value === 'number' ? 'n' : typeof value === 'boolean' ? 'b' : 's', v: value };
}

function clearDataRows(ws: XLSX.WorkSheet, startRow: number, endRow: number, cols: string[]) {
  for (let r = startRow; r <= endRow; r++) {
    for (const col of cols) {
      const addr = `${col}${r}`;
      const cell = ws[addr] as XLSX.CellObject | undefined;
      if (cell?.f) continue;
      if (cell) delete ws[addr];
    }
  }
}

function fillCover(ws: XLSX.WorkSheet, project: SelectionProject, sheets: Record<string, CofSelectionRow[]>) {
  setCell(ws, 'B6', project.name);
  setCell(ws, 'B7', project.lotRef ?? project.planRef ?? '');
  let row = 24;
  for (const [sheetName, rows] of Object.entries(sheets)) {
    for (const item of rows.slice(0, 40)) {
      setCell(ws, `B${row}`, sheetName);
      setCell(ws, `C${row}`, item.productName);
      if (item.total != null) setCell(ws, 'H' + row, item.total);
      if (item.difference != null) setCell(ws, 'G' + row, item.difference);
      row += 1;
      if (row > 79) break;
    }
    if (row > 79) break;
  }
}

function fillCountertops(ws: XLSX.WorkSheet, project: SelectionProject, rows: CofSelectionRow[]) {
  setCell(ws, 'M2', project.name);
  setCell(ws, 'M3', project.lotRef ?? project.planRef ?? '');
  clearDataRows(ws, 8, 80, ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']);
  let excelRow = 8;
  for (const row of rows.slice(0, 60)) {
    setCell(ws, `B${excelRow}`, row.area);
    setCell(ws, `C${excelRow}`, row.type || 'Countertop Surface');
    setCell(ws, `D${excelRow}`, row.detail ?? 'Surface Type');
    setCell(ws, `E${excelRow}`, row.productName);
    setCell(ws, `F${excelRow}`, row.level ?? '');
    setCell(ws, `G${excelRow}`, row.included ? 'Yes' : 'No');
    setCell(ws, `J${excelRow}`, row.notes ?? '');
    setCell(ws, `K${excelRow}`, row.qty);
    // Qty_Pad formula equivalent when template formula missing
    const padAddr = `L${excelRow}`;
    if (!(ws[padAddr] as XLSX.CellObject | undefined)?.f) {
      setCell(ws, padAddr, Math.round(row.qty * (1 + QTY_PAD) * 100) / 100);
    }
    excelRow += 1;
  }
}

function fillTileFloor(ws: XLSX.WorkSheet, project: SelectionProject, rows: CofSelectionRow[]) {
  setCell(ws, 'K2', project.name);
  setCell(ws, 'K3', project.lotRef ?? project.planRef ?? '');
  clearDataRows(ws, 8, 80, ['A', 'B', 'C', 'D', 'E', 'K']);
  let excelRow = 8;
  for (const row of rows.slice(0, 60)) {
    setCell(ws, `A${excelRow}`, row.area);
    setCell(ws, `B${excelRow}`, row.type || 'Floor Tile');
    setCell(ws, `C${excelRow}`, row.level ?? '');
    setCell(ws, `D${excelRow}`, row.productName);
    setCell(ws, `E${excelRow}`, row.notes ?? '');
    setCell(ws, `K${excelRow}`, row.qty);
    const padAddr = `L${excelRow}`;
    if (!(ws[padAddr] as XLSX.CellObject | undefined)?.f) {
      setCell(ws, padAddr, Math.round(row.qty * (1 + QTY_PAD) * 100) / 100);
    }
    excelRow += 1;
  }
}

function fillAllowances(ws: XLSX.WorkSheet, project: SelectionProject, allowances: AllowanceBudget[] = []) {
  setCell(ws, 'A1', project.name);
  setCell(ws, 'A2', project.lotRef ?? project.planRef ?? '');
  setCell(ws, 'C4', project.name);
  setCell(ws, 'C5', project.lotRef ?? project.planRef ?? '');
  let excelRow = 8;
  for (const a of allowances.slice(0, 20)) {
    setCell(ws, `B${excelRow}`, 'Allowance');
    setCell(ws, `C${excelRow}`, a.label || a.pricingCategory);
    setCell(ws, `E${excelRow}`, a.budgetAmount);
    excelRow += 1;
  }
}

function fillOptions(ws: XLSX.WorkSheet, project: SelectionProject, rows: CofSelectionRow[]) {
  setCell(ws, 'A1', project.name);
  setCell(ws, 'A2', project.lotRef ?? project.planRef ?? '');
  setCell(ws, 'C4', project.name);
  setCell(ws, 'C5', project.lotRef ?? project.planRef ?? '');
  let excelRow = 8;
  for (const row of rows.slice(0, 40)) {
    setCell(ws, `B${excelRow}`, row.type);
    setCell(ws, `C${excelRow}`, row.productName);
    if (row.total != null) setCell(ws, `G${excelRow}`, row.total);
    if (row.difference != null) setCell(ws, `H${excelRow}`, row.difference);
    excelRow += 1;
  }
}

function fillSimpleTrade(ws: XLSX.WorkSheet, project: SelectionProject, rows: CofSelectionRow[]) {
  setCell(ws, 'A1', project.name);
  setCell(ws, 'A2', project.lotRef ?? project.planRef ?? '');
  let excelRow = 8;
  for (const row of rows.slice(0, 40)) {
    setCell(ws, `B${excelRow}`, row.area);
    setCell(ws, `C${excelRow}`, row.productName);
    setCell(ws, `D${excelRow}`, row.level ?? '');
    setCell(ws, `E${excelRow}`, row.qty);
    if (row.total != null) setCell(ws, `F${excelRow}`, row.total);
    if (row.difference != null) setCell(ws, `G${excelRow}`, row.difference);
    excelRow += 1;
  }
}

/** Fallback workbook when the Olsen template cannot be loaded. */
function buildFallbackWorkbook(input: CofExportInput, sheets: Record<string, CofSelectionRow[]>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const cover: unknown[][] = [
    ['CUSTOMER OPTION FORM'],
    ['CUSTOMER:', input.project.name],
    ['JOB ADDRESS:', input.project.lotRef ?? input.project.planRef ?? ''],
    [],
    ['Category', 'Description', 'Qty', 'Unit', 'Difference', 'Charge HO'],
  ];
  for (const [sheet, rows] of Object.entries(sheets)) {
    for (const row of rows) {
      cover.push([sheet, row.productName, row.qty, row.unit, row.difference ?? '', row.chargeHomeowner ?? '']);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cover), 'Customer Option Cover Page');

  const counter: unknown[][] = [['', 'Area', 'Type', 'Detail', 'Product Name', 'Level', 'Included?', 'Notes', 'Qty_Est', 'Qty_Pad', 'Units']];
  for (const row of sheets.Countertops ?? []) {
    counter.push(['', row.area, row.type, row.detail ?? '', row.productName, row.level ?? '', row.included ? 'Yes' : '', row.notes ?? '', row.qty, Math.round(row.qty * 1.1 * 100) / 100, row.unit]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(counter), 'Countertops');

  const tile: unknown[][] = [['Area/Room', 'Type', 'Level', 'Product Name', 'Notes', 'Qty_Est', 'Qty_Pad', 'Units']];
  for (const row of sheets['Tile-Floor'] ?? []) {
    tile.push([row.area, row.type, row.level ?? '', row.productName, row.notes ?? '', row.qty, Math.round(row.qty * 1.1 * 100) / 100, row.unit]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tile), 'Tile-Floor');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Category', 'Description', 'Allowance'],
      ...(input.allowances ?? []).map((a) => [a.pricingCategory, a.label, a.budgetAmount]),
    ] as unknown[][]),
    'Allowances',
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Category', 'Description', 'Final price', 'Difference'],
      ...(sheets.Options ?? []).map((r) => [r.type, r.productName, r.total ?? '', r.difference ?? '']),
    ] as unknown[][]),
    'Options',
  );
  return wb;
}

async function loadTemplateBytes(): Promise<ArrayBuffer | null> {
  try {
    if (typeof fetch !== 'function') return null;
    const res = await fetch('/templates/customer-option-form-2026.xlsx');
    if (res.ok) return await res.arrayBuffer();
  } catch {
    /* template optional — fallback workbook used */
  }
  return null;
}

export function buildCofWorkbookFromTemplate(templateBytes: ArrayBuffer, input: CofExportInput): XLSX.WorkBook {
  const sheets = buildCofRows(input);
  const wb = XLSX.read(templateBytes, { type: 'array', cellFormula: true });

  if (wb.Sheets['Customer Option Cover Page']) fillCover(wb.Sheets['Customer Option Cover Page']!, input.project, sheets);
  if (wb.Sheets.Countertops) fillCountertops(wb.Sheets.Countertops, input.project, sheets.Countertops ?? []);
  if (wb.Sheets['Tile-Floor']) fillTileFloor(wb.Sheets['Tile-Floor']!, input.project, sheets['Tile-Floor'] ?? []);
  if (wb.Sheets.Allowances) fillAllowances(wb.Sheets.Allowances, input.project, input.allowances);
  if (wb.Sheets.Options) fillOptions(wb.Sheets.Options, input.project, sheets.Options ?? []);
  for (const name of ['Cabinets', 'Pavers', 'Stone', 'Summer Kitchen'] as const) {
    if (wb.Sheets[name] && sheets[name]?.length) fillSimpleTrade(wb.Sheets[name]!, input.project, sheets[name]!);
  }
  return wb;
}

export function buildCofWorkbook(input: CofExportInput): XLSX.WorkBook {
  return buildFallbackWorkbook(input, buildCofRows(input));
}

export async function buildCofWorkbookAsync(input: CofExportInput): Promise<XLSX.WorkBook> {
  const bytes = await loadTemplateBytes();
  if (bytes) return buildCofWorkbookFromTemplate(bytes, input);
  return buildCofWorkbook(input);
}

export async function downloadCofExcel(input: CofExportInput, filename = 'customer-option-form.xlsx') {
  const wb = await buildCofWorkbookAsync(input);
  XLSX.writeFile(wb, filename);
}

export async function cofWorkbookToArrayBuffer(input: CofExportInput): Promise<ArrayBuffer> {
  const wb = await buildCofWorkbookAsync(input);
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}
