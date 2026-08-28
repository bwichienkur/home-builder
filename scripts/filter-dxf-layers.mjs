#!/usr/bin/env node
/** Filter DXF entities to selected layers (LINE / LWPOLYLINE only). */
import { readFileSync, writeFileSync } from 'node:fs';

const ALLOW = new Set(
  process.argv[3]?.split(',').map((s) => s.trim()) ?? [
    'WALLS INT',
    'WALLS EXT',
    'WALL EXT',
    'wall-external',
    'DOORS',
    'doors-window',
  ],
);
const TYPES = new Set(['LINE', 'LWPOLYLINE', 'POLYLINE']);

const inPath = process.argv[2];
const outPath = process.argv[4] ?? inPath.replace(/\.dxf$/i, '.walls.dxf');
if (!inPath) {
  console.error('Usage: node scripts/filter-dxf-layers.mjs input.dxf [layers] [output.dxf]');
  process.exit(1);
}

const raw = readFileSync(inPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const lines = raw.split('\n');
const entities = [];

for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() !== '0') continue;
  const type = (lines[i + 1] ?? '').trim().toUpperCase();
  if (!TYPES.has(type)) continue;
  const entity = [lines[i], lines[i + 1]];
  i += 2;
  let layer = '';
  while (i < lines.length && lines[i].trim() !== '0') {
    entity.push(lines[i], lines[i + 1] ?? '');
    if (lines[i].trim() === '8') layer = (lines[i + 1] ?? '').trim();
    i += 2;
  }
  i -= 2;
  if (ALLOW.has(layer)) entities.push(...entity);
}

const dxf = [
  '  0', 'SECTION', '  2', 'HEADER', '  9', '$ACADVER', '  1', 'AC1018', '  0', 'ENDSEC',
  '  0', 'SECTION', '  2', 'ENTITIES',
  ...entities,
  '  0', 'ENDSEC', '  0', 'EOF', '',
].join('\n');
writeFileSync(outPath, dxf);
console.log(JSON.stringify({ ok: true, entities: entities.length / 2, output: outPath, bytes: dxf.length }, null, 2));
