import {
  buildSheetsFromDxf,
  cropSegmentsToViewport,
  extractDxfModelGeometry,
  openingKindFromLayer,
  pickElevationViewports,
  pickFloorViewport,
} from '../housePlans/dxfDrawingImport';
import { flipPlanLabels, flipPlanY } from '../housePlans/dxfImport';
import { looksLikeRoomName } from '../housePlans/dxfParse';
import {
  prepareCadWallCenterlines,
  readInsUnits,
  scaleSegmentsToFeet,
} from '../housePlans/dxfRooms';
import type { DrawingSheet } from '../housePlans/drawingPackage';
import { buildCadElevationSheets } from './buildCadElevation';
import {
  classifyLayerKind,
  classifySegmentRole,
  classifyToRole,
  defaultLayerVisible,
  type CadLayerClassify,
} from './classifyLayers';
import type {
  CadBoundsFt,
  CadElevationSheet,
  CadFixtureHintFt,
  CadLabelFt,
  CadLayerInfo,
  CadOpeningHintFt,
  CadPlate,
  CadSegmentFt,
  CadSegmentRole,
  CadWallCenterlineFt,
} from './types';

/** Cap imported linework for browser memory; prefer layer visibility over dropping layers. */
const MAX_SEGMENTS = 40_000;
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

function exteriorFromLayer(layer?: string): boolean {
  const u = (layer ?? '').toUpperCase();
  if (/INT|INTERIOR/.test(u) && !/EXT/.test(u)) return false;
  return /EXT|EXTERIOR|OUT/.test(u);
}

function segmentRole(layer: string, linetype?: string): CadSegmentRole {
  const lt = (linetype ?? '').toUpperCase();
  if (
    /DASH|HIDDEN|PHANTOM|DOT/.test(lt) &&
    /CEILING|VOLUME|SPACE.?BOUND|ROOM.?BOUND/.test(layer.toUpperCase())
  ) {
    return 'soft';
  }
  return classifySegmentRole(layer);
}

function buildLayerIndex(
  segments: CadSegmentFt[],
  labels: CadLabelFt[] = [],
  elevationSheets: CadElevationSheet[] = [],
  prior?: CadLayerInfo[],
): CadLayerInfo[] {
  const priorMap = new Map((prior ?? []).map((l) => [l.name, l]));
  const map = new Map<string, CadLayerInfo>();

  for (const s of segments) {
    const existing = map.get(s.layer);
    if (existing) {
      existing.segmentCount += 1;
      continue;
    }
    const prev = priorMap.get(s.layer);
    const kind = prev?.kind ?? classifyLayerKind(s.layer);
    const role = prev?.role ?? s.role ?? classifySegmentRole(s.layer);
    map.set(s.layer, {
      name: s.layer,
      kind,
      role,
      visible: prev?.visible ?? defaultLayerVisible(s.layer, kind, role),
      segmentCount: 1,
    });
  }

  for (const sheet of elevationSheets) {
    for (const s of sheet.segments) {
      const existing = map.get(s.layer);
      if (existing) {
        existing.segmentCount += 1;
        continue;
      }
      const prev = priorMap.get(s.layer);
      map.set(s.layer, {
        name: s.layer,
        kind: 'elevation',
        role: s.role,
        visible: prev?.visible ?? false,
        segmentCount: 1,
      });
    }
  }

  for (const label of labels) {
    const name = label.layer || 'TEXT ROOM';
    if (map.has(name)) continue;
    const prev = priorMap.get(name);
    const kind = prev?.kind ?? 'annotation';
    const role = prev?.role ?? 'other';
    map.set(name, {
      name,
      kind,
      role,
      visible: prev?.visible ?? defaultLayerVisible(name, kind, role),
      segmentCount: 0,
    });
  }

  // Preserve prior layers that lost all geometry (user may re-show after remove undo).
  for (const prev of prior ?? []) {
    if (!map.has(prev.name)) {
      map.set(prev.name, { ...prev, segmentCount: 0 });
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Rebuild wall centerlines + openings from visible classified layers.
 * Call after hide / show / classify / remove so plate + 3D stay in sync.
 */
export function rebuildPlateFromLayerSettings(plate: CadPlate): CadPlate {
  const roleByLayer = new Map(plate.layers.map((l) => [l.name, l.role]));
  const visible = new Set(plate.layers.filter((l) => l.visible).map((l) => l.name));

  const segments: CadSegmentFt[] = plate.segments.map((s) => ({
    ...s,
    role: roleByLayer.get(s.layer) ?? s.role,
  }));

  const wallRaw = segments.filter((s) => s.role === 'wall' && visible.has(s.layer));
  const centers = prepareCadWallCenterlines(
    wallRaw.map((s) => ({
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      layer: s.layer,
    })),
  );
  const wallCenterlines: CadWallCenterlineFt[] = centers.map((s) => ({
    x1: s.x1,
    y1: s.y1,
    x2: s.x2,
    y2: s.y2,
    layer: s.layer,
    exterior: s.exterior ?? exteriorFromLayer(s.layer),
  }));

  const openingHints: CadOpeningHintFt[] = segments
    .filter((s) => s.role === 'opening' && visible.has(s.layer))
    .map((s) => ({
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      kind: openingKindFromLayer(s.layer),
      layer: s.layer,
    }));

  const fixtureHints = (plate.fixtureHints ?? []).filter(
    (f) => !f.layer || visible.has(f.layer) || !plate.layers.some((l) => l.name === f.layer),
  );

  const layers = buildLayerIndex(
    segments,
    plate.labels,
    [plate.elevationFront, plate.elevationSide].filter(Boolean) as CadElevationSheet[],
    plate.layers,
  );

  return {
    ...plate,
    segments,
    wallCenterlines,
    openingHints,
    fixtureHints,
    layers,
    bounds: boundsOf(segments.length ? segments.filter((s) => visible.has(s.layer)) : wallCenterlines),
  };
}

/**
 * Build a CAD plate from DXF text.
 * Imports all model-space layers; smart defaults hide dims / roof / text / MEP.
 */
export function buildCadPlateFromDxf(
  dxfText: string,
  sourceFileName: string,
  opts?: { sheets?: DrawingSheet[]; pdfUrl?: string; sheetSource?: CadPlate['sheetSource'] },
): CadPlate {
  const warnings: string[] = [];
  const { segs, labels, fixtureHints: rawHints } = extractDxfModelGeometry(dxfText);
  const floorVp = pickFloorViewport(dxfText);
  const insUnits = readInsUnits(dxfText);

  let working = segs;
  let workingLabels = labels;
  let workingHints = rawHints;
  if (floorVp) {
    const cropped = cropSegmentsToViewport(working, floorVp, 0.1);
    if (cropped.length >= 20) {
      working = cropped;
      workingLabels = cropSegmentsToViewport(
        workingLabels.map((l) => ({ ...l, x1: l.x, y1: l.y, x2: l.x, y2: l.y })),
        floorVp,
        0.08,
      ).map(({ x1, y1, text, layer }) => ({ x: x1, y: y1, text, layer }));
      workingHints = cropSegmentsToViewport(
        workingHints.map((h) => ({ ...h, x1: h.x, y1: h.y, x2: h.x, y2: h.y })),
        floorVp,
        0.12,
      ).map(({ x1, y1, ...rest }) => ({
        ...rest,
        x: x1,
        y: y1,
      }));
      warnings.push(
        `Cropped model space to floor viewport (${floorVp.modelW.toFixed(0)}×${floorVp.modelH.toFixed(0)}).`,
      );
    } else {
      warnings.push('Floor viewport crop too sparse — using full model-space linework.');
    }
  } else {
    warnings.push('No floor viewport found — using full model-space linework.');
  }

  // Import every layer (no preferred-pool drop). Cap count for memory.
  if (working.length > MAX_SEGMENTS) {
    warnings.push(
      `Imported first ${MAX_SEGMENTS.toLocaleString()} of ${working.length.toLocaleString()} segments — hide unused layers, then re-import a floor-only DXF if needed.`,
    );
  }
  const { scale, segments: scaled } = scaleSegmentsToFeet(working.slice(0, MAX_SEGMENTS), insUnits);
  const flipped = flipPlanY(scaled);

  const segments: CadSegmentFt[] = flipped.map((s) => ({
    x1: s.x1,
    y1: s.y1,
    x2: s.x2,
    y2: s.y2,
    layer: s.layer ?? '0',
    role: segmentRole(s.layer ?? '0', s.linetype),
    linetype: s.linetype,
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

  const plateFixtureHints: CadFixtureHintFt[] = flipPlanLabels(
    workingHints.map((h) => ({
      x: h.x * scale,
      y: h.y * scale,
      widthFt: h.width != null ? h.width * scale : undefined,
      depthFt: h.depth != null ? h.depth * scale : undefined,
      radiusFt: h.radius != null ? h.radius * scale : undefined,
      rotationDeg: h.rotationDeg,
      layer: h.layer,
      blockName: h.blockName,
      kind: h.kind,
    })),
  ).map(({ x, y, widthFt, depthFt, radiusFt, rotationDeg, layer, blockName, kind }) => ({
    xFt: x,
    yFt: y,
    widthFt,
    depthFt,
    radiusFt,
    rotationDeg,
    layer,
    blockName,
    kind,
  }));

  let sheets = opts?.sheets ?? [];
  let sheetSource: CadPlate['sheetSource'] = opts?.sheetSource ?? 'static';
  if (!sheets.length) {
    const built = buildSheetsFromDxf(dxfText, segs, labels);
    sheets = built.sheets;
    warnings.push(...built.warnings);
    sheetSource = sheets.length ? 'dxf_viewport' : 'static';
  }

  const elevVps = pickElevationViewports(dxfText);
  const { front: elevationFront, side: elevationSide, warnings: elevWarnings } = buildCadElevationSheets(
    dxfText,
    segs,
    labels,
    elevVps,
  );
  warnings.push(...elevWarnings);

  const layers = buildLayerIndex(
    segments,
    plateLabels,
    [elevationFront, elevationSide].filter(Boolean) as CadElevationSheet[],
  );

  const layerCount = layers.length;
  const onCount = layers.filter((l) => l.visible).length;
  warnings.push(`Layers: ${layerCount} imported · ${onCount} visible by default (dims/roof/text/MEP off).`);

  const draft: CadPlate = {
    id: `cad-plate-${Date.now().toString(36)}`,
    sourceFileName,
    importedAt: new Date().toISOString(),
    warnings,
    layers,
    segments,
    wallCenterlines: [],
    openingHints: [],
    labels: plateLabels,
    fixtureHints: plateFixtureHints,
    slabs: [],
    elevationFront: elevationFront ?? undefined,
    elevationSide: elevationSide ?? undefined,
    sheets,
    bounds: boundsOf(segments),
    sheetSource,
    pdfUrl: opts?.pdfUrl,
  };

  const plate = rebuildPlateFromLayerSettings(draft);

  if (plate.wallCenterlines.length < 4) {
    plate.warnings.push('Few wall centerlines — classify wall layers in the panel, then rebuild.');
  }
  const fixtureCount = plate.segments.filter((s) => s.role === 'fixture').length;
  const softCount = plate.segments.filter((s) => s.role === 'soft').length;
  if (fixtureCount) {
    plate.warnings.push(`Fixture linework: ${fixtureCount} segment(s).`);
  }
  if (softCount) {
    plate.warnings.push(`Soft room borders: ${softCount} segment(s).`);
  }
  if (plate.labels.length) plate.warnings.push(`Room labels: ${plate.labels.length}.`);
  if (plate.fixtureHints.length) {
    plate.warnings.push(`Fixture poses: ${plate.fixtureHints.length} (INSERT/CIRCLE for Extrude).`);
  }

  return plate;
}

/** Toggle visibility and rebuild walls / openings / 3D inputs. */
export function withLayerVisibility(plate: CadPlate, visibility: Record<string, boolean>): CadPlate {
  return rebuildPlateFromLayerSettings({
    ...plate,
    layers: plate.layers.map((l) => ({
      ...l,
      visible: visibility[l.name] ?? l.visible,
    })),
  });
}

/** Set layer classify (Wall / Door / Dim / Ignore / …) and rebuild. */
export function setLayerClassify(plate: CadPlate, layerName: string, classify: CadLayerClassify): CadPlate {
  const role = classifyToRole(classify);
  const kind =
    classify === 'dim'
      ? 'annotation'
      : classify === 'ignore'
        ? 'other'
        : classify === 'wall' || classify === 'door' || classify === 'fixture' || classify === 'soft'
          ? 'floor'
          : classifyLayerKind(layerName);

  const layers = plate.layers.map((l) => {
    if (l.name !== layerName) return l;
    const visible =
      classify === 'dim' || classify === 'ignore'
        ? false
        : l.visible || role === 'wall' || role === 'opening';
    return { ...l, role, kind, visible };
  });

  const segments = plate.segments.map((s) => (s.layer === layerName ? { ...s, role } : s));
  return rebuildPlateFromLayerSettings({ ...plate, layers, segments });
}

/** Permanently drop a layer’s geometry from the plate. */
export function removeLayer(plate: CadPlate, layerName: string): CadPlate {
  const segments = plate.segments.filter((s) => s.layer !== layerName);
  const labels = plate.labels.filter((l) => (l.layer || 'TEXT ROOM') !== layerName);
  const fixtureHints = plate.fixtureHints.filter((f) => f.layer !== layerName);
  const slabs = (plate.slabs ?? []).filter((s) => s.layer !== layerName);
  const layers = plate.layers.filter((l) => l.name !== layerName);
  return rebuildPlateFromLayerSettings({
    ...plate,
    segments,
    labels,
    fixtureHints,
    slabs,
    layers,
  });
}

/** Hide all annotation / dim / roof / noise layers in one click. */
export function hideNonFloorPreset(plate: CadPlate): CadPlate {
  const layers = plate.layers.map((l) => {
    const shouldHide =
      l.kind === 'annotation' ||
      l.kind === 'elevation' ||
      l.kind === 'foundation' ||
      l.role === 'other' ||
      l.role === 'elevation';
    return shouldHide ? { ...l, visible: false } : l;
  });
  return rebuildPlateFromLayerSettings({ ...plate, layers });
}

/** Show only layers classified as wall or door (opening). */
export function showWallsAndDoorsPreset(plate: CadPlate): CadPlate {
  const layers = plate.layers.map((l) => ({
    ...l,
    visible: l.role === 'wall' || l.role === 'opening',
  }));
  return rebuildPlateFromLayerSettings({ ...plate, layers });
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
