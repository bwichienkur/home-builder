import type { Opening, PlanRoomLabel, Point, UnitSystem, Wall } from '../../types';
import { roomArea } from '../geometry/rooms';
import { formatArea, formatLength } from '../measurements';
import { PIXELS_PER_METER } from '../geometry/snapping';

export type PlanExportInput = {
  name?: string;
  floorName?: string;
  walls: Wall[];
  openings: Opening[];
  planRooms: PlanRoomLabel[];
  unitSystem?: UnitSystem;
};

function boundsOf(points: Point[]) {
  if (!points.length) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function wallLengthM(wall: Wall) {
  const dx = (wall.end.x - wall.start.x) / PIXELS_PER_METER;
  const dy = (wall.end.y - wall.start.y) / PIXELS_PER_METER;
  return Math.hypot(dx, dy);
}

/** Draw a dimensioned floor plan onto a canvas (plan-pixel space → image). */
export function drawFloorPlanToCanvas(input: PlanExportInput, opts?: { widthPx?: number; heightPx?: number }) {
  const wallPts = input.walls.flatMap((w) => [w.start, w.end]);
  const roomPts = input.planRooms.flatMap((r) => r.points);
  const b = boundsOf([...wallPts, ...roomPts]);
  const pad = 80;
  const contentW = Math.max(120, b.maxX - b.minX);
  const contentH = Math.max(120, b.maxY - b.minY);
  const targetW = opts?.widthPx ?? 1600;
  const targetH = opts?.heightPx ?? Math.round(targetW * ((contentH + pad * 2) / (contentW + pad * 2)));
  const scale = Math.min((targetW - pad * 2) / contentW, (targetH - pad * 2 - 72) / contentH);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const tx = (x: number) => pad + (x - b.minX) * scale;
  const ty = (y: number) => pad + 56 + (y - b.minY) * scale;

  ctx.fillStyle = '#f7f8fa';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.fillStyle = '#111820';
  ctx.font = '700 28px Figtree, system-ui, sans-serif';
  ctx.fillText(input.name || 'Floor plan', pad, 36);
  ctx.font = '600 16px Figtree, system-ui, sans-serif';
  ctx.fillStyle = '#5c6770';
  const subtitle = [input.floorName, new Date().toLocaleDateString()].filter(Boolean).join(' · ');
  ctx.fillText(subtitle, pad, 58);

  // Rooms
  for (const room of input.planRooms) {
    if (room.points.length < 3) continue;
    ctx.beginPath();
    room.points.forEach((p, i) => {
      const x = tx(p.x);
      const y = ty(p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(232, 242, 251, 0.85)';
    ctx.fill();
    ctx.strokeStyle = '#c5d9ec';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const cx = room.points.reduce((s, p) => s + p.x, 0) / room.points.length;
    const cy = room.points.reduce((s, p) => s + p.y, 0) / room.points.length;
    const area = roomArea(room.points);
    ctx.fillStyle = '#111820';
    ctx.font = '700 15px Figtree, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(room.name, tx(cx), ty(cy) - 8);
    ctx.font = '600 12px Figtree, system-ui, sans-serif';
    ctx.fillStyle = '#5c6770';
    ctx.fillText(formatArea(area, input.unitSystem ?? 'imperial'), tx(cx), ty(cy) + 10);
    ctx.textAlign = 'left';
  }

  // Walls + outer dims on longest horizontal / vertical
  ctx.strokeStyle = '#111820';
  ctx.lineWidth = 4;
  ctx.lineCap = 'square';
  for (const wall of input.walls) {
    ctx.beginPath();
    ctx.moveTo(tx(wall.start.x), ty(wall.start.y));
    ctx.lineTo(tx(wall.end.x), ty(wall.end.y));
    ctx.stroke();
  }

  // Openings as white gaps with ticks
  for (const opening of input.openings) {
    const wall = input.walls.find((w) => w.id === opening.wallId);
    if (!wall) continue;
    const len = wallLengthM(wall);
    if (len < 0.05) continue;
    const t0 = Math.max(0, opening.offset - opening.width / (2 * len));
    const t1 = Math.min(1, opening.offset + opening.width / (2 * len));
    const x0 = wall.start.x + (wall.end.x - wall.start.x) * t0;
    const y0 = wall.start.y + (wall.end.y - wall.start.y) * t0;
    const x1 = wall.start.x + (wall.end.x - wall.start.x) * t1;
    const y1 = wall.start.y + (wall.end.y - wall.start.y) * t1;
    ctx.strokeStyle = '#f7f8fa';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(tx(x0), ty(y0));
    ctx.lineTo(tx(x1), ty(y1));
    ctx.stroke();
    ctx.strokeStyle = opening.type === 'window' ? '#0058a3' : '#0f6b3c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx(x0), ty(y0));
    ctx.lineTo(tx(x1), ty(y1));
    ctx.stroke();
  }

  // Overall envelope dimensions
  const unit = input.unitSystem ?? 'imperial';
  const widthM = contentW / PIXELS_PER_METER;
  const depthM = contentH / PIXELS_PER_METER;
  ctx.fillStyle = '#111820';
  ctx.font = '600 13px Figtree, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(formatLength(widthM, unit), targetW / 2, targetH - 18);
  ctx.save();
  ctx.translate(18, targetH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(formatLength(depthM, unit), 0, 0);
  ctx.restore();
  ctx.textAlign = 'left';

  return canvas;
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string) {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}

/** Minimal one-page PDF wrapping a JPEG of the plan (no extra deps). */
export function downloadCanvasPdf(canvas: HTMLCanvasElement, filename: string) {
  const jpeg = canvas.toDataURL('image/jpeg', 0.92);
  const raw = atob(jpeg.split(',')[1] ?? '');
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

  const w = canvas.width;
  const h = canvas.height;
  const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;

  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  let offset = 0;
  const push = (chunk: string | Uint8Array) => {
    if (typeof chunk === 'string') {
      const bin = encoder.encode(chunk);
      parts.push(bin);
      offset += bin.length;
    } else {
      const copy = new Uint8Array(chunk);
      parts.push(copy);
      offset += copy.length;
    }
  };

  push('%PDF-1.4\n');
  const offsets: number[] = [0];

  const writeObj = (num: number, body: string, stream?: Uint8Array) => {
    offsets[num] = offset;
    if (stream) {
      push(`${num} 0 obj\n${body}\n`);
      push(stream);
      push('\nendstream\nendobj\n');
    } else {
      push(`${num} 0 obj\n${body}\nendobj\n`);
    }
  };

  writeObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  writeObj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  writeObj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`,
  );
  writeObj(4, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  writeObj(
    5,
    `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream`,
    bytes,
  );

  const xrefStart = offset;
  push(`xref\n0 6\n`);
  push(`0000000000 65535 f \n`);
  for (let i = 1; i <= 5; i++) {
    push(`${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`);
  }
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const blob = new Blob(parts, { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Simple DXF of wall LINE entities (plan pixels as drawing units). */
export function downloadPlanDxf(input: PlanExportInput, filename: string) {
  const lines = ['0', 'SECTION', '2', 'ENTITIES'];
  for (const wall of input.walls) {
    lines.push(
      '0',
      'LINE',
      '8',
      'WALLS',
      '10',
      String(wall.start.x),
      '20',
      String(-wall.start.y),
      '30',
      '0',
      '11',
      String(wall.end.x),
      '21',
      String(-wall.end.y),
      '31',
      '0',
    );
  }
  lines.push('0', 'ENDSEC', '0', 'EOF');
  const blob = new Blob([lines.join('\n')], { type: 'application/dxf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function openingOffsetFromMeters(meters: number, wall: Wall) {
  const len = wallLengthM(wall);
  if (len < 0.05) return 0.5;
  return Math.min(0.97, Math.max(0.03, meters / len));
}

export function openingMetersFromOffset(offset: number, wall: Wall) {
  return wallLengthM(wall) * offset;
}

export { wallLengthM };
