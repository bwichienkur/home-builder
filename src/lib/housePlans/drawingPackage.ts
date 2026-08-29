import type { HousePlan } from './buildPlan';

/** One printable layout / sheet from a DWG set (floor, elevation, notes, …). */
export type DrawingSheet = {
  id: string;
  /** Display name, e.g. "SHT. 1 FLOOR" */
  name: string;
  /** 0 = cover / model extras; 1..n follow sheet order when known */
  order: number;
  kind: 'cover' | 'floor' | 'elevation' | 'foundation' | 'electrical' | 'details' | 'notes' | 'truss' | 'other';
  /** Public URL or blob URL for a pre-rendered SVG/PNG (fallback only) */
  imageUrl?: string;
  /** Inline SVG markup when generated at import time (prefer IDB for large sets) */
  svg?: string;
  /** PDF page index when a plan-set PDF was attached (0-based, for pdf.js / hash nav) */
  pdfPageIndex?: number;
};

export type DrawingPackage = {
  id: string;
  sourceFileName: string;
  importedAt: string;
  /** Warnings from conversion / room detection / sheet crop */
  warnings: string[];
  sheets: DrawingSheet[];
  /** Optional multi-page PDF plan set for high-fidelity sheet reading */
  pdfFileName?: string;
  /** Object URL or public path to the PDF (session or hosted) */
  pdfUrl?: string;
  /** How sheets were produced */
  sheetSource: 'dxf_viewport' | 'pdf' | 'static' | 'mixed';
};

export type DrawingImportResult = {
  package: DrawingPackage;
  plan: HousePlan;
  /** Wall-layer segment count used for room detection */
  lineCount: number;
};

export function sheetKindFromName(name: string): DrawingSheet['kind'] {
  const u = name.toUpperCase();
  if (u.includes('COVER')) return 'cover';
  if (u.includes('FLOOR') || /\b1\s*OF\b/.test(u)) return 'floor';
  if (u.includes('ELEV')) return 'elevation';
  if (u.includes('FOUND')) return 'foundation';
  if (u.includes('ELECT')) return 'electrical';
  if (u.includes('DETAIL')) return 'details';
  if (u.includes('NOTE')) return 'notes';
  if (u.includes('TRUSS')) return 'truss';
  return 'other';
}

/**
 * Stillwater 183 sheet labels aligned with Olsen MODEL.dwg / plan-set PDF.
 * Prefer the PDF (`plan-set.pdf`) — DXF viewport SVGs are lossy and jumble text.
 */
export const STILLWATER_SHEET_LABELS: {
  order: number;
  name: string;
  kind: DrawingSheet['kind'];
  pdfPageIndex: number;
  file?: string;
}[] = [
  { order: 0, name: 'COVER', kind: 'cover', pdfPageIndex: 0 },
  { order: 1, name: 'SHT. 1 FLOOR', kind: 'floor', pdfPageIndex: 1 },
  { order: 2, name: 'SHT. 2 FRONT ELEVATION', kind: 'elevation', pdfPageIndex: 2 },
  { order: 3, name: 'SHT. 3 SIDE ELEVATIONS', kind: 'elevation', pdfPageIndex: 3 },
  { order: 4, name: 'SHT. 4 FOUNDATION', kind: 'foundation', pdfPageIndex: 4 },
  { order: 5, name: 'SHT. 5 ELECTRICAL', kind: 'electrical', pdfPageIndex: 5 },
  { order: 6, name: 'SHT. 6 DETAILS', kind: 'details', pdfPageIndex: 6 },
  { order: 7, name: 'SHT. 7 NOTES', kind: 'notes', pdfPageIndex: 7 },
  { order: 8, name: 'SHT. 8 TRUSS CONNECTOR', kind: 'truss', pdfPageIndex: 8 },
];

export function stillwaterDrawingPackage(): DrawingPackage {
  const base = '/plan-sheets/stillwater-183';
  return {
    id: 'stillwater-183-drawings',
    sourceFileName: '183 STILLWATER plan set.pdf',
    importedAt: new Date().toISOString(),
    warnings: [],
    sheetSource: 'pdf',
    pdfFileName: '183 STILLWATER_dj112425.pdf',
    pdfUrl: `${base}/plan-set.pdf`,
    sheets: STILLWATER_SHEET_LABELS.map((s) => ({
      id: `stillwater-sheet-${s.order}`,
      name: s.name,
      order: s.order,
      kind: s.kind,
      pdfPageIndex: s.pdfPageIndex,
    })),
  };
}

/** Browser PDF viewer URL for a specific 1-based page (native viewer hash). */
export function pdfViewerSrc(pdfUrl: string, pageIndex0: number): string {
  const page = Math.max(1, pageIndex0 + 1);
  const base = pdfUrl.split('#')[0]!;
  return `${base}#page=${page}`;
}
