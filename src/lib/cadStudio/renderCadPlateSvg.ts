import type { CadPlate, CadSegmentFt, CadSegmentRole } from './types';
import { visibleLabels, visibleSegments } from './buildCadPlate';
import { computeExteriorDims, computeInteriorDims } from './cadExteriorDims';
import {
  visibleFixtures,
  visibleOpeningHints,
  visibleWallCenterlines,
} from './cadLayerVisibility';
import { detectCadRoomStamps, formatRoomAreaSqFt } from './cadRoomStamps';
import { wallFootprintPointsAttr, wallFootprintQuad } from './cadWallFootprint';
import {
  cadWallHatchPatternDefs,
  wallHatchLegendForPlate,
  wallHatchStyleForWall,
} from './cadWallHatch';
import { wallStrokeForMaterial } from './cadSceneMaterials';
import {
  doorSwingArcPath,
  garageDoorLines,
  openingPlanFrame,
  showsDoorSwing,
  windowMullionLines,
} from './cadOpeningSymbols';
import { layoutOpeningMarks } from './cadMarkLayout';

const ROLE_STROKE: Record<CadSegmentRole, string> = {
  wall: '#1e293b',
  opening: '#b45309',
  fixture: '#0f766e',
  soft: '#475569',
  elevation: '#64748b',
  other: '#94a3b8',
};

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Sheet-quality floor plan SVG — closer to the live editor: wall footprints with
 * type hatch, door swings, fixtures, room stamps + SF, dims, and wall legend.
 * Honors soft layer visibility for walls, openings, and fixtures.
 */
export function renderCadPlateSvg(
  plate: CadPlate,
  opts?: {
    padFt?: number;
    title?: string;
    showDims?: boolean;
    showInteriorDims?: boolean;
    showRoomFills?: boolean;
    showLegend?: boolean;
  },
): string {
  const segs = visibleSegments(plate);
  const labels = visibleLabels(plate);
  const walls = visibleWallCenterlines(plate);
  const openings = visibleOpeningHints(plate);
  const fixtures = visibleFixtures(plate);
  const pad = opts?.padFt ?? 8;
  const { minX, minY, maxX, maxY } = plate.bounds;
  const legendH = opts?.showLegend === false ? 0 : 4.5;
  const w = Math.max(maxX - minX, 1) + pad * 2;
  const h = Math.max(maxY - minY, 1) + pad * 2 + legendH;
  const ox = minX - pad;
  const oy = minY - pad;
  const stroke = Math.max(w, h) * 0.0012;
  const fontSize = Math.max(0.7, Math.min(1.6, Math.max(w, h) * 0.012));
  const rooms = detectCadRoomStamps(plate);
  const exteriorDims = opts?.showDims === false ? [] : computeExteriorDims(plate);
  const interiorDims = opts?.showInteriorDims ? computeInteriorDims(plate) : [];
  const legend = wallHatchLegendForPlate(walls);

  const byRole: Record<CadSegmentRole, CadSegmentFt[]> = {
    wall: [],
    opening: [],
    fixture: [],
    soft: [],
    elevation: [],
    other: [],
  };
  for (const s of segs) byRole[s.role].push(s);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(3)} ${h.toFixed(3)}" width="1400" height="${Math.round((1400 * h) / w)}" role="img" aria-label="${escapeXml(opts?.title ?? plate.sourceFileName)}">`,
    `<defs>${cadWallHatchPatternDefs()}</defs>`,
    `<rect width="100%" height="100%" fill="#f7f8fa"/>`,
    `<g transform="translate(${(-ox).toFixed(3)} ${(h - legendH + oy).toFixed(3)}) scale(1,-1)">`,
  ];

  if (opts?.showRoomFills !== false) {
    const fills = ['#dbeafe', '#dcfce7', '#fef9c3', '#fce7f3', '#e0e7ff', '#ffedd5'];
    rooms.forEach((room, i) => {
      if (!room.points.length) return;
      const pts = room.points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');
      parts.push(
        `<polygon points="${pts}" fill="${fills[i % fills.length]}" fill-opacity="0.35" stroke="none"/>`,
      );
    });
  }

  for (const role of ['soft', 'other', 'elevation', 'fixture'] as CadSegmentRole[]) {
    for (const s of byRole[role]) {
      const dash =
        role === 'soft' || /DASH|HIDDEN|PHANTOM|DOT/i.test(s.linetype ?? '')
          ? ' stroke-dasharray="0.35 0.28"'
          : '';
      parts.push(
        `<line x1="${s.x1.toFixed(3)}" y1="${s.y1.toFixed(3)}" x2="${s.x2.toFixed(3)}" y2="${s.y2.toFixed(3)}" stroke="${ROLE_STROKE[role]}" stroke-width="${(stroke * (role === 'fixture' ? 0.85 : 0.7)).toFixed(4)}" stroke-opacity="0.55" stroke-linecap="round"${dash}/>`,
      );
    }
  }

  for (const wall of walls) {
    const foot = wallFootprintQuad(wall);
    const hatch = wallHatchStyleForWall(wall);
    const wallStroke = wallStrokeForMaterial(wall.materialId, wall.exterior);
    parts.push(
      `<polygon points="${wallFootprintPointsAttr(foot)}" fill="url(#${hatch.patternId})" stroke="${wallStroke}" stroke-width="${(stroke * 0.85).toFixed(4)}" stroke-linejoin="round"/>`,
    );
  }

  const markLayouts = layoutOpeningMarks(openings, {
    fontFt: Math.max(0.85, stroke * 9),
    viewSpanFt: Math.max(w, h),
    hideWhenWiderThanFt: 120,
  });

  for (const o of openings) {
    const g = openingPlanFrame(o);
    const color = o.kind === 'window' ? '#0284c7' : '#b45309';
    if (o.kind === 'window') {
      for (const ln of windowMullionLines(o, g.nx, g.ny)) {
        parts.push(
          `<line x1="${ln.x1.toFixed(3)}" y1="${ln.y1.toFixed(3)}" x2="${ln.x2.toFixed(3)}" y2="${ln.y2.toFixed(3)}" stroke="${color}" stroke-width="${(stroke * 1.6).toFixed(4)}" stroke-linecap="butt"/>`,
        );
      }
    } else if (o.kind === 'garage') {
      for (const ln of garageDoorLines(o, g.nx, g.ny)) {
        parts.push(
          `<line x1="${ln.x1.toFixed(3)}" y1="${ln.y1.toFixed(3)}" x2="${ln.x2.toFixed(3)}" y2="${ln.y2.toFixed(3)}" stroke="${color}" stroke-width="${(stroke * 1.8).toFixed(4)}" stroke-linecap="butt"/>`,
        );
      }
    } else {
      parts.push(
        `<line x1="${o.x1.toFixed(3)}" y1="${o.y1.toFixed(3)}" x2="${o.x2.toFixed(3)}" y2="${o.y2.toFixed(3)}" stroke="${color}" stroke-width="${(stroke * 2.2).toFixed(4)}" stroke-linecap="butt"/>`,
      );
    }
    if (showsDoorSwing(o.kind, g.swing)) {
      parts.push(
        `<line x1="${g.hingeX.toFixed(3)}" y1="${g.hingeY.toFixed(3)}" x2="${g.leafTipX.toFixed(3)}" y2="${g.leafTipY.toFixed(3)}" stroke="${color}" stroke-width="${(stroke * 1.6).toFixed(4)}" stroke-linecap="round"/>`,
      );
      parts.push(
        `<path d="${doorSwingArcPath(g)}" fill="none" stroke="${color}" stroke-width="${(stroke * 1.1).toFixed(4)}"/>`,
      );
    }
  }

  // Opening marks (decluttered) — inside flipped group with local text flip
  openings.forEach((o, i) => {
    const layout = markLayouts[i];
    if (!o.mark || !layout?.visible) return;
    const color = o.kind === 'window' ? '#0c4a6e' : '#9a3412';
    const fs = Math.max(0.85, stroke * 9);
    parts.push(
      `<g transform="translate(${layout.anchorX.toFixed(3)} ${layout.anchorY.toFixed(3)}) scale(1,-1)">`,
    );
    if (layout.leader) {
      parts.push(
        `<line x1="0" y1="0" x2="${layout.labelLocalX.toFixed(3)}" y2="${(layout.labelLocalY + stroke * 2).toFixed(3)}" stroke="${color}" stroke-width="${(stroke * 0.7).toFixed(4)}" stroke-opacity="0.55"/>`,
      );
    }
    parts.push(
      `<text x="${layout.labelLocalX.toFixed(3)}" y="${layout.labelLocalY.toFixed(3)}" fill="${color}" font-size="${fs.toFixed(3)}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-weight="700" text-anchor="middle">${escapeXml(o.mark)}</text>`,
    );
    parts.push('</g>');
  });

  for (const f of fixtures) {
    const wf = f.widthFt ?? 2;
    const df = f.depthFt ?? 2;
    const rot = ((f.rotationDeg ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const corners = [
      [-wf / 2, -df / 2],
      [wf / 2, -df / 2],
      [wf / 2, df / 2],
      [-wf / 2, df / 2],
    ].map(([lx, ly]) => {
      const x = f.xFt + lx * cos - ly * sin;
      const y = f.yFt + lx * sin + ly * cos;
      return `${x.toFixed(3)},${y.toFixed(3)}`;
    });
    parts.push(
      `<polygon points="${corners.join(' ')}" fill="#99f6e4" fill-opacity="0.55" stroke="#0f766e" stroke-width="${(stroke * 0.9).toFixed(4)}"/>`,
    );
  }

  parts.push('</g>');

  for (const d of [...exteriorDims, ...interiorDims]) {
    const x1 = d.x1 - ox;
    const y1 = h - legendH - (d.y1 - oy);
    const x2 = d.x2 - ox;
    const y2 = h - legendH - (d.y2 - oy);
    const mx = d.labelX - ox;
    const my = h - legendH - (d.labelY - oy);
    parts.push(
      `<line x1="${x1.toFixed(3)}" y1="${y1.toFixed(3)}" x2="${x2.toFixed(3)}" y2="${y2.toFixed(3)}" stroke="#475569" stroke-width="0.06"/>`,
    );
    parts.push(
      `<text x="${mx.toFixed(3)}" y="${my.toFixed(3)}" fill="#334155" font-size="${(fontSize * 0.85).toFixed(3)}" font-family="IBM Plex Sans, Segoe UI, sans-serif" text-anchor="middle">${escapeXml(d.label)}</text>`,
    );
  }

  for (const room of rooms) {
    const x = room.x - ox;
    const y = h - legendH - (room.y - oy);
    parts.push(
      `<text x="${x.toFixed(3)}" y="${y.toFixed(3)}" fill="#0f172a" font-size="${fontSize.toFixed(3)}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-weight="600" text-anchor="middle">${escapeXml(room.name)}</text>`,
    );
    parts.push(
      `<text x="${x.toFixed(3)}" y="${(y + fontSize * 1.15).toFixed(3)}" fill="#475569" font-size="${(fontSize * 0.85).toFixed(3)}" font-family="IBM Plex Sans, Segoe UI, sans-serif" text-anchor="middle">${escapeXml(formatRoomAreaSqFt(room.areaSqFt))}</text>`,
    );
  }

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]!;
    if (rooms.some((r) => r.sourceLabelIndex === i)) continue;
    const x = label.x - ox;
    const y = h - legendH - (label.y - oy);
    parts.push(
      `<text x="${x.toFixed(3)}" y="${y.toFixed(3)}" fill="#0f172a" font-size="${fontSize.toFixed(3)}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-weight="600" text-anchor="middle" dominant-baseline="middle">${escapeXml(label.text)}</text>`,
    );
  }

  if (opts?.showLegend !== false && legend.length) {
    let lx = pad * 0.35;
    const ly = h - legendH + 1.2;
    parts.push(
      `<text x="${lx.toFixed(2)}" y="${(ly - 0.55).toFixed(2)}" fill="#0f172a" font-size="0.85" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-weight="600">Wall types</text>`,
    );
    for (const item of legend) {
      parts.push(
        `<rect x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" width="1.6" height="0.9" fill="url(#${item.patternId})" stroke="${item.stroke}" stroke-width="0.06"/>`,
      );
      parts.push(
        `<text x="${(lx + 1.9).toFixed(2)}" y="${(ly + 0.7).toFixed(2)}" fill="#334155" font-size="0.75" font-family="IBM Plex Sans, Segoe UI, sans-serif">${escapeXml(item.label)}</text>`,
      );
      lx += 8.5;
    }
  }

  if (opts?.title) {
    parts.push(
      `<text x="16" y="28" fill="#0f172a" font-size="20" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-weight="600">${escapeXml(opts.title)}</text>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}
