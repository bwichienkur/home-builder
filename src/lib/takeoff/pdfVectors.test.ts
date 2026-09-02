import { describe, expect, it } from 'vitest';
import {
  distPointToSegment,
  extendCollinearPolyline,
  pickPolylineAlongDrag,
  pickPolylineNearPoint,
  type PdfPageVectors,
  type PdfVectorPolyline,
} from './pdfVectors';

function pageFromPolys(
  polys: {
    points: { x: number; y: number }[];
    strokeWidth?: number;
    role?: PdfVectorPolyline['role'];
    hasCurves?: boolean;
  }[],
): PdfPageVectors {
  const polylines: PdfVectorPolyline[] = [];
  const segments: PdfPageVectors['segments'] = [];
  polys.forEach((p, id) => {
    let lengthPx = 0;
    for (let i = 1; i < p.points.length; i += 1) {
      const a = p.points[i - 1]!;
      const b = p.points[i]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      lengthPx += len;
      segments.push({
        a,
        b,
        polylineId: id,
        lengthPx: len,
        strokeWidth: p.strokeWidth ?? 0.7,
        role: p.role ?? 'wall',
      });
    }
    polylines.push({
      id,
      points: p.points,
      lengthPx,
      strokeWidth: p.strokeWidth ?? 0.7,
      role: p.role ?? 'wall',
      hasCurves: p.hasCurves ?? false,
    });
  });
  return {
    pageIndex: 0,
    widthPt: 1000,
    heightPt: 1000,
    polylines,
    segments,
    wallWidthHint: 0.7,
  };
}

describe('pdfVectors pick', () => {
  it('measures distance to segment', () => {
    const { dist, closest } = distPointToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(dist).toBeCloseTo(3, 5);
    expect(closest.x).toBeCloseTo(5, 5);
    expect(closest.y).toBeCloseTo(0, 5);
  });

  it('picks the full polyline containing the nearest segment', () => {
    const vectors = pageFromPolys([
      {
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 100, y: 0 },
        ],
        role: 'wall',
        strokeWidth: 0.7,
      },
      {
        points: [
          { x: 0, y: 40 },
          { x: 20, y: 40 },
        ],
        role: 'wall',
        strokeWidth: 0.7,
      },
    ]);
    const hit = pickPolylineNearPoint(vectors, { x: 72, y: 2 }, { maxDistPx: 8 });
    expect(hit).not.toBeNull();
    expect(hit!.points).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(hit!.lengthPx).toBeCloseTo(100, 5);
  });

  it('prefers thick wall over nearby thin dimension line', () => {
    const vectors = pageFromPolys([
      {
        // dimension string parallel to wall
        points: [
          { x: 0, y: 4 },
          { x: 100, y: 4 },
        ],
        role: 'dimension',
        strokeWidth: 0,
      },
      {
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        role: 'wall',
        strokeWidth: 0.7,
      },
    ]);
    const hit = pickPolylineNearPoint(vectors, { x: 50, y: 3 }, { maxDistPx: 8, preferWalls: true });
    expect(hit).not.toBeNull();
    expect(hit!.role).toBe('wall');
    expect(hit!.points[0]).toEqual({ x: 0, y: 0 });
  });

  it('extends collinear neighbor polylines', () => {
    const a: PdfVectorPolyline = {
      id: 0,
      points: [
        { x: 0, y: 10 },
        { x: 40, y: 10 },
      ],
      lengthPx: 40,
      strokeWidth: 0.7,
      role: 'wall',
      hasCurves: false,
    };
    const b: PdfVectorPolyline = {
      id: 1,
      points: [
        { x: 40, y: 10 },
        { x: 90, y: 10 },
      ],
      lengthPx: 50,
      strokeWidth: 0.7,
      role: 'wall',
      hasCurves: false,
    };
    const extended = extendCollinearPolyline(a, [a, b]);
    expect(extended).toEqual([
      { x: 0, y: 10 },
      { x: 40, y: 10 },
      { x: 90, y: 10 },
    ]);
  });

  it('drag along a wall locks onto that wall run', () => {
    const vectors = pageFromPolys([
      {
        points: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
        ],
        role: 'wall',
        strokeWidth: 0.7,
      },
      {
        points: [
          { x: 0, y: 30 },
          { x: 200, y: 30 },
        ],
        role: 'dimension',
        strokeWidth: 0,
      },
    ]);
    const hit = pickPolylineAlongDrag(
      vectors,
      { x: 10, y: 1 },
      { x: 150, y: 2 },
      { preferWalls: true },
    );
    expect(hit).not.toBeNull();
    expect(hit!.role).toBe('wall');
    expect(hit!.lengthPx).toBeCloseTo(200, 5);
  });

  it('returns null when click is far from vectors', () => {
    const vectors = pageFromPolys([
      {
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
        ],
      },
    ]);
    expect(pickPolylineNearPoint(vectors, { x: 10, y: 40 }, { maxDistPx: 8 })).toBeNull();
  });
});
