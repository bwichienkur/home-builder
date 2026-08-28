#!/usr/bin/env node
/** Export baked Olsen seed to vendor import JSON for POST /api/admin/catalog/import */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seed = JSON.parse(readFileSync(join(root, 'src/lib/catalog/olsenCatalogSeed.json'), 'utf8'));
const out = join(root, 'scripts/out/olsen-vendor-import.json');

const rows = seed.map((item) => ({
  vendorId: item.vendorId,
  vendorName: item.brand ?? item.vendorId,
  sku: item.sku,
  name: item.name,
  category: item.category,
  subcategory: item.subcategory,
  roomTypes: item.roomTypes ?? [],
  tags: item.tags ?? [],
  sellable: item.sellable ?? true,
  placeholderOnly: item.placeholderOnly ?? true,
  mountingType: item.mountingType ?? 'floor',
  placementSurfaces: item.placementSurfaces ?? ['floor'],
  placementMode: item.placementMode,
  level: item.level,
  sourceTab: item.sourceTab,
  section: item.section,
  dimensions: {
    width: item.dims[0],
    depth: item.dims[1],
    height: item.dims[2],
    unit: 'm',
  },
  color: item.color,
  finish: item.finish,
  material: item.material,
  price: item.price,
  cost: item.cost,
  currency: item.currency ?? 'USD',
  priceUnit: item.priceUnit ?? 'each',
  priceVerifiedAt: item.priceVerifiedAt,
  thumbnailUrl: item.thumbnailUrl?.startsWith('http') ? item.thumbnailUrl : item.thumbnailUrl ? `http://localhost:5173${item.thumbnailUrl}` : '',
  textureUrl: item.textureUrl,
  roughnessMapUrl: item.roughnessMapUrl,
  normalMapUrl: item.normalMapUrl,
  textureRepeat: item.textureRepeat,
  roughness: item.roughness,
  modelUrl: item.modelUrl ?? '',
  lowPolyModelUrl: item.lowPolyModelUrl ?? '',
  active: true,
}));

writeFileSync(out, `${JSON.stringify(rows, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, rows: rows.length, out }, null, 2));
