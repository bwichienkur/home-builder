#!/usr/bin/env node
/** Weekly Olsen Cost Library refresh — rebuild seed and report delta-sensitive SKU count. */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const metaPath = join(root, 'src/lib/catalog/olsenCatalogMeta.json');
const xlsxPath = join(root, 'Olsen_Cost_Library_All_Tabs_Reformatted_2026.xlsx');

if (!existsSync(xlsxPath)) {
  console.error(JSON.stringify({ ok: false, error: `Missing ${xlsxPath}` }));
  process.exit(1);
}

const before = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : null;
execSync('node scripts/build-olsen-catalog.mjs', { cwd: root, stdio: 'inherit' });
try {
  execSync('python3 scripts/extract-lookbook-thumbs.py', { cwd: root, stdio: 'inherit' });
  execSync('node scripts/build-olsen-catalog.mjs', { cwd: root, stdio: 'inherit' });
} catch {
  console.warn('Lookbook refresh skipped or failed — catalog seed still rebuilt.');
}

const after = JSON.parse(readFileSync(metaPath, 'utf8'));
console.log(
  JSON.stringify(
    {
      ok: true,
      refreshedAt: new Date().toISOString(),
      beforeRows: before?.rowCount ?? null,
      afterRows: after.rowCount,
      lookbookThumbs: after.lookbookThumbs,
      withPhotoThumb: after.withPhotoThumb,
    },
    null,
    2,
  ),
);
