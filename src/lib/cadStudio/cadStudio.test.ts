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
  });

  it('builds a plate from DXF with wall centerlines and openings', () => {
    const plate = buildCadPlateFromDxf(tinyDxf, 'tiny.dxf');
    expect(plate.wallCenterlines.length).toBeGreaterThanOrEqual(4);
    expect(plate.openingHints.length).toBeGreaterThanOrEqual(1);
    expect(plate.layers.some((l) => l.role === 'wall')).toBe(true);
    expect(plate.segments.length).toBeGreaterThan(0);
  });

  it('renders SVG plate and extrudes walls from centerlines', () => {
    const plate = demoCadPlate();
    const svg = renderCadPlateSvg(plate, { title: 'Demo' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('#1e293b');
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
