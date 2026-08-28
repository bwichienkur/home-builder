#!/usr/bin/env node
/**
 * Convert plans/source/183-stillwater/MODEL.dwg → filtered DXF → HousePlan JSON seed.
 * Run: npm run plan:import-stillwater
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { init, convertDwgToDxf } from 'dwgdxf';
import { importDxfHousePlan } from '../src/lib/housePlans/dxfImport.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'plans/source/183-stillwater');
const dwg = join(srcDir, 'MODEL.dwg');
const dxf = join(srcDir, 'MODEL.dxf');
const wallsDxf = join(srcDir, 'MODEL.walls.dxf');
const outJson = join(root, 'src/lib/housePlans/stillwater183Plan.json');

async function main() {
  if (!existsSync(dwg)) {
    console.error(JSON.stringify({ ok: false, error: `Missing ${dwg}` }));
    process.exit(1);
  }

  if (!existsSync(dxf)) {
    await init();
    const bytes = readFileSync(dwg);
    const converted = await convertDwgToDxf(new Uint8Array(bytes));
    writeFileSync(dxf, converted);
    console.log(JSON.stringify({ step: 'dwg→dxf', bytes: converted.length }));
  }

  if (!existsSync(wallsDxf)) {
    const { execSync } = await import('node:child_process');
    execSync(`node scripts/filter-dxf-layers.mjs "${dxf}"`, { stdio: 'inherit' });
  }

  const filtered = readFileSync(wallsDxf, 'utf8');
  const result = importDxfHousePlan(filtered, '183 Stillwater · Veranda Model 183');
  const plan = {
    ...result.plan,
    id: 'stillwater-183',
    name: '183 Stillwater · Veranda Model 183',
    sourceUrl: 'plans/source/183-stillwater/MODEL.dwg',
    note: 'Imported from Olsen AutoCAD MODEL.dwg (wall layers). Review room names and sizes in Build.',
    flyerUrl: undefined,
  };
  writeFileSync(outJson, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        rooms: plan.floors[0]?.rooms.length ?? 0,
        lines: result.lineCount,
        livingSqFt: plan.livingSqFt,
        warnings: result.warnings.slice(0, 6),
        outJson,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
