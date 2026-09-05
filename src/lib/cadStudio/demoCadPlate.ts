import type { CadPlate } from './types';
import { applyAutoFoundation } from './buildCadFoundation';

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

  const plate: CadPlate = {
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
      // Kitchen run along north wall
      {
        xFt: 6,
        yFt: 26.75,
        widthFt: 10,
        depthFt: 2,
        layer: 'FIXTURES',
        kind: 'counter',
        blockName: 'COUNTER',
        rotationDeg: 0,
      },
      {
        xFt: 3.5,
        yFt: 26.75,
        widthFt: 2.5,
        depthFt: 2,
        layer: 'FIXTURES',
        kind: 'sink',
        blockName: 'SINK',
        rotationDeg: 0,
      },
      {
        xFt: 9.5,
        yFt: 26.75,
        widthFt: 2.5,
        depthFt: 2.5,
        layer: 'FIXTURES',
        kind: 'appliance',
        blockName: 'STOVE',
        rotationDeg: 0,
      },
      // Island + prep sink
      {
        xFt: 18,
        yFt: 20,
        widthFt: 8,
        depthFt: 3.5,
        layer: 'FIXTURES',
        kind: 'island',
        blockName: 'ISLAND',
        rotationDeg: 0,
      },
      {
        xFt: 16,
        yFt: 20.5,
        widthFt: 2.4,
        depthFt: 1.5,
        layer: 'FIXTURES',
        kind: 'sink',
        blockName: 'pv_snk_double',
        rotationDeg: 0,
      },
      // Bath
      {
        xFt: 3.2,
        yFt: 3.2,
        widthFt: 1.75,
        depthFt: 2.4,
        layer: 'FIXTURES',
        kind: 'toilet',
        blockName: 'TOILET',
        rotationDeg: 180,
      },
      {
        xFt: 8,
        yFt: 2.5,
        widthFt: 5,
        depthFt: 2.5,
        layer: 'FIXTURES',
        kind: 'tub',
        blockName: 'TUB',
        rotationDeg: 0,
      },
      {
        xFt: 3.2,
        yFt: 5.35,
        widthFt: 3,
        depthFt: 0.35,
        layer: 'FIXTURES',
        kind: 'mirror',
        blockName: 'MIRROR',
        rotationDeg: 0,
      },
    ],
    slabs: [
      {
        id: 'slab-demo-terrace',
        kind: 'terrace',
        points: [
          { x: 8, y: -8 },
          { x: 28, y: -8 },
          { x: 28, y: -1 },
          { x: 8, y: -1 },
        ],
        thicknessFt: 0.5,
        elevationFt: 0,
        layer: 'SLAB TERRACE',
        railing: false,
      },
      {
        id: 'slab-demo-balcony',
        kind: 'balcony',
        points: [
          { x: 40, y: 16 },
          { x: 48, y: 16 },
          { x: 48, y: 24 },
          { x: 40, y: 24 },
        ],
        thicknessFt: 0.5,
        elevationFt: 0,
        layer: 'SLAB BALCONY',
        railing: true,
      },
      {
        // Lot must clearly dominate house (0–40 × 0–28) + garage (52–68 × 4–20).
        id: 'slab-demo-plot',
        kind: 'plot',
        points: [
          { x: -30, y: -36 },
          { x: 98, y: -36 },
          { x: 98, y: 58 },
          { x: -30, y: 58 },
        ],
        thicknessFt: 0.08,
        elevationFt: -0.04,
        layer: 'A-SITE-PLOT',
        railing: false,
      },
    ],
    stairs: [
      {
        id: 'stair-demo-1',
        xFt: 27,
        yFt: 15,
        runFt: 10,
        widthFt: 3.5,
        riseFt: 9,
        steps: 14,
        rotationDeg: 90,
        railing: true,
        layer: 'STAIRS',
      },
    ],
    dormers: [
      {
        id: 'dormer-demo-1',
        xFt: 20,
        yFt: 26,
        widthFt: 8,
        depthFt: 6,
        heightFt: 5,
        rotationDeg: 0,
        pitchRise12: 8,
        layer: 'A-ROOF-DORM',
        buildingId: 'bldg-main',
      },
    ],
    sectionCuts: [
      {
        id: 'section-demo-a',
        x1: -2,
        y1: 14,
        x2: 50,
        y2: 14,
        depthFt: 1.5,
        label: 'SECTION A-A',
        layer: 'A-SECT',
      },
    ],
    buildings: [
      { id: 'bldg-main', name: 'Main house', offsetXFt: 0, offsetYFt: 0, visible: true },
      { id: 'bldg-garage', name: 'Detached garage', offsetXFt: 0, offsetYFt: 0, visible: true },
    ],
    terrain: {
      enabled: true,
      gradePercent: 2,
      directionDeg: 15,
      // Pad beyond lot so graded mesh never reads smaller than the parcel.
      padFt: 12,
    },
    titleBlock: {
      projectName: 'Demo Ranch',
      sheetTitle: 'CAD Studio Sheet Set',
      drawnBy: 'Olsen CAD',
      checkedBy: '—',
      scaleLabel: '1/4" = 1\'-0"',
      dateLabel: '2026-09-04',
      revision: 'A',
      address: 'Sample Lot',
    },
    foundation: {
      enabled: true,
      mode: 'slab+footing',
      offsetFt: 0.5,
      slabThicknessFt: 0.67,
      footingWidthFt: 2,
      footingDepthFt: 1,
    },
    elevationFront,
    elevationSide,
    sheets: [
      { id: 'demo-floor', name: 'SHT. 1 FLOOR', order: 1, kind: 'floor' },
      { id: 'demo-front', name: 'SHT. 2 FRONT ELEVATION', order: 2, kind: 'elevation' },
      { id: 'demo-section', name: 'SHT. 3 SECTION A-A', order: 3, kind: 'details' },
    ],
    bounds: { minX: -30, minY: -36, maxX: 98, maxY: 58 },
    sheetSource: 'synthetic',
  };

  // Detached garage as second building (multi-building)
  const garageWalls = [
    { x1: 52, y1: 4, x2: 68, y2: 4, layer: 'WALLS EXT', exterior: true, buildingId: 'bldg-garage' },
    { x1: 68, y1: 4, x2: 68, y2: 20, layer: 'WALLS EXT', exterior: true, buildingId: 'bldg-garage' },
    { x1: 68, y1: 20, x2: 52, y2: 20, layer: 'WALLS EXT', exterior: true, buildingId: 'bldg-garage' },
    { x1: 52, y1: 20, x2: 52, y2: 4, layer: 'WALLS EXT', exterior: true, buildingId: 'bldg-garage' },
  ];
  plate.wallCenterlines = [
    ...plate.wallCenterlines.map((w) => ({ ...w, buildingId: 'bldg-main' })),
    ...garageWalls,
  ];
  plate.openingHints = [
    ...plate.openingHints,
    { x1: 54, y1: 4, x2: 66, y2: 4, kind: 'garage' as const, layer: 'DOORS' },
  ];
  plate.segments = [
    ...plate.segments,
    ...garageWalls.map((s) => ({
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      layer: s.layer,
      role: 'wall' as const,
    })),
    { x1: 54, y1: 4, x2: 66, y2: 4, layer: 'DOORS', role: 'opening' as const },
  ];
  // Keep plate bounds = full lot (not only building envelope).
  plate.bounds = { minX: -30, minY: -36, maxX: 98, maxY: 58 };
  plate.labels = [
    ...plate.labels,
    { x: 60, y: 12, text: 'GARAGE', layer: 'TEXT ROOM' },
  ];

  return applyAutoFoundation(plate, { enabled: true });
}
