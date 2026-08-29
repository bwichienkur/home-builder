/** Low-level DXF entity parsing for wall segments + room labels. */

export type DxfSeg = { x1: number; y1: number; x2: number; y2: number; layer?: string };
export type DxfLabel = { x: number; y: number; text: string; layer?: string };

function decodeMtext(raw: string): string {
  return raw
    .replace(/\\P/gi, ' ')
    .replace(/\\p[^\s\\;]*/gi, ' ')
    .replace(/\{\\[^;]*;/g, '')
    .replace(/\}/g, '')
    .replace(/\\[A-Za-z][^;\\]*;?/g, '')
    .replace(/%%[Uu]/g, '')
    .replace(/^t[\d.,]+;/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when a DXF text string looks like a room name (not a note/dim/ceiling callout). */
export function looksLikeRoomName(text: string): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > 40) return false;
  if (/[;\\]/.test(t)) return false;
  if (/,$/.test(t)) return false;
  if (/^\d/.test(t) && !/\b(CAR|BED|BATH)/i.test(t)) return false;
  if (
    /CLG|PCK|RECESS|ELLIPSE|ARCH|DRAIN|AREA\b|FALSE WALL|HOLD ABOVE|TYP\.|SEE NOTE|UNDER ROOF|SQ\.?\s*FT|TOTAL\b|POT FILLER|GAS\s*F\.?P|ACCESS|SEAT\b|STONE\b/i.test(
      t,
    )
  ) {
    return false;
  }
  if (!/[A-Za-z]{3,}/.test(t)) return false;
  return true;
}

/**
 * Parse LINE / LWPOLYLINE (+ TEXT/MTEXT labels) from a DXF string.
 * Does not filter by layer — callers filter.
 */
export function parseDxfEntitiesToSegments(dxfText: string): {
  segments: DxfSeg[];
  labels: DxfLabel[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const lines = dxfText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const segments: DxfSeg[] = [];
  const labels: DxfLabel[] = [];
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
      let x1 = 0;
      let y1 = 0;
      let x2 = 0;
      let y2 = 0;
      let layer = '0';
      while (i < lines.length) {
        const p = readPair();
        if (!p) break;
        if (p.code === 0) {
          i -= 2;
          break;
        }
        if (p.code === 8) layer = p.value;
        if (p.code === 10) x1 = Number(p.value);
        if (p.code === 20) y1 = Number(p.value);
        if (p.code === 11) x2 = Number(p.value);
        if (p.code === 21) y2 = Number(p.value);
      }
      if ([x1, y1, x2, y2].every((n) => Number.isFinite(n))) {
        segments.push({ x1, y1, x2, y2, layer });
      }
    } else if (type === 'LWPOLYLINE') {
      const verts: { x: number; y: number }[] = [];
      let closed = false;
      let pendingX: number | null = null;
      let layer = '0';
      while (i < lines.length) {
        const p = readPair();
        if (!p) break;
        if (p.code === 0) {
          i -= 2;
          break;
        }
        if (p.code === 8) layer = p.value;
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
        segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, layer });
      }
      if (closed && verts.length > 2) {
        const a = verts[verts.length - 1]!;
        const b = verts[0]!;
        segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, layer });
      }
    } else if (type === 'TEXT' || type === 'MTEXT') {
      let text = '';
      let x = 0;
      let y = 0;
      let layer = '0';
      while (i < lines.length) {
        const p = readPair();
        if (!p) break;
        if (p.code === 0) {
          i -= 2;
          break;
        }
        if (p.code === 8) layer = p.value;
        if (p.code === 10) x = Number(p.value);
        if (p.code === 20) y = Number(p.value);
        if (p.code === 1) text = p.value;
        if (p.code === 3) text += p.value;
      }
      text = decodeMtext(text);
      if (text && Number.isFinite(x) && Number.isFinite(y) && text.length < 80) {
        labels.push({ x, y, text, layer });
      }
    }
  }
  if (!segments.length) warnings.push('No LINE or LWPOLYLINE entities found.');
  return { segments, labels, warnings };
}
