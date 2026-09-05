import { describe, expect, it } from 'vitest';
import {
  buildCadPlateFromDxf,
  classifyLayerKind,
  classifySegmentRole,
  demoCadPlate,
  extrudeCadPlate,
  isElevationLayer,
  removeLayer,
  renderCadElevationSvg,
  renderCadPlateSvg,
  setLayerClassify,
  withLayerVisibility,
  visibleWallCenterlines,
} from './index';

const tinyDxf = `  0
SECTION
  2
HEADER
  9
$INSUNITS
 70
2
  0
ENDSEC
  0
SECTION
  2
ENTITIES
  0
LINE
  8
WALLS EXT
 10
0
 20
0
 11
30
 21
0
  0
LINE
  8
WALLS EXT
 10
30
 20
0
 11
30
 21
20
  0
LINE
  8
WALLS EXT
 10
30
 20
20
 11
0
 21
20
  0
LINE
  8
WALLS EXT
 10
0
 20
20
 11
0
 21
0
  0
LINE
  8
WALLS INT
 10
15
 20
0
 11
15
 21
20
  0
LINE
  8
DOORS
 10
7
 20
0
 11
10
 21
0
  0
LINE
  8
A-ELEV-FRONT
 10
0
 20
100
 11
40
 21
100
  0
LINE
  8
COUNTER
 10
5
 20
5
 11
12
 21
5
  0
LINE
  8
COUNTER
 10
12
 20
5
 11
12
 21
9
  0
LINE
  8
COUNTER
 10
12
 20
9
 11
5
 21
9
  0
LINE
  8
COUNTER
 10
5
 20
9
 11
5
 21
5
  0
LINE
  8
CEILING
  6
HIDDEN
 10
2
 20
2
 11
14
 21
2
  0
CIRCLE
  8
FIXTURES
 10
8
 20
7
 40
4
  0
INSERT
  8
FIXTURES
  2
pv_toi_std
 10
22
 20
8
 41
1
 42
1
 50
0
  0
TEXT
  8
TEXT ROOM
 10
8
 20
12
 40
1
  1
KITCHEN
  0
ENDSEC
  0
EOF
`;

describe('cadStudio', () => {
  it('classifies elevation vs floor wall layers', () => {
    expect(isElevationLayer('A-ELEV-FRONT')).toBe(true);
    expect(isElevationLayer('WALLS INT')).toBe(false);
    expect(classifyLayerKind('WALLS EXT')).toBe('floor');
    expect(classifyLayerKind('A-ELEV-FRONT')).toBe('elevation');
    expect(classifySegmentRole('DOORS')).toBe('opening');
    expect(classifySegmentRole('WALLS INT')).toBe('wall');
    expect(classifySegmentRole('COUNTER')).toBe('fixture');
    expect(classifySegmentRole('CEILING')).toBe('soft');
  });

  it('builds a plate from DXF with wall centerlines and openings', () => {
    const plate = buildCadPlateFromDxf(tinyDxf, 'tiny.dxf');
    expect(plate.wallCenterlines.length).toBeGreaterThanOrEqual(4);
    expect(plate.openingHints.length).toBeGreaterThanOrEqual(1);
    expect(plate.layers.some((l) => l.role === 'wall')).toBe(true);
    expect(plate.segments.length).toBeGreaterThan(0);
  });

  it('imports fixtures, soft room borders, and room labels onto the plate', () => {
    const plate = buildCadPlateFromDxf(tinyDxf, 'tiny.dxf');
    expect(plate.segments.some((s) => s.role === 'fixture')).toBe(true);
    expect(plate.segments.some((s) => s.role === 'soft')).toBe(true);
    expect(plate.labels.some((l) => /KITCHEN/i.test(l.text))).toBe(true);
    expect(plate.fixtureHints.length).toBeGreaterThanOrEqual(1);
    const svg = renderCadPlateSvg(plate);
    expect(svg).toContain('#0f766e');
    expect(svg).toContain('stroke-dasharray');
    expect(svg).toContain('KITCHEN');
  });

  it('renders SVG plate and extrudes walls from centerlines', () => {
    const plate = demoCadPlate();
    const svg = renderCadPlateSvg(plate, { title: 'Demo' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('#1e293b');
    expect(svg).toContain('KITCHEN');
    const extrusion = extrudeCadPlate(plate);
    expect(extrusion.walls.length).toBeGreaterThanOrEqual(8);
    expect(extrusion.openings.length).toBeGreaterThanOrEqual(1);
  });

  it('detects procedural Extrude fixtures from counters and INSERT/CIRCLE hints', () => {
    const plate = buildCadPlateFromDxf(tinyDxf, 'tiny.dxf');
    const extrusion = extrudeCadPlate(plate);
    expect(extrusion.fixtures.length).toBeGreaterThanOrEqual(2);
    expect(extrusion.massing.roof.ridgeHeightM).toBeGreaterThan(extrusion.heightM);

    const demo = extrudeCadPlate(demoCadPlate());
    expect(demo.fixtures.some((f) => f.kind === 'island')).toBe(true);
    expect(demo.massing.frontElevation?.segments.some((s) => /ROOF/i.test(s.layer))).toBe(true);
  });

  it('renders demo front elevation SVG from plate elevation sheet', () => {
    const plate = demoCadPlate();
    const svg = renderCadElevationSvg(plate.elevationFront!);
    expect(svg).toContain('<svg');
    expect(svg).toContain('#7c8491');
  });

  it('honors layer visibility toggles in SVG', () => {
    const plate = withLayerVisibility(demoCadPlate(), { DOORS: false, WINDOWS: false });
    const svg = renderCadPlateSvg(plate);
    expect(svg).not.toContain('#b45309');
  });

  it('imports dim layers off by default and rebuilds walls when classified', () => {
    const dxf = `  0
SECTION
  2
HEADER
  9
$INSUNITS
 70
2
  0
ENDSEC
  0
SECTION
  2
ENTITIES
  0
LINE
  8
WALLS EXT
 10
0
 20
0
 11
30
 21
0
  0
LINE
  8
WALLS EXT
 10
30
 20
0
 11
30
 21
20
  0
LINE
  8
WALLS EXT
 10
30
 20
20
 11
0
 21
20
  0
LINE
  8
WALLS EXT
 10
0
 20
20
 11
0
 21
0
  0
LINE
  8
DIMS
 10
0
 20
-2
 11
30
 21
-2
  0
LINE
  8
ROOF PLAN
 10
-5
 20
-5
 11
35
 21
-5
  0
ENDSEC
  0
EOF
`;
    const plate = buildCadPlateFromDxf(dxf, 'layers.dxf');
    expect(plate.layers.some((l) => l.name === 'DIMS')).toBe(true);
    expect(plate.layers.some((l) => l.name === 'ROOF PLAN')).toBe(true);
    expect(plate.layers.find((l) => l.name === 'DIMS')?.visible).toBe(false);
    expect(plate.layers.find((l) => l.name === 'ROOF PLAN')?.visible).toBe(false);

    const wallsBefore = plate.wallCenterlines.length;
    expect(wallsBefore).toBeGreaterThanOrEqual(4);

    const hiddenWalls = withLayerVisibility(plate, { 'WALLS EXT': false });
    // Soft visibility keeps authored centerlines; drawing filters via visibleWallCenterlines.
    expect(hiddenWalls.wallCenterlines.length).toBe(wallsBefore);
    expect(visibleWallCenterlines(hiddenWalls).length).toBe(0);

    const asIgnore = setLayerClassify(plate, 'WALLS EXT', 'ignore');
    expect(asIgnore.wallCenterlines.length).toBe(0);
    expect(asIgnore.layers.find((l) => l.name === 'WALLS EXT')?.visible).toBe(false);

    const removed = removeLayer(plate, 'DIMS');
    expect(removed.layers.some((l) => l.name === 'DIMS')).toBe(false);
    expect(removed.segments.some((s) => s.layer === 'DIMS')).toBe(false);
  });
});
