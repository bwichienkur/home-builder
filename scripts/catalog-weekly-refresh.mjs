#!/usr/bin/env node
/** Refresh Olsen catalog from Master Catalog package (+ Cost Library selection tabs). */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const metaPath = join(root, 'src/lib/catalog/olsenCatalogMeta.json');
const packageDir = join(root, 'Olsen_Inventory_Images_and_Master_Catalog');
const masterXlsx = join(packageDir, 'Olsen_3D_Full_Master_Catalog_Updated.xlsx');
const costXlsx = join(root, 'Olsen_Cost_Library_All_Tabs_Reformatted_2026.xlsx');
const publicInventory = join(root, 'public/catalog/olsen/inventory');
const publicRef = join(root, 'public/catalog/olsen/lookbook-ref');

if (!existsSync(masterXlsx)) {
  console.error(JSON.stringify({ ok: false, error: `Missing ${masterXlsx}` }));
  process.exit(1);
}
if (!existsSync(costXlsx)) {
  console.error(JSON.stringify({ ok: false, error: `Missing ${costXlsx}` }));
  process.exit(1);
}

const before = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : null;

// Keep public assets in sync with the source package.
cpSync(join(packageDir, 'inventory_images'), publicInventory, { recursive: true });
cpSync(join(packageDir, 'lookbook_reference_pages'), publicRef, { recursive: true });
cpSync(join(packageDir, 'inventory_image_manifest.csv'), join(root, 'public/catalog/olsen/inventory_image_manifest.csv'));

execSync('node scripts/build-olsen-catalog.mjs', { cwd: root, stdio: 'inherit' });

const after = JSON.parse(readFileSync(metaPath, 'utf8'));
console.log(
  JSON.stringify(
    {
      ok: true,
      refreshedAt: new Date().toISOString(),
      beforeRows: before?.rowCount ?? null,
      afterRows: after.rowCount,
      counts: after.counts,
    },
    null,
    2,
  ),
);
