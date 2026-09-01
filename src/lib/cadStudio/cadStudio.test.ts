import { describe, expect, it } from 'vitest';
import {
  buildCadPlateFromDxf,
  classifyLayerKind,
  classifySegmentRole,
  demoCadPlate,
  extrudeCadPlate,
  isElevationLayer,
  renderCadPlateSvg,
  withLayerVisibility,
} from './index';

const tinyDxf = `  0
SECTION
  2
HEADER
  9
$INSUNITS
 70
1
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
0.5
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

  it('honors layer visibility toggles in SVG', () => {
    const plate = withLayerVisibility(demoCadPlate(), { DOORS: false, WINDOWS: false });
    const svg = renderCadPlateSvg(plate);
    expect(svg).not.toContain('#b45309');
  });
});
