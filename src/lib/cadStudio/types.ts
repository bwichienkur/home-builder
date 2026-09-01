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

export type CadLabelFt = {
  x: number;
  y: number;
  text: string;
  layer?: string;
};

/** Raw fixture pose from DXF INSERT / CIRCLE (plan feet after plate build). */
export type CadFixtureKind = 'counter' | 'island' | 'sink' | 'toilet' | 'tub' | 'appliance' | 'other';

export type CadFixtureHintFt = {
  xFt: number;
  yFt: number;
  widthFt?: number;
  depthFt?: number;
  radiusFt?: number;
  rotationDeg?: number;
  layer: string;
  blockName?: string;
  kind?: CadFixtureKind;
};

/** Procedural 3D fixture instance for Extrude view (plan feet). */
export type CadFixtureInstance = {
  id: string;
  kind: CadFixtureKind;
  xFt: number;
  yFt: number;
  widthFt: number;
  depthFt: number;
  heightM: number;
  rotationRad: number;
  layer?: string;
  blockName?: string;
};

export type CadBoundsFt = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/** Elevation sheet segment — X = width from left, Y = height above grade (feet). */
export type CadElevationSegmentFt = {
  x1Ft: number;
  y1Ft: number;
  x2Ft: number;
  y2Ft: number;
  layer: string;
  role: CadSegmentRole;
  linetype?: string;
};

export type CadElevationFace = 'front' | 'side' | 'rear';

export type CadElevationSheet = {
  face: CadElevationFace;
  name: string;
  segments: CadElevationSegmentFt[];
  bounds: CadBoundsFt;
  labels: CadLabelFt[];
  gradeFt: number;
};

export type CadPlanFace = 'south' | 'north' | 'east' | 'west';

export type CadRoofProfilePoint = { xFt: number; yFt: number };

export type CadRoofMassing = {
  style: 'procedural' | 'dxf';
  ridgeHeightM: number;
  /** True when the ridge runs parallel to plan X (side-elevation / eave faces front). */
  ridgeAlongX: boolean;
  /** Ridge envelope from ROOF linework on the front elevation (DXF mode). */
  profile?: CadRoofProfilePoint[];
  overhangM: number;
  facadeWidthFt: number;
  facadeDepthFt: number;
};

export type CadMassing = {
  frontFace: CadPlanFace;
  storyHeightM: number;
  roof: CadRoofMassing;
  frontElevation?: CadElevationSheet;
  sideElevation?: CadElevationSheet;
  facadeWidthFt: number;
  facadeDepthFt: number;
  /** Elevation sheet height (grade to ridge) in feet. */
  facadeHeightFt: number;
  /** Plan bounds (feet) for aligning facade plane to walls. */
  planBounds: CadBoundsFt;
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
  /** Room names and similar plan labels (feet, same frame as segments). */
  labels: CadLabelFt[];
  /** INSERT/CIRCLE poses for procedural Extrude meshes. */
  fixtureHints: CadFixtureHintFt[];
  /** Front elevation linework (width × height ft) when DXF has elevation viewports. */
  elevationFront?: CadElevationSheet;
  /** Side/rear elevation linework when available. */
  elevationSide?: CadElevationSheet;
  sheets: DrawingSheet[];
  bounds: CadBoundsFt;
  sheetSource: 'dxf_viewport' | 'pdf' | 'static' | 'mixed' | 'synthetic';
  pdfUrl?: string;
};

export type CadExtrusion = {
  walls: Wall[];
  openings: Opening[];
  fixtures: CadFixtureInstance[];
  centerFt: { cx: number; cy: number };
  heightM: number;
  massing: CadMassing;
  /** Plan-feet centerlines used for corner miter trims in 3D. */
  wallSegmentsFt: Array<{ x1: number; y1: number; x2: number; y2: number; exterior?: boolean }>;
};
