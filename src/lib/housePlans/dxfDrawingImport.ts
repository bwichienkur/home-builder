import { importDxfHousePlan } from './dxfImport';
import type { HousePlan } from './buildPlan';
import {
  sheetKindFromName,
  type DrawingImportResult,
  type DrawingPackage,
  type DrawingSheet,
} from './drawingPackage';
import { looksLikeRoomName } from './dxfParse';

/** Layers preferred for room footprint (walls only — doors create openings/noise). */
export const ROOM_WALL_LAYER_HINTS = [
  'WALLS INT',
  'WALLS EXT',
  'WALL EXT',
  'WALL INT',
  'wall-external',
  'wall-internal',
  '1st_Floor_Objects_Walls',
  'A-WALL',
  'A-WALLS',
  'WALL',
];

/** Layers kept for room footprint detection (exact historic set + fuzzy match). */
export const WALL_LAYERS = new Set([
  'WALLS INT',
  'WALLS EXT',
  'WALL EXT',
  'wall-external',
  'DOORS',
  'doors-window',
  '1st_Floor_Objects_Walls',
]);

export function isRoomWallLayer(layer: string): boolean {
  const u = layer.trim().toUpperCase();
  if (!u) return false;
  if (/DOOR|WINDOW|GLAZ|OPENING|SWING/.test(u)) return false;
  if (WALL_LAYERS.has(layer) && !/DOOR/i.test(layer)) return true;
  return (
    /\bWALLS?\b/.test(u) ||
    u.includes('WALL-') ||
    u.startsWith('A-WALL') ||
    ROOM_WALL_LAYER_HINTS.some((h) => u === h.toUpperCase())
  );
}

export function isSheetWallLayer(layer: string): boolean {
  return WALL_LAYERS.has(layer) || isRoomWallLayer(layer) || /DOOR|WINDOW/i.test(layer);
}

/** Door / window / glazing layers — used for Opening entities, not wall centerlines. */
export function isOpeningLayer(layer: string): boolean {
  const u = layer.trim().toUpperCase();
  if (!u) return false;
  if (/SWING|ARC|HINGE/.test(u) && !/DOOR|WINDOW|GLAZ|OPEN/.test(u)) return false;
  return /DOOR|WINDOW|GLAZ|OPENING|A-GLAZ|A-DOOR|A-WIND/.test(u);
}

export function openingKindFromLayer(layer: string): 'door' | 'window' {
  const u = layer.trim().toUpperCase();
  if (/WINDOW|GLAZ|WIND/.test(u)) return 'window';
  return 'door';
}

/** Model-space linework kept for the Plan CAD overlay (walls, openings, fixtures, sheet geometry). */
export function isPlanOverlayLayer(layer: string): boolean {
  const u = layer.trim().toUpperCase();
  if (/FIXTURE|COUNTER|CABINET|APPLIANCE/.test(u)) return true;
  return isRoomWallLayer(layer) || isOpeningLayer(layer) || isSheetWallLayer(layer);
}

export function planVectorRole(layer: string): 'wall' | 'opening' | 'fixture' | 'soft' | 'other' {
  if (isOpeningLayer(layer)) return 'opening';
  if (isRoomWallLayer(layer)) return 'wall';
  const u = layer.trim().toUpperCase();
  if (/FIXTURE|COUNTER|CABINET|APPLIANCE|SINK|TOILET|RANGE|STOVE|OVEN/.test(u)) return 'fixture';
  if (/CEILING|VOLUME|SPACE.?BOUND|ROOM.?BOUND|OPEN.?PLAN/.test(u)) return 'soft';
  return 'other';
}

/** Soft partition / space-boundary layers for open-plan room splits. */
export function isSoftSpaceLayer(layer: string): boolean {
  const u = layer.trim().toUpperCase();
  return /CEILING|VOLUME|SPACE.?BOUND|ROOM.?BOUND|OPEN.?PLAN/.test(u);
}
/** Layers drawn into sheet reference SVGs. */
export const SHEET_LAYERS = new Set([
  ...WALL_LAYERS,
  'WINDOWS',
  'TEXT',
  'TEXT ROOM',
  'DIMS',
  'DIM',
  'COUNTER',
  'FIXTURES',
  'CONC',
  'ELECTRIC',
  'ELECTRIC LINES',
  'CEILING',
  'NOTE',
  'BORDER',
  'ROOF',
  'HATCH',
  'CELLS',
  'BLOCK',
  'wall-external',
  '0',
]);

const MAX_SEGS_PER_SHEET = 6000;
const MAX_TEXTS_PER_SHEET = 400;

type Viewport = {
  block: string;
  modelCx: number;
  modelCy: number;
  modelW: number;
  modelH: number;
  paperW: number;
  paperH: number;
};

type PaperMeta = {
  block: string;
  titles: string[];
  viewports: Viewport[];
};

type Seg = { x1: number; y1: number; x2: number; y2: number; layer: string; linetype?: string };
type Label = { x: number; y: number; text: string; layer: string };

function decodeMtext(raw: string): string {
  return raw
    .replace(/\\P/gi, ' ')
    .replace(/\\p[^\s\\;]*/gi, ' ')
    .replace(/\{\\[^;]*;/g, '')
    .replace(/\}/g, '')
    // Formatting codes terminated by ';' (e.g. \H1.333x; \fArial;)
    .replace(/\\[A-Za-z][^;\\]*;/g, '')
    // Single-char toggles (\L underline, \O overline, \K strike) — must not eat following text
    .replace(/\\[LlOoKkAa]/g, '')
    .replace(/%%[Uu]/g, '')
    .replace(/^t[\d.,]+;/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function iterPairs(dxfText: string): Generator<{ code: number; value: string }> {
  const lines = dxfText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return (function* () {
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const code = Number(lines[i]!.trim());
      if (!Number.isFinite(code)) continue;
      yield { code, value: (lines[i + 1] ?? '').trim() };
    }
  })();
}

/** Filter DXF ENTITIES to LINE/LWPOLYLINE on allow-listed layers (string rebuild). */
export function filterDxfToLayers(
  dxfText: string,
  allow: Set<string>,
  opts?: { fuzzyRoomWalls?: boolean },
): string {
  const lines = dxfText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const entities: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() !== '0') continue;
    const type = (lines[i + 1] ?? '').trim().toUpperCase();
    if (type !== 'LINE' && type !== 'LWPOLYLINE' && type !== 'POLYLINE') continue;
    const entity = [lines[i]!, lines[i + 1]!];
    i += 2;
    let layer = '';
    while (i < lines.length && lines[i]!.trim() !== '0') {
      entity.push(lines[i]!, lines[i + 1] ?? '');
      if (lines[i]!.trim() === '8') layer = (lines[i + 1] ?? '').trim();
      i += 2;
    }
    i -= 2;
    const ok = allow.has(layer) || (opts?.fuzzyRoomWalls && isRoomWallLayer(layer));
    if (ok) entities.push(...entity);
  }
  return [
    '  0',
    'SECTION',
    '  2',
    'HEADER',
    '  9',
    '$ACADVER',
    '  1',
    'AC1018',
    '  0',
    'ENDSEC',
    '  0',
    'SECTION',
    '  2',
    'ENTITIES',
    ...entities,
    '  0',
    'ENDSEC',
    '  0',
    'EOF',
    '',
  ].join('\n');
}

function parsePaperBlocks(dxfText: string): PaperMeta[] {
  const byBlock = new Map<string, PaperMeta>();
  let section: string | null = null;
  let inBlock = false;
  let blockName: string | null = null;
  let ent: string | null = null;
  const data: Record<string, string> = {};

  const ensure = (name: string) => {
    let m = byBlock.get(name);
    if (!m) {
      m = { block: name, titles: [], viewports: [] };
      byBlock.set(name, m);
    }
    return m;
  };

  const flushEnt = () => {
    if (!inBlock || !blockName || !ent) {
      ent = null;
      for (const k of Object.keys(data)) delete data[k];
      return;
    }
    if (!blockName.startsWith('*PAPER')) {
      ent = null;
      for (const k of Object.keys(data)) delete data[k];
      return;
    }
    const meta = ensure(blockName);
    if (ent === 'VIEWPORT') {
      const cx = Number(data['12'] ?? 0);
      const cy = Number(data['22'] ?? 0);
      const vh = Number(data['45'] ?? 0);
      const pw = Number(data['40'] ?? 1);
      const ph = Number(data['41'] ?? 1);
      if (vh > 0 && pw > 0 && ph > 0) {
        meta.viewports.push({
          block: blockName,
          modelCx: cx,
          modelCy: cy,
          modelH: vh,
          modelW: vh * (pw / ph),
          paperW: pw,
          paperH: ph,
        });
      }
    } else if (ent === 'TEXT' || ent === 'MTEXT') {
      const t = decodeMtext(data['1'] ?? '');
      if (t) meta.titles.push(t);
    }
    ent = null;
    for (const k of Object.keys(data)) delete data[k];
  };

  for (const { code, value } of iterPairs(dxfText)) {
    if (code === 0 && value === 'SECTION') {
      section = null;
      continue;
    }
    if (code === 2 && section === null) {
      section = value;
      continue;
    }
    if (code === 0 && value === 'ENDSEC') {
      flushEnt();
      section = null;
      continue;
    }
    if (section !== 'BLOCKS') continue;
    if (code === 0) {
      if (value === 'BLOCK') {
        flushEnt();
        inBlock = true;
        blockName = null;
      } else if (value === 'ENDBLK') {
        flushEnt();
        inBlock = false;
        blockName = null;
      } else if (inBlock) {
        flushEnt();
        ent = value;
      }
      continue;
    }
    if (!inBlock) continue;
    if (blockName === null && code === 2) {
      blockName = value;
      continue;
    }
    if (ent && data[code] === undefined) data[code] = value;
    else if (ent && code === 3) data['1'] = (data['1'] ?? '') + value;
  }

  return [...byBlock.values()];
}

function pickPrimaryViewport(vps: Viewport[]): Viewport | null {
  if (!vps.length) return null;
  // Skip tiny logo/title viewports; prefer largest model area.
  const ranked = [...vps].sort((a, b) => b.modelW * b.modelH - a.modelW * a.modelH);
  return ranked[0] ?? null;
}

function titleForPaper(meta: PaperMeta, index: number): string {
  const joined = meta.titles.join(' | ');
  if (/\bCOVER\b/i.test(joined) && !/\d+\s*OF\s*\d+/i.test(joined)) return 'COVER';
  const ofMatch = joined.match(/(\d+)\s*OF\s*(\d+)/i);
  if (ofMatch) {
    const n = Number(ofMatch[1]);
    const map: Record<number, string> = {
      1: 'SHT. 1 FLOOR',
      2: 'SHT. 2 FRONT ELEVATION',
      3: 'SHT. 3 SIDE ELEVATIONS',
      4: 'SHT. 4 FOUNDATION',
      5: 'SHT. 5 ELECTRICAL',
      6: 'SHT. 6 DETAILS',
      7: 'SHT. 7 NOTES',
      8: 'SHT. 8 TRUSS CONNECTOR',
    };
    if (map[n]) return map[n]!;
    return `Sheet ${n} of ${ofMatch[2]}`;
  }
  return `Sheet ${index + 1}`;
}

function orderForTitle(name: string, fallback: number): number {
  if (name === 'COVER') return 0;
  const m = name.match(/SHT\.\s*(\d+)/i) || name.match(/Sheet\s*(\d+)/i);
  if (m) return Number(m[1]);
  return fallback + 1;
}

function inView(x: number, y: number, vp: Viewport, pad = 0.02): boolean {
  const hx = vp.modelW * (0.5 + pad);
  const hy = vp.modelH * (0.5 + pad);
  return x >= vp.modelCx - hx && x <= vp.modelCx + hx && y >= vp.modelCy - hy && y <= vp.modelCy + hy;
}

export function pickFloorViewport(dxfText: string): Viewport | null {
  const papers = parsePaperBlocks(dxfText);
  const ranked: { meta: PaperMeta; vp: Viewport; title: string }[] = [];
  papers.forEach((meta, index) => {
    const vp = pickPrimaryViewport(meta.viewports);
    if (!vp || vp.modelW * vp.modelH < 200) return;
    const title = titleForPaper(meta, index);
    ranked.push({ meta, vp, title });
  });
  const floor = ranked.find((r) => /FLOOR|PLAN/i.test(r.title) && !/FOUNDATION|ROOF|ELEV/i.test(r.title));
  if (floor) return floor.vp;
  // Largest viewport as fallback (usually the floor plan)
  ranked.sort((a, b) => b.vp.modelW * b.vp.modelH - a.vp.modelW * a.vp.modelH);
  return ranked[0]?.vp ?? null;
}

/** Keep segments that intersect a model-space viewport (floor plan crop). */
export function cropSegmentsToViewport<T extends { x1: number; y1: number; x2: number; y2: number }>(
  segs: T[],
  vp: Viewport,
  pad = 0.05,
): T[] {
  return segs.filter((s) => segHitsView(s, vp, pad));
}

function segHitsView(
  s: { x1: number; y1: number; x2: number; y2: number },
  vp: Viewport,
  pad = 0.02,
): boolean {
  return (
    inView(s.x1, s.y1, vp, pad) ||
    inView(s.x2, s.y2, vp, pad) ||
    inView((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, vp, pad)
  );
}

/** Collect model-space geometry for sheet crops + wall filter in one pass. */
export function extractDxfModelGeometry(dxfText: string): {
  segs: Seg[];
  labels: Label[];
  wallDxf: string;
} {
  const segs: Seg[] = [];
  const labels: Label[] = [];
  const wallEntities: string[] = [];
  const lines = dxfText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  let i = 0;
  const inEntities = (): boolean => {
    // Find ENTITIES section start once via scan — handled in loop below
    return true;
  };
  void inEntities;

  let section: string | null = null;
  while (i < lines.length) {
    if (lines[i]!.trim() === '0' && (lines[i + 1] ?? '').trim() === 'SECTION') {
      const name = (lines[i + 3] ?? '').trim();
      section = name;
      i += 4;
      continue;
    }
    if (lines[i]!.trim() === '0' && (lines[i + 1] ?? '').trim() === 'ENDSEC') {
      section = null;
      i += 2;
      continue;
    }
    if (section !== 'ENTITIES') {
      i += 1;
      continue;
    }
    if (lines[i]!.trim() !== '0') {
      i += 1;
      continue;
    }
    const type = (lines[i + 1] ?? '').trim().toUpperCase();
    const start = i;
    i += 2;
    const fields: Record<string, string> = {};
    const raw: string[] = [lines[start]!, lines[start + 1]!];
    while (i < lines.length && lines[i]!.trim() !== '0') {
      raw.push(lines[i]!, lines[i + 1] ?? '');
      const code = lines[i]!.trim();
      const val = (lines[i + 1] ?? '').trim();
      if (code === '3' && fields['1']) fields['1'] += val;
      else if (!(code in fields)) fields[code] = val;
      i += 2;
    }

    if (fields['67'] === '1') continue; // paper space entity in ENTITIES
    const layer = fields['8'] ?? '0';

    if ((type === 'LINE' || type === 'LWPOLYLINE' || type === 'POLYLINE') && isRoomWallLayer(layer)) {
      wallEntities.push(...raw);
    }

    if (!SHEET_LAYERS.has(layer) && !isSheetWallLayer(layer)) continue;

    if (type === 'LINE') {
      const x1 = Number(fields['10']);
      const y1 = Number(fields['20']);
      const x2 = Number(fields['11']);
      const y2 = Number(fields['21']);
      const linetype = fields['6'];
      if ([x1, y1, x2, y2].every(Number.isFinite)) segs.push({ x1, y1, x2, y2, layer, linetype });
    } else if (type === 'LWPOLYLINE') {
      // re-parse verts from raw pairs
      const verts: { x: number; y: number }[] = [];
      let pendingX: number | null = null;
      let closed = false;
      const linetype = fields['6'];
      for (let r = 0; r + 1 < raw.length; r += 2) {
        const c = raw[r]!.trim();
        const v = raw[r + 1]!.trim();
        if (c === '70') closed = (Number(v) & 1) === 1;
        if (c === '10') pendingX = Number(v);
        if (c === '20' && pendingX != null) {
          verts.push({ x: pendingX, y: Number(v) });
          pendingX = null;
        }
      }
      for (let v = 0; v < verts.length - 1; v++) {
        const a = verts[v]!;
        const b = verts[v + 1]!;
        segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, layer, linetype });
      }
      if (closed && verts.length > 2) {
        const a = verts[verts.length - 1]!;
        const b = verts[0]!;
        segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, layer, linetype });
      }
    } else if (type === 'TEXT' || type === 'MTEXT') {
      const text = decodeMtext(fields['1'] ?? '');
      const x = Number(fields['10']);
      const y = Number(fields['20']);
      if (text && Number.isFinite(x) && Number.isFinite(y) && text.length < 80) {
        labels.push({ x, y, text, layer });
      }
    }
  }

  const wallDxf = [
    '  0',
    'SECTION',
    '  2',
    'HEADER',
    '  9',
    '$ACADVER',
    '  1',
    'AC1018',
    '  0',
    'ENDSEC',
    '  0',
    'SECTION',
    '  2',
    'ENTITIES',
    ...wallEntities,
    '  0',
    'ENDSEC',
    '  0',
    'EOF',
    '',
  ].join('\n');

  return { segs, labels, wallDxf };
}

function strokeForLayer(layer: string): string {
  const u = layer.toUpperCase();
  if (u.includes('WALL')) return '#1f2937';
  if (u.includes('DOOR')) return '#b45309';
  if (u.includes('WINDOW')) return '#0369a1';
  if (u.includes('TEXT')) return '#334155';
  if (u.includes('DIM')) return '#64748b';
  if (u.includes('ELECTRIC')) return '#ca8a04';
  if (u.includes('FIXTURE') || u.includes('COUNTER')) return '#0f766e';
  if (u.includes('CONC')) return '#78716c';
  return '#475569';
}

export function renderViewportSvg(
  vp: Viewport,
  segs: Seg[],
  labels: Label[],
  title: string,
): string {
  const minX = vp.modelCx - vp.modelW / 2;
  const maxX = vp.modelCx + vp.modelW / 2;
  const minY = vp.modelCy - vp.modelH / 2;
  const maxY = vp.modelCy + vp.modelH / 2;
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);

  const kept: Seg[] = [];
  for (const s of segs) {
    if (!segHitsView(s, vp)) continue;
    kept.push(s);
    if (kept.length >= MAX_SEGS_PER_SHEET) break;
  }

  const keptLabels: Label[] = [];
  for (const l of labels) {
    if (!inView(l.x, l.y, vp)) continue;
    keptLabels.push(l);
    if (keptLabels.length >= MAX_TEXTS_PER_SHEET) break;
  }

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" width="1600" height="${Math.round((1600 * h) / w)}" role="img" aria-label="${escapeXml(title)}">`,
    `<rect width="100%" height="100%" fill="#f8fafc"/>`,
    `<g transform="translate(${(-minX).toFixed(2)} ${(maxY).toFixed(2)}) scale(1,-1)">`,
  ];

  for (const s of kept) {
    parts.push(
      `<line x1="${s.x1.toFixed(2)}" y1="${s.y1.toFixed(2)}" x2="${s.x2.toFixed(2)}" y2="${s.y2.toFixed(2)}" stroke="${strokeForLayer(s.layer)}" stroke-width="${Math.max(w, h) * 0.0009}" stroke-linecap="round"/>`,
    );
  }

  // Text un-mirrored relative to sheet
  parts.push(`</g>`);
  for (const l of keptLabels) {
    const tx = l.x - minX;
    const ty = maxY - l.y;
    const font = Math.max(w, h) * 0.012;
    parts.push(
      `<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" fill="${strokeForLayer(l.layer)}" font-size="${font.toFixed(2)}" font-family="IBM Plex Sans, Segoe UI, sans-serif">${escapeXml(l.text)}</text>`,
    );
  }
  parts.push(
    `<text x="12" y="28" fill="#0f172a" font-size="22" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-weight="600">${escapeXml(title)}</text>`,
  );
  parts.push(`</svg>`);
  return parts.join('');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildSheetsFromDxf(
  dxfText: string,
  segs: Seg[],
  labels: Label[],
): { sheets: DrawingSheet[]; warnings: string[] } {
  const warnings: string[] = [];
  const papers = parsePaperBlocks(dxfText);
  if (!papers.length) {
    warnings.push('No paper-space layouts found — sheet previews unavailable.');
    return { sheets: [], warnings };
  }

  const sheets: DrawingSheet[] = [];
  papers.forEach((meta, index) => {
    const vp = pickPrimaryViewport(meta.viewports);
    if (!vp) return;
    // Skip tiny viewports that are only title logos
    if (vp.modelW * vp.modelH < 200) return;
    const name = titleForPaper(meta, index);
    const order = orderForTitle(name, index);
    const svg = renderViewportSvg(vp, segs, labels, name);
    sheets.push({
      id: `sheet-${order}-${meta.block.replace(/\W+/g, '').toLowerCase()}`,
      name,
      order,
      kind: sheetKindFromName(name),
      svg,
    });
  });

  sheets.sort((a, b) => a.order - b.order);
  if (!sheets.length) warnings.push('Layouts found but no usable viewports to crop.');
  return { sheets, warnings };
}

export function importDxfDrawingPackage(
  dxfText: string,
  sourceFileName: string,
  planName?: string,
): DrawingImportResult {
  const { segs, labels, wallDxf } = extractDxfModelGeometry(dxfText);
  const floorVp = pickFloorViewport(dxfText);

  // Prefer wall segments cropped to the floor-plan viewport (avoids elevations / details in model space).
  let roomSegs = segs.filter((s) => isRoomWallLayer(s.layer));
  let openingSegs = segs.filter((s) => isOpeningLayer(s.layer));
  let overlaySegs = segs.filter((s) => isPlanOverlayLayer(s.layer));
  let softSegs = segs.filter((s) => {
    const lt = (s.linetype ?? '').toUpperCase();
    const layer = s.layer.toUpperCase();
    if (/SPACE.?BOUND|ROOM.?BOUND|OPEN.?PLAN|VOLUME.?LINE/.test(layer)) return true;
    if (/DASH|HIDDEN|PHANTOM|DOT/.test(lt) && /\bWALL/.test(layer)) return true;
    return false;
  });
  // Broader soft linework for dotted overlay (ceiling breaks, etc.) — not used for flood paint.
  let softOverlaySegs = segs.filter((s) => {
    const lt = (s.linetype ?? '').toUpperCase();
    const layer = s.layer.toUpperCase();
    if (softSegs.includes(s)) return true;
    if (/DASH|HIDDEN|PHANTOM|DOT|CENTER/.test(lt)) return true;
    if (/CEILING|VOLUME/.test(layer)) return true;
    return false;
  });
  let roomLabels = labels.map((l) => ({ x: l.x, y: l.y, text: l.text, layer: l.layer }));
  const cropWarnings: string[] = [];
  if (floorVp) {
    const cropped = cropSegmentsToViewport(roomSegs, floorVp, 0.08);
    if (cropped.length >= 20) {
      roomSegs = cropped;
      openingSegs = cropSegmentsToViewport(openingSegs, floorVp, 0.12);
      overlaySegs = cropSegmentsToViewport(overlaySegs, floorVp, 0.12);
      softSegs = cropSegmentsToViewport(softSegs, floorVp, 0.12);
      softOverlaySegs = cropSegmentsToViewport(softOverlaySegs, floorVp, 0.12);
      roomLabels = cropSegmentsToViewport(
        roomLabels.map((l) => ({ ...l, x1: l.x, y1: l.y, x2: l.x, y2: l.y })),
        floorVp,
        0.08,
      )
        .filter((l) => looksLikeRoomName(l.text) || /ROOM/i.test(String(l.layer ?? '')))
        .map(({ x1, y1, text, layer }) => ({ x: x1, y: y1, text, layer }));
      cropWarnings.push(
        `Cropped walls to floor viewport (${floorVp.modelW.toFixed(0)}×${floorVp.modelH.toFixed(0)} model units).`,
      );
    } else {
      cropWarnings.push('Floor viewport crop too sparse — using all model-space wall layers.');
    }
  }

  const imported =
    roomSegs.length >= 8
      ? importDxfHousePlan(dxfText, planName ?? sourceFileName.replace(/\.(dwg|dxf)$/i, ''), {
          segments: roomSegs,
          labels: roomLabels,
          openingSegments: openingSegs,
          planVectors: [...overlaySegs, ...softOverlaySegs],
          softPartitions: softSegs,
        })
      : importDxfHousePlan(
          wallDxf.includes('LINE') || wallDxf.includes('LWPOLYLINE')
            ? wallDxf
            : filterDxfToLayers(dxfText, WALL_LAYERS, { fuzzyRoomWalls: true }),
          planName ?? sourceFileName.replace(/\.(dwg|dxf)$/i, ''),
          {
            labels: roomLabels,
            openingSegments: openingSegs,
            planVectors: [...overlaySegs, ...softOverlaySegs],
            softPartitions: softSegs,
          },
        );

  const { sheets, warnings: sheetWarnings } = buildSheetsFromDxf(dxfText, segs, labels);

  const plan: HousePlan = {
    ...imported.plan,
    note: 'Imported from DWG/DXF (floor viewport crop + sealed envelope flood-fill). Review rooms in Plan verification.',
    sourceUrl: sourceFileName,
  };

  const pkg: DrawingPackage = {
    id: `drawings-${plan.id}`,
    sourceFileName,
    importedAt: new Date().toISOString(),
    warnings: [...cropWarnings, ...imported.warnings, ...sheetWarnings],
    sheets,
    sheetSource: sheets.length ? 'dxf_viewport' : 'static',
  };

  return { package: pkg, plan, lineCount: imported.lineCount };
}
