/**
 * Extract stroked vector paths from a PDF page (pdf.js operator list)
 * and pick full polylines near a click — PlanSwift-style line grab.
 */
import * as pdfjs from 'pdfjs-dist';
import type { TakeoffPointPx } from './types';

export type PdfVectorSegment = {
  a: TakeoffPointPx;
  b: TakeoffPointPx;
  polylineId: number;
};

export type PdfVectorPolyline = {
  id: number;
  points: TakeoffPointPx[];
  lengthPx: number;
};

export type PdfPageVectors = {
  pageIndex: number;
  widthPt: number;
  heightPt: number;
  polylines: PdfVectorPolyline[];
  segments: PdfVectorSegment[];
};

type Mat = [number, number, number, number, number, number];

const cache = new Map<string, Promise<PdfPageVectors>>();

function cacheKey(pdfUrl: string, pageIndex: number) {
  return `${pdfUrl}::${pageIndex}`;
}

export function clearPdfVectorCache(pdfUrl?: string) {
  if (!pdfUrl) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${pdfUrl}::`)) cache.delete(key);
  }
}

function multiply(m: Mat, a: Mat): Mat {
  return [
    m[0] * a[0] + m[2] * a[1],
    m[1] * a[0] + m[3] * a[1],
    m[0] * a[2] + m[2] * a[3],
    m[1] * a[2] + m[3] * a[3],
    m[0] * a[4] + m[2] * a[5] + m[4],
    m[1] * a[4] + m[3] * a[5] + m[5],
  ];
}

function applyMat(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function dist(a: TakeoffPointPx, b: TakeoffPointPx) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function polylineLength(points: TakeoffPointPx[]) {
  let n = 0;
  for (let i = 1; i < points.length; i += 1) n += dist(points[i - 1]!, points[i]!);
  return n;
}

/** Distance from point P to segment AB, and closest point. */
export function distPointToSegment(
  p: TakeoffPointPx,
  a: TakeoffPointPx,
  b: TakeoffPointPx,
): { dist: number; closest: TakeoffPointPx; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) {
    return { dist: dist(p, a), closest: a, t: 0 };
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const closest = { x: a.x + t * dx, y: a.y + t * dy };
  return { dist: dist(p, closest), closest, t };
}

function nearlySame(a: TakeoffPointPx, b: TakeoffPointPx, eps: number) {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

function direction(a: TakeoffPointPx, b: TakeoffPointPx): TakeoffPointPx | null {
  const len = dist(a, b);
  if (len < 1e-6) return null;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

function collinearDirs(d1: TakeoffPointPx, d2: TakeoffPointPx, cosMin = 0.98) {
  const dot = Math.abs(d1.x * d2.x + d1.y * d2.y);
  return dot >= cosMin;
}

/**
 * Parse stroked paths from a page into viewport (scale=1) polylines.
 */
export async function extractPdfPageVectors(
  pdfUrl: string,
  pageIndex: number,
): Promise<PdfPageVectors> {
  const key = cacheKey(pdfUrl, pageIndex);
  const existing = cache.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const loadingTask =
      typeof pdfUrl === 'string' && pdfUrl.startsWith('file:')
        ? pdfjs.getDocument({ url: pdfUrl })
        : pdfUrl.startsWith('blob:') || pdfUrl.startsWith('http') || pdfUrl.startsWith('/')
          ? pdfjs.getDocument(pdfUrl)
          : pdfjs.getDocument({ url: pdfUrl });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1 });
    const opList = await page.getOperatorList();
    const OPS = pdfjs.OPS;

    let ctm: Mat = [1, 0, 0, 1, 0, 0];
    const stack: Mat[] = [];
    const polylines: PdfVectorPolyline[] = [];
    const segments: PdfVectorSegment[] = [];
    let nextId = 0;

    const toView = (x: number, y: number): TakeoffPointPx => {
      const [vx, vy] = viewport.convertToViewportPoint(x, y);
      return { x: vx, y: vy };
    };

    const flushPoints = (raw: TakeoffPointPx[]) => {
      if (raw.length < 2) return;
      // Deduplicate consecutive duplicates
      const points: TakeoffPointPx[] = [raw[0]!];
      for (let i = 1; i < raw.length; i += 1) {
        const p = raw[i]!;
        const prev = points[points.length - 1]!;
        if (!nearlySame(prev, p, 0.05)) points.push(p);
      }
      if (points.length < 2) return;
      const lengthPx = polylineLength(points);
      if (lengthPx < 2) return;
      const id = nextId++;
      polylines.push({ id, points, lengthPx });
      for (let i = 1; i < points.length; i += 1) {
        segments.push({ a: points[i - 1]!, b: points[i]!, polylineId: id });
      }
    };

    const paintOps = new Set([
      OPS.stroke,
      OPS.closeStroke,
      OPS.fillStroke,
      OPS.eoFillStroke,
      OPS.closeFillStroke,
      OPS.closeEOFillStroke,
    ]);

    for (let i = 0; i < opList.fnArray.length; i += 1) {
      const fn = opList.fnArray[i]!;
      const args = opList.argsArray[i] as unknown[];

      if (fn === OPS.save) {
        stack.push(ctm.slice() as Mat);
        continue;
      }
      if (fn === OPS.restore) {
        ctm = stack.pop() ?? ([1, 0, 0, 1, 0, 0] as Mat);
        continue;
      }
      if (fn === OPS.transform) {
        ctm = multiply(ctm, args as Mat);
        continue;
      }

      // Modern pdf.js batches path construction.
      if (fn === (OPS as { constructPath?: number }).constructPath) {
        const next = opList.fnArray[i + 1];
        if (next == null || !paintOps.has(next)) continue;
        const pathOps = args[0] as number[];
        const coords = args[1] as number[];
        let ci = 0;
        let px = 0;
        let py = 0;
        let sx = 0;
        let sy = 0;
        let started = false;
        const pts: TakeoffPointPx[] = [];

        const pushPt = (x: number, y: number) => {
          const [ax, ay] = applyMat(ctm, x, y);
          pts.push(toView(ax, ay));
        };

        for (const op of pathOps) {
          if (op === OPS.moveTo) {
            if (pts.length >= 2) flushPoints(pts);
            pts.length = 0;
            sx = px = coords[ci++]!;
            sy = py = coords[ci++]!;
            started = true;
            pushPt(px, py);
          } else if (op === OPS.lineTo) {
            px = coords[ci++]!;
            py = coords[ci++]!;
            if (started) pushPt(px, py);
          } else if (op === OPS.closePath) {
            if (started) pushPt(sx, sy);
          } else if (op === OPS.curveTo) {
            // Approximate cubic with end point (walls are almost always lines).
            ci += 4;
            px = coords[ci++]!;
            py = coords[ci++]!;
            if (started) pushPt(px, py);
          } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
            ci += 2;
            px = coords[ci++]!;
            py = coords[ci++]!;
            if (started) pushPt(px, py);
          } else if (op === OPS.rectangle) {
            if (pts.length >= 2) flushPoints(pts);
            pts.length = 0;
            const x = coords[ci++]!;
            const y = coords[ci++]!;
            const w = coords[ci++]!;
            const h = coords[ci++]!;
            pushPt(x, y);
            pushPt(x + w, y);
            pushPt(x + w, y + h);
            pushPt(x, y + h);
            pushPt(x, y);
            flushPoints(pts);
            pts.length = 0;
            started = false;
          } else {
            // Unknown — abort this path chunk.
            pts.length = 0;
            started = false;
            break;
          }
        }
        if (pts.length >= 2) flushPoints(pts);
        continue;
      }

      // Legacy streamed path ops (older pdf.js).
      // Ignored if constructPath is present for this build.
    }

    return {
      pageIndex,
      widthPt: viewport.width,
      heightPt: viewport.height,
      polylines,
      segments,
    };
  })();

  cache.set(key, promise);
  try {
    return await promise;
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

/**
 * Extend a seed polyline by chaining collinear neighbors that share endpoints.
 */
export function extendCollinearPolyline(
  seed: PdfVectorPolyline,
  all: PdfVectorPolyline[],
  options?: { joinEps?: number; cosMin?: number; maxPieces?: number },
): TakeoffPointPx[] {
  const joinEps = options?.joinEps ?? 1.5;
  const cosMin = options?.cosMin ?? 0.985;
  const maxPieces = options?.maxPieces ?? 40;

  const used = new Set<number>([seed.id]);
  let points = seed.points.map((p) => ({ ...p }));

  const endDir = (pts: TakeoffPointPx[], atStart: boolean): TakeoffPointPx | null => {
    if (pts.length < 2) return null;
    return atStart
      ? direction(pts[1]!, pts[0]!)
      : direction(pts[pts.length - 2]!, pts[pts.length - 1]!);
  };

  let grew = true;
  let pieces = 1;
  while (grew && pieces < maxPieces) {
    grew = false;
    const start = points[0]!;
    const end = points[points.length - 1]!;
    const dirStart = endDir(points, true);
    const dirEnd = endDir(points, false);

    for (const poly of all) {
      if (used.has(poly.id) || poly.points.length < 2) continue;
      const a = poly.points[0]!;
      const b = poly.points[poly.points.length - 1]!;
      const dPoly = direction(a, b);
      if (!dPoly) continue;

      // Attach to end
      if (dirEnd && nearlySame(end, a, joinEps) && collinearDirs(dirEnd, dPoly, cosMin)) {
        points = points.concat(poly.points.slice(1).map((p) => ({ ...p })));
        used.add(poly.id);
        grew = true;
        pieces += 1;
        break;
      }
      if (dirEnd && nearlySame(end, b, joinEps) && collinearDirs(dirEnd, dPoly, cosMin)) {
        points = points.concat(poly.points.slice(0, -1).reverse().map((p) => ({ ...p })));
        used.add(poly.id);
        grew = true;
        pieces += 1;
        break;
      }
      // Attach to start
      if (dirStart && nearlySame(start, b, joinEps) && collinearDirs(dirStart, dPoly, cosMin)) {
        points = poly.points.slice(0, -1).map((p) => ({ ...p })).concat(points);
        used.add(poly.id);
        grew = true;
        pieces += 1;
        break;
      }
      if (dirStart && nearlySame(start, a, joinEps) && collinearDirs(dirStart, dPoly, cosMin)) {
        points = poly.points.slice(1).reverse().map((p) => ({ ...p })).concat(points);
        used.add(poly.id);
        grew = true;
        pieces += 1;
        break;
      }
    }
  }

  return points;
}

export type VectorPickResult = {
  points: TakeoffPointPx[];
  distancePx: number;
  polylineId: number;
  lengthPx: number;
};

/**
 * Find the best stroked polyline near a click and return the full (possibly extended) run.
 */
export function pickPolylineNearPoint(
  vectors: PdfPageVectors,
  point: TakeoffPointPx,
  options?: { maxDistPx?: number; minLengthPx?: number },
): VectorPickResult | null {
  const maxDistPx = options?.maxDistPx ?? 10;
  const minLengthPx = options?.minLengthPx ?? 8;

  let best: { polylineId: number; dist: number; lengthPx: number } | null = null;

  for (const seg of vectors.segments) {
    const poly = vectors.polylines[seg.polylineId];
    if (!poly || poly.lengthPx < minLengthPx) continue;
    const { dist: d } = distPointToSegment(point, seg.a, seg.b);
    if (d > maxDistPx) continue;
    if (
      !best ||
      d < best.dist - 0.35 ||
      (Math.abs(d - best.dist) <= 0.35 && poly.lengthPx > best.lengthPx)
    ) {
      best = { polylineId: seg.polylineId, dist: d, lengthPx: poly.lengthPx };
    }
  }

  if (!best) return null;
  const seed = vectors.polylines[best.polylineId];
  if (!seed) return null;
  const points = extendCollinearPolyline(seed, vectors.polylines);
  return {
    points,
    distancePx: best.dist,
    polylineId: seed.id,
    lengthPx: polylineLength(points),
  };
}

export async function pickPdfLineAtPoint(
  pdfUrl: string,
  pageIndex: number,
  point: TakeoffPointPx,
  options?: { maxDistPx?: number; minLengthPx?: number },
): Promise<VectorPickResult | null> {
  const vectors = await extractPdfPageVectors(pdfUrl, pageIndex);
  return pickPolylineNearPoint(vectors, point, options);
}
