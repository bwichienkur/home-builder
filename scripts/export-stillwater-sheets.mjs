/**
 * Export Stillwater MODEL.dxf paper viewports → public/plan-sheets/stillwater-183/*.svg
 * Run: node scripts/export-stillwater-sheets.mjs
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dxfPath = join(root, 'plans/source/183-stillwater/MODEL.dxf');
const outDir = join(root, 'public/plan-sheets/stillwater-183');

const SHEET_LAYERS = new Set([
  'WALLS INT', 'WALLS EXT', 'WALL EXT', 'wall-external', 'DOORS', 'doors-window',
  'WINDOWS', 'TEXT', 'TEXT ROOM', 'DIMS', 'DIM', 'COUNTER', 'FIXTURES', 'CONC',
  'ELECTRIC', 'ELECTRIC LINES', 'CEILING', 'NOTE', 'BORDER', 'ROOF', '0',
  '1st_Floor_Objects_Walls',
]);

const LABELS = [
  { order: 0, name: 'COVER', file: '00-cover.svg' },
  { order: 1, name: 'SHT. 1 FLOOR', file: '01-floor.svg' },
  { order: 2, name: 'SHT. 2 FRONT ELEVATION', file: '02-front-elevation.svg' },
  { order: 3, name: 'SHT. 3 SIDE ELEVATIONS', file: '03-side-elevations.svg' },
  { order: 4, name: 'SHT. 4 FOUNDATION', file: '04-foundation.svg' },
  { order: 5, name: 'SHT. 5 ELECTRICAL', file: '05-electrical.svg' },
  { order: 6, name: 'SHT. 6 DETAILS', file: '06-details.svg' },
  { order: 7, name: 'SHT. 7 NOTES', file: '07-notes.svg' },
  { order: 8, name: 'SHT. 8 TRUSS CONNECTOR', file: '08-truss.svg' },
];

function decodeMtext(raw) {
  return raw.replace(/\\P/gi, ' ').replace(/\{\\[^;]*;/g, '').replace(/\}/g, '')
    .replace(/\\[A-Za-z][^;\\]*;?/g, '').replace(/%%[Uu]/g, '').trim();
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parsePaper(dxfText) {
  const byBlock = new Map();
  const lines = dxfText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let section = null, inBlock = false, blockName = null, ent = null;
  const data = {};
  const ensure = (n) => {
    if (!byBlock.has(n)) byBlock.set(n, { block: n, titles: [], viewports: [] });
    return byBlock.get(n);
  };
  const flush = () => {
    if (!inBlock || !blockName || !ent || !blockName.startsWith('*PAPER')) {
      ent = null; Object.keys(data).forEach((k) => delete data[k]); return;
    }
    const meta = ensure(blockName);
    if (ent === 'VIEWPORT') {
      const cx = Number(data['12'] || 0), cy = Number(data['22'] || 0);
      const vh = Number(data['45'] || 0), pw = Number(data['40'] || 1), ph = Number(data['41'] || 1);
      if (vh > 0 && pw > 0 && ph > 0) {
        meta.viewports.push({ modelCx: cx, modelCy: cy, modelH: vh, modelW: vh * (pw / ph) });
      }
    } else if (ent === 'TEXT' || ent === 'MTEXT') {
      const t = decodeMtext(data['1'] || '');
      if (t) meta.titles.push(t);
    }
    ent = null; Object.keys(data).forEach((k) => delete data[k]);
  };
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    const value = (lines[i + 1] || '').trim();
    if (!Number.isFinite(code)) continue;
    if (code === 0 && value === 'SECTION') { section = null; continue; }
    if (code === 2 && section === null) { section = value; continue; }
    if (code === 0 && value === 'ENDSEC') { flush(); section = null; continue; }
    if (section !== 'BLOCKS') continue;
    if (code === 0) {
      if (value === 'BLOCK') { flush(); inBlock = true; blockName = null; }
      else if (value === 'ENDBLK') { flush(); inBlock = false; blockName = null; }
      else if (inBlock) { flush(); ent = value; }
      continue;
    }
    if (!inBlock) continue;
    if (blockName === null && code === 2) { blockName = value; continue; }
    if (ent && data[code] === undefined) data[code] = value;
    else if (ent && code === 3) data['1'] = (data['1'] || '') + value;
  }
  return [...byBlock.values()];
}

function extractGeom(dxfText) {
  const segs = [], labels = [];
  const lines = dxfText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let i = 0, section = null;
  while (i < lines.length) {
    if (lines[i].trim() === '0' && (lines[i + 1] || '').trim() === 'SECTION') {
      section = (lines[i + 3] || '').trim(); i += 4; continue;
    }
    if (lines[i].trim() === '0' && (lines[i + 1] || '').trim() === 'ENDSEC') {
      section = null; i += 2; continue;
    }
    if (section !== 'ENTITIES') { i += 1; continue; }
    if (lines[i].trim() !== '0') { i += 1; continue; }
    const type = (lines[i + 1] || '').trim().toUpperCase();
    const raw = [lines[i], lines[i + 1]]; i += 2;
    const fields = {};
    while (i < lines.length && lines[i].trim() !== '0') {
      raw.push(lines[i], lines[i + 1] || '');
      const c = lines[i].trim(), v = (lines[i + 1] || '').trim();
      if (c === '3' && fields['1']) fields['1'] += v;
      else if (!(c in fields)) fields[c] = v;
      i += 2;
    }
    if (fields['67'] === '1') continue;
    const layer = fields['8'] || '0';
    if (!SHEET_LAYERS.has(layer)) continue;
    if (type === 'LINE') {
      const x1 = Number(fields['10']), y1 = Number(fields['20']), x2 = Number(fields['11']), y2 = Number(fields['21']);
      if ([x1, y1, x2, y2].every(Number.isFinite)) segs.push({ x1, y1, x2, y2, layer });
    } else if (type === 'LWPOLYLINE') {
      const verts = []; let px = null, closed = false;
      for (let r = 0; r + 1 < raw.length; r += 2) {
        const c = raw[r].trim(), v = raw[r + 1].trim();
        if (c === '70') closed = (Number(v) & 1) === 1;
        if (c === '10') px = Number(v);
        if (c === '20' && px != null) { verts.push({ x: px, y: Number(v) }); px = null; }
      }
      for (let v = 0; v < verts.length - 1; v++) {
        segs.push({ x1: verts[v].x, y1: verts[v].y, x2: verts[v + 1].x, y2: verts[v + 1].y, layer });
      }
      if (closed && verts.length > 2) {
        const a = verts[verts.length - 1], b = verts[0];
        segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, layer });
      }
    } else if (type === 'TEXT' || type === 'MTEXT') {
      const text = decodeMtext(fields['1'] || '');
      const x = Number(fields['10']), y = Number(fields['20']);
      if (text && Number.isFinite(x) && Number.isFinite(y) && text.length < 80) labels.push({ x, y, text, layer });
    }
  }
  return { segs, labels };
}

function inView(x, y, vp, pad = 0.02) {
  const hx = vp.modelW * (0.5 + pad), hy = vp.modelH * (0.5 + pad);
  return x >= vp.modelCx - hx && x <= vp.modelCx + hx && y >= vp.modelCy - hy && y <= vp.modelCy + hy;
}

function stroke(layer) {
  const u = layer.toUpperCase();
  if (u.includes('WALL')) return '#1f2937';
  if (u.includes('DOOR')) return '#b45309';
  if (u.includes('WINDOW')) return '#0369a1';
  if (u.includes('TEXT')) return '#334155';
  if (u.includes('ELECTRIC')) return '#ca8a04';
  return '#475569';
}

function renderSvg(vp, segs, labels, title) {
  const minX = vp.modelCx - vp.modelW / 2, maxX = vp.modelCx + vp.modelW / 2;
  const minY = vp.modelCy - vp.modelH / 2, maxY = vp.modelCy + vp.modelH / 2;
  const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
  const kept = [];
  for (const s of segs) {
    if (inView(s.x1, s.y1, vp) || inView(s.x2, s.y2, vp)) {
      kept.push(s);
      if (kept.length >= 6000) break;
    }
  }
  const keptL = [];
  for (const l of labels) {
    if (inView(l.x, l.y, vp)) {
      keptL.push(l);
      if (keptL.length >= 400) break;
    }
  }
  const sw = Math.max(w, h) * 0.0009;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" width="1600" height="${Math.round((1600 * h) / w)}">`,
    `<rect width="100%" height="100%" fill="#f8fafc"/>`,
    `<g transform="translate(${(-minX).toFixed(2)} ${maxY.toFixed(2)}) scale(1,-1)">`,
  ];
  for (const s of kept) {
    parts.push(`<line x1="${s.x1.toFixed(2)}" y1="${s.y1.toFixed(2)}" x2="${s.x2.toFixed(2)}" y2="${s.y2.toFixed(2)}" stroke="${stroke(s.layer)}" stroke-width="${sw}" stroke-linecap="round"/>`);
  }
  parts.push('</g>');
  const font = Math.max(w, h) * 0.012;
  for (const l of keptL) {
    parts.push(`<text x="${(l.x - minX).toFixed(2)}" y="${(maxY - l.y).toFixed(2)}" fill="${stroke(l.layer)}" font-size="${font.toFixed(2)}" font-family="IBM Plex Sans,Segoe UI,sans-serif">${escapeXml(l.text)}</text>`);
  }
  parts.push(`<text x="12" y="28" fill="#0f172a" font-size="22" font-family="IBM Plex Sans,Segoe UI,sans-serif" font-weight="600">${escapeXml(title)}</text>`);
  parts.push('</svg>');
  return { svg: parts.join(''), segCount: kept.length, labelCount: keptL.length };
}

function sheetOrderFromTitles(titles) {
  const joined = titles.join(' | ');
  if (/\bCOVER\b/i.test(joined) && !/\d+\s*OF\s*\d+/i.test(joined)) return 0;
  const m = joined.match(/(\d+)\s*OF\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

function main() {
  if (!existsSync(dxfPath)) {
    console.error(JSON.stringify({ ok: false, error: `Missing ${dxfPath}` }));
    process.exit(1);
  }
  console.log('Reading DXF…');
  const dxf = readFileSync(dxfPath, 'utf8');
  console.log('Parsing paper layouts…');
  const papers = parsePaper(dxf);
  console.log('Extracting geometry (this can take a minute)…');
  const { segs, labels } = extractGeom(dxf);
  console.log(JSON.stringify({ papers: papers.length, segs: segs.length, labels: labels.length }));

  mkdirSync(outDir, { recursive: true });
  const manifest = [];

  for (const meta of papers) {
    const order = sheetOrderFromTitles(meta.titles);
    if (order == null) continue;
    const label = LABELS.find((l) => l.order === order);
    if (!label) continue;
    const vp = [...meta.viewports].sort((a, b) => b.modelW * b.modelH - a.modelW * a.modelH)[0];
    if (!vp || vp.modelW * vp.modelH < 200) continue;
    const { svg, segCount, labelCount } = renderSvg(vp, segs, labels, label.name);
    const out = join(outDir, label.file);
    writeFileSync(out, svg);
    manifest.push({ order: label.order, name: label.name, file: label.file, bytes: svg.length, segCount, labelCount });
    console.log(`Wrote ${label.file} (${segCount} segs, ${labelCount} labels)`);
  }

  // Ensure all expected files exist (placeholder if missing)
  for (const label of LABELS) {
    const path = join(outDir, label.file);
    if (!existsSync(path)) {
      const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="100%" height="100%" fill="#f8fafc"/><text x="40" y="80" font-size="28" fill="#0f172a" font-family="sans-serif">${escapeXml(label.name)}</text><text x="40" y="120" font-size="16" fill="#64748b" font-family="sans-serif">Sheet preview not extracted from this DXF layout.</text></svg>`;
      writeFileSync(path, placeholder);
      manifest.push({ order: label.order, name: label.name, file: label.file, bytes: placeholder.length, placeholder: true });
    }
  }

  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify({ planId: 'stillwater-183', sheets: manifest.sort((a, b) => a.order - b.order) }, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, outDir, sheets: manifest.length }, null, 2));
}

main();
