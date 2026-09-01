import { stillwaterDrawingPackage, pdfViewerSrc } from '../../lib/housePlans/drawingPackage';
import type { CadPlate } from '../../lib/cadStudio';

const SHEET_IMAGES: Record<number, string> = {
  0: '/plan-sheets/stillwater-183/00-cover.svg',
  1: '/plan-sheets/stillwater-183/01-floor.svg',
  2: '/plan-sheets/stillwater-183/02-front-elevation.svg',
  3: '/plan-sheets/stillwater-183/03-side-elevations.svg',
  4: '/plan-sheets/stillwater-183/04-foundation.svg',
  5: '/plan-sheets/stillwater-183/05-electrical.svg',
  6: '/plan-sheets/stillwater-183/06-details.svg',
  7: '/plan-sheets/stillwater-183/07-notes.svg',
  8: '/plan-sheets/stillwater-183/08-truss.svg',
};

/** Stillwater sheet package for CAD Studio — PDF/SVG reference without loading MODEL.dxf. */
export function stillwaterCadSheetPlate(): CadPlate {
  const pkg = stillwaterDrawingPackage();
  return {
    id: 'cad-stillwater-sheets',
    sourceFileName: pkg.sourceFileName,
    importedAt: pkg.importedAt,
    warnings: [
      'Stillwater sheet package loaded for floor/elevation reference.',
      'Import MODEL.dxf or MODEL.dwg to build the CAD plate and extrude walls.',
    ],
    layers: [],
    segments: [],
    wallCenterlines: [],
    openingHints: [],
    labels: [],
    fixtureHints: [],
    sheets: pkg.sheets.map((s) => ({
      ...s,
      imageUrl: SHEET_IMAGES[s.order] ?? s.imageUrl,
    })),
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    sheetSource: 'pdf',
    pdfUrl: pkg.pdfUrl,
  };
}

export { pdfViewerSrc };
