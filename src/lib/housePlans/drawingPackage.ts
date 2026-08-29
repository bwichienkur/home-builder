import type { HousePlan } from './buildPlan';

/** One printable layout / sheet from a DWG set (floor, elevation, notes, …). */
export type DrawingSheet = {
  id: string;
  /** Display name, e.g. "SHT. 1 FLOOR" */
  name: string;
  /** 0 = cover / model extras; 1..n follow sheet order when known */
  order: number;
  kind: 'cover' | 'floor' | 'elevation' | 'foundation' | 'electrical' | 'details' | 'notes' | 'truss' | 'other';
  /** Public URL or blob URL for a pre-rendered SVG/PNG */
  imageUrl?: string;
  /** Inline SVG markup when generated at import time (prefer IDB for large sets) */
  svg?: string;
  /** PDF page index when a plan-set PDF was attached (0-based) */
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

/** Stillwater 183 sheet labels aligned with Olsen MODEL.dwg paper tabs. */
export const STILLWATER_SHEET_LABELS: { order: number; name: string; kind: DrawingSheet['kind']; file: string }[] = [
  { order: 0, name: 'COVER', kind: 'cover', file: '00-cover.svg' },
  { order: 1, name: 'SHT. 1 FLOOR', kind: 'floor', file: '01-floor.svg' },
  { order: 2, name: 'SHT. 2 FRONT ELEVATION', kind: 'elevation', file: '02-front-elevation.svg' },
  { order: 3, name: 'SHT. 3 SIDE ELEVATIONS', kind: 'elevation', file: '03-side-elevations.svg' },
  { order: 4, name: 'SHT. 4 FOUNDATION', kind: 'foundation', file: '04-foundation.svg' },
  { order: 5, name: 'SHT. 5 ELECTRICAL', kind: 'electrical', file: '05-electrical.svg' },
  { order: 6, name: 'SHT. 6 DETAILS', kind: 'details', file: '06-details.svg' },
  { order: 7, name: 'SHT. 7 NOTES', kind: 'notes', file: '07-notes.svg' },
  { order: 8, name: 'SHT. 8 TRUSS CONNECTOR', kind: 'truss', file: '08-truss.svg' },
];

export function stillwaterDrawingPackage(): DrawingPackage {
  const base = '/plan-sheets/stillwater-183';
  return {
    id: 'stillwater-183-drawings',
    sourceFileName: 'MODEL.dwg',
    importedAt: new Date().toISOString(),
    warnings: [],
    sheetSource: 'static',
    sheets: STILLWATER_SHEET_LABELS.map((s) => ({
      id: `stillwater-sheet-${s.order}`,
      name: s.name,
      order: s.order,
      kind: s.kind,
      imageUrl: `${base}/${s.file}`,
    })),
  };
}
