import type { DrawingSheet } from '../housePlans/drawingPackage';
import type { Opening, Wall } from '../../types';

/** Where a DXF layer belongs in a multi-sheet drawing set. */
export type CadLayerKind = 'floor' | 'elevation' | 'foundation' | 'annotation' | 'other';

/** How a segment is used for plate overlay / extrusion. */
export type CadSegmentRole = 'wall' | 'opening' | 'fixture' | 'soft' | 'elevation' | 'other';

export type CadLayerInfo = {
  name: string;
  kind: CadLayerKind;
  role: CadSegmentRole;
  visible: boolean;
  segmentCount: number;
};

export type CadSegmentFt = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: string;
  role: CadSegmentRole;
  linetype?: string;
};

export type CadOpeningHintFt = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'door' | 'window';
  layer?: string;
};

export type CadWallCenterlineFt = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer?: string;
  exterior?: boolean;
};

export type CadBoundsFt = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/**
 * CAD plate — source of truth for the CAD-first studio.
 * Rooms are not required; walls extrude from wall-layer centerlines.
 */
export type CadPlate = {
  id: string;
  sourceFileName: string;
  importedAt: string;
  warnings: string[];
  layers: CadLayerInfo[];
  /** Exact DXF linework in feet (plan Y flipped to match sheet/PDF orientation). */
  segments: CadSegmentFt[];
  wallCenterlines: CadWallCenterlineFt[];
  openingHints: CadOpeningHintFt[];
  sheets: DrawingSheet[];
  bounds: CadBoundsFt;
  sheetSource: 'dxf_viewport' | 'pdf' | 'static' | 'mixed' | 'synthetic';
  pdfUrl?: string;
};

export type CadExtrusion = {
  walls: Wall[];
  openings: Opening[];
  centerFt: { cx: number; cy: number };
  heightM: number;
};
