import type {
  CadPlate,
  CadSectionCutFt,
  CadSectionDrawing,
  CadSectionHit,
} from './types';
import { defaultWallThicknessFt } from './cadDrawSnap';

const DEFAULT_STORY_FT = 9;

function cutLength(cut: CadSectionCutFt): number {
  return Math.hypot(cut.x2 - cut.x1, cut.y2 - cut.y1);
}

/** Segment–segment intersection in plan; returns station along cut [0..1] or null. */
function intersectStation(
  cut: CadSectionCutFt,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number | null {
  const x1 = cut.x1;
  const y1 = cut.y1;
  const x2 = cut.x2;
  const y2 = cut.y2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const ex = bx - ax;
  const ey = by - ay;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-10) return null;
  const t = ((ax - x1) * ey - (ay - y1) * ex) / den;
  const u = ((ax - x1) * dy - (ay - y1) * dx) / den;
  if (t < -0.02 || t > 1.02 || u < -0.02 || u > 1.02) return null;
  return Math.max(0, Math.min(1, t));
}

function storyHeightFt(_plate: CadPlate): number {
  return DEFAULT_STORY_FT;
}

function ridgeHeightFt(plate: CadPlate, story: number): number {
  const pitch = plate.roof?.pitchRise12 ?? 6;
  const kind = plate.roof?.kind ?? 'gable';
  if (kind === 'flat') return story + 0.5;
  const span = Math.max(1, plate.bounds.maxX - plate.bounds.minX, plate.bounds.maxY - plate.bounds.minY);
  const rise = (pitch / 12) * (span / 2);
  return story + Math.max(1.5, rise);
}

/**
 * Build a building section drawing by intersecting the cut with wall centerlines.
 * Openings near each hit become voids in the wall profile.
 */
export function buildCadSectionDrawing(
  plate: CadPlate,
  cut: CadSectionCutFt,
  opts?: { storyHeightFt?: number },
): CadSectionDrawing {
  const len = Math.max(0.1, cutLength(cut));
  const story = opts?.storyHeightFt ?? storyHeightFt(plate);
  const ridge = ridgeHeightFt(plate, story);
  const hits: CadSectionHit[] = [];

  for (const w of plate.wallCenterlines) {
    if (w.buildingId && plate.buildings?.length) {
      const b = plate.buildings.find((x) => x.id === w.buildingId);
      if (b && !b.visible) continue;
    }
    const t = intersectStation(cut, w.x1, w.y1, w.x2, w.y2);
    if (t == null) continue;
    const stationFt = t * len;
    const thicknessFt = defaultWallThicknessFt(w);
    const openings: CadSectionHit['openings'] = [];
    for (const o of plate.openingHints) {
      const midX = (o.x1 + o.x2) / 2;
      const midY = (o.y1 + o.y2) / 2;
      // Opening must sit near the wall hit (plan proximity).
      const hx = cut.x1 + (cut.x2 - cut.x1) * t;
      const hy = cut.y1 + (cut.y2 - cut.y1) * t;
      if (Math.hypot(midX - hx, midY - hy) > 2.5) continue;
      const widthFt = Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
      const sillFt = o.kind === 'window' ? (o.sillFt ?? 2.5) : 0;
      const heightFt = o.heightFt ?? (o.kind === 'window' ? 4 : o.kind === 'garage' ? 7 : 6.67);
      const headFt = Math.min(story - 0.25, sillFt + heightFt);
      openings.push({ sillFt, headFt, widthFt });
    }
    hits.push({
      stationFt,
      thicknessFt,
      heightFt: story,
      exterior: !!w.exterior,
      openings,
    });
  }

  hits.sort((a, b) => a.stationFt - b.stationFt);

  return {
    cut,
    lengthFt: len,
    storyHeightFt: story,
    ridgeHeightFt: ridge,
    hits,
    gradeFt: 0,
  };
}

/** SVG of a building section (station × height in feet). */
export function renderCadSectionSvg(
  drawing: CadSectionDrawing,
  opts?: { title?: string; padFt?: number },
): string {
  const pad = opts?.padFt ?? 2;
  const w = drawing.lengthFt + pad * 2;
  const h = drawing.ridgeHeightFt + pad * 2 + 1;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" width="1400" height="${Math.round((1400 * h) / w)}" role="img">`,
    `<rect width="100%" height="100%" fill="#f7f4ee"/>`,
    `<g transform="translate(${pad} ${(h - pad).toFixed(2)}) scale(1,-1)">`,
    // Grade
    `<line x1="0" y1="0" x2="${drawing.lengthFt.toFixed(2)}" y2="0" stroke="#78716c" stroke-width="0.08"/>`,
  ];

  for (const hit of drawing.hits) {
    const x = hit.stationFt;
    const t = Math.max(0.15, hit.thicknessFt);
    const fill = hit.exterior ? '#d6d3d1' : '#e7e5e4';
    parts.push(
      `<rect x="${(x - t / 2).toFixed(3)}" y="0" width="${t.toFixed(3)}" height="${hit.heightFt.toFixed(3)}" fill="${fill}" stroke="#44403c" stroke-width="0.04"/>`,
    );
    for (const op of hit.openings) {
      const oh = Math.max(0.2, op.headFt - op.sillFt);
      parts.push(
        `<rect x="${(x - t / 2 - 0.02).toFixed(3)}" y="${op.sillFt.toFixed(3)}" width="${(t + 0.04).toFixed(3)}" height="${oh.toFixed(3)}" fill="#bae6fd" stroke="#0284c7" stroke-width="0.03"/>`,
      );
    }
  }

  // Simple roof outline (gable over full cut)
  const mid = drawing.lengthFt / 2;
  parts.push(
    `<polyline points="0,${drawing.storyHeightFt.toFixed(2)} ${mid.toFixed(2)},${drawing.ridgeHeightFt.toFixed(2)} ${drawing.lengthFt.toFixed(2)},${drawing.storyHeightFt.toFixed(2)}" fill="none" stroke="#0f766e" stroke-width="0.07"/>`,
  );
  parts.push('</g>');

  if (opts?.title) {
    parts.push(
      `<text x="16" y="24" fill="#0f172a" font-size="18" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-weight="600">${escapeXml(opts.title)}</text>`,
    );
  }
  parts.push(
    `<text x="16" y="44" fill="#57534e" font-size="12" font-family="IBM Plex Sans, Segoe UI, sans-serif">${escapeXml(drawing.cut.label)} · ${drawing.lengthFt.toFixed(1)}'</text>`,
  );
  parts.push('</svg>');
  return parts.join('');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function defaultSectionCut(plate: CadPlate): CadSectionCutFt {
  const { minX, minY, maxX, maxY } = plate.bounds;
  const cy = (minY + maxY) / 2;
  return {
    id: 'section-a',
    x1: minX - 2,
    y1: cy,
    x2: maxX + 2,
    y2: cy,
    depthFt: 1.5,
    label: 'SECTION A-A',
    layer: 'A-SECT',
  };
}
