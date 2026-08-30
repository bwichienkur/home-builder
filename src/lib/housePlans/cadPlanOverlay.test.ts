import { describe, expect, it } from 'vitest';
import { importDxfHousePlan } from './dxfImport';
import { isPlanOverlayLayer, planVectorRole } from './dxfDrawingImport';

describe('plan-first CAD overlay import', () => {
  it('classifies overlay layers', () => {
    expect(isPlanOverlayLayer('WALLS INT')).toBe(true);
    expect(isPlanOverlayLayer('DOORS')).toBe(true);
    expect(isPlanOverlayLayer('WINDOWS')).toBe(true);
    expect(planVectorRole('WALLS EXT')).toBe('wall');
    expect(planVectorRole('DOORS')).toBe('opening');
    expect(planVectorRole('DIMS')).toBe('other');
  });

  it('stores cadPlanVectorsFt alongside wallSegmentsFt', () => {
    // Simple inch-based rectangle with a door tick on DOORS layer.
    const dxf = `0
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
WALLS INT
10
0
20
0
11
240
21
0
0
LINE
8
WALLS INT
10
240
20
0
11
240
21
180
0
LINE
8
WALLS INT
10
240
20
180
11
0
21
180
0
LINE
8
WALLS INT
10
0
20
180
11
0
21
0
0
LINE
8
DOORS
10
100
20
0
11
136
21
0
0
ENDSEC
0
EOF
`;
    const { plan, warnings } = importDxfHousePlan(dxf, 'Overlay test', {
      segments: [
        { x1: 0, y1: 0, x2: 240, y2: 0, layer: 'WALLS INT' },
        { x1: 240, y1: 0, x2: 240, y2: 180, layer: 'WALLS INT' },
        { x1: 240, y1: 180, x2: 0, y2: 180, layer: 'WALLS INT' },
        { x1: 0, y1: 180, x2: 0, y2: 0, layer: 'WALLS INT' },
      ],
      openingSegments: [{ x1: 100, y1: 0, x2: 136, y2: 0, layer: 'DOORS' }],
      planVectors: [
        { x1: 0, y1: 0, x2: 240, y2: 0, layer: 'WALLS INT' },
        { x1: 240, y1: 0, x2: 240, y2: 180, layer: 'WALLS INT' },
        { x1: 240, y1: 180, x2: 0, y2: 180, layer: 'WALLS INT' },
        { x1: 0, y1: 180, x2: 0, y2: 0, layer: 'WALLS INT' },
        { x1: 100, y1: 0, x2: 136, y2: 0, layer: 'DOORS' },
      ],
    });
    const floor = plan.floors[0]!;
    expect(floor.wallSegmentsFt?.length).toBeGreaterThan(0);
    expect(floor.cadPlanVectorsFt?.length).toBeGreaterThanOrEqual(4);
    expect(floor.cadPlanVectorsFt?.some((v) => v.role === 'opening')).toBe(true);
    expect(floor.cadPlanVectorsFt?.some((v) => v.role === 'wall')).toBe(true);
    expect(warnings.some((w) => /plan vector/i.test(w))).toBe(true);
  });
});
