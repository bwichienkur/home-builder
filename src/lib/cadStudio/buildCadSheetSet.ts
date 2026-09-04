import type { CadPlate, CadTitleBlock } from './types';
import { buildCadSectionDrawing, defaultSectionCut, renderCadSectionSvg } from './buildCadSection';
import { renderCadElevationSvg } from './renderCadElevationSvg';
import { renderCadPlateSvg } from './renderCadPlateSvg';

export const DEFAULT_TITLE_BLOCK: CadTitleBlock = {
  projectName: 'Olsen Custom Homes',
  sheetTitle: 'Drawing Set',
  drawnBy: 'CAD Studio',
  checkedBy: '—',
  scaleLabel: '1/4" = 1\'-0"',
  dateLabel: new Date().toISOString().slice(0, 10),
  revision: 'A',
  address: '',
};

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Wrap an inner SVG view in an architectural sheet with title block (ANSI D-ish landscape). */
export function wrapSheetWithTitleBlock(
  innerSvg: string,
  title: CadTitleBlock,
  sheetNumber: string,
  sheetName: string,
): string {
  // Extract viewBox content from inner SVG (drop outer svg tags).
  const bodyMatch = innerSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  const inner = bodyMatch?.[1] ?? innerSvg;
  const vbMatch = innerSvg.match(/viewBox="([^"]+)"/i);
  const vb = vbMatch?.[1] ?? '0 0 100 80';

  const W = 1100;
  const H = 850;
  const margin = 28;
  const titleH = 90;
  const drawW = W - margin * 2;
  const drawH = H - margin * 2 - titleH - 8;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(sheetName)}">
  <rect width="100%" height="100%" fill="#faf8f4"/>
  <rect x="${margin}" y="${margin}" width="${drawW}" height="${drawH}" fill="#fff" stroke="#1c1917" stroke-width="1.5"/>
  <svg x="${margin + 8}" y="${margin + 8}" width="${drawW - 16}" height="${drawH - 16}" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">
    ${inner}
  </svg>
  <g transform="translate(${margin} ${margin + drawH + 8})">
    <rect width="${drawW}" height="${titleH}" fill="#fff" stroke="#1c1917" stroke-width="1.5"/>
    <line x1="${drawW * 0.55}" y1="0" x2="${drawW * 0.55}" y2="${titleH}" stroke="#1c1917" stroke-width="1"/>
    <line x1="${drawW * 0.78}" y1="0" x2="${drawW * 0.78}" y2="${titleH}" stroke="#1c1917" stroke-width="1"/>
    <line x1="0" y1="28" x2="${drawW * 0.55}" y2="28" stroke="#1c1917" stroke-width="0.75"/>
    <line x1="0" y1="56" x2="${drawW * 0.55}" y2="56" stroke="#1c1917" stroke-width="0.75"/>
    <text x="10" y="18" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="11" fill="#57534e">PROJECT</text>
    <text x="10" y="48" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="16" font-weight="600" fill="#0f172a">${escapeXml(title.projectName)}</text>
    <text x="10" y="76" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="12" fill="#44403c">${escapeXml(title.address || sheetName)}</text>
    <text x="${drawW * 0.55 + 10}" y="18" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="11" fill="#57534e">SHEET</text>
    <text x="${drawW * 0.55 + 10}" y="42" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="14" font-weight="600" fill="#0f172a">${escapeXml(sheetName)}</text>
    <text x="${drawW * 0.55 + 10}" y="66" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="11" fill="#44403c">Scale ${escapeXml(title.scaleLabel)}</text>
    <text x="${drawW * 0.55 + 10}" y="82" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="11" fill="#44403c">Rev ${escapeXml(title.revision)} · ${escapeXml(title.dateLabel)}</text>
    <text x="${drawW * 0.78 + 10}" y="28" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="28" font-weight="700" fill="#0f172a">${escapeXml(sheetNumber)}</text>
    <text x="${drawW * 0.78 + 10}" y="58" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="11" fill="#57534e">Drawn ${escapeXml(title.drawnBy)}</text>
    <text x="${drawW * 0.78 + 10}" y="76" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="11" fill="#57534e">Checked ${escapeXml(title.checkedBy)}</text>
  </g>
</svg>`;
}

export type CadSheetSetPage = {
  id: string;
  number: string;
  name: string;
  kind: 'floor' | 'elevation' | 'section' | 'schedule';
  svg: string;
};

/** Build a printable multi-sheet set (floor, elevations, section) with title blocks. */
export function buildCadSheetSet(plate: CadPlate): CadSheetSetPage[] {
  const title: CadTitleBlock = { ...DEFAULT_TITLE_BLOCK, ...(plate.titleBlock ?? {}) };
  const pages: CadSheetSetPage[] = [];

  const floorSvg = renderCadPlateSvg(plate, { title: 'Floor plan' });
  pages.push({
    id: 'A-101',
    number: 'A-101',
    name: 'FLOOR PLAN',
    kind: 'floor',
    svg: wrapSheetWithTitleBlock(floorSvg, title, 'A-101', 'FLOOR PLAN'),
  });

  if (plate.elevationFront) {
    const elev = renderCadElevationSvg(plate.elevationFront, { title: plate.elevationFront.name });
    pages.push({
      id: 'A-201',
      number: 'A-201',
      name: 'FRONT ELEVATION',
      kind: 'elevation',
      svg: wrapSheetWithTitleBlock(elev, title, 'A-201', 'FRONT ELEVATION'),
    });
  }
  if (plate.elevationSide) {
    const elev = renderCadElevationSvg(plate.elevationSide, { title: plate.elevationSide.name });
    pages.push({
      id: 'A-202',
      number: 'A-202',
      name: 'SIDE ELEVATION',
      kind: 'elevation',
      svg: wrapSheetWithTitleBlock(elev, title, 'A-202', 'SIDE ELEVATION'),
    });
  }

  const cut = plate.sectionCuts?.[0] ?? defaultSectionCut(plate);
  const section = buildCadSectionDrawing(plate, cut);
  const sectionSvg = renderCadSectionSvg(section, { title: cut.label });
  pages.push({
    id: 'A-301',
    number: 'A-301',
    name: cut.label,
    kind: 'section',
    svg: wrapSheetWithTitleBlock(sectionSvg, title, 'A-301', cut.label),
  });

  return pages;
}

/** Single HTML document with all sheets for print / Save as PDF. */
export function exportCadSheetSetHtml(plate: CadPlate): string {
  const pages = buildCadSheetSet(plate);
  const title = plate.titleBlock?.projectName ?? plate.sourceFileName;
  const bodies = pages
    .map(
      (p) =>
        `<section class="sheet" aria-label="${escapeXml(p.name)}">${p.svg.replace(/^<\?xml[^>]*>\s*/i, '')}</section>`,
    )
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeXml(title)} — Sheet Set</title>
<style>
  @page { size: landscape; margin: 0.35in; }
  body { margin: 0; background: #e7e5e4; font-family: "IBM Plex Sans", Segoe UI, sans-serif; }
  .sheet { page-break-after: always; background: #fff; margin: 12px auto; max-width: 1100px; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
  .sheet:last-child { page-break-after: auto; }
  .sheet svg { display: block; width: 100%; height: auto; }
</style>
</head>
<body>
${bodies}
</body>
</html>`;
}

export function setPlateTitleBlock(plate: CadPlate, patch: Partial<CadTitleBlock>): CadPlate {
  return {
    ...plate,
    titleBlock: { ...DEFAULT_TITLE_BLOCK, ...(plate.titleBlock ?? {}), ...patch },
  };
}
