import { describe, expect, it } from 'vitest';
import {
  arcToSegments,
  circleToSegments,
  explodeInsert,
  isFixtureGeometryLayer,
  loadBlockPrimitives,
} from './dxfFixtureGeometry';

describe('dxfFixtureGeometry', () => {
  it('recognizes fixture layers', () => {
    expect(isFixtureGeometryLayer('COUNTER')).toBe(true);
    expect(isFixtureGeometryLayer('FIXTURES')).toBe(true);
    expect(isFixtureGeometryLayer('PLUMBING')).toBe(true);
    expect(isFixtureGeometryLayer('WALLS INT')).toBe(false);
  });

  it('tessellates circles into closed chords', () => {
    const segs = circleToSegments(0, 0, 1, 'FIXTURES', undefined, 8);
    expect(segs.length).toBe(8);
    expect(segs[0]!.layer).toBe('FIXTURES');
  });

  it('tessellates arcs', () => {
    const segs = arcToSegments(0, 0, 2, 0, 90, 'COUNTER');
    expect(segs.length).toBeGreaterThanOrEqual(2);
  });

  it('explodes INSERT transforms', () => {
    const prims = [{ x1: 0, y1: 0, x2: 1, y2: 0, layer: '0' }];
    const placed = explodeInsert(prims, 10, 20, 2, 2, 0, 'FIXTURES');
    expect(placed[0]!.x1).toBeCloseTo(10);
    expect(placed[0]!.y1).toBeCloseTo(20);
    expect(placed[0]!.x2).toBeCloseTo(12);
    expect(placed[0]!.layer).toBe('FIXTURES');
  });

  it('loads block primitives from DXF BLOCKS', () => {
    const dxf = `0
SECTION
2
BLOCKS
0
BLOCK
2
pv_snk_lav
0
LINE
8
0
10
0
20
0
11
1
21
0
0
CIRCLE
8
0
10
0.5
20
0.5
40
0.25
0
ENDBLK
0
ENDSEC
0
EOF
`;
    const blocks = loadBlockPrimitives(dxf);
    expect(blocks.get('pv_snk_lav')?.length).toBeGreaterThan(1);
  });
});
