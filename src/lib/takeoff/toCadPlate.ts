import type { CadPlate, CadSegmentFt, CadSegmentRole } from '../cadStudio/types';
import type { TakeoffObject, TakeoffPage, TakeoffProject } from './types';

/**
 * Convert takeoff geometry on a calibrated floor page into a CadPlate
 * so we can reuse extrudeCadPlate / CadExtrudeView.
 *
 * Coordinates: PDF page Y grows downward; CadPlate plan Y grows upward.
 * We flip Y around the page height in feet.
 */
export function takeoffToCadPlate(
  project: TakeoffProject,
  page: TakeoffPage,
  objects: TakeoffObject[],
): CadPlate {
  const scale = page.scale;
  if (!scale?.pixelsPerFoot || scale.pixelsPerFoot <= 0) {
    throw new Error('Calibrate the page scale before previewing 3D.');
  }
  const ppf = scale.pixelsPerFoot;
  const pageHFt = page.heightPt / ppf;

  const toPlan = (xPx: number, yPx: number) => ({
    x: xPx / ppf,
    y: pageHFt - yPx / ppf,
  });

  const pageObjects = objects.filter((o) => o.pageId === page.id);
  const walls = pageObjects.filter((o) => o.kind === 'wall' && o.points.length >= 2);
  const rooms = pageObjects.filter((o) => o.kind === 'room' && o.points.length >= 3);
  const openings = pageObjects.filter(
    (o) => (o.kind === 'door' || o.kind === 'window') && o.points.length >= 2,
  );
  const fixtures = pageObjects.filter((o) => o.kind === 'fixture' && o.points.length >= 1);

  const wallCenterlines = walls.flatMap((wall) => {
    const segs = [];
    for (let i = 1; i < wall.points.length; i += 1) {
      const a = toPlan(wall.points[i - 1]!.x, wall.points[i - 1]!.y);
      const b = toPlan(wall.points[i]!.x, wall.points[i]!.y);
      segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, layer: 'TAKEOFF_WALL', exterior: true });
    }
    return segs;
  });

  const segments: CadSegmentFt[] = wallCenterlines.map((w) => ({
    x1: w.x1,
    y1: w.y1,
    x2: w.x2,
    y2: w.y2,
    layer: 'TAKEOFF_WALL',
    role: 'wall' as CadSegmentRole,
  }));

  // Room outlines as soft segments for overlay (not extruded as walls).
  for (const room of rooms) {
    for (let i = 0; i < room.points.length; i += 1) {
      const aPx = room.points[i]!;
      const bPx = room.points[(i + 1) % room.points.length]!;
      const a = toPlan(aPx.x, aPx.y);
      const b = toPlan(bPx.x, bPx.y);
      segments.push({
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        layer: 'TAKEOFF_ROOM',
        role: 'soft',
      });
    }
  }

  const openingHints = openings.map((o) => {
    const a = toPlan(o.points[0]!.x, o.points[0]!.y);
    const b = toPlan(o.points[1]!.x, o.points[1]!.y);
    return {
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      kind: o.kind === 'window' ? ('window' as const) : ('door' as const),
      layer: 'TAKEOFF_OPENING',
    };
  });

  const fixtureHints = fixtures.map((f) => {
    const p = toPlan(f.points[0]!.x, f.points[0]!.y);
    return {
      xFt: p.x,
      yFt: p.y,
      layer: 'TAKEOFF_FIXTURE',
      kind: 'other' as const,
      blockName: f.label || 'fixture',
    };
  });

  const labels = rooms
    .filter((r) => r.label)
    .map((r) => {
      const cx = r.points.reduce((s, p) => s + p.x, 0) / r.points.length;
      const cy = r.points.reduce((s, p) => s + p.y, 0) / r.points.length;
      const p = toPlan(cx, cy);
      return { x: p.x, y: p.y, text: r.label!, layer: 'TAKEOFF_LABEL' };
    });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of wallCenterlines) {
    minX = Math.min(minX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxX = Math.max(maxX, s.x1, s.x2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = page.widthPt / ppf;
    maxY = pageHFt;
  }

  const warnings = [...project.warnings];
  if (!wallCenterlines.length) warnings.push('No walls traced yet — 3D preview will be empty.');
  if (!page.scale) warnings.push('Page scale not calibrated.');

  return {
    id: `takeoff-${project.id}-${page.id}`,
    sourceFileName: project.sourceFileName,
    importedAt: new Date().toISOString(),
    warnings,
    layers: [
      {
        name: 'TAKEOFF_WALL',
        kind: 'floor',
        role: 'wall',
        visible: true,
        segmentCount: wallCenterlines.length,
      },
      {
        name: 'TAKEOFF_ROOM',
        kind: 'floor',
        role: 'soft',
        visible: true,
        segmentCount: rooms.length,
      },
      {
        name: 'TAKEOFF_OPENING',
        kind: 'floor',
        role: 'opening',
        visible: true,
        segmentCount: openings.length,
      },
    ],
    segments,
    wallCenterlines,
    openingHints,
    labels,
    fixtureHints,
    sheets: [],
    bounds: { minX, minY, maxX, maxY },
    sheetSource: 'pdf',
    pdfUrl: project.pdfUrl,
  };
}
