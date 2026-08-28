#!/usr/bin/env node
/**
 * Build src/lib/catalog/olsenCatalogSeed.json from Olsen Cost Library XLSX.
 * Run: node scripts/build-olsen-catalog.mjs
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import XLSX from 'xlsx';
import {
  TAB_CATEGORY,
  TAB_PLACEMENT,
  TAB_ROOMS,
  TEXTURE_BY_TAB,
  dimsForTab,
  hashColor,
  mapUnit,
  shouldIncludeRow,
  slug,
} from './olsen-import-rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const xlsxPath = join(root, 'Olsen_Cost_Library_All_Tabs_Reformatted_2026.xlsx');
const outPath = join(root, 'src/lib/catalog/olsenCatalogSeed.json');
const metaPath = join(root, 'src/lib/catalog/olsenCatalogMeta.json');
const lookbookPath = join(root, 'src/lib/catalog/lookbookThumbs.json');

function loadLookbookThumbs() {
  if (!existsSync(lookbookPath)) return {};
  try {
    const data = JSON.parse(readFileSync(lookbookPath, 'utf8'));
    return data.skuToThumbnail ?? {};
  } catch {
    return {};
  }
}

const lookbookThumbs = loadLookbookThumbs();

if (!existsSync(xlsxPath)) {
  console.error(`Missing workbook: ${xlsxPath}`);
  process.exit(1);
}

const workbook = XLSX.read(readFileSync(xlsxPath), { type: 'buffer', cellDates: true });
const sheet = workbook.Sheets['Master Cost Library'];
if (!sheet) {
  console.error('Master Cost Library sheet not found');
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
const items = [];
const seen = new Set();

for (const raw of rows) {
  const row = {
    Cost_ID: raw.Cost_ID,
    Source_Tab: raw.Source_Tab,
    Section: raw.Section,
    Item_Name: raw.Item_Name,
    Item_Type: raw.Item_Type,
    Level: raw.Level,
    Vendor_Source: raw.Vendor_Source,
    Amount: raw.Amount,
    Unit: raw.Unit,
    Last_Revision: raw.Last_Revision,
    Notes: raw.Notes,
  };
  if (!shouldIncludeRow(row)) continue;

  const costId = String(row.Cost_ID ?? '').trim();
  if (!costId || seen.has(costId)) continue;
  seen.add(costId);

  const tab = row.Source_Tab;
  const vendor = String(row.Vendor_Source ?? row.Section ?? 'Olsen').trim();
  const vendorId = slug(vendor);
  const cat = TAB_CATEGORY[tab] ?? { category: 'Specialties', subcategory: tab };
  const placement = TAB_PLACEMENT[tab] ?? { mountingType: 'floor', surfaces: ['floor'] };
  const texturePack = TEXTURE_BY_TAB[tab];
  const level = row.Level ? String(row.Level).trim() : undefined;
  const itemName = String(row.Item_Name ?? 'Item').trim();
  const displayName = level ? `${itemName} · ${level}` : itemName;
  const priceUnit = mapUnit(row.Unit);
  const amount = Number(row.Amount);

  const item = {
    id: `olsen-${costId.toLowerCase()}`,
    sku: costId,
    vendorId,
    name: displayName,
    brand: vendor,
    category: cat.category,
    subcategory: cat.subcategory,
    roomTypes: TAB_ROOMS[tab] ?? [],
    tags: ['olsen', slug(tab), ...(level ? [slug(level)] : [])],
    dims: dimsForTab(tab),
    color: hashColor(`${vendor}-${itemName}-${level ?? ''}`),
    cost: amount,
    price: amount,
    currency: 'USD',
    priceUnit,
    priceVerifiedAt: row.Last_Revision
      ? new Date(row.Last_Revision).toISOString().slice(0, 10)
      : '2026-01-01',
    sellable: true,
    placeholderOnly: !texturePack?.textureUrl,
    mountingType: placement.mountingType ?? 'floor',
    placementSurfaces: placement.surfaces ?? ['floor'],
    ...(placement.placementMode ? { placementMode: placement.placementMode } : {}),
    ...(texturePack ?? {}),
    ...(lookbookThumbs[costId] ? { thumbnailUrl: lookbookThumbs[costId], placeholderOnly: false } : {}),
    level,
    sourceTab: tab,
    section: row.Section ? String(row.Section) : undefined,
    emoji: '▧',
    sourceLabel: 'Olsen Cost Library 2026',
    note: row.Notes ? String(row.Notes) : `Imported from ${tab}`,
  };

  items.push(item);
}

items.sort((a, b) => a.name.localeCompare(b.name));

const meta = {
  generatedAt: new Date().toISOString(),
  sourceFile: 'Olsen_Cost_Library_All_Tabs_Reformatted_2026.xlsx',
  rowCount: items.length,
  tabs: [...new Set(items.map((i) => i.sourceTab))].sort(),
  lookbookThumbs: Object.keys(lookbookThumbs).length,
  withPhotoThumb: items.filter((i) => i.thumbnailUrl?.includes('/lookbook/')).length,
};

writeFileSync(outPath, `${JSON.stringify(items, null, 2)}\n`);
writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

console.log(JSON.stringify({ ok: true, ...meta }, null, 2));
