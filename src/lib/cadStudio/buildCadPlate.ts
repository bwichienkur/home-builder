import {
  buildSheetsFromDxf,
  cropSegmentsToViewport,
  extractDxfModelGeometry,
  isOpeningLayer,
  isRoomWallLayer,
  openingKindFromLayer,
  pickFloorViewport,
} from '../housePlans/dxfDrawingImport';
import { flipPlanY } from '../housePlans/dxfImport';
import {
  readInsUnits,
  scaleSegmentsToFeet,
  wallCenterlinesFromSegments,
} from '../housePlans/dxfRooms';
import type { DrawingSheet } from '../housePlans/drawingPackage';
import { classifyLayerKind, classifySegmentRole } from './classifyLayers';
import type {
  CadBoundsFt,
  CadLayerInfo,
  CadOpeningHintFt,
  CadPlate,
  CadSegmentFt,
  CadWallCenterlineFt,
} from './types';

const MAX_SEGMENTS = 12_000;

function boundsOf(segs: { x1: number; y1: number; x2: number; y2: number }[]): CadBoundsFt {
  if (!segs.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of segs) {
    minX = Math.min(minX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxX = Math.max(maxX, s.x1, s.x2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

function buildLayerIndex(segments: CadSegmentFt[]): CadLayerInfo[] {
  const map = new Map<string, CadLayerInfo>();
  for (const s of segments) {
    const existing = map.get(s.layer);
    if (existing) {
      existing.segmentCount += 1;
      continue;
    }
    const kind = classifyLayerKind(s.layer);
    const role = classifySegmentRole(s.layer);
    map.set(s.layer, {
      name: s.layer,
      kind,
      role,
      visible: kind === 'floor' && (role === 'wall' || role === 'opening' || role === 'fixture' || role === 'soft'),
      segmentCount: 1,
    });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function exteriorFromLayer(layer?: string): boolean {
  const u = (layer ?? '').toUpperCase();
  if (/INT|INTERIOR/.test(u) && !/EXT/.test(u)) return false;
  return /EXT|EXTERIOR|OUT/.test(u);
}

/**
 * Build a CAD plate from DXF text.
 * Floor plate linework is cropped to the floor viewport when available.
 */
export function buildCadPlateFromDxf(
  dxfText: string,
  sourceFileName: string,
  opts?: { sheets?: DrawingSheet[]; pdfUrl?: string; sheetSource?: CadPlate['sheetSource'] },
): CadPlate {
  const warnings: string[] = [];
  const { segs, labels } = extractDxfModelGeometry(dxfText);
  const floorVp = pickFloorViewport(dxfText);
  const insUnits = readInsUnits(dxfText);

  let working = segs;
  if (floorVp) {
    const cropped = cropSegmentsToViewport(working, floorVp, 0.1);
    if (cropped.length >= 20) {
      working = cropped;
      warnings.push(
        `Cropped model space to floor viewport (${floorVp.modelW.toFixed(0)}×${floorVp.modelH.toFixed(0)}).`,
      );
    } else {
      warnings.push('Floor viewport crop too sparse — using full model-space linework.');
    }
  } else {
    warnings.push('No floor viewport found — using full model-space linework.');
  }

  const preferred = working.filter((s) => {
    const role = classifySegmentRole(s.layer);
    const kind = classifyLayerKind(s.layer);
    return kind === 'floor' || role !== 'other';
  });
  const pool = preferred.length >= 8 ? preferred : working;
  const scaled = scaleSegmentsToFeet(pool.slice(0, MAX_SEGMENTS), insUnits).segments;
  const flipped = flipPlanY(scaled);

  const segments: CadSegmentFt[] = flipped.map((s) => ({
    x1: s.x1,
    y1: s.y1,
    x2: s.x2,
    y2: s.y2,
    layer: s.layer ?? '0',
    role: classifySegmentRole(s.layer ?? '0'),
    linetype: s.linetype,
  }));

  const wallRaw = flipped.filter((s) => isRoomWallLayer(s.layer ?? ''));
  const centers = wallCenterlinesFromSegments(wallRaw);
  const wallCenterlines: CadWallCenterlineFt[] = centers.map((s) => ({
    x1: s.x1,
    y1: s.y1,
    x2: s.x2,
    y2: s.y2,
    layer: s.layer,
    exterior: s.exterior ?? exteriorFromLayer(s.layer),
  }));

  const openingHints: CadOpeningHintFt[] = flipped
    .filter((s) => isOpeningLayer(s.layer ?? ''))
    .map((s) => ({
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      kind: openingKindFromLayer(s.layer ?? ''),
      layer: s.layer,
    }));

  let sheets = opts?.sheets ?? [];
  let sheetSource: CadPlate['sheetSource'] = opts?.sheetSource ?? 'static';
  if (!sheets.length) {
    const built = buildSheetsFromDxf(dxfText, segs, labels);
    sheets = built.sheets;
    warnings.push(...built.warnings);
    sheetSource = sheets.length ? 'dxf_viewport' : 'static';
  }

  if (wallCenterlines.length < 4) {
    warnings.push('Few wall centerlines detected — check wall layer names in the DXF.');
  }

  return {
    id: `cad-plate-${Date.now().toString(36)}`,
    sourceFileName,
    importedAt: new Date().toISOString(),
    warnings,
    layers: buildLayerIndex(segments),
    segments,
    wallCenterlines,
    openingHints,
    sheets,
    bounds: boundsOf(segments.length ? segments : wallCenterlines),
    sheetSource,
    pdfUrl: opts?.pdfUrl,
  };
}

/** Apply layer visibility toggles without rebuilding geometry. */
export function withLayerVisibility(plate: CadPlate, visibility: Record<string, boolean>): CadPlate {
  return {
    ...plate,
    layers: plate.layers.map((l) => ({
      ...l,
      visible: visibility[l.name] ?? l.visible,
    })),
  };
}

export function visibleSegments(plate: CadPlate): CadSegmentFt[] {
  const on = new Set(plate.layers.filter((l) => l.visible).map((l) => l.name));
  return plate.segments.filter((s) => on.has(s.layer));
}
