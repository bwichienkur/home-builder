import type { Opening, PlanRoomLabel, Point, UnitSystem, Wall } from '../../types';
import { roomArea } from '../geometry/rooms';
import { formatArea, formatLength } from '../measurements';
import { PIXELS_PER_METER } from '../geometry/snapping';
import {
  drawElevationToCanvas,
  drawSectionToCanvas,
  drawStructureSheetToCanvas,
} from './drawElevations';

export type PlanExportInput = {
  name?: string;
  floorName?: string;
  walls: Wall[];
  openings: Opening[];
  planRooms: PlanRoomLabel[];
  unitSystem?: UnitSystem;
  furniture?: import('../../types').FurnitureItem[];
};

/** Print sheet size in inches (landscape ANSI B / Tabloid). */
export const SHEET_IN = { width: 17, height: 11 } as const;
export const SHEET_DPI = 150;

function boundsOf(points: Point[]) {
  if (!points.length) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function wallLengthM(wall: Wall) {
  const dx = (wall.end.x - wall.start.x) / PIXELS_PER_METER;
  const dy = (wall.end.y - wall.start.y) / PIXELS_PER_METER;
  return Math.hypot(dx, dy);
}

export function openingOffsetFromMeters(meters: number, wall: Wall) {
  const len = wallLengthM(wall);
  if (len < 0.05) return 0.5;
  return Math.min(0.97, Math.max(0.03, meters / len));
}

export function openingMetersFromOffset(offset: number, wall: Wall) {
  return wallLengthM(wall) * offset;
}

function openingSpanPlan(wall: Wall, opening: Opening) {
  const len = wallLengthM(wall);
  if (len < 0.05) return null;
  const t0 = Math.max(0, opening.offset - opening.width / (2 * len));
  const t1 = Math.min(1, opening.offset + opening.width / (2 * len));
  return {
    a: {
      x: wall.start.x + (wall.end.x - wall.start.x) * t0,
      y: wall.start.y + (wall.end.y - wall.start.y) * t0,
    },
    b: {
      x: wall.start.x + (wall.end.x - wall.start.x) * t1,
      y: wall.start.y + (wall.end.y - wall.start.y) * t1,
    },
    mid: {
      x: wall.start.x + (wall.end.x - wall.start.x) * opening.offset,
      y: wall.start.y + (wall.end.y - wall.start.y) * opening.offset,
    },
  };
}

/** Architectural scale label for a true meters→paper scale. */
export function describePlanScale(pxPerMeter: number, dpi = SHEET_DPI, unit: UnitSystem = 'imperial') {
  if (unit === 'metric') {
    // paper mm per world meter = (pxPerMeter / dpi) * 25.4
    const paperMmPerWorldM = (pxPerMeter / dpi) * 25.4;
    const ratio = 1000 / Math.max(1e-9, paperMmPerWorldM);
    const nice = [50, 75, 100, 125, 150, 200, 250, 500].reduce((best, n) =>
      Math.abs(n - ratio) < Math.abs(best - ratio) ? n : best,
    );
    return { label: `1:${nice}`, ratio: nice, pxPerMeter };
  }
  // inches on paper per foot in world
  const inPerFt = (pxPerMeter * 0.3048) / dpi;
  const candidates: { label: string; inPerFt: number }[] = [
    { label: '1/8" = 1\'-0"', inPerFt: 1 / 8 },
    { label: '3/16" = 1\'-0"', inPerFt: 3 / 16 },
    { label: '1/4" = 1\'-0"', inPerFt: 1 / 4 },
    { label: '3/8" = 1\'-0"', inPerFt: 3 / 8 },
    { label: '1/2" = 1\'-0"', inPerFt: 1 / 2 },
    { label: '3/4" = 1\'-0"', inPerFt: 3 / 4 },
    { label: '1" = 1\'-0"', inPerFt: 1 },
  ];
  const best = candidates.reduce((a, b) => (Math.abs(b.inPerFt - inPerFt) < Math.abs(a.inPerFt - inPerFt) ? b : a));
  return { label: best.label, ratio: 1 / best.inPerFt, pxPerMeter };
}

export type OpeningScheduleRow = {
  mark: string;
  type: Opening['type'];
  widthM: number;
  heightM: number;
  sillM: number;
  wallId: string;
};

export function buildOpeningSchedule(openings: Opening[]): OpeningScheduleRow[] {
  const byType: Record<Opening['type'], number> = { door: 0, window: 0, passage: 0 };
  return openings.map((o) => {
    byType[o.type] += 1;
    const prefix = o.type === 'door' ? 'D' : o.type === 'window' ? 'W' : 'P';
    return {
      mark: `${prefix}${byType[o.type]}`,
      type: o.type,
      widthM: o.width,
      heightM: o.height,
      sillM: o.sill,
      wallId: o.wallId,
    };
  });
}

function drawDimLine(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  label: string,
  outward: { x: number; y: number },
  offsetPx: number,
) {
  const ox = outward.x * offsetPx;
  const oy = outward.y * offsetPx;
  const x0 = ax + ox;
  const y0 = ay + oy;
  const x1 = bx + ox;
  const y1 = by + oy;
  ctx.strokeStyle = '#111820';
  ctx.fillStyle = '#111820';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ax + ox * 0.35, ay + oy * 0.35);
  ctx.lineTo(x0, y0);
  ctx.moveTo(bx + ox * 0.35, by + oy * 0.35);
  ctx.lineTo(x1, y1);
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  // ticks
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const tx = ((y1 - y0) / len) * 5;
  const ty = (-(x1 - x0) / len) * 5;
  ctx.beginPath();
  ctx.moveTo(x0 - tx, y0 - ty);
  ctx.lineTo(x0 + tx, y0 + ty);
  ctx.moveTo(x1 - tx, y1 - ty);
  ctx.lineTo(x1 + tx, y1 + ty);
  ctx.stroke();
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  ctx.font = '600 11px Figtree, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const pad = 3;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = '#f7f8fa';
  ctx.fillRect(mx - tw / 2 - pad, my - 7, tw + pad * 2, 14);
  ctx.fillStyle = '#111820';
  ctx.fillText(label, mx, my);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawNorthArrow(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#111820';
  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.lineTo(10, 12);
  ctx.lineTo(0, 4);
  ctx.lineTo(-10, 12);
  ctx.closePath();
  ctx.fill();
  ctx.font = '700 12px Figtree, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', 0, -34);
  ctx.restore();
}

function drawTitleBlock(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  input: PlanExportInput,
  scaleLabel: string,
  sheetLabel: string,
) {
  ctx.strokeStyle = '#111820';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.beginPath();
  ctx.moveTo(rect.x, rect.y + rect.h * 0.38);
  ctx.lineTo(rect.x + rect.w, rect.y + rect.h * 0.38);
  ctx.moveTo(rect.x, rect.y + rect.h * 0.62);
  ctx.lineTo(rect.x + rect.w, rect.y + rect.h * 0.62);
  ctx.moveTo(rect.x + rect.w * 0.55, rect.y + rect.h * 0.62);
  ctx.lineTo(rect.x + rect.w * 0.55, rect.y + rect.h);
  ctx.stroke();

  ctx.fillStyle = '#111820';
  ctx.font = '700 16px Figtree, system-ui, sans-serif';
  ctx.fillText(input.name || 'Floor plan', rect.x + 10, rect.y + 24);
  ctx.font = '600 12px Figtree, system-ui, sans-serif';
  ctx.fillStyle = '#5c6770';
  ctx.fillText(input.floorName || 'Plan', rect.x + 10, rect.y + 44);

  ctx.fillStyle = '#111820';
  ctx.font = '600 11px Figtree, system-ui, sans-serif';
  ctx.fillText(`SCALE  ${scaleLabel}`, rect.x + 10, rect.y + rect.h * 0.38 + 22);
  ctx.fillText(`DATE  ${new Date().toLocaleDateString()}`, rect.x + 10, rect.y + rect.h * 0.38 + 40);
  ctx.fillText(sheetLabel, rect.x + 10, rect.y + rect.h * 0.62 + 22);
  ctx.fillText('Mahnikka Planner', rect.x + rect.w * 0.55 + 10, rect.y + rect.h * 0.62 + 22);
  ctx.font = '500 10px Figtree, system-ui, sans-serif';
  ctx.fillStyle = '#5c6770';
  ctx.fillText('INTERNAL ESTIMATE SET — not a contract bid', rect.x + rect.w * 0.55 + 10, rect.y + rect.h * 0.62 + 40);
}

function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pxPerMeter: number,
  unit: UnitSystem,
) {
  const meters = unit === 'metric' ? 2 : 3.048; // 2 m or 10 ft
  const w = meters * pxPerMeter;
  ctx.strokeStyle = '#111820';
  ctx.fillStyle = '#111820';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  const segments = unit === 'metric' ? 2 : 2;
  for (let i = 0; i <= segments; i++) {
    const sx = x + (w * i) / segments;
    ctx.beginPath();
    ctx.moveTo(sx, y - 6);
    ctx.lineTo(sx, y + 6);
    ctx.stroke();
    if (i % 2 === 0) {
      ctx.fillRect(sx, y - 3, w / segments, 6);
    }
  }
  ctx.font = '600 10px Figtree, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(unit === 'metric' ? '0' : '0', x, y + 18);
  ctx.fillText(unit === 'metric' ? `${meters} m` : '10\'', x + w, y + 18);
  ctx.textAlign = 'left';
}

/**
 * Draw a scaled, dimensioned floor-plan sheet (title block, north arrow, wall/opening dims).
 * Defaults to landscape ANSI B @ 150 DPI.
 */
export function drawFloorPlanToCanvas(input: PlanExportInput, opts?: { widthPx?: number; heightPx?: number }) {
  const unit = input.unitSystem ?? 'imperial';
  const targetW = opts?.widthPx ?? Math.round(SHEET_IN.width * SHEET_DPI);
  const targetH = opts?.heightPx ?? Math.round(SHEET_IN.height * SHEET_DPI);

  const wallPts = input.walls.flatMap((w) => [w.start, w.end]);
  const roomPts = input.planRooms.flatMap((r) => r.points);
  const b = boundsOf([...wallPts, ...roomPts]);
  const contentW = Math.max(120, b.maxX - b.minX);
  const contentH = Math.max(120, b.maxY - b.minY);

  const margin = 48;
  const titleH = 110;
  const titleW = 320;
  const drawLeft = margin + 36;
  const drawTop = margin + 28;
  const drawRight = targetW - margin;
  const drawBottom = targetH - margin - titleH - 16;
  const drawW = drawRight - drawLeft;
  const drawH = drawBottom - drawTop;

  // Leave padding inside drawing area for dimension strings
  const dimPad = 56;
  const scale = Math.min((drawW - dimPad * 2) / contentW, (drawH - dimPad * 2) / contentH);
  const pxPerMeter = scale * PIXELS_PER_METER;
  const scaleInfo = describePlanScale(pxPerMeter, SHEET_DPI, unit);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const offsetX = drawLeft + dimPad + (drawW - dimPad * 2 - contentW * scale) / 2;
  const offsetY = drawTop + dimPad + (drawH - dimPad * 2 - contentH * scale) / 2;
  const tx = (x: number) => offsetX + (x - b.minX) * scale;
  const ty = (y: number) => offsetY + (y - b.minY) * scale;

  ctx.fillStyle = '#f7f8fa';
  ctx.fillRect(0, 0, targetW, targetH);

  // Sheet border
  ctx.strokeStyle = '#111820';
  ctx.lineWidth = 2;
  ctx.strokeRect(margin / 2, margin / 2, targetW - margin, targetH - margin);

  // Rooms
  for (const room of input.planRooms) {
    if (room.points.length < 3) continue;
    ctx.beginPath();
    room.points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(tx(p.x), ty(p.y));
      else ctx.lineTo(tx(p.x), ty(p.y));
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(232, 242, 251, 0.9)';
    ctx.fill();
    ctx.strokeStyle = '#9bb8d4';
    ctx.lineWidth = 1.25;
    ctx.stroke();

    const cx = room.points.reduce((s, p) => s + p.x, 0) / room.points.length;
    const cy = room.points.reduce((s, p) => s + p.y, 0) / room.points.length;
    const area = roomArea(room.points);
    ctx.fillStyle = '#111820';
    ctx.font = '700 14px Figtree, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(room.name.toUpperCase(), tx(cx), ty(cy) - 8);
    ctx.font = '600 11px Figtree, system-ui, sans-serif';
    ctx.fillStyle = '#5c6770';
    ctx.fillText(formatArea(area, unit), tx(cx), ty(cy) + 10);
    ctx.textAlign = 'left';
  }

  // Walls
  ctx.strokeStyle = '#111820';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'square';
  for (const wall of input.walls) {
    ctx.beginPath();
    ctx.moveTo(tx(wall.start.x), ty(wall.start.y));
    ctx.lineTo(tx(wall.end.x), ty(wall.end.y));
    ctx.stroke();
  }

  const schedule = buildOpeningSchedule(input.openings);
  const markById = new Map(input.openings.map((o, i) => [o.id, schedule[i]!.mark]));

  // Openings + marks + width dims
  for (const opening of input.openings) {
    const wall = input.walls.find((w) => w.id === opening.wallId);
    if (!wall) continue;
    const span = openingSpanPlan(wall, opening);
    if (!span) continue;
    ctx.strokeStyle = '#f7f8fa';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(tx(span.a.x), ty(span.a.y));
    ctx.lineTo(tx(span.b.x), ty(span.b.y));
    ctx.stroke();
    ctx.strokeStyle = opening.type === 'window' ? '#0058a3' : '#0f6b3c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx(span.a.x), ty(span.a.y));
    ctx.lineTo(tx(span.b.x), ty(span.b.y));
    ctx.stroke();

    const mark = markById.get(opening.id) ?? '';
    ctx.fillStyle = '#111820';
    ctx.font = '700 11px Figtree, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(mark, tx(span.mid.x), ty(span.mid.y) - 10);
    ctx.textAlign = 'left';

    const wx = wall.end.x - wall.start.x;
    const wy = wall.end.y - wall.start.y;
    const wlen = Math.hypot(wx, wy) || 1;
    // outward normal (screen space approx via plan Y-down)
    let nx = -wy / wlen;
    let ny = wx / wlen;
    const midX = (wall.start.x + wall.end.x) / 2;
    const midY = (wall.start.y + wall.end.y) / 2;
    const planCx = (b.minX + b.maxX) / 2;
    const planCy = (b.minY + b.maxY) / 2;
    if ((midX - planCx) * nx + (midY - planCy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    drawDimLine(
      ctx,
      tx(span.a.x),
      ty(span.a.y),
      tx(span.b.x),
      ty(span.b.y),
      formatLength(opening.width, unit),
      { x: nx, y: ny },
      18,
    );
  }

  // Wall length dimensions (outside)
  for (const wall of input.walls) {
    const len = wallLengthM(wall);
    if (len < 0.4) continue;
    const wx = wall.end.x - wall.start.x;
    const wy = wall.end.y - wall.start.y;
    const wlen = Math.hypot(wx, wy) || 1;
    let nx = -wy / wlen;
    let ny = wx / wlen;
    const midX = (wall.start.x + wall.end.x) / 2;
    const midY = (wall.start.y + wall.end.y) / 2;
    const planCx = (b.minX + b.maxX) / 2;
    const planCy = (b.minY + b.maxY) / 2;
    if ((midX - planCx) * nx + (midY - planCy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    drawDimLine(
      ctx,
      tx(wall.start.x),
      ty(wall.start.y),
      tx(wall.end.x),
      ty(wall.end.y),
      formatLength(len, unit),
      { x: nx, y: ny },
      36,
    );
  }

  // Overall envelope dims
  const widthM = contentW / PIXELS_PER_METER;
  const depthM = contentH / PIXELS_PER_METER;
  drawDimLine(ctx, offsetX, offsetY - 8, offsetX + contentW * scale, offsetY - 8, formatLength(widthM, unit), { x: 0, y: -1 }, 14);
  drawDimLine(ctx, offsetX - 8, offsetY, offsetX - 8, offsetY + contentH * scale, formatLength(depthM, unit), { x: -1, y: 0 }, 14);

  drawNorthArrow(ctx, drawRight - 36, drawTop + 48);
  drawScaleBar(ctx, drawLeft, drawBottom + 8, pxPerMeter, unit);

  const titleRect = { x: targetW - margin - titleW, y: targetH - margin - titleH, w: titleW, h: titleH };
  drawTitleBlock(ctx, titleRect, input, scaleInfo.label, 'A1 · FLOOR PLAN');

  ctx.fillStyle = '#5c6770';
  ctx.font = '600 11px Figtree, system-ui, sans-serif';
  ctx.fillText(`Drawing scale ≈ ${scaleInfo.label}`, drawLeft, margin / 2 + 18);

  return canvas;
}

/** Schedule sheet for doors / windows / passages. */
export function drawOpeningScheduleToCanvas(input: PlanExportInput, opts?: { widthPx?: number; heightPx?: number }) {
  const unit = input.unitSystem ?? 'imperial';
  const targetW = opts?.widthPx ?? Math.round(SHEET_IN.width * SHEET_DPI);
  const targetH = opts?.heightPx ?? Math.round(SHEET_IN.height * SHEET_DPI);
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const rows = buildOpeningSchedule(input.openings);
  ctx.fillStyle = '#f7f8fa';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.strokeStyle = '#111820';
  ctx.lineWidth = 2;
  const margin = 48;
  ctx.strokeRect(margin / 2, margin / 2, targetW - margin, targetH - margin);

  ctx.fillStyle = '#111820';
  ctx.font = '700 28px Figtree, system-ui, sans-serif';
  ctx.fillText('Door & window schedule', margin, margin + 28);
  ctx.font = '600 14px Figtree, system-ui, sans-serif';
  ctx.fillStyle = '#5c6770';
  ctx.fillText([input.name, input.floorName].filter(Boolean).join(' · ') || 'Plan', margin, margin + 52);

  const cols = [
    { key: 'mark', label: 'Mark', w: 90 },
    { key: 'type', label: 'Type', w: 140 },
    { key: 'width', label: 'Width', w: 160 },
    { key: 'height', label: 'Height', w: 160 },
    { key: 'sill', label: 'Sill', w: 160 },
    { key: 'wall', label: 'Wall', w: 180 },
  ] as const;
  const tableX = margin;
  const tableY = margin + 80;
  const rowH = 34;
  let x = tableX;
  ctx.font = '700 12px Figtree, system-ui, sans-serif';
  ctx.fillStyle = '#111820';
  for (const col of cols) {
    ctx.strokeRect(x, tableY, col.w, rowH);
    ctx.fillText(col.label, x + 10, tableY + 22);
    x += col.w;
  }

  ctx.font = '600 12px Figtree, system-ui, sans-serif';
  rows.forEach((row, i) => {
    const y = tableY + rowH * (i + 1);
    const values = [
      row.mark,
      row.type,
      formatLength(row.widthM, unit),
      formatLength(row.heightM, unit),
      row.type === 'window' ? formatLength(row.sillM, unit) : '—',
      row.wallId.slice(0, 10),
    ];
    let cx = tableX;
    values.forEach((val, ci) => {
      const w = cols[ci]!.w;
      ctx.strokeRect(cx, y, w, rowH);
      ctx.fillText(val, cx + 10, y + 22);
      cx += w;
    });
  });

  if (!rows.length) {
    ctx.fillStyle = '#5c6770';
    ctx.fillText('No openings on this floor.', tableX, tableY + rowH + 28);
  }

  const titleRect = { x: targetW - margin - 320, y: targetH - margin - 110, w: 320, h: 110 };
  drawTitleBlock(ctx, titleRect, input, 'N/A', 'A2 · SCHEDULES');
  return canvas;
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string) {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}

function canvasToJpegBytes(canvas: HTMLCanvasElement) {
  const jpeg = canvas.toDataURL('image/jpeg', 0.92);
  const raw = atob(jpeg.split(',')[1] ?? '');
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** One or more JPEG pages as a multi-page PDF (no extra deps). */
export function downloadCanvasesPdf(canvases: HTMLCanvasElement[], filename: string) {
  if (!canvases.length) return;
  const pages = canvases.map((c) => ({ w: c.width, h: c.height, bytes: canvasToJpegBytes(c) }));

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

  // Object layout: 1 catalog, 2 pages, then per page: page, content, image
  const pageCount = pages.length;
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  writeObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  writeObj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);

  pages.forEach((page, i) => {
    const pageObj = 3 + i * 3;
    const contentObj = pageObj + 1;
    const imageObj = pageObj + 2;
    const content = `q\n${page.w} 0 0 ${page.h} 0 0 cm\n/Im${i} Do\nQ\n`;
    writeObj(
      pageObj,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.w} ${page.h}] /Contents ${contentObj} 0 R /Resources << /XObject << /Im${i} ${imageObj} 0 R >> >> >>`,
    );
    writeObj(contentObj, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    writeObj(
      imageObj,
      `<< /Type /XObject /Subtype /Image /Width ${page.w} /Height ${page.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream`,
      page.bytes,
    );
  });

  const lastObj = 2 + pageCount * 3;
  const xrefStart = offset;
  push(`xref\n0 ${lastObj + 1}\n`);
  push(`0000000000 65535 f \n`);
  for (let i = 1; i <= lastObj; i++) {
    push(`${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${lastObj + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const blob = new Blob(parts, { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** @deprecated Prefer downloadCanvasesPdf for multi-page sheets. */
export function downloadCanvasPdf(canvas: HTMLCanvasElement, filename: string) {
  downloadCanvasesPdf([canvas], filename);
}

export function downloadScaledPlanPdf(input: PlanExportInput, filename: string) {
  downloadCanvasesPdf(buildConstructionSetCanvases(input), filename);
}

/** One construction-set sheet pack per floor, concatenated into a single PDF. */
export function downloadMultiFloorScaledPlanPdf(inputs: PlanExportInput[], filename: string) {
  if (!inputs.length) return;
  if (inputs.length === 1) {
    downloadScaledPlanPdf(inputs[0]!, filename);
    return;
  }
  downloadCanvasesPdf(
    inputs.flatMap((input) => buildConstructionSetCanvases(input)),
    filename,
  );
}

/** Full CD set: plan, schedule, elevations, section, foundation, roof. */
export function buildConstructionSetCanvases(input: PlanExportInput) {
  return [
    drawFloorPlanToCanvas(input),
    drawOpeningScheduleToCanvas(input),
    drawElevationToCanvas(input, 'front'),
    drawElevationToCanvas(input, 'right'),
    drawSectionToCanvas(input),
    drawStructureSheetToCanvas({ ...input, kind: 'foundation' }),
    drawStructureSheetToCanvas({ ...input, kind: 'roof' }),
  ];
}

/** Plan-pixel → CAD drawing units (meters or inches), Y-up, origin at plan min corner. */
export function planPointToCad(p: Point, origin: Point, unit: UnitSystem): { x: number; y: number } {
  const metersX = (p.x - origin.x) / PIXELS_PER_METER;
  const metersY = (p.y - origin.y) / PIXELS_PER_METER;
  if (unit === 'metric') return { x: metersX, y: -metersY };
  const IN_PER_M = 39.37007874;
  return { x: metersX * IN_PER_M, y: -metersY * IN_PER_M };
}

/** Build a DXF string with WALLS / ROOMS / OPENINGS / TEXT layers in real units. */
export function buildPlanDxf(input: PlanExportInput): string {
  const unit = input.unitSystem ?? 'imperial';
  const wallPts = input.walls.flatMap((w) => [w.start, w.end]);
  const roomPts = input.planRooms.flatMap((r) => r.points);
  const b = boundsOf([...wallPts, ...roomPts]);
  const origin = { x: b.minX, y: b.minY };
  // AutoCAD: 1 = inches, 4 = millimeters — use inches for imperial, millimeters for metric
  const insunits = unit === 'metric' ? 4 : 1;
  const scaleCad = (p: Point) => {
    const c = planPointToCad(p, origin, unit);
    if (unit === 'metric') return { x: c.x * 1000, y: c.y * 1000 }; // mm
    return c; // inches
  };

  const lines: string[] = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$INSUNITS',
    '70',
    String(insunits),
    '9',
    '$MEASUREMENT',
    '70',
    unit === 'metric' ? '1' : '0',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'TABLES',
    '0',
    'TABLE',
    '2',
    'LAYER',
    '70',
    '7',
    '0',
    'LAYER',
    '2',
    'WALLS',
    '70',
    '0',
    '62',
    '7',
    '6',
    'CONTINUOUS',
    '0',
    'LAYER',
    '2',
    'A-WALL-EXT',
    '70',
    '0',
    '62',
    '1',
    '6',
    'CONTINUOUS',
    '0',
    'LAYER',
    '2',
    'A-WALL-INT',
    '70',
    '0',
    '62',
    '5',
    '6',
    'CONTINUOUS',
    '0',
    'LAYER',
    '2',
    'ROOMS',
    '70',
    '0',
    '62',
    '4',
    '6',
    'CONTINUOUS',
    '0',
    'LAYER',
    '2',
    'OPENINGS',
    '70',
    '0',
    '62',
    '3',
    '6',
    'CONTINUOUS',
    '0',
    'LAYER',
    '2',
    'TEXT',
    '70',
    '0',
    '62',
    '2',
    '6',
    'CONTINUOUS',
    '0',
    'LAYER',
    '2',
    'DIMS',
    '70',
    '0',
    '62',
    '1',
    '6',
    'CONTINUOUS',
    '0',
    'ENDTAB',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
  ];

  const pushLine = (layer: string, a: Point, bPt: Point) => {
    const A = scaleCad(a);
    const B = scaleCad(bPt);
    lines.push('0', 'LINE', '8', layer, '10', String(A.x), '20', String(A.y), '30', '0', '11', String(B.x), '21', String(B.y), '31', '0');
  };

  const offsetPair = (a: Point, bPt: Point, distPx: number) => {
    const dx = bPt.x - a.x;
    const dy = bPt.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * distPx;
    const ny = (dx / len) * distPx;
    return {
      left: { a: { x: a.x + nx, y: a.y + ny }, b: { x: bPt.x + nx, y: bPt.y + ny } },
      right: { a: { x: a.x - nx, y: a.y - ny }, b: { x: bPt.x - nx, y: bPt.y - ny } },
    };
  };

  for (const wall of input.walls) {
    const layer = wall.assembly === 'exterior' ? 'A-WALL-EXT' : 'A-WALL-INT';
    const halfPx = ((wall.thickness || 0.15) * PIXELS_PER_METER) / 2;
    const sides = offsetPair(wall.start, wall.end, halfPx);
    // Closed rectangular face (4 edges) for hatch/area workflows.
    const a1 = sides.left.a;
    const b1 = sides.left.b;
    const b2 = sides.right.b;
    const a2 = sides.right.a;
    const verts = [a1, b1, b2, a2].map(scaleCad);
    lines.push('0', 'LWPOLYLINE', '8', layer, '90', '4', '70', '1');
    for (const v of verts) {
      lines.push('10', String(v.x), '20', String(v.y));
    }
    // Centerline kept on WALLS for dim reference / older importers.
    pushLine('WALLS', wall.start, wall.end);
    const len = wallLengthM(wall);
    if (len < 0.3) continue;
    const mid = {
      x: (wall.start.x + wall.end.x) / 2,
      y: (wall.start.y + wall.end.y) / 2,
    };
    const M = scaleCad(mid);
    const textH = unit === 'metric' ? 120 : 5;
    const label = unit === 'metric' ? `${len.toFixed(2)} m` : `${(len / 0.3048).toFixed(2)} ft`;
    lines.push(
      '0',
      'TEXT',
      '8',
      'DIMS',
      '10',
      String(M.x),
      '20',
      String(M.y),
      '30',
      '0',
      '40',
      String(textH),
      '1',
      label,
    );
  }

  for (const room of input.planRooms) {
    if (room.points.length < 3) continue;
    const verts = room.points.map(scaleCad);
    lines.push(
      '0',
      'LWPOLYLINE',
      '8',
      'ROOMS',
      '90',
      String(verts.length),
      '70',
      '1',
    );
    for (const v of verts) {
      lines.push('10', String(v.x), '20', String(v.y));
    }
    const cx = room.points.reduce((s, p) => s + p.x, 0) / room.points.length;
    const cy = room.points.reduce((s, p) => s + p.y, 0) / room.points.length;
    const C = scaleCad({ x: cx, y: cy });
    const textH = unit === 'metric' ? 200 : 8; // mm or inches
    lines.push(
      '0',
      'TEXT',
      '8',
      'TEXT',
      '10',
      String(C.x),
      '20',
      String(C.y),
      '30',
      '0',
      '40',
      String(textH),
      '1',
      room.name,
    );
  }

  const schedule = buildOpeningSchedule(input.openings);
  input.openings.forEach((opening, i) => {
    const wall = input.walls.find((w) => w.id === opening.wallId);
    if (!wall) return;
    const span = openingSpanPlan(wall, opening);
    if (!span) return;
    pushLine('OPENINGS', span.a, span.b);
    const M = scaleCad(span.mid);
    const textH = unit === 'metric' ? 150 : 6;
    lines.push(
      '0',
      'TEXT',
      '8',
      'TEXT',
      '10',
      String(M.x),
      '20',
      String(M.y),
      '30',
      '0',
      '40',
      String(textH),
      '1',
      schedule[i]?.mark ?? opening.type,
    );
  });

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

export function downloadPlanDxf(input: PlanExportInput, filename: string) {
  const blob = new Blob([buildPlanDxf(input)], { type: 'application/dxf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
