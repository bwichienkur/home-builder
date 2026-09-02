import { describe, expect, it } from 'vitest';
import {
  distPointToSegment,
  extendCollinearPolyline,
  pickPolylineNearPoint,
  type PdfPageVectors,
  type PdfVectorPolyline,
} from './pdfVectors';

function pageFromPolys(polys: { points: { x: number; y: number }[] }[]): PdfPageVectors {
  const polylines: PdfVectorPolyline[] = [];
  const segments: PdfPageVectors['segments'] = [];
  polys.forEach((p, id) => {
    let lengthPx = 0;
    for (let i = 1; i < p.points.length; i += 1) {
      const a = p.points[i - 1]!;
      const b = p.points[i]!;
      lengthPx += Math.hypot(b.x - a.x, b.y - a.y);
      segments.push({ a, b, polylineId: id });
    }
    polylines.push({ id, points: p.points, lengthPx });
  });
  return { pageIndex: 0, widthPt: 1000, heightPt: 1000, polylines, segments };
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
      },
      {
        points: [
          { x: 0, y: 40 },
          { x: 20, y: 40 },
        ],
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

  it('extends collinear neighbor polylines', () => {
    const a: PdfVectorPolyline = {
      id: 0,
      points: [
        { x: 0, y: 10 },
        { x: 40, y: 10 },
      ],
      lengthPx: 40,
    };
    const b: PdfVectorPolyline = {
      id: 1,
      points: [
        { x: 40, y: 10 },
        { x: 90, y: 10 },
      ],
      lengthPx: 50,
    };
    const extended = extendCollinearPolyline(a, [a, b]);
    expect(extended).toEqual([
      { x: 0, y: 10 },
      { x: 40, y: 10 },
      { x: 90, y: 10 },
    ]);
  });

  it('prefers longer line when two are equally close', () => {
    const vectors = pageFromPolys([
      {
        points: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
        ],
      },
      {
        points: [
          { x: 0, y: 0.2 },
          { x: 200, y: 0.2 },
        ],
      },
    ]);
    const hit = pickPolylineNearPoint(vectors, { x: 10, y: 0.1 }, { maxDistPx: 5, minLengthPx: 5 });
    expect(hit).not.toBeNull();
    expect(hit!.lengthPx).toBeGreaterThan(100);
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
