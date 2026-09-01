import type { CadPlate } from './types';

/** Tiny orthogonal ranch used as an offline CAD Studio demo (no Stillwater DXF required). */
export function demoCadPlate(): CadPlate {
  const walls = [
    { x1: 0, y1: 0, x2: 40, y2: 0, layer: 'WALLS EXT', exterior: true },
    { x1: 40, y1: 0, x2: 40, y2: 28, layer: 'WALLS EXT', exterior: true },
    { x1: 40, y1: 28, x2: 0, y2: 28, layer: 'WALLS EXT', exterior: true },
    { x1: 0, y1: 28, x2: 0, y2: 0, layer: 'WALLS EXT', exterior: true },
    { x1: 12, y1: 0, x2: 12, y2: 14, layer: 'WALLS INT', exterior: false },
    { x1: 0, y1: 14, x2: 12, y2: 14, layer: 'WALLS INT', exterior: false },
    { x1: 12, y1: 14, x2: 40, y2: 14, layer: 'WALLS INT', exterior: false },
    { x1: 26, y1: 14, x2: 26, y2: 28, layer: 'WALLS INT', exterior: false },
    { x1: 26, y1: 0, x2: 26, y2: 14, layer: 'WALLS INT', exterior: false },
    { x1: 12, y1: 8, x2: 26, y2: 8, layer: 'WALLS INT', exterior: false },
  ];

  const openings = [
    { x1: 5, y1: 0, x2: 8, y2: 0, kind: 'door' as const, layer: 'DOORS' },
    { x1: 18, y1: 0, x2: 21, y2: 0, kind: 'door' as const, layer: 'DOORS' },
    { x1: 32, y1: 0, x2: 36, y2: 0, kind: 'window' as const, layer: 'WINDOWS' },
    { x1: 40, y1: 10, x2: 40, y2: 14, kind: 'window' as const, layer: 'WINDOWS' },
    { x1: 12, y1: 10, x2: 12, y2: 12, kind: 'door' as const, layer: 'DOORS' },
  ];

  const segments = [
    ...walls.map((s) => ({
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      layer: s.layer,
      role: 'wall' as const,
    })),
    ...openings.map((s) => ({
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      layer: s.layer,
      role: 'opening' as const,
    })),
    // Kitchen island / counter outline
    { x1: 14, y1: 18, x2: 22, y2: 18, layer: 'COUNTER', role: 'fixture' as const },
    { x1: 22, y1: 18, x2: 22, y2: 22, layer: 'COUNTER', role: 'fixture' as const },
    { x1: 22, y1: 22, x2: 14, y2: 22, layer: 'COUNTER', role: 'fixture' as const },
    { x1: 14, y1: 22, x2: 14, y2: 18, layer: 'COUNTER', role: 'fixture' as const },
    // Soft room border (dashed ceiling / space boundary)
    {
      x1: 1,
      y1: 15,
      x2: 11,
      y2: 15,
      layer: 'CEILING',
      role: 'soft' as const,
      linetype: 'HIDDEN',
    },
  ];

  const labels = [
    { x: 6, y: 21, text: 'KITCHEN', layer: 'TEXT ROOM' },
    { x: 19, y: 7, text: 'BEDROOM', layer: 'TEXT ROOM' },
    { x: 33, y: 21, text: 'GREAT ROOM', layer: 'TEXT ROOM' },
  ];

  const layerNames = [...new Set(segments.map((s) => s.layer))];

  const elevationFront = {
    face: 'front' as const,
    name: 'SHT. 2 FRONT ELEVATION',
    gradeFt: 0,
    bounds: { minX: 0, minY: 0, maxX: 40, maxY: 18 },
    labels: [{ x: 20, y: 16, text: 'FRONT ELEVATION', layer: 'A-ELEV-TEXT' }],
    segments: [
      { x1Ft: 0, y1Ft: 0, x2Ft: 40, y2Ft: 0, layer: 'WALLS EXT', role: 'wall' as const },
      { x1Ft: 0, y1Ft: 0, x2Ft: 0, y2Ft: 9, layer: 'WALLS EXT', role: 'wall' as const },
      { x1Ft: 40, y1Ft: 0, x2Ft: 40, y2Ft: 9, layer: 'WALLS EXT', role: 'wall' as const },
      { x1Ft: 5, y1Ft: 0, x2Ft: 8, y2Ft: 7, layer: 'DOORS', role: 'opening' as const },
      { x1Ft: 18, y1Ft: 0, x2Ft: 21, y2Ft: 7, layer: 'DOORS', role: 'opening' as const },
      { x1Ft: 32, y1Ft: 3, x2Ft: 36, y2Ft: 7, layer: 'WINDOWS', role: 'opening' as const },
      { x1Ft: 0, y1Ft: 9, x2Ft: 20, y2Ft: 18, layer: 'ROOF', role: 'elevation' as const },
      { x1Ft: 20, y1Ft: 18, x2Ft: 40, y2Ft: 9, layer: 'ROOF', role: 'elevation' as const },
    ],
  };

  const elevationSide = {
    face: 'side' as const,
    name: 'SHT. 3 SIDE ELEVATIONS',
    gradeFt: 0,
    bounds: { minX: 0, minY: 0, maxX: 28, maxY: 16 },
    labels: [],
    segments: [
      { x1Ft: 0, y1Ft: 0, x2Ft: 28, y2Ft: 0, layer: 'WALLS EXT', role: 'wall' as const },
      { x1Ft: 0, y1Ft: 0, x2Ft: 0, y2Ft: 9, layer: 'WALLS EXT', role: 'wall' as const },
      { x1Ft: 28, y1Ft: 0, x2Ft: 28, y2Ft: 9, layer: 'WALLS EXT', role: 'wall' as const },
      { x1Ft: 0, y1Ft: 9, x2Ft: 14, y2Ft: 16, layer: 'ROOF', role: 'elevation' as const },
      { x1Ft: 14, y1Ft: 16, x2Ft: 28, y2Ft: 9, layer: 'ROOF', role: 'elevation' as const },
    ],
  };

  return {
    id: 'cad-demo-ranch',
    sourceFileName: 'demo-ranch.dxf',
    importedAt: new Date().toISOString(),
    warnings: [
      'Synthetic demo plate — replace with a DXF/DWG import for production CAD.',
      'Front elevation: 8 segment(s), 40.0×18.0 ft.',
    ],
    layers: layerNames.map((name) => ({
      name,
      kind: 'floor' as const,
      role: /DOOR|WINDOW/i.test(name)
        ? ('opening' as const)
        : /COUNTER|FIXTURE/i.test(name)
          ? ('fixture' as const)
          : /CEILING/i.test(name)
            ? ('soft' as const)
            : ('wall' as const),
      visible: true,
      segmentCount: segments.filter((s) => s.layer === name).length,
    })),
    segments,
    wallCenterlines: walls.map((s) => ({
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      layer: s.layer,
      exterior: s.exterior,
    })),
    openingHints: openings,
    labels,
    fixtureHints: [
      { xFt: 16, yFt: 20.5, widthFt: 1.5, depthFt: 1.2, layer: 'FIXTURES', kind: 'sink', blockName: 'pv_snk_double' },
    ],
    elevationFront,
    elevationSide,
    sheets: [
      { id: 'demo-floor', name: 'SHT. 1 FLOOR', order: 1, kind: 'floor' },
      { id: 'demo-front', name: 'SHT. 2 FRONT ELEVATION', order: 2, kind: 'elevation' },
    ],
    bounds: { minX: 0, minY: 0, maxX: 40, maxY: 28 },
    sheetSource: 'synthetic',
  };
}
