import type { FurnitureItem, Opening, PlanRoomLabel, Point, UnitSystem, Wall } from '../../types';
import { formatLength } from '../measurements';
import { PIXELS_PER_METER } from '../geometry/snapping';
import { wallLengthM } from './drawFloorPlan';

export type ElevationFace = 'front' | 'back' | 'left' | 'right';

function boundsOf(points: Point[]) {
  if (!points.length) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function planToM(p: Point, origin: Point) {
  return {
    x: (p.x - origin.x) / PIXELS_PER_METER,
    y: (p.y - origin.y) / PIXELS_PER_METER,
  };
}

/** Orthographic elevation of exterior walls for one face. */
export function drawElevationToCanvas(
  input: {
    name?: string;
    floorName?: string;
    walls: Wall[];
    openings: Opening[];
    planRooms: PlanRoomLabel[];
    unitSystem?: UnitSystem;
  },
  face: ElevationFace,
  opts?: { widthPx?: number; heightPx?: number },
) {
  const unit = input.unitSystem ?? 'imperial';
  const w = opts?.widthPx ?? 2550;
  const h = opts?.heightPx ?? 1650;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const wallPts = input.walls.flatMap((wall) => [wall.start, wall.end]);
  const b = boundsOf([...wallPts, ...input.planRooms.flatMap((r) => r.points)]);
  const origin = { x: b.minX, y: b.minY };
  const widthM = (b.maxX - b.minX) / PIXELS_PER_METER;
  const depthM = (b.maxY - b.minY) / PIXELS_PER_METER;
  const storyH = input.walls[0]?.height ?? 2.7;

  const along = face === 'front' || face === 'back' ? widthM : depthM;
  const margin = 80;
  const titleH = 70;
  const scale = Math.min((w - margin * 2) / Math.max(along, 1), (h - margin * 2 - titleH - 40) / (storyH + 1));

  ctx.fillStyle = '#f7f8fa';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#111820';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, w - 48, h - 48);

  ctx.fillStyle = '#111820';
  ctx.font = '700 26px Figtree, system-ui, sans-serif';
  ctx.fillText(`${face.toUpperCase()} ELEVATION`, margin, margin + 10);
  ctx.font = '600 14px Figtree, system-ui, sans-serif';
  ctx.fillStyle = '#5c6770';
  ctx.fillText([input.name, input.floorName].filter(Boolean).join(' · '), margin, margin + 34);

  const groundY = h - margin - 40;
  const leftX = margin + ((w - margin * 2) - along * scale) / 2;

  // Ground line
  ctx.strokeStyle = '#111820';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftX - 20, groundY);
  ctx.lineTo(leftX + along * scale + 20, groundY);
  ctx.stroke();

  const projectWall = (wall: Wall) => {
    const a = planToM(wall.start, origin);
    const bPt = planToM(wall.end, origin);
    if (face === 'front') {
      // looking +Y (plan down); show walls near maxY
      const y = Math.max(a.y, bPt.y);
      if (Math.abs(y - depthM) > 0.35 && Math.abs(a.y - bPt.y) < 0.2) return null;
      if (Math.abs(a.y - bPt.y) > Math.abs(a.x - bPt.x)) return null; // prefer horizontal runs on front
      return { x0: Math.min(a.x, bPt.x), x1: Math.max(a.x, bPt.x), wall };
    }
    if (face === 'back') {
      if (Math.abs(a.y - bPt.y) > Math.abs(a.x - bPt.x)) return null;
      const y = Math.min(a.y, bPt.y);
      if (y > 0.35) return null;
      return { x0: Math.min(a.x, bPt.x), x1: Math.max(a.x, bPt.x), wall };
    }
    if (face === 'left') {
      if (Math.abs(a.x - bPt.x) > Math.abs(a.y - bPt.y)) return null;
      const x = Math.min(a.x, bPt.x);
      if (x > 0.35) return null;
      return { x0: Math.min(a.y, bPt.y), x1: Math.max(a.y, bPt.y), wall };
    }
    if (Math.abs(a.x - bPt.x) > Math.abs(a.y - bPt.y)) return null;
    const x = Math.max(a.x, bPt.x);
    if (Math.abs(x - widthM) > 0.35) return null;
    return { x0: Math.min(a.y, bPt.y), x1: Math.max(a.y, bPt.y), wall };
  };

  for (const wall of input.walls) {
    const proj = projectWall(wall);
    if (!proj) continue;
    const x0 = leftX + proj.x0 * scale;
    const x1 = leftX + proj.x1 * scale;
    const top = groundY - storyH * scale;
    ctx.fillStyle = '#e8edf2';
    ctx.fillRect(Math.min(x0, x1), top, Math.abs(x1 - x0), storyH * scale);
    ctx.strokeStyle = '#111820';
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.min(x0, x1), top, Math.abs(x1 - x0), storyH * scale);

    for (const opening of input.openings.filter((o) => o.wallId === wall.id)) {
      const len = wallLengthM(wall);
      if (len < 0.05) continue;
      const t0 = opening.offset - opening.width / (2 * len);
      const span = Math.abs(x1 - x0);
      const ox = Math.min(x0, x1) + Math.max(0, Math.min(1, t0)) * span;
      const ow = (opening.width / len) * span;
      const sill = opening.sill * scale;
      const oh = opening.height * scale;
      ctx.fillStyle = opening.type === 'window' ? '#cfe8f7' : '#f7f8fa';
      ctx.fillRect(ox, groundY - sill - oh, ow, oh);
      ctx.strokeStyle = '#0058a3';
      ctx.strokeRect(ox, groundY - sill - oh, ow, oh);
    }
  }

  // Height dim
  ctx.fillStyle = '#111820';
  ctx.font = '600 12px Figtree, system-ui, sans-serif';
  ctx.fillText(formatLength(storyH, unit), leftX + along * scale + 16, groundY - (storyH * scale) / 2);
  ctx.fillText(formatLength(along, unit), leftX + (along * scale) / 2 - 20, groundY + 24);

  // Simple gable / flat roof silhouette over the elevation run.
  const roofTop = groundY - storyH * scale;
  ctx.strokeStyle = '#5c6770';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(leftX - 8, roofTop);
  ctx.lineTo(leftX + along * scale * 0.5, roofTop - Math.min(36, storyH * scale * 0.22));
  ctx.lineTo(leftX + along * scale + 8, roofTop);
  ctx.stroke();

  return canvas;
}

/** Vertical section through plan center (looking +X). */
export function drawSectionToCanvas(
  input: {
    name?: string;
    floorName?: string;
    walls: Wall[];
    openings: Opening[];
    planRooms: PlanRoomLabel[];
    furniture?: FurnitureItem[];
    unitSystem?: UnitSystem;
  },
  opts?: { widthPx?: number; heightPx?: number },
) {
  const unit = input.unitSystem ?? 'imperial';
  const w = opts?.widthPx ?? 2550;
  const h = opts?.heightPx ?? 1650;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const wallPts = input.walls.flatMap((wall) => [wall.start, wall.end]);
  const b = boundsOf([...wallPts, ...input.planRooms.flatMap((r) => r.points)]);
  const depthM = (b.maxY - b.minY) / PIXELS_PER_METER;
  const storyH = input.walls[0]?.height ?? 2.7;
  const margin = 80;
  const scale = Math.min((w - margin * 2) / Math.max(depthM, 1), (h - margin * 2 - 80) / (storyH + 1.5));
  const groundY = h - margin - 40;
  const leftX = margin + ((w - margin * 2) - depthM * scale) / 2;

  ctx.fillStyle = '#f7f8fa';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#111820';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, w - 48, h - 48);
  ctx.fillStyle = '#111820';
  ctx.font = '700 26px Figtree, system-ui, sans-serif';
  ctx.fillText('BUILDING SECTION', margin, margin + 10);
  ctx.font = '600 14px Figtree, system-ui, sans-serif';
  ctx.fillStyle = '#5c6770';
  ctx.fillText([input.name, input.floorName, 'cut looking east'].filter(Boolean).join(' · '), margin, margin + 34);

  // Floor slab
  ctx.fillStyle = '#d9dde3';
  ctx.fillRect(leftX, groundY - 8, depthM * scale, 12);
  ctx.strokeStyle = '#111820';
  ctx.strokeRect(leftX, groundY - 8, depthM * scale, 12);

  // Ceiling
  ctx.strokeStyle = '#5c6770';
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(leftX, groundY - storyH * scale);
  ctx.lineTo(leftX + depthM * scale, groundY - storyH * scale);
  ctx.stroke();
  ctx.setLineDash([]);

  // Exterior wall ends in section
  ctx.fillStyle = '#c5cdd6';
  ctx.fillRect(leftX - 10, groundY - storyH * scale, 10, storyH * scale);
  ctx.fillRect(leftX + depthM * scale, groundY - storyH * scale, 10, storyH * scale);

  // Stairs in section if present
  for (const item of input.furniture ?? []) {
    if (item.placementKind !== 'stair') continue;
    const rise = item.stair?.riseM ?? item.height;
    const run = item.stair?.runM ?? item.depth;
    const steps = item.stair?.steps ?? 10;
    const z0 = item.z - item.depth / 2;
    // Map world z roughly into section depth using plan origin mid
    const originY = (b.minY + b.maxY) / 2 / PIXELS_PER_METER;
    void originY;
    const sx = leftX + ((item.z - ((b.minY - 420) / PIXELS_PER_METER)) ) ; // fallback visual
    void sx;
    const startX = leftX + depthM * scale * 0.35;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const x = startX + t * run * scale;
      const y = groundY - t * rise * scale;
      ctx.fillStyle = '#8b7355';
      ctx.fillRect(x, y - (rise / steps) * scale, (run / steps) * scale, (rise / steps) * scale);
    }
  }

  ctx.fillStyle = '#111820';
  ctx.font = '600 12px Figtree, system-ui, sans-serif';
  ctx.fillText(formatLength(storyH, unit), leftX + depthM * scale + 20, groundY - (storyH * scale) / 2);
  ctx.fillText(formatLength(depthM, unit), leftX + (depthM * scale) / 2 - 20, groundY + 24);
  return canvas;
}

/** Simple foundation / roof outline sheets for the CD set. */
export function drawStructureSheetToCanvas(
  input: {
    name?: string;
    floorName?: string;
    walls: Wall[];
    planRooms: PlanRoomLabel[];
    unitSystem?: UnitSystem;
    kind: 'foundation' | 'roof';
  },
  opts?: { widthPx?: number; heightPx?: number },
) {
  const unit = input.unitSystem ?? 'imperial';
  const w = opts?.widthPx ?? 2550;
  const h = opts?.heightPx ?? 1650;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const wallPts = input.walls.flatMap((wall) => [wall.start, wall.end]);
  const b = boundsOf([...wallPts, ...input.planRooms.flatMap((r) => r.points)]);
  const margin = 100;
  const contentW = Math.max(120, b.maxX - b.minX);
  const contentH = Math.max(120, b.maxY - b.minY);
  const scale = Math.min((w - margin * 2) / contentW, (h - margin * 2 - 80) / contentH);
  const tx = (x: number) => margin + (x - b.minX) * scale;
  const ty = (y: number) => margin + 60 + (y - b.minY) * scale;

  ctx.fillStyle = '#f7f8fa';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#111820';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, w - 48, h - 48);
  ctx.fillStyle = '#111820';
  ctx.font = '700 26px Figtree, system-ui, sans-serif';
  ctx.fillText(input.kind === 'foundation' ? 'FOUNDATION PLAN' : 'ROOF PLAN', margin, margin);
  ctx.font = '600 14px Figtree, system-ui, sans-serif';
  ctx.fillStyle = '#5c6770';
  ctx.fillText([input.name, input.floorName].filter(Boolean).join(' · '), margin, margin + 28);

  for (const wall of input.walls) {
    ctx.beginPath();
    ctx.moveTo(tx(wall.start.x), ty(wall.start.y));
    ctx.lineTo(tx(wall.end.x), ty(wall.end.y));
    if (input.kind === 'foundation') {
      ctx.strokeStyle = '#5c4033';
      ctx.lineWidth = wall.assembly === 'exterior' ? 8 : 4;
    } else {
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = wall.assembly === 'exterior' ? 5 : 2;
    }
    ctx.stroke();
  }

  if (input.kind === 'roof') {
    // Ridge line approx center
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = '#0058a3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx(b.minX), ty((b.minY + b.maxY) / 2));
    ctx.lineTo(tx(b.maxX), ty((b.minY + b.maxY) / 2));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#0058a3';
    ctx.font = '700 12px Figtree, system-ui, sans-serif';
    ctx.fillText('RIDGE', tx((b.minX + b.maxX) / 2) - 20, ty((b.minY + b.maxY) / 2) - 8);
  }

  ctx.fillStyle = '#5c6770';
  ctx.font = '600 12px Figtree, system-ui, sans-serif';
  ctx.fillText(
    `Envelope ${formatLength(contentW / PIXELS_PER_METER, unit)} × ${formatLength(contentH / PIXELS_PER_METER, unit)}`,
    margin,
    h - 40,
  );
  return canvas;
}
