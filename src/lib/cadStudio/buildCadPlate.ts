import {
  buildSheetsFromDxf,
  cropSegmentsToViewport,
  extractDxfModelGeometry,
  isOpeningLayer,
  isRoomWallLayer,
  openingKindFromLayer,
  pickFloorViewport,
} from '../housePlans/dxfDrawingImport';
import { flipPlanLabels, flipPlanY } from '../housePlans/dxfImport';
import { looksLikeRoomName } from '../housePlans/dxfParse';
import {
  readInsUnits,
  scaleSegmentsToFeet,
  wallCenterlinesFromSegments,
} from '../housePlans/dxfRooms';
import type { DrawingSheet } from '../housePlans/drawingPackage';
import { classifyLayerKind, classifySegmentRole } from './classifyLayers';
import type {
  CadBoundsFt,
  CadLabelFt,
  CadLayerInfo,
  CadOpeningHintFt,
  CadPlate,
  CadSegmentFt,
  CadWallCenterlineFt,
} from './types';

const MAX_SEGMENTS = 12_000;
const MAX_LABELS = 200;

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

function buildLayerIndex(segments: CadSegmentFt[], labels: CadLabelFt[] = []): CadLayerInfo[] {
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
      visible:
        kind === 'floor' &&
        (role === 'wall' || role === 'opening' || role === 'fixture' || role === 'soft'),
      segmentCount: 1,
    });
  }
  for (const label of labels) {
    const name = label.layer || 'TEXT ROOM';
    if (map.has(name)) continue;
    map.set(name, {
      name,
      kind: 'annotation',
      role: 'other',
      visible: true,
      segmentCount: 0,
    });
  }
  // Annotation linework (generic TEXT notes) stays off by default; room-name layer stays on.
  for (const layer of map.values()) {
    if (layer.kind === 'annotation' && layer.role === 'other' && !/ROOM/i.test(layer.name)) {
      layer.visible = false;
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function exteriorFromLayer(layer?: string): boolean {
  const u = (layer ?? '').toUpperCase();
  if (/INT|INTERIOR/.test(u) && !/EXT/.test(u)) return false;
  return /EXT|EXTERIOR|OUT/.test(u);
}

function segmentRole(layer: string, linetype?: string): CadSegmentFt['role'] {
  const lt = (linetype ?? '').toUpperCase();
  if (
    /DASH|HIDDEN|PHANTOM|DOT/.test(lt) &&
    /CEILING|VOLUME|SPACE.?BOUND|ROOM.?BOUND/.test(layer.toUpperCase())
  ) {
    return 'soft';
  }
  return classifySegmentRole(layer);
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
  let workingLabels = labels;
  if (floorVp) {
    const cropped = cropSegmentsToViewport(working, floorVp, 0.1);
    if (cropped.length >= 20) {
      working = cropped;
      workingLabels = cropSegmentsToViewport(
        workingLabels.map((l) => ({ ...l, x1: l.x, y1: l.y, x2: l.x, y2: l.y })),
        floorVp,
        0.08,
      ).map(({ x1, y1, text, layer }) => ({ x: x1, y: y1, text, layer }));
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
    const role = segmentRole(s.layer, s.linetype);
    const kind = classifyLayerKind(s.layer);
    return kind === 'floor' || role !== 'other';
  });
  const pool = preferred.length >= 8 ? preferred : working;
  const { scale, segments: scaled } = scaleSegmentsToFeet(pool.slice(0, MAX_SEGMENTS), insUnits);
  const flipped = flipPlanY(scaled);

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

  // Plate walls = paired centerlines only. Raw wall-layer faces often include
  // unpaired measurement / witness / tick lines that must not draw as walls.
  const nonWall = flipped.filter((s) => !isRoomWallLayer(s.layer ?? ''));
  const segments: CadSegmentFt[] = [
    ...wallCenterlines.map((s) => ({
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      layer: s.layer ?? 'WALLS',
      role: 'wall' as const,
    })),
    ...nonWall.map((s) => ({
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      layer: s.layer ?? '0',
      role: segmentRole(s.layer ?? '0', s.linetype),
      linetype: s.linetype,
    })),
  ];

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

  const plateLabels: CadLabelFt[] = flipPlanLabels(
    workingLabels
      .filter((l) => looksLikeRoomName(l.text) || /ROOM/i.test(String(l.layer ?? '')))
      .map((l) => ({
        x: l.x * scale,
        y: l.y * scale,
        text: l.text,
        layer: l.layer,
      }))
      .filter((l) => looksLikeRoomName(l.text))
      .slice(0, MAX_LABELS),
  );

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
  const fixtureCount = segments.filter((s) => s.role === 'fixture').length;
  const softCount = segments.filter((s) => s.role === 'soft').length;
  if (fixtureCount) {
    warnings.push(`Fixture linework: ${fixtureCount} segment(s) (counters, sinks, appliances).`);
  }
  if (softCount) {
    warnings.push(`Soft room borders: ${softCount} segment(s) (ceiling / space boundaries).`);
  }
  if (plateLabels.length) warnings.push(`Room labels: ${plateLabels.length}.`);

  return {
    id: `cad-plate-${Date.now().toString(36)}`,
    sourceFileName,
    importedAt: new Date().toISOString(),
    warnings,
    layers: buildLayerIndex(segments, plateLabels),
    segments,
    wallCenterlines,
    openingHints,
    labels: plateLabels,
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

export function visibleLabels(plate: CadPlate): CadLabelFt[] {
  const on = new Set(plate.layers.filter((l) => l.visible).map((l) => l.name));
  return (plate.labels ?? []).filter(
    (l) => !l.layer || on.has(l.layer) || !plate.layers.some((x) => x.name === l.layer),
  );
}
