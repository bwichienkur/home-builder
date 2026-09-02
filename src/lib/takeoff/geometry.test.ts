import { describe, expect, it } from 'vitest';
import {
  calibrateScaleFromPoints,
  formatFtIn,
  measureObject,
  parseLengthFt,
  polygonAreaPx2,
  snapPoint,
} from './geometry';
import { takeoffToCadPlate } from './toCadPlate';
import type { TakeoffProject } from './types';

describe('takeoff geometry', () => {
  it('parses architectural lengths', () => {
    expect(parseLengthFt("12'-6\"")).toBeCloseTo(12.5);
    expect(parseLengthFt('12')).toBe(12);
    expect(parseLengthFt('18"')).toBe(1.5);
    expect(parseLengthFt('nope')).toBeNull();
  });

  it('calibrates pixelsPerFoot from two points', () => {
    const scale = calibrateScaleFromPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(scale.pixelsPerFoot).toBeCloseTo(10);
    expect(formatFtIn(12.5)).toBe(`12'-6"`);
  });

  it('measures wall length and room area', () => {
    const scale = { pixelsPerFoot: 10 };
    const wall = measureObject(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      'wall',
      scale,
    );
    expect(wall.lengthFt).toBeCloseTo(10);
    const room = measureObject(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 0, y: 50 },
      ],
      'room',
      scale,
    );
    expect(room.areaSqFt).toBeCloseTo(50);
    expect(polygonAreaPx2([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ])).toBeCloseTo(100);
  });

  it('snaps ortho and to candidates', () => {
    const ortho = snapPoint({ x: 40, y: 3 }, [], { x: 0, y: 0 });
    expect(ortho).toEqual({ x: 40, y: 0 });
    const snapped = snapPoint({ x: 52, y: 51 }, [{ x: 50, y: 50 }], null);
    expect(snapped).toEqual({ x: 50, y: 50 });
  });
});

describe('takeoffToCadPlate', () => {
  it('flips Y and builds wall centerlines', () => {
    const project: TakeoffProject = {
      id: 'p1',
      name: 'Demo',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      pdfUrl: 'blob:x',
      sourceFileName: 'demo.pdf',
      pages: [
        {
          id: 'page-1',
          pageIndex: 0,
          name: 'Floor',
          widthPt: 200,
          heightPt: 100,
          scale: { pixelsPerFoot: 10 },
        },
      ],
      objects: [
        {
          id: 'w1',
          pageId: 'page-1',
          kind: 'wall',
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
          lengthFt: 10,
          source: 'manual',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      warnings: [],
    };
    const plate = takeoffToCadPlate(project, project.pages[0]!, project.objects);
    expect(plate.wallCenterlines).toHaveLength(1);
    expect(plate.wallCenterlines[0]!.x1).toBeCloseTo(0);
    // y=0 at top of PDF → y = heightFt at bottom of plan after flip
    expect(plate.wallCenterlines[0]!.y1).toBeCloseTo(10);
    expect(plate.sheetSource).toBe('pdf');
  });
});
