/** Tessellate fixture CIRCLE/ARC and explode simple INSERT blocks into line segments. */

export type FixtureSeg = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: string;
  linetype?: string;
};

export function isFixtureGeometryLayer(layer: string): boolean {
  const u = layer.trim().toUpperCase();
  return /FIXTURE|COUNTER|CABINET|APPLIANCE|PLUMB|SHELF|SINK|TOILET|TUB|BATH|ISLAND|RANGE|STOVE|OVEN/.test(
    u,
  );
}

/** Approximate a circle as closed polyline chords. */
export function circleToSegments(
  cx: number,
  cy: number,
  r: number,
  layer: string,
  linetype?: string,
  sides = 24,
): FixtureSeg[] {
  if (!(r > 0) || !Number.isFinite(cx + cy + r)) return [];
  const out: FixtureSeg[] = [];
  const n = Math.max(8, sides);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    out.push({
      x1: cx + Math.cos(a0) * r,
      y1: cy + Math.sin(a0) * r,
      x2: cx + Math.cos(a1) * r,
      y2: cy + Math.sin(a1) * r,
      layer,
      linetype,
    });
  }
  return out;
}

/** Approximate a DXF ARC (angles in degrees, CCW) as chords. */
export function arcToSegments(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
  layer: string,
  linetype?: string,
  maxChordDeg = 15,
): FixtureSeg[] {
  if (!(r > 0) || !Number.isFinite(cx + cy + r + startDeg + endDeg)) return [];
  let a0 = startDeg;
  let a1 = endDeg;
  while (a1 <= a0) a1 += 360;
  const span = a1 - a0;
  const steps = Math.max(2, Math.ceil(span / maxChordDeg));
  const out: FixtureSeg[] = [];
  for (let i = 0; i < steps; i++) {
    const t0 = a0 + (span * i) / steps;
    const t1 = a0 + (span * (i + 1)) / steps;
    const r0 = (t0 * Math.PI) / 180;
    const r1 = (t1 * Math.PI) / 180;
    out.push({
      x1: cx + Math.cos(r0) * r,
      y1: cy + Math.sin(r0) * r,
      x2: cx + Math.cos(r1) * r,
      y2: cy + Math.sin(r1) * r,
      layer,
      linetype,
    });
  }
  return out;
}

function transformPoint(
  x: number,
  y: number,
  ix: number,
  iy: number,
  scaleX: number,
  scaleY: number,
  rotDeg: number,
): { x: number; y: number } {
  const sx = x * scaleX;
  const sy = y * scaleY;
  const rad = (rotDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: ix + sx * c - sy * s, y: iy + sx * s + sy * c };
}

function transformSeg(
  seg: FixtureSeg,
  ix: number,
  iy: number,
  scaleX: number,
  scaleY: number,
  rotDeg: number,
  layer: string,
): FixtureSeg {
  const a = transformPoint(seg.x1, seg.y1, ix, iy, scaleX, scaleY, rotDeg);
  const b = transformPoint(seg.x2, seg.y2, ix, iy, scaleX, scaleY, rotDeg);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, layer, linetype: seg.linetype };
}

type RawPairs = string[];

function segsFromEntityRaw(type: string, raw: RawPairs, layerFallback: string): FixtureSeg[] {
  const fields: Record<string, string> = {};
  for (let r = 0; r + 1 < raw.length; r += 2) {
    const c = raw[r]!.trim();
    const v = raw[r + 1]!.trim();
    if (!(c in fields)) fields[c] = v;
  }
  const layer = fields['8'] ?? layerFallback;
  const linetype = fields['6'];
  if (type === 'LINE') {
    const x1 = Number(fields['10']);
    const y1 = Number(fields['20']);
    const x2 = Number(fields['11']);
    const y2 = Number(fields['21']);
    if ([x1, y1, x2, y2].every(Number.isFinite)) return [{ x1, y1, x2, y2, layer, linetype }];
    return [];
  }
  if (type === 'CIRCLE') {
    return circleToSegments(Number(fields['10']), Number(fields['20']), Number(fields['40']), layer, linetype);
  }
  if (type === 'ARC') {
    return arcToSegments(
      Number(fields['10']),
      Number(fields['20']),
      Number(fields['40']),
      Number(fields['50']),
      Number(fields['51']),
      layer,
      linetype,
    );
  }
  if (type === 'LWPOLYLINE') {
    const verts: { x: number; y: number }[] = [];
    let pendingX: number | null = null;
    let closed = false;
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
    const out: FixtureSeg[] = [];
    for (let v = 0; v < verts.length - 1; v++) {
      const a = verts[v]!;
      const b = verts[v + 1]!;
      out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, layer, linetype });
    }
    if (closed && verts.length > 2) {
      const a = verts[verts.length - 1]!;
      const b = verts[0]!;
      out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, layer, linetype });
    }
    return out;
  }
  return [];
}

/**
 * Parse BLOCKS section into named primitive linework (no nested INSERT).
 * Used to explode fixture INSERT entities (sinks, toilets, appliances).
 */
export function loadBlockPrimitives(dxfText: string): Map<string, FixtureSeg[]> {
  const lines = dxfText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const map = new Map<string, FixtureSeg[]>();
  let section: string | null = null;
  let inBlock = false;
  let blockName: string | null = null;
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.trim() === '0' && (lines[i + 1] ?? '').trim() === 'SECTION') {
      section = (lines[i + 3] ?? '').trim();
      i += 4;
      continue;
    }
    if (lines[i]!.trim() === '0' && (lines[i + 1] ?? '').trim() === 'ENDSEC') {
      section = null;
      inBlock = false;
      blockName = null;
      i += 2;
      continue;
    }
    if (section !== 'BLOCKS') {
      i += 1;
      continue;
    }
    if (lines[i]!.trim() !== '0') {
      i += 1;
      continue;
    }
    const type = (lines[i + 1] ?? '').trim().toUpperCase();
    if (type === 'BLOCK') {
      inBlock = true;
      blockName = null;
      i += 2;
      while (i < lines.length && lines[i]!.trim() !== '0') {
        if (lines[i]!.trim() === '2' && blockName == null) blockName = (lines[i + 1] ?? '').trim();
        i += 2;
      }
      continue;
    }
    if (type === 'ENDBLK') {
      inBlock = false;
      blockName = null;
      i += 2;
      continue;
    }
    if (!inBlock || !blockName || blockName.startsWith('*')) {
      i += 1;
      continue;
    }
    if (!['LINE', 'LWPOLYLINE', 'CIRCLE', 'ARC'].includes(type)) {
      i += 1;
      continue;
    }
    const start = i;
    i += 2;
    const raw: string[] = [lines[start]!, lines[start + 1]!];
    while (i < lines.length && lines[i]!.trim() !== '0') {
      raw.push(lines[i]!, lines[i + 1] ?? '');
      i += 2;
    }
    const segs = segsFromEntityRaw(type, raw, '0');
    if (!segs.length) continue;
    const list = map.get(blockName) ?? [];
    list.push(...segs);
    map.set(blockName, list);
  }
  return map;
}

/** Place a block's primitives at an INSERT transform. */
export function explodeInsert(
  blockSegs: FixtureSeg[],
  ix: number,
  iy: number,
  scaleX: number,
  scaleY: number,
  rotDeg: number,
  layer: string,
): FixtureSeg[] {
  if (!blockSegs.length) return [];
  return blockSegs.map((s) => transformSeg(s, ix, iy, scaleX, scaleY, rotDeg, layer));
}
