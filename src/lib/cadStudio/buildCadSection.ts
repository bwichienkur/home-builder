import type {
  CadPlate,
  CadSectionCutFt,
  CadSectionDrawing,
  CadSectionHit,
  CadSectionLevelMarker,
  CadSectionSlabBand,
} from './types';
import { defaultWallThicknessFt } from './cadDrawSnap';

const DEFAULT_STORY_FT = 9;
const FOOTING_DEPTH_FT = 2.5;
const FOOTING_THICK_FT = 0.67;
const SLAB_THICK_FT = 0.33;
const SLAB_TOP_FT = 0.67;

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

function storyHeightFt(plate: CadPlate): number {
  const stories = plate.stories ?? [];
  if (stories.length >= 2) {
    const sorted = [...stories].sort((a, b) => a.levelFt - b.levelFt);
    const activeId = plate.activeStoryId ?? sorted[0]?.id;
    const i = sorted.findIndex((s) => s.id === activeId);
    if (i >= 0 && sorted[i + 1]) return Math.max(8, sorted[i + 1]!.levelFt - sorted[i]!.levelFt);
  }
  return DEFAULT_STORY_FT;
}

function ridgeHeightFt(plate: CadPlate, story: number): number {
  const pitch = plate.roof?.pitchRise12 ?? 6;
  const kind = plate.roof?.kind ?? 'gable';
  if (kind === 'flat') return story + 0.5;
  const span = Math.max(
    1,
    plate.bounds.maxX - plate.bounds.minX,
    plate.bounds.maxY - plate.bounds.minY,
  );
  const rise = (pitch / 12) * (span / 2);
  return story + Math.max(1.5, rise);
}

/**
 * Build a building section drawing by intersecting the cut with wall centerlines.
 * Includes floor slab, footings, level markers, and opening voids.
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
      const hx = cut.x1 + (cut.x2 - cut.x1) * t;
      const hy = cut.y1 + (cut.y2 - cut.y1) * t;
      if (Math.hypot(midX - hx, midY - hy) > 2.5) continue;
      const widthFt = o.widthFt ?? Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
      const sillFt = o.kind === 'window' ? (o.sillFt ?? 2.5) : 0;
      const heightFt =
        o.heightFt ?? (o.kind === 'window' ? 4 : o.kind === 'garage' ? 7 : 6.67);
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

  const levels: CadSectionLevelMarker[] = [
    { label: 'GRADE', elevationFt: 0 },
    { label: 'F.F.', elevationFt: SLAB_TOP_FT },
    { label: 'CEILING', elevationFt: story },
    { label: 'RIDGE', elevationFt: ridge },
  ];

  const slabs: CadSectionSlabBand[] = [
    {
      stationStartFt: 0,
      stationEndFt: len,
      topFt: SLAB_TOP_FT,
      thicknessFt: SLAB_THICK_FT,
      kind: 'floor',
    },
    {
      stationStartFt: 0,
      stationEndFt: len,
      topFt: 0,
      thicknessFt: FOOTING_DEPTH_FT,
      kind: 'foundation',
    },
  ];

  for (const hit of hits) {
    if (!hit.exterior) continue;
    const half = Math.max(1.2, hit.thicknessFt * 2.5);
    slabs.push({
      stationStartFt: Math.max(0, hit.stationFt - half),
      stationEndFt: Math.min(len, hit.stationFt + half),
      topFt: -FOOTING_DEPTH_FT + FOOTING_THICK_FT,
      thicknessFt: FOOTING_THICK_FT,
      kind: 'footing',
    });
  }

  return {
    cut,
    lengthFt: len,
    storyHeightFt: story,
    ridgeHeightFt: ridge,
    hits,
    gradeFt: 0,
    levels,
    slabs,
  };
}

/** SVG of a building section (station × height in feet) with poché + level markers. */
export function renderCadSectionSvg(
  drawing: CadSectionDrawing,
  opts?: { title?: string; padFt?: number },
): string {
  const pad = opts?.padFt ?? 3.5;
  const below = 3.2;
  const w = drawing.lengthFt + pad * 2 + 3.5;
  const h = drawing.ridgeHeightFt + pad * 2 + below;
  const y0 = h - pad - below;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" width="1400" height="${Math.round((1400 * h) / w)}" role="img">`,
    `<defs>
      <pattern id="cad-sec-poché" width="0.35" height="0.35" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="0.35" height="0.35" fill="#e7e5e4"/>
        <path d="M 0 0 L 0 0.35" stroke="#78716c" stroke-width="0.05"/>
      </pattern>
      <pattern id="cad-sec-conc" width="0.4" height="0.4" patternUnits="userSpaceOnUse">
        <rect width="0.4" height="0.4" fill="#d6d3d1"/>
        <circle cx="0.1" cy="0.15" r="0.03" fill="#a8a29e"/>
        <circle cx="0.28" cy="0.3" r="0.025" fill="#a8a29e"/>
      </pattern>
    </defs>`,
    `<rect width="100%" height="100%" fill="#f7f4ee"/>`,
  ];

  const toSvgY = (elevFt: number) => y0 - elevFt;

  for (const band of drawing.slabs ?? []) {
    const x = pad + band.stationStartFt;
    const bw = Math.max(0.05, band.stationEndFt - band.stationStartFt);
    const top = toSvgY(band.topFt);
    const bot = toSvgY(band.topFt - band.thicknessFt);
    const fill =
      band.kind === 'footing' || band.kind === 'floor'
        ? 'url(#cad-sec-conc)'
        : '#a8a29e';
    parts.push(
      `<rect x="${x.toFixed(3)}" y="${Math.min(top, bot).toFixed(3)}" width="${bw.toFixed(3)}" height="${Math.abs(bot - top).toFixed(3)}" fill="${fill}" stroke="#57534e" stroke-width="0.04"/>`,
    );
  }

  parts.push(
    `<line x1="${pad.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${(pad + drawing.lengthFt).toFixed(2)}" y2="${y0.toFixed(2)}" stroke="#78716c" stroke-width="0.09"/>`,
  );

  for (const hit of drawing.hits) {
    const x = pad + hit.stationFt;
    const t = Math.max(0.15, hit.thicknessFt);
    const top = toSvgY(hit.heightFt);
    const bot = toSvgY(SLAB_TOP_FT);
    const fill = hit.exterior ? 'url(#cad-sec-poché)' : '#f5f5f4';
    parts.push(
      `<rect x="${(x - t / 2).toFixed(3)}" y="${Math.min(top, bot).toFixed(3)}" width="${t.toFixed(3)}" height="${Math.abs(bot - top).toFixed(3)}" fill="${fill}" stroke="#44403c" stroke-width="0.05"/>`,
    );
    for (const op of hit.openings) {
      const oh = Math.max(0.2, op.headFt - op.sillFt);
      const oy = toSvgY(op.headFt);
      parts.push(
        `<rect x="${(x - t / 2 - 0.02).toFixed(3)}" y="${oy.toFixed(3)}" width="${(t + 0.04).toFixed(3)}" height="${oh.toFixed(3)}" fill="#bae6fd" stroke="#0284c7" stroke-width="0.03"/>`,
      );
    }
  }

  const mid = pad + drawing.lengthFt / 2;
  const roofY = toSvgY(drawing.ridgeHeightFt);
  const eaveY = toSvgY(drawing.storyHeightFt);
  parts.push(
    `<polyline points="${pad.toFixed(2)},${eaveY.toFixed(2)} ${mid.toFixed(2)},${roofY.toFixed(2)} ${(pad + drawing.lengthFt).toFixed(2)},${eaveY.toFixed(2)}" fill="none" stroke="#0f766e" stroke-width="0.08"/>`,
  );

  const lx = pad + drawing.lengthFt + 0.45;
  for (const lvl of drawing.levels ?? []) {
    const y = toSvgY(lvl.elevationFt);
    parts.push(
      `<line x1="${(pad - 0.4).toFixed(2)}" y1="${y.toFixed(2)}" x2="${(pad + drawing.lengthFt + 0.2).toFixed(2)}" y2="${y.toFixed(2)}" stroke="#a8a29e" stroke-width="0.03" stroke-dasharray="0.25 0.18"/>`,
    );
    parts.push(
      `<polygon points="${lx.toFixed(2)},${y.toFixed(2)} ${(lx + 0.35).toFixed(2)},${(y - 0.18).toFixed(2)} ${(lx + 0.35).toFixed(2)},${(y + 0.18).toFixed(2)}" fill="#0f172a"/>`,
    );
    parts.push(
      `<text x="${(lx + 0.45).toFixed(2)}" y="${(y + 0.12).toFixed(2)}" fill="#0f172a" font-size="0.45" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-weight="600">${escapeXml(lvl.label)}</text>`,
    );
    parts.push(
      `<text x="${(lx + 0.45).toFixed(2)}" y="${(y + 0.55).toFixed(2)}" fill="#57534e" font-size="0.35" font-family="IBM Plex Sans, Segoe UI, sans-serif">${lvl.elevationFt.toFixed(2)}'</text>`,
    );
  }

  if (opts?.title) {
    parts.push(
      `<text x="16" y="24" fill="#0f172a" font-size="18" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-weight="600">${escapeXml(opts.title)}</text>`,
    );
  }
  parts.push(
    `<text x="16" y="44" fill="#57534e" font-size="12" font-family="IBM Plex Sans, Segoe UI, sans-serif">${escapeXml(drawing.cut.label)} · ${drawing.lengthFt.toFixed(1)}' · section</text>`,
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
