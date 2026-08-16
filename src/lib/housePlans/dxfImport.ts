import type { HousePlan, PlanRoomRect } from './buildPlan';
import { room } from './planFactories';

export type DxfImportResult = {
  plan: HousePlan;
  warnings: string[];
  lineCount: number;
};

type Seg = { x1: number; y1: number; x2: number; y2: number };

/** Parse a minimal subset of DXF: LINE and LWPOLYLINE in world units (feet). */
export function parseDxfToSegments(dxfText: string): { segments: Seg[]; warnings: string[] } {
  const warnings: string[] = [];
  const lines = dxfText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const segments: Seg[] = [];
  let i = 0;
  const readPair = (): { code: number; value: string } | null => {
    while (i < lines.length) {
      const code = Number(lines[i++]?.trim());
      const value = lines[i++] ?? '';
      if (Number.isFinite(code)) return { code, value: value.trim() };
    }
    return null;
  };

  while (i < lines.length) {
    const pair = readPair();
    if (!pair) break;
    if (pair.code !== 0) continue;
    const type = pair.value.toUpperCase();
    if (type === 'LINE') {
      let x1 = 0,
        y1 = 0,
        x2 = 0,
        y2 = 0;
      while (i < lines.length) {
        const p = readPair();
        if (!p) break;
        if (p.code === 0) {
          i -= 2;
          break;
        }
        if (p.code === 10) x1 = Number(p.value);
        if (p.code === 20) y1 = Number(p.value);
        if (p.code === 11) x2 = Number(p.value);
        if (p.code === 21) y2 = Number(p.value);
      }
      if ([x1, y1, x2, y2].every((n) => Number.isFinite(n))) segments.push({ x1, y1, x2, y2 });
    } else if (type === 'LWPOLYLINE') {
      const verts: { x: number; y: number }[] = [];
      let closed = false;
      let pendingX: number | null = null;
      while (i < lines.length) {
        const p = readPair();
        if (!p) break;
        if (p.code === 0) {
          i -= 2;
          break;
        }
        if (p.code === 70) closed = (Number(p.value) & 1) === 1;
        if (p.code === 10) pendingX = Number(p.value);
        if (p.code === 20 && pendingX != null) {
          verts.push({ x: pendingX, y: Number(p.value) });
          pendingX = null;
        }
      }
      for (let v = 0; v < verts.length - 1; v++) {
        const a = verts[v]!;
        const b = verts[v + 1]!;
        segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
      if (closed && verts.length > 2) {
        const a = verts[verts.length - 1]!;
        const b = verts[0]!;
        segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
    }
  }
  if (!segments.length) warnings.push('No LINE or LWPOLYLINE entities found.');
  return { segments, warnings };
}

/**
 * Convert axis-aligned DXF segments into rectangular rooms by detecting closed
 * rectangles (teaching / schematic DXF). Non-orthogonal geometry is reported.
 */
export function segmentsToOrthogonalRooms(segments: Seg[]): { rooms: PlanRoomRect[]; warnings: string[] } {
  const warnings: string[] = [];
  const ortho = segments.filter((s) => Math.abs(s.x1 - s.x2) < 1e-6 || Math.abs(s.y1 - s.y2) < 1e-6);
  if (ortho.length < segments.length) {
    warnings.push(`${segments.length - ortho.length} non-orthogonal segment(s) ignored.`);
  }
  // Collect unique X and Y grid lines from segment endpoints.
  const xs = [...new Set(ortho.flatMap((s) => [s.x1, s.x2]).map((v) => Math.round(v * 1000) / 1000))].sort(
    (a, b) => a - b,
  );
  const ys = [...new Set(ortho.flatMap((s) => [s.y1, s.y2]).map((v) => Math.round(v * 1000) / 1000))].sort(
    (a, b) => a - b,
  );
  if (xs.length < 2 || ys.length < 2) {
    warnings.push('Could not infer a room grid from DXF segments.');
    return { rooms: [], warnings };
  }

  const hasH = (x1: number, x2: number, y: number) =>
    ortho.some(
      (s) =>
        Math.abs(s.y1 - y) < 0.05 &&
        Math.abs(s.y2 - y) < 0.05 &&
        Math.min(s.x1, s.x2) <= Math.min(x1, x2) + 0.05 &&
        Math.max(s.x1, s.x2) >= Math.max(x1, x2) - 0.05,
    );
  const hasV = (y1: number, y2: number, x: number) =>
    ortho.some(
      (s) =>
        Math.abs(s.x1 - x) < 0.05 &&
        Math.abs(s.x2 - x) < 0.05 &&
        Math.min(s.y1, s.y2) <= Math.min(y1, y2) + 0.05 &&
        Math.max(s.y1, s.y2) >= Math.max(y1, y2) - 0.05,
    );

  const rooms: PlanRoomRect[] = [];
  let n = 1;
  for (let yi = 0; yi < ys.length - 1; yi++) {
    for (let xi = 0; xi < xs.length - 1; xi++) {
      const x0 = xs[xi]!;
      const x1 = xs[xi + 1]!;
      const y0 = ys[yi]!;
      const y1 = ys[yi + 1]!;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < 2 || h < 2) continue;
      // Cell is a room if all four sides exist in the segment set.
      if (hasH(x0, x1, y0) && hasH(x0, x1, y1) && hasV(y0, y1, x0) && hasV(y0, y1, x1)) {
        rooms.push(room(`Room ${n}`, 'Living room', x0, y0, w, h, 9));
        n++;
      }
    }
  }
  if (!rooms.length) {
    // Fallback: one room from overall bbox.
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    rooms.push(room('Imported space', 'Living room', minX, minY, maxX - minX, maxY - minY, 9));
    warnings.push('No closed rectangular cells detected — created a single bounding room.');
  }
  return { rooms, warnings };
}

export function importDxfHousePlan(dxfText: string, name = 'Imported DXF plan'): DxfImportResult {
  const { segments, warnings: w1 } = parseDxfToSegments(dxfText);
  const { rooms, warnings: w2 } = segmentsToOrthogonalRooms(segments);
  const maxX = Math.max(...rooms.map((r) => r.x + r.w), 0);
  const maxY = Math.max(...rooms.map((r) => r.y + r.h), 0);
  const living = rooms.reduce((s, r) => s + r.w * r.h, 0);
  const plan: HousePlan = {
    id: `dxf-${crypto.randomUUID().slice(0, 8)}`,
    name,
    stories: 1,
    beds: 0,
    baths: 0,
    livingSqFt: Math.round(living),
    totalUnderRoofSqFt: Math.round(maxX * maxY),
    sourceUrl: '',
    note: 'Imported from DXF (LINE/LWPOLYLINE). Orthogonal cell detection; review walls in Build.',
    floors: [{ id: `dxf-floor-1`, name: 'First story', rooms }],
  };
  return { plan, warnings: [...w1, ...w2], lineCount: segments.length };
}

/** Minimal IFC detection — full IFC mapping is server/worker follow-up. */
export function inspectIfc(text: string): { ok: boolean; message: string } {
  if (!/ISO-10303-21/i.test(text) && !/FILE_SCHEMA\s*\(\s*\('IFC/i.test(text)) {
    return { ok: false, message: 'File does not look like an IFC STEP exchange file.' };
  }
  return {
    ok: false,
    message:
      'IFC detected. Full IFC→walls mapping is not enabled in this MVP — export DXF spaces or use native JSON. Sample IFC files: buildingSMART documentation.',
  };
}
