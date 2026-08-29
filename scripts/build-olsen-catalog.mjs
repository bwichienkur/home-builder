/**
 * Build src/lib/catalog/olsenCatalogSeed.json from:
 *   1) Olsen_Inventory_Images_and_Master_Catalog (product authority + images)
 *   2) Olsen Cost Library selection tabs still needed for COF pricing
 *      (Countertops, Tile, Windows, Stone, … — not Plumbing/Pavers/Trim)
 *
 * Run: npm run catalog:build-olsen
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
  SELECTION_SOURCE_TABS,
} from './olsen-import-rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = join(root, 'Olsen_Inventory_Images_and_Master_Catalog');
const masterXlsx = join(packageDir, 'Olsen_3D_Full_Master_Catalog_Updated.xlsx');
const manifestCsv = join(packageDir, 'inventory_image_manifest.csv');
const costXlsx = join(root, 'Olsen_Cost_Library_All_Tabs_Reformatted_2026.xlsx');
const outPath = join(root, 'src/lib/catalog/olsenCatalogSeed.json');
const metaPath = join(root, 'src/lib/catalog/olsenCatalogMeta.json');
const publicInventory = join(root, 'public/catalog/olsen/inventory');

/** Cost Library tabs kept for COF / level pricing (Master Catalog owns plumbing/pavers/trim). */
const COST_LIBRARY_TABS = new Set(
  [...SELECTION_SOURCE_TABS].filter(
    (t) => !['Plumbing', 'Pavers', 'Trim Material'].includes(t),
  ),
);

const MASTER_CATEGORY = {
  bathroom_accessory: { category: 'Plumbing', subcategory: 'Bathroom accessories', sourceTab: 'Plumbing', rooms: ['Bathroom'] },
  bathroom_faucet: { category: 'Plumbing', subcategory: 'Lavatory faucet', sourceTab: 'Plumbing', rooms: ['Bathroom'] },
  shower_faucet: { category: 'Plumbing', subcategory: 'Shower faucet', sourceTab: 'Plumbing', rooms: ['Bathroom'] },
  kitchen_faucet: { category: 'Plumbing', subcategory: 'Kitchen faucet', sourceTab: 'Plumbing', rooms: ['Kitchen'] },
  bar_faucet: { category: 'Plumbing', subcategory: 'Bar faucet', sourceTab: 'Plumbing', rooms: ['Kitchen', 'Dining room'] },
  tub_shower_faucet: { category: 'Plumbing', subcategory: 'Tub/shower faucet', sourceTab: 'Plumbing', rooms: ['Bathroom'] },
  roman_tub_faucet: { category: 'Plumbing', subcategory: 'Roman tub faucet', sourceTab: 'Plumbing', rooms: ['Bathroom'] },
  laundry_faucet: { category: 'Plumbing', subcategory: 'Laundry faucet', sourceTab: 'Plumbing', rooms: ['Laundry'] },
  roofing: { category: 'Exterior', subcategory: 'Roofing', sourceTab: 'Specialties', rooms: ['Outdoor'] },
  pavers: { category: 'Surfaces', subcategory: 'Pavers', sourceTab: 'Pavers', rooms: ['Outdoor'] },
  sink: { category: 'Plumbing', subcategory: 'Sink', sourceTab: 'Plumbing', rooms: ['Kitchen', 'Laundry', 'Bathroom'] },
  trim: { category: 'Trim', subcategory: 'Material', sourceTab: 'Trim Material', rooms: ['Bedroom', 'Living room', 'Hallway', 'Kitchen'] },
};

const IMAGE_CATEGORY_META = {
  cabinetry_hardware: { category: 'Cabinetry', subcategory: 'Hardware', sourceTab: 'Specialties', rooms: ['Kitchen', 'Bathroom', 'Laundry'], mountingType: 'wall', surfaces: ['wall'] },
  door_hardware: { category: 'Doors', subcategory: 'Hardware', sourceTab: 'Interior Doors', rooms: ['Bedroom', 'Hallway', 'Bathroom'], mountingType: 'wall', surfaces: ['wall'] },
  interior_doors: { category: 'Doors', subcategory: 'Interior', sourceTab: 'Interior Doors', rooms: ['Bedroom', 'Hallway', 'Bathroom'], mountingType: 'wall', surfaces: ['wall'] },
  fire_rated_doors: { category: 'Doors', subcategory: 'Fire-rated', sourceTab: 'Interior Doors', rooms: ['Hallway'], mountingType: 'wall', surfaces: ['wall'] },
  garage_doors: { category: 'Doors', subcategory: 'Garage', sourceTab: 'Ext. Door Install', rooms: ['Outdoor'], mountingType: 'wall', surfaces: ['wall'] },
  railing: { category: 'Exterior', subcategory: 'Railing', sourceTab: 'Railing - Shutters', rooms: ['Outdoor', 'Hallway'], mountingType: 'floor', surfaces: ['floor'] },
  wall_finish: { category: 'Surfaces', subcategory: 'Wall finish', sourceTab: 'Specialties', rooms: ['Living room', 'Hallway'], mountingType: 'wall', surfaces: ['wall'] },
  shelving: { category: 'Decor', subcategory: 'Shelving', sourceTab: 'Shelves - Mantles - Beams', rooms: ['Bedroom', 'Office', 'Laundry'], mountingType: 'wall', surfaces: ['wall'] },
  shower_enclosures: { category: 'Plumbing', subcategory: 'Shower enclosure', sourceTab: 'Plumbing', rooms: ['Bathroom'], mountingType: 'floor', surfaces: ['floor'] },
};

const INCH = 0.0254;

function inchToM(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n * INCH : null;
}

function parseFractionInches(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase().replace(/"/g, '').replace(/inches?/g, '').trim();
  if (!s) return null;
  // 5-1/4 or 9/16 or 15.75 or 15 3/4
  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const dash = s.match(/^(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)$/);
  if (dash) return Number(dash[1]) + Number(dash[2]) / Number(dash[3]);
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseDimsInches(text) {
  if (!text) return null;
  const parts = String(text)
    .replace(/["″]/g, '')
    .split(/[x×]/i)
    .map((p) => parseFractionInches(p.trim()))
    .filter((n) => n != null);
  if (parts.length >= 3) return [parts[0] * INCH, parts[1] * INCH, parts[2] * INCH];
  if (parts.length === 2) return [parts[0] * INCH, 0.05, parts[1] * INCH];
  return null;
}

function sheetRows(workbook, name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

function loadManifest() {
  if (!existsSync(manifestCsv)) return [];
  const raw = readFileSync(manifestCsv, 'utf8').replace(/^\uFEFF/, '');
  const wb = XLSX.read(raw, { type: 'string' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' }).map((r) => ({
    id: String(r.asset_candidate_id ?? '').trim(),
    page: String(r.page ?? '').trim(),
    category: String(r.category ?? '').trim(),
    imageFile: String(r.image_file ?? '').trim().replace(/^inventory_images\//, ''),
    nearbyText: String(r.nearby_text ?? '').trim(),
    strategy: String(r.conversion_strategy ?? '').trim(),
  }));
}

function publicThumbPath(rel) {
  return `/catalog/olsen/inventory/${rel.replace(/\\/g, '/')}`;
}

function scoreImage(candidate, { page, needles, categoryHints }) {
  let score = 0;
  if (page && String(candidate.page) === String(page)) score += 5;
  const text = `${candidate.nearbyText} ${candidate.imageFile}`.toLowerCase();
  for (const n of needles) {
    if (!n) continue;
    const q = String(n).toLowerCase();
    if (q.length >= 3 && text.includes(q)) score += 3;
  }
  for (const h of categoryHints) {
    if (candidate.category === h) score += 2;
  }
  return score;
}

function pickImage(manifest, opts) {
  let best = null;
  let bestScore = 0;
  for (const c of manifest) {
    const s = scoreImage(c, opts);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  if (!best || bestScore < 5) return null;
  return publicThumbPath(best.imageFile);
}

function baseItem(partial) {
  return {
    currency: 'USD',
    sellable: true,
    placeholderOnly: !partial.thumbnailUrl && !partial.modelUrl && !partial.textureUrl,
    emoji: '▧',
    ...partial,
  };
}

function buildMoenItems(workbook, manifest) {
  const masters = sheetRows(workbook, 'Moen Master');
  const variants = sheetRows(workbook, 'Moen Variants');
  const byId = new Map(masters.map((m) => [String(m.asset_id), m]));
  const items = [];

  for (const v of variants) {
    const sku = String(v.sku ?? '').trim();
    if (!sku) continue;
    const geometryId = String(v.geometry_asset_id ?? '').trim();
    const master = byId.get(geometryId) ?? {};
    const catKey = String(v.category ?? master.category ?? 'bathroom_faucet');
    const meta = MASTER_CATEGORY[catKey] ?? MASTER_CATEGORY.bathroom_faucet;
    const finish = String(v.finish ?? '').trim();
    const productName = String(master.product_name ?? `${v.collection ?? 'Moen'} ${v.base_model ?? sku}`).trim();
    const name = finish ? `${productName} · ${finish}` : productName;

    const w = inchToM(master.overall_width_in) ?? inchToM(master.spout_reach_in) ?? 0.22;
    const d = inchToM(master.overall_depth_in) ?? inchToM(master.spout_length_in) ?? 0.18;
    const h = inchToM(master.overall_height_in) ?? inchToM(master.spout_height_in) ?? 0.25;

    const page = v.olsen_page ?? master.olsen_page;
    const thumbnailUrl = pickImage(manifest, {
      page,
      needles: [sku, v.base_model, finish, productName, master.collection],
      categoryHints: [
        catKey === 'bathroom_accessory' ? 'bathroom_accessories' : '',
        catKey === 'bathroom_faucet' ? 'bathroom_sink_faucet' : '',
        catKey === 'kitchen_faucet' ? 'kitchen_faucet' : '',
        catKey === 'laundry_faucet' ? 'laundry_faucet' : '',
        catKey === 'bar_faucet' ? 'wet_bar_faucets' : '',
        catKey === 'shower_faucet' ? 'shower_faucets' : '',
        catKey === 'tub_shower_faucet' ? 'tub_shower_faucets' : '',
        catKey === 'roman_tub_faucet' ? 'roman_tub_faucet' : '',
      ].filter(Boolean),
    });

    items.push(
      baseItem({
        id: `olsen-${slug(sku)}`,
        sku,
        vendorId: 'moen',
        name,
        brand: 'Moen',
        category: meta.category,
        subcategory: meta.subcategory,
        roomTypes: meta.rooms,
        tags: ['olsen', 'master-catalog', 'moen', slug(catKey), slug(finish || 'finish')],
        dims: [w, d, h],
        color: hashColor(`${sku}-${finish}`),
        finish: finish || undefined,
        priceUnit: 'each',
        mountingType: String(master.placement_type ?? 'wall_mount').includes('wall') ? 'wall' : 'floor',
        placementSurfaces: String(master.placement_type ?? 'wall_mount').includes('wall') ? ['wall'] : ['floor'],
        thumbnailUrl: thumbnailUrl || undefined,
        sourceUrl: v.manufacturer_url || master.manufacturer_url || undefined,
        modelUrl: master.cad_obj_url || undefined,
        level: undefined,
        sourceTab: meta.sourceTab,
        section: String(v.collection ?? master.collection ?? 'Moen'),
        sourceLabel: 'Olsen Master Catalog',
        geometryAssetId: geometryId,
        note: [
          master.notes,
          master.detailed_dimensions,
          master.dimension_completion_status ? `Dims: ${master.dimension_completion_status}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      }),
    );
  }
  return items;
}

function buildEagleItems(workbook, manifest) {
  const rows = sheetRows(workbook, 'Eagle Roofing');
  return rows.map((r) => {
    const code = String(r.product_code ?? '').trim();
    const color = String(r.color ?? '').trim();
    const profile = String(r.profile ?? '').trim();
    const assetId = String(r.asset_id ?? `eagle-${code}`).trim();
    const w = inchToM(r.tile_width_in) ?? 0.3;
    const d = inchToM(r.tile_length_in) ?? 0.4;
    const h = 0.05;
    const thumbnailUrl = pickImage(manifest, {
      page: r.olsen_page,
      needles: [code, color, profile],
      categoryHints: ['roofing'],
    });
    return baseItem({
      id: `olsen-${slug(assetId)}`,
      sku: code || assetId,
      vendorId: 'eagle-roofing',
      name: `${profile} · ${color}`.trim(),
      brand: 'Eagle Roofing Products',
      category: 'Exterior',
      subcategory: 'Roofing',
      roomTypes: ['Outdoor'],
      tags: ['olsen', 'master-catalog', 'roofing', slug(profile)],
      dims: [w, d, h],
      color: hashColor(color || code),
      finish: color || undefined,
      priceUnit: 'sq ft',
      mountingType: 'floor',
      placementSurfaces: ['floor'],
      placementMode: 'floor-fill',
      thumbnailUrl: thumbnailUrl || undefined,
      sourceUrl: r.manufacturer_url || undefined,
      sourceTab: 'Specialties',
      section: profile,
      sourceLabel: 'Olsen Master Catalog',
      note: [r.color_description, r.availability, `${r.tiles_per_100_sqft ?? ''} tiles / 100 sf`]
        .filter(Boolean)
        .join(' · '),
    });
  });
}

function buildTremronItems(workbook, manifest) {
  const rows = sheetRows(workbook, 'Tremron Pavers');
  return rows.map((r) => {
    const color = String(r.color ?? '').trim();
    const family = String(r.family ?? '').trim();
    const code = String(r.product_code ?? '').trim();
    const assetId = String(r.asset_id ?? '').trim();
    const thickness = inchToM(r.thickness_in) ?? 0.06;
    const thumbnailUrl = pickImage(manifest, {
      page: r.olsen_page,
      needles: [color, family, code, color.replace(/'/g, '')],
      categoryHints: ['pavers'],
    });
    return baseItem({
      id: `olsen-${slug(assetId || `${family}-${color}`)}`,
      sku: code || assetId,
      vendorId: 'tremron',
      name: `${family} · ${color}`.trim(),
      brand: 'Tremron',
      category: 'Surfaces',
      subcategory: 'Pavers',
      roomTypes: ['Outdoor'],
      tags: ['olsen', 'master-catalog', 'pavers', slug(family)],
      dims: [0.15, 0.15, thickness],
      color: hashColor(color),
      finish: color || undefined,
      priceUnit: 'sq ft',
      mountingType: 'floor',
      placementSurfaces: ['floor'],
      placementMode: 'floor-fill',
      thumbnailUrl: thumbnailUrl || undefined,
      sourceUrl: r.manufacturer_url || undefined,
      sourceTab: 'Pavers',
      section: family,
      sourceLabel: 'Olsen Master Catalog',
      note: [r.piece_sizes_in ? `Pieces: ${r.piece_sizes_in}` : null, r.surface, r.sf_per_cube ? `${r.sf_per_cube} sf/cube` : null]
        .filter(Boolean)
        .join(' · '),
    });
  });
}

function buildSinkItems(workbook, manifest) {
  const rows = sheetRows(workbook, 'Olsen Sinks');
  return rows.map((r) => {
    const model = String(r.model ?? '').trim();
    const assetId = String(r.asset_id ?? '').trim();
    const cat = String(r.category ?? 'Sink').trim();
    const dims = parseDimsInches(r.inside_dimensions_in) ?? [0.5, 0.4, 0.2];
    const thumbnailUrl = pickImage(manifest, {
      page: r.olsen_page,
      needles: [model, assetId.replace(/olsen-sink-/i, '')],
      categoryHints: ['sinks'],
    });
    return baseItem({
      id: `olsen-${slug(assetId || model)}`,
      sku: model || assetId,
      vendorId: 'olsen',
      name: `${cat} · ${model}`.trim(),
      brand: 'Olsen',
      category: 'Plumbing',
      subcategory: 'Sink',
      roomTypes: /vanity/i.test(cat) ? ['Bathroom'] : /bar/i.test(cat) ? ['Kitchen', 'Dining room'] : ['Kitchen', 'Laundry'],
      tags: ['olsen', 'master-catalog', 'sink', slug(cat)],
      dims,
      color: hashColor(model),
      priceUnit: 'each',
      mountingType: 'floor',
      placementSurfaces: ['floor'],
      thumbnailUrl: thumbnailUrl || undefined,
      sourceTab: 'Plumbing',
      section: cat,
      sourceLabel: 'Olsen Master Catalog',
      note: r.inside_dimensions_in ? `Inside: ${r.inside_dimensions_in}` : String(r.lookup_status ?? ''),
    });
  });
}

function buildTrimItems(workbook, manifest) {
  const rows = sheetRows(workbook, 'Olsen Trim');
  return rows.map((r) => {
    const sku = String(r.sku ?? '').trim();
    const type = String(r.type ?? 'Trim').trim();
    const assetId = String(r.asset_id ?? '').trim();
    const profile = String(r.profile_dimensions_in ?? '');
    const parts = profile.split(/[x×]/i).map((p) => parseFractionInches(p.trim()));
    const depth = (parts[0] ?? 0.5) * INCH;
    const height = (parts[1] ?? 3) * INCH;
    const thumbnailUrl = pickImage(manifest, {
      page: r.olsen_page,
      needles: [sku, type, r.notes],
      categoryHints: ['trim_carpentry'],
    });
    return baseItem({
      id: `olsen-${slug(assetId || sku)}`,
      sku: sku || assetId,
      vendorId: 'olsen',
      name: `${type} · ${sku}${r.notes ? ` · ${r.notes}` : ''}`.trim(),
      brand: 'Olsen',
      category: 'Trim',
      subcategory: type,
      roomTypes: ['Bedroom', 'Living room', 'Dining room', 'Hallway', 'Kitchen', 'Bathroom'],
      tags: ['olsen', 'master-catalog', 'trim', slug(type)],
      dims: [1, depth, height],
      color: hashColor(sku),
      priceUnit: 'linear ft',
      mountingType: 'floor',
      placementSurfaces: ['floor'],
      placementMode: 'floor-perimeter',
      thumbnailUrl: thumbnailUrl || undefined,
      sourceTab: 'Trim Material',
      section: type,
      sourceLabel: 'Olsen Master Catalog',
      note: profile ? `Profile: ${profile}` : '',
    });
  });
}

/** Look Book image candidates for categories not represented as Master Catalog rows. */
function buildImageCandidateItems(manifest, usedImages) {
  const items = [];
  for (const c of manifest) {
    const meta = IMAGE_CATEGORY_META[c.category];
    if (!meta) continue;
    if (!c.imageFile || usedImages.has(publicThumbPath(c.imageFile))) continue;
    const label = c.nearbyText.replace(/\s+/g, ' ').trim() || c.id || c.imageFile;
    const name = label.length > 90 ? `${label.slice(0, 87)}…` : label;
    const thumb = publicThumbPath(c.imageFile);
    usedImages.add(thumb);
    items.push(
      baseItem({
        id: `olsen-img-${slug(c.id || c.imageFile)}`,
        sku: c.id || slug(c.imageFile),
        vendorId: 'olsen-lookbook',
        name,
        brand: 'Olsen Look Book',
        category: meta.category,
        subcategory: meta.subcategory,
        roomTypes: meta.rooms,
        tags: ['olsen', 'lookbook-image', slug(c.category), 'unreviewed'],
        dims: dimsForTab(meta.sourceTab) ?? [0.6, 0.6, 0.6],
        color: hashColor(c.id || name),
        priceUnit: 'each',
        mountingType: meta.mountingType,
        placementSurfaces: meta.surfaces,
        thumbnailUrl: thumb,
        sourceTab: meta.sourceTab,
        section: c.category,
        sourceLabel: 'Olsen Look Book image',
        note: `Page ${c.page} · ${c.strategy || 'image candidate'} · review before assigning SKU`,
        placeholderOnly: false,
      }),
    );
  }
  return items;
}

function buildCostLibraryItems() {
  if (!existsSync(costXlsx)) return [];
  const workbook = XLSX.read(readFileSync(costXlsx), { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets['Master Cost Library'];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const items = [];
  const seen = new Set();

  for (const raw of rows) {
    const tab = raw.Source_Tab;
    if (!COST_LIBRARY_TABS.has(tab)) continue;
    const row = {
      Cost_ID: raw.Cost_ID,
      Source_Tab: tab,
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

    const vendor = String(row.Vendor_Source ?? row.Section ?? 'Olsen').trim();
    const vendorId = slug(vendor);
    const cat = TAB_CATEGORY[tab] ?? { category: 'Specialties', subcategory: tab };
    const placement = TAB_PLACEMENT[tab] ?? { mountingType: 'floor', surfaces: ['floor'] };
    const texturePack = TEXTURE_BY_TAB[tab];
    const level = row.Level ? String(row.Level).trim() : undefined;
    const itemName = String(row.Item_Name ?? 'Item').trim();
    const displayName = level ? `${itemName} · ${level}` : itemName;
    const amount = Number(row.Amount);

    items.push(
      baseItem({
        id: `olsen-${costId.toLowerCase()}`,
        sku: costId,
        vendorId,
        name: displayName,
        brand: vendor,
        category: cat.category,
        subcategory: cat.subcategory,
        roomTypes: TAB_ROOMS[tab] ?? [],
        tags: ['olsen', 'cost-library', slug(tab), ...(level ? [slug(level)] : [])],
        dims: dimsForTab(tab),
        color: hashColor(`${vendor}-${itemName}-${level ?? ''}`),
        cost: amount,
        price: amount,
        priceUnit: mapUnit(row.Unit),
        priceVerifiedAt: row.Last_Revision
          ? new Date(row.Last_Revision).toISOString().slice(0, 10)
          : '2026-01-01',
        placeholderOnly: !texturePack?.textureUrl,
        mountingType: placement.mountingType ?? 'floor',
        placementSurfaces: placement.surfaces ?? ['floor'],
        ...(placement.placementMode ? { placementMode: placement.placementMode } : {}),
        ...(texturePack ?? {}),
        level,
        sourceTab: tab,
        section: row.Section ? String(row.Section) : undefined,
        sourceLabel: 'Olsen Cost Library 2026',
        note: row.Notes ? String(row.Notes) : `Imported from ${tab}`,
      }),
    );
  }
  return items;
}

function main() {
  if (!existsSync(masterXlsx)) {
    console.error(`Missing master catalog: ${masterXlsx}`);
    process.exit(1);
  }
  if (!existsSync(publicInventory)) {
    console.error(`Missing public inventory images at ${publicInventory}. Copy package inventory_images first.`);
    process.exit(1);
  }

  const workbook = XLSX.read(readFileSync(masterXlsx), { type: 'buffer', cellDates: true });
  const manifest = loadManifest();

  const moen = buildMoenItems(workbook, manifest);
  const eagle = buildEagleItems(workbook, manifest);
  const tremron = buildTremronItems(workbook, manifest);
  const sinks = buildSinkItems(workbook, manifest);
  const trim = buildTrimItems(workbook, manifest);
  const masterItems = [...moen, ...eagle, ...tremron, ...sinks, ...trim];

  const usedImages = new Set(masterItems.map((i) => i.thumbnailUrl).filter(Boolean));
  const imageCandidates = buildImageCandidateItems(manifest, usedImages);
  const costItems = buildCostLibraryItems();

  let items = [...masterItems, ...imageCandidates, ...costItems];

  // De-dupe by id (kit stubs stay in plumbingKitStubs.json and merge at runtime)
  const byId = new Map();
  for (const item of items) byId.set(item.id, item);
  items = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));

  const meta = {
    generatedAt: new Date().toISOString(),
    sourcePackage: 'Olsen_Inventory_Images_and_Master_Catalog',
    masterCatalogFile: 'Olsen_3D_Full_Master_Catalog_Updated.xlsx',
    costLibraryFile: 'Olsen_Cost_Library_All_Tabs_Reformatted_2026.xlsx',
    rowCount: items.length,
    counts: {
      moenVariants: moen.length,
      eagleRoofing: eagle.length,
      tremronPavers: tremron.length,
      sinks: sinks.length,
      trim: trim.length,
      lookbookImageCandidates: imageCandidates.length,
      costLibrarySelectionTabs: costItems.length,
      withInventoryPhoto: items.filter((i) => i.thumbnailUrl?.includes('/catalog/olsen/inventory/')).length,
    },
    tabs: [...new Set(items.map((i) => i.sourceTab).filter(Boolean))].sort(),
    categories: [...new Set(items.map((i) => i.category))].sort(),
  };

  writeFileSync(outPath, `${JSON.stringify(items, null, 2)}\n`);
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, ...meta }, null, 2));
}

main();
