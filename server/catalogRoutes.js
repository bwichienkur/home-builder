import { z } from 'zod';

export const inventoryRow = z.object({
  vendorId: z.string().min(1),
  vendorName: z.string().min(1),
  vendorWebsite: z.string().url().optional().or(z.literal('')),
  sku: z.string().min(1),
  manufacturer: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  subcategory: z.string().optional(),
  roomTypes: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  sellable: z.boolean().default(true),
  placeholderOnly: z.boolean().default(false),
  mountingType: z.string().default('floor'),
  placementSurfaces: z.array(z.string()).default(['floor']),
  placementMode: z.string().optional(),
  level: z.string().optional(),
  sourceTab: z.string().optional(),
  section: z.string().optional(),
  dimensions: z.object({
    width: z.number().positive(),
    depth: z.number().positive(),
    height: z.number().positive(),
    unit: z.string().default('m'),
  }),
  color: z.string().optional(),
  finish: z.string().optional(),
  material: z.string().optional(),
  productUrl: z.string().optional().or(z.literal('')),
  price: z.number().nonnegative().optional(),
  currency: z.string().default('USD'),
  priceUnit: z.string().default('each'),
  msrp: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  laborCost: z.number().nonnegative().optional(),
  wasteFactorPercent: z.number().nonnegative().optional(),
  taxable: z.boolean().default(true),
  priceVerifiedAt: z.string().optional(),
  thumbnailUrl: z.string().optional().or(z.literal('')),
  textureUrl: z.string().optional().or(z.literal('')),
  roughnessMapUrl: z.string().optional().or(z.literal('')),
  normalMapUrl: z.string().optional().or(z.literal('')),
  textureRepeat: z.number().nonnegative().optional(),
  roughness: z.number().nonnegative().optional(),
  modelUrl: z.string().url().optional().or(z.literal('')),
  lowPolyModelUrl: z.string().url().optional().or(z.literal('')),
  availability: z.string().optional(),
  leadTimeDays: z.number().int().nonnegative().optional(),
  active: z.boolean().default(true),
});

const CATALOG_SELECT = `
SELECT p.id,p.vendor_id AS "vendorId",v.name AS brand,p.sku,p.name,p.category,p.subcategory,
  p.dimensions,p.color,p.finish,p.material,p.sellable,p.placeholder_only AS "placeholderOnly",
  p.mounting_type AS "mountingType",p.placement_surfaces AS "placementSurfaces",
  p.placement_mode AS "placementMode",p.level,p.source_tab AS "sourceTab",p.section,
  p.texture_url AS "textureUrl",p.roughness_map_url AS "roughnessMapUrl",p.normal_map_url AS "normalMapUrl",
  p.texture_repeat AS "textureRepeat",p.roughness,p.product_url AS "sourceUrl",
  price.price,price.currency,price.price_unit AS "priceUnit",price.verified_at AS "priceVerifiedAt",
  thumb.url AS "thumbnailUrl",model.url AS "modelUrl",proxy.url AS "lowPolyModelUrl",
  coalesce(array_agg(DISTINCT rt.room_type) FILTER (WHERE rt.room_type IS NOT NULL),'{}') AS "roomTypes"
FROM products p
JOIN vendors v ON v.id=p.vendor_id
LEFT JOIN product_room_types rt ON rt.product_id=p.id
LEFT JOIN LATERAL (
  SELECT * FROM product_prices pp WHERE pp.product_id=p.id
  ORDER BY verified_at DESC NULLS LAST,created_at DESC LIMIT 1
) price ON true
LEFT JOIN LATERAL (
  SELECT url FROM product_assets a WHERE a.product_id=p.id AND kind='thumbnail' AND active LIMIT 1
) thumb ON true
LEFT JOIN LATERAL (
  SELECT url FROM product_assets a WHERE a.product_id=p.id AND kind='model' AND active LIMIT 1
) model ON true
LEFT JOIN LATERAL (
  SELECT url FROM product_assets a WHERE a.product_id=p.id AND kind='low_poly_model' AND active LIMIT 1
) proxy ON true
WHERE p.active
  AND ($1='' OR to_tsvector('english',coalesce(p.name,'')||' '||coalesce(p.sku,'')||' '||coalesce(p.manufacturer,'')) @@ plainto_tsquery('english',$1))
  AND ($2='' OR rt.room_type=$2)
  AND ($3='' OR p.vendor_id=$3)
  AND ($4='' OR p.category=$4)
GROUP BY p.id,v.name,price.price,price.currency,price.price_unit,price.verified_at,thumb.url,model.url,proxy.url
ORDER BY p.name LIMIT $5 OFFSET $6`;

export function mountCatalogRoutes(app, pool) {
  app.get('/api/catalog', async (req, res, next) => {
    try {
      const q = String(req.query.q ?? '');
      const room = String(req.query.room ?? '');
      const vendor = String(req.query.vendor ?? '');
      const category = String(req.query.category ?? '');
      const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
      const offset = Math.max(0, Number(req.query.cursor ?? 0));
      if (!pool) return res.json({ items: [], nextCursor: null, mode: 'configure-database' });
      const { rows } = await pool.query(CATALOG_SELECT, [q, room, vendor, category, limit, offset]);
      res.json({ items: rows, nextCursor: rows.length === limit ? String(offset + limit) : null });
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/admin/vendors', async (_req, res, next) => {
    try {
      if (!pool) return res.status(503).json({ error: 'DATABASE_URL is not configured' });
      const { rows } = await pool.query(
        'SELECT v.id,v.name,v.website,v.active,count(p.id)::int AS "productCount" FROM vendors v LEFT JOIN products p ON p.vendor_id=v.id GROUP BY v.id ORDER BY v.name',
      );
      res.json({ items: rows });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/admin/catalog/import', async (req, res, next) => {
    if (!pool) return res.status(503).json({ error: 'DATABASE_URL is not configured' });
    const mode = String(req.body.mode ?? 'create-update');
    const rows = Array.isArray(req.body.items) ? req.body.items : [];
    const validated = rows.map((row, index) => ({ index: index + 2, row, result: inventoryRow.safeParse(row) }));
    const failures = validated.filter((x) => !x.result.success);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const job = (
        await client.query(
          'INSERT INTO catalog_import_jobs(user_id,file_name,mode,row_count,status) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [req.userId, String(req.body.fileName ?? 'inventory upload'), mode, rows.length, failures.length ? 'failed' : 'processing'],
        )
      ).rows[0];
      if (failures.length) {
        for (const failure of failures) {
          await client.query(
            'INSERT INTO catalog_import_errors(import_job_id,row_number,raw_row,errors) VALUES($1,$2,$3,$4)',
            [job.id, failure.index, failure.row, failure.result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)],
          );
        }
        await client.query('UPDATE catalog_import_jobs SET error_count=$1,completed_at=now() WHERE id=$2', [failures.length, job.id]);
        await client.query('COMMIT');
        return res.status(400).json({ jobId: job.id, errorCount: failures.length });
      }
      const items = validated.map((x) => x.result.data);
      const vendorIds = [...new Set(items.map((i) => i.vendorId))];
      if (mode === 'replace-vendor' && vendorIds.length) {
        await client.query('UPDATE products SET active=false,updated_at=now() WHERE vendor_id=ANY($1)', [vendorIds]);
      }
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const item of items) {
        await client.query(
          'INSERT INTO vendors(id,name,website) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=excluded.name,website=excluded.website,updated_at=now()',
          [item.vendorId, item.vendorName, item.vendorWebsite || null],
        );
        const existing = (await client.query('SELECT id FROM products WHERE vendor_id=$1 AND sku=$2', [item.vendorId, item.sku])).rows[0];
        if (existing && mode === 'create-only') {
          skipped++;
          continue;
        }
        const product = (
          await client.query(
            `INSERT INTO products(
              vendor_id,sku,manufacturer,name,description,category,subcategory,tags,sellable,placeholder_only,
              mounting_type,placement_surfaces,placement_mode,level,source_tab,section,dimensions,color,finish,material,
              texture_url,roughness_map_url,normal_map_url,texture_repeat,roughness,availability,lead_time_days,product_url,active
            ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
            ON CONFLICT(vendor_id,sku) DO UPDATE SET
              manufacturer=excluded.manufacturer,name=excluded.name,description=excluded.description,category=excluded.category,
              subcategory=excluded.subcategory,tags=excluded.tags,sellable=excluded.sellable,placeholder_only=excluded.placeholder_only,
              mounting_type=excluded.mounting_type,placement_surfaces=excluded.placement_surfaces,placement_mode=excluded.placement_mode,
              level=excluded.level,source_tab=excluded.source_tab,section=excluded.section,dimensions=excluded.dimensions,color=excluded.color,
              finish=excluded.finish,material=excluded.material,texture_url=excluded.texture_url,roughness_map_url=excluded.roughness_map_url,
              normal_map_url=excluded.normal_map_url,texture_repeat=excluded.texture_repeat,roughness=excluded.roughness,
              availability=excluded.availability,lead_time_days=excluded.lead_time_days,product_url=excluded.product_url,
              active=excluded.active,updated_at=now()
            RETURNING id`,
            [
              item.vendorId,
              item.sku,
              item.manufacturer || null,
              item.name,
              item.description || null,
              item.category,
              item.subcategory || null,
              item.tags,
              item.sellable,
              item.placeholderOnly,
              item.mountingType,
              item.placementSurfaces,
              item.placementMode || null,
              item.level || null,
              item.sourceTab || null,
              item.section || null,
              item.dimensions,
              item.color || null,
              item.finish || null,
              item.material || null,
              item.textureUrl || null,
              item.roughnessMapUrl || null,
              item.normalMapUrl || null,
              item.textureRepeat ?? null,
              item.roughness ?? null,
              item.availability || null,
              item.leadTimeDays ?? null,
              item.productUrl || null,
              item.active,
            ],
          )
        ).rows[0];
        existing ? updated++ : created++;
        await client.query('DELETE FROM product_room_types WHERE product_id=$1', [product.id]);
        for (const room of item.roomTypes) {
          await client.query('INSERT INTO product_room_types(product_id,room_type) VALUES($1,$2) ON CONFLICT DO NOTHING', [product.id, room]);
        }
        await client.query('DELETE FROM product_prices WHERE product_id=$1', [product.id]);
        await client.query(
          'INSERT INTO product_prices(product_id,currency,price,price_unit,msrp,cost,labor_cost,waste_factor_percent,taxable,verified_at,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [
            product.id,
            item.currency,
            item.price ?? null,
            item.priceUnit,
            item.msrp ?? null,
            item.cost ?? null,
            item.laborCost ?? null,
            item.wasteFactorPercent ?? null,
            item.taxable,
            item.priceVerifiedAt || null,
            'vendor import',
          ],
        );
        await client.query('DELETE FROM product_assets WHERE product_id=$1', [product.id]);
        for (const [kind, url] of [
          ['thumbnail', item.thumbnailUrl],
          ['model', item.modelUrl],
          ['low_poly_model', item.lowPolyModelUrl],
        ]) {
          if (url) await client.query('INSERT INTO product_assets(product_id,kind,url) VALUES($1,$2,$3)', [product.id, kind, url]);
        }
      }
      await client.query('UPDATE catalog_import_jobs SET status=$1,created_count=$2,updated_count=$3,skipped_count=$4,completed_at=now() WHERE id=$5', [
        'completed',
        created,
        updated,
        skipped,
        job.id,
      ]);
      await client.query('COMMIT');
      res.status(201).json({ jobId: job.id, created, updated, skipped });
    } catch (e) {
      await client.query('ROLLBACK');
      next(e);
    } finally {
      client.release();
    }
  });
}
