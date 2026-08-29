import { describe, expect, it } from 'vitest';
import { buildSheetsFromDxf, extractDxfModelGeometry, filterDxfToLayers, importDxfDrawingPackage, WALL_LAYERS } from './dxfDrawingImport';
import { sheetKindFromName } from './drawingPackage';

const tinyDxf = `  0
SECTION
  2
HEADER
  0
ENDSEC
  0
SECTION
  2
BLOCKS
  0
BLOCK
  2
*PAPER_SPACE3
  0
VIEWPORT
 10
5
 20
5
 40
20
 41
15
 12
10
 22
10
 45
20
  0
TEXT
  1
1 OF 8
  0
ENDBLK
  0
ENDSEC
  0
SECTION
  2
ENTITIES
  0
LINE
  8
WALLS INT
 10
0
 20
0
 11
20
 21
0
  0
LINE
  8
WALLS INT
 10
20
 20
0
 11
20
 21
20
  0
LINE
  8
WALLS INT
 10
20
 20
20
 11
0
 21
20
  0
LINE
  8
WALLS INT
 10
0
 20
20
 11
0
 21
0
  0
TEXT
  8
TEXT ROOM
 10
10
 20
10
  1
KITCHEN
  0
ENDSEC
  0
EOF
`;

describe('drawing package helpers', () => {
  it('maps sheet kinds from names', () => {
    expect(sheetKindFromName('SHT. 1 FLOOR')).toBe('floor');
    expect(sheetKindFromName('SHT. 5 ELECTRICAL')).toBe('electrical');
    expect(sheetKindFromName('COVER')).toBe('cover');
  });

  it('filters wall layers', () => {
    const filtered = filterDxfToLayers(tinyDxf, WALL_LAYERS);
    expect(filtered).toContain('WALLS INT');
    expect(filtered).not.toContain('TEXT ROOM');
  });

  it('builds a sheet SVG from paper viewport + model geometry', () => {
    const { segs, labels } = extractDxfModelGeometry(tinyDxf);
    expect(segs.length).toBeGreaterThanOrEqual(4);
    expect(labels.some((l) => l.text.includes('KITCHEN'))).toBe(true);
    const { sheets } = buildSheetsFromDxf(tinyDxf, segs, labels);
    expect(sheets.length).toBeGreaterThanOrEqual(1);
    expect(sheets[0]!.name).toMatch(/FLOOR|Sheet/i);
    expect(sheets[0]!.svg).toContain('<svg');
    expect(sheets[0]!.svg).toContain('line');
  });

  it('imports a drawing package with a room plan', () => {
    const result = importDxfDrawingPackage(tinyDxf, 'demo.dxf', 'Demo plan');
    expect(result.plan.floors[0]!.rooms.length).toBeGreaterThanOrEqual(1);
    expect(result.package.sheets.length).toBeGreaterThanOrEqual(1);
    expect(result.lineCount).toBeGreaterThan(0);
  });
});
