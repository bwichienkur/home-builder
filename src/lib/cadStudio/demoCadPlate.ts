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
  ];

  const layerNames = [...new Set(segments.map((s) => s.layer))];
  return {
    id: 'cad-demo-ranch',
    sourceFileName: 'demo-ranch.dxf',
    importedAt: new Date().toISOString(),
    warnings: ['Synthetic demo plate — replace with a DXF/DWG import for production CAD.'],
    layers: layerNames.map((name) => ({
      name,
      kind: 'floor' as const,
      role: /DOOR|WINDOW/i.test(name) ? ('opening' as const) : ('wall' as const),
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
    sheets: [
      { id: 'demo-floor', name: 'SHT. 1 FLOOR', order: 1, kind: 'floor' },
      { id: 'demo-front', name: 'SHT. 2 FRONT ELEVATION', order: 2, kind: 'elevation' },
    ],
    bounds: { minX: 0, minY: 0, maxX: 40, maxY: 28 },
    sheetSource: 'synthetic',
  };
}
