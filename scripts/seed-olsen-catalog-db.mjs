#!/usr/bin/env node
/**
 * Seed Postgres `products` (+ vendors / prices / assets / room types) from
 * src/lib/catalog/olsenCatalogSeed.json (+ plumbing kit stubs).
 *
 * Usage:
 *   DATABASE_URL=postgres://… npm run catalog:seed-db
 *   DATABASE_URL=… npm run catalog:seed-db -- --replace-olsen
 *
 * --replace-olsen  soft-deactivates existing products for Olsen-related vendors
 *                  before upsert (keeps non-Olsen rows).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = join(root, 'src/lib/catalog/olsenCatalogSeed.json');
const stubsPath = join(root, 'src/lib/catalog/plumbingKitStubs.json');
const url = process.env.DATABASE_URL;
const replaceOlsen = process.argv.includes('--replace-olsen');

if (!url) {
  console.error(JSON.stringify({ ok: false, error: 'DATABASE_URL is required' }));
  process.exit(1);
}
if (!existsSync(seedPath)) {
  console.error(JSON.stringify({ ok: false, error: `Missing ${seedPath}` }));
  process.exit(1);
}

function positiveDim(n, fallback = 0.6) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function mapSeedItem(item) {
  const dims = Array.isArray(item.dims) ? item.dims : [0.6, 0.6, 0.6];
  const vendorId = String(item.vendorId || 'olsen').trim() || 'olsen';
  const sku = String(item.sku || item.id).trim();
  if (!sku) return null;
  return {
    vendorId,
    vendorName: String(item.brand || vendorId),
    sku,
    manufacturer: item.brand || null,
    name: String(item.name || sku),
    description: item.note || null,
    category: String(item.category || 'Specialties'),
    subcategory: item.subcategory || null,
    roomTypes: Array.isArray(item.roomTypes) ? item.roomTypes.filter(Boolean) : [],
    tags: Array.isArray(item.tags) ? item.tags.filter(Boolean) : [],
    sellable: item.sellable !== false,
    placeholderOnly: Boolean(item.placeholderOnly),
    mountingType: item.mountingType || 'floor',
    placementSurfaces: Array.isArray(item.placementSurfaces) && item.placementSurfaces.length
      ? item.placementSurfaces
      : ['floor'],
    placementMode: item.placementMode || null,
    level: item.level || null,
    sourceTab: item.sourceTab || null,
    section: item.section || null,
    dimensions: {
      width: positiveDim(dims[0]),
      depth: positiveDim(dims[1]),
      height: positiveDim(dims[2]),
      unit: 'm',
    },
    color: item.color || null,
    finish: item.finish || null,
    material: item.material || null,
    productUrl: item.sourceUrl || null,
    price: item.price != null && Number.isFinite(Number(item.price)) ? Number(item.price) : null,
    cost: item.cost != null && Number.isFinite(Number(item.cost)) ? Number(item.cost) : null,
    currency: item.currency || 'USD',
    priceUnit: item.priceUnit || 'each',
    priceVerifiedAt: item.priceVerifiedAt || null,
    thumbnailUrl: item.thumbnailUrl || null,
    textureUrl: item.textureUrl || null,
    roughnessMapUrl: item.roughnessMapUrl || null,
    normalMapUrl: item.normalMapUrl || null,
    textureRepeat: item.textureRepeat ?? null,
    roughness: item.roughness ?? null,
    modelUrl: item.modelUrl && /^https?:\/\//i.test(item.modelUrl) ? item.modelUrl : null,
    lowPolyModelUrl:
      item.lowPolyModelUrl && /^https?:\/\//i.test(item.lowPolyModelUrl) ? item.lowPolyModelUrl : null,
    active: true,
    sourceLabel: item.sourceLabel || 'Olsen catalog seed',
  };
}

const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
const stubs = existsSync(stubsPath) ? JSON.parse(readFileSync(stubsPath, 'utf8')) : [];
const items = [...seed, ...stubs].map(mapSeedItem).filter(Boolean);

// De-dupe by vendorId|sku (last wins)
const byKey = new Map();
for (const item of items) byKey.set(`${item.vendorId}|${item.sku}`, item);
const unique = [...byKey.values()];

const vendorIds = [...new Set(unique.map((i) => i.vendorId))];

const client = new pg.Client({
  connectionString: url,
  ssl: /neon\.tech|sslmode=require/i.test(url) ? { rejectUnauthorized: false } : undefined,
});
await client.connect();

let created = 0;
let updated = 0;
const vendorIds = [...new Set(unique.map((i) => i.vendorId))];

try {
  await client.query('BEGIN');

  const job = (
    await client.query(
      `INSERT INTO catalog_import_jobs(file_name, mode, row_count, status)
       VALUES($1,$2,$3,'processing') RETURNING id`,
      ['olsenCatalogSeed.json', replaceOlsen ? 'replace-olsen' : 'create-update', unique.length],
    )
  ).rows[0];

  if (replaceOlsen) {
    await client.query(
      `UPDATE products SET active=false, updated_at=now()
       WHERE vendor_id = ANY($1::text[])
          OR vendor_id LIKE 'olsen%'
          OR tags && ARRAY['olsen','master-catalog','cost-library','lookbook-image']::text[]`,
      [vendorIds],
    );
  }

  for (const item of unique) {
    await client.query(
      `INSERT INTO vendors(id, name) VALUES($1,$2)
       ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, updated_at=now()`,
      [item.vendorId, item.vendorName],
    );

    const existing = (
      await client.query('SELECT id FROM products WHERE vendor_id=$1 AND sku=$2', [item.vendorId, item.sku])
    ).rows[0];

    const product = (
      await client.query(
        `INSERT INTO products(
          vendor_id,sku,manufacturer,name,description,category,subcategory,tags,sellable,placeholder_only,
          mounting_type,placement_surfaces,placement_mode,level,source_tab,section,dimensions,color,finish,material,
          texture_url,roughness_map_url,normal_map_url,texture_repeat,roughness,product_url,active
        ) VALUES(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,true
        )
        ON CONFLICT(vendor_id,sku) DO UPDATE SET
          manufacturer=EXCLUDED.manufacturer,name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,
          subcategory=EXCLUDED.subcategory,tags=EXCLUDED.tags,sellable=EXCLUDED.sellable,placeholder_only=EXCLUDED.placeholder_only,
          mounting_type=EXCLUDED.mounting_type,placement_surfaces=EXCLUDED.placement_surfaces,placement_mode=EXCLUDED.placement_mode,
          level=EXCLUDED.level,source_tab=EXCLUDED.source_tab,section=EXCLUDED.section,dimensions=EXCLUDED.dimensions,
          color=EXCLUDED.color,finish=EXCLUDED.finish,material=EXCLUDED.material,texture_url=EXCLUDED.texture_url,
          roughness_map_url=EXCLUDED.roughness_map_url,normal_map_url=EXCLUDED.normal_map_url,texture_repeat=EXCLUDED.texture_repeat,
          roughness=EXCLUDED.roughness,product_url=EXCLUDED.product_url,active=true,updated_at=now()
        RETURNING id`,
        [
          item.vendorId,
          item.sku,
          item.manufacturer,
          item.name,
          item.description,
          item.category,
          item.subcategory,
          item.tags,
          item.sellable,
          item.placeholderOnly,
          item.mountingType,
          item.placementSurfaces,
          item.placementMode,
          item.level,
          item.sourceTab,
          item.section,
          JSON.stringify(item.dimensions),
          item.color,
          item.finish,
          item.material,
          item.textureUrl,
          item.roughnessMapUrl,
          item.normalMapUrl,
          item.textureRepeat,
          item.roughness,
          item.productUrl,
        ],
      )
    ).rows[0];

    if (existing) updated++;
    else created++;

    await client.query('DELETE FROM product_room_types WHERE product_id=$1', [product.id]);
    for (const room of item.roomTypes) {
      await client.query(
        'INSERT INTO product_room_types(product_id,room_type) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [product.id, room],
      );
    }

    await client.query('DELETE FROM product_prices WHERE product_id=$1', [product.id]);
    await client.query(
      `INSERT INTO product_prices(product_id,currency,price,price_unit,cost,taxable,verified_at,source)
       VALUES($1,$2,$3,$4,$5,true,$6,$7)`,
      [
        product.id,
        item.currency,
        item.price,
        item.priceUnit,
        item.cost,
        item.priceVerifiedAt,
        item.sourceLabel,
      ],
    );

    await client.query('DELETE FROM product_assets WHERE product_id=$1', [product.id]);
    for (const [kind, assetUrl] of [
      ['thumbnail', item.thumbnailUrl],
      ['model', item.modelUrl],
      ['low_poly_model', item.lowPolyModelUrl],
    ]) {
      if (assetUrl) {
        await client.query(
          'INSERT INTO product_assets(product_id,kind,url) VALUES($1,$2,$3)',
          [product.id, kind, assetUrl],
        );
      }
    }
  }

  await client.query(
    `UPDATE catalog_import_jobs
     SET status='completed', created_count=$1, updated_count=$2, skipped_count=0, completed_at=now()
     WHERE id=$3`,
    [created, updated, job.id],
  );

  await client.query('COMMIT');

  const counts = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM products WHERE active) AS active_products,
      (SELECT COUNT(*)::int FROM vendors WHERE active) AS vendors,
      (SELECT COUNT(*)::int FROM product_assets) AS assets,
      (SELECT COUNT(*)::int FROM product_prices) AS prices
  `);

  console.log(
    JSON.stringify(
      {
        ok: true,
        jobId: job.id,
        created,
        updated,
        imported: unique.length,
        replaceOlsen,
        ...counts.rows[0],
      },
      null,
      2,
    ),
  );
} catch (err) {
  await client.query('ROLLBACK');
  console.error(err);
  process.exit(1);
} finally {
  await client.end();
}
