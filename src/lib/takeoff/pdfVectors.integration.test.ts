import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractPdfPageVectors, pickPolylineNearPoint } from './pdfVectors';

describe('pdfVectors Stillwater integration', () => {
  it('extracts stroked lines from floor sheet and picks near a segment', async () => {
    const file = resolve('public/plan-sheets/stillwater-183/plan-set.pdf');
    if (!existsSync(file)) return;
    const pdfUrl = pathToFileURL(file).href;
    const vectors = await extractPdfPageVectors(pdfUrl, 1); // page 2 = floor
    expect(vectors.polylines.length).toBeGreaterThan(500);
    expect(vectors.segments.length).toBeGreaterThan(1000);
    expect(vectors.wallWidthHint).toBeGreaterThan(0);
    const walls = vectors.polylines.filter((p) => p.role === 'wall');
    const dims = vectors.polylines.filter((p) => p.role === 'dimension');
    expect(walls.length).toBeGreaterThan(50);
    expect(dims.length).toBeGreaterThan(50);
    const mid = vectors.segments.find((s) => s.role === 'wall' && s.lengthPx > 40);
    expect(mid).toBeTruthy();
    const click = {
      x: (mid!.a.x + mid!.b.x) / 2,
      y: (mid!.a.y + mid!.b.y) / 2,
    };
    const hit = pickPolylineNearPoint(vectors, click, {
      maxDistPx: 8,
      preferWalls: true,
      excludeDimensions: true,
    });
    expect(hit).not.toBeNull();
    expect(hit!.role).toBe('wall');
    expect(hit!.points.length).toBeGreaterThanOrEqual(2);
    expect(hit!.lengthPx).toBeGreaterThan(5);
  }, 30_000);
});
