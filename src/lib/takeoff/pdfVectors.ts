/**
 * Extract stroked vector paths from a PDF page (pdf.js operator list)
 * and pick full polylines near a click / drag — PlanSwift-style line grab.
 *
 * Prefer thick structural strokes (walls) over thin dimension / annotation lines.
 */
import * as pdfjs from 'pdfjs-dist';
import type { TakeoffPointPx } from './types';

export type PdfStrokeRole = 'wall' | 'dimension' | 'opening' | 'other';

export type PdfVectorSegment = {
  a: TakeoffPointPx;
  b: TakeoffPointPx;
  polylineId: number;
  lengthPx: number;
  strokeWidth: number;
  role: PdfStrokeRole;
};

export type PdfVectorPolyline = {
  id: number;
  points: TakeoffPointPx[];
  lengthPx: number;
  /** PDF line width scaled roughly into page pixels. */
  strokeWidth: number;
  role: PdfStrokeRole;
  /** True when path used curve operators (door swings, etc.). */
  hasCurves: boolean;
};

export type PdfPageVectors = {
  pageIndex: number;
  widthPt: number;
  heightPt: number;
  polylines: PdfVectorPolyline[];
  segments: PdfVectorSegment[];
  /** Median non-zero stroke width — used as wall thickness cue. */
  wallWidthHint: number;
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

function ctmScale(m: Mat) {
  return Math.hypot(m[0], m[1]) || 1;
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

function segmentDir(a: TakeoffPointPx, b: TakeoffPointPx): TakeoffPointPx | null {
  return direction(a, b);
}

function classifyPolyline(input: {
  lengthPx: number;
  strokeWidth: number;
  hasCurves: boolean;
  wallWidthHint: number;
  points: TakeoffPointPx[];
}): PdfStrokeRole {
  const { lengthPx, strokeWidth, hasCurves, wallWidthHint, points } = input;
  // Door swings / arcs
  if (hasCurves && lengthPx > 12 && lengthPx < 180) return 'opening';

  const thick = wallWidthHint > 0 ? strokeWidth >= wallWidthHint * 0.5 : strokeWidth >= 0.35;
  if (thick && lengthPx >= 10) return 'wall';

  // Tiny ticks at dimension ends
  if (strokeWidth < 0.2 && lengthPx < 10) return 'dimension';

  // Short thin axis-aligned runs — typical dimension strings / extension ticks
  if (strokeWidth < 0.2 && lengthPx < 55 && points.length <= 3) {
    const d = direction(points[0]!, points[points.length - 1]!);
    if (d && (Math.abs(d.x) > 0.95 || Math.abs(d.y) > 0.95)) return 'dimension';
  }

  // Thin but long — often outer dimension strings; keep as dimension so wall pick can ignore
  if (strokeWidth < 0.15 && lengthPx >= 20) return 'dimension';

  return 'other';
}

function assignRoles(polylines: PdfVectorPolyline[], wallWidthHint: number) {
  for (const poly of polylines) {
    poly.role = classifyPolyline({
      lengthPx: poly.lengthPx,
      strokeWidth: poly.strokeWidth,
      hasCurves: poly.hasCurves,
      wallWidthHint,
      points: poly.points,
    });
  }
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
    let lineWidth = 1;
    const polylines: PdfVectorPolyline[] = [];
    const segments: PdfVectorSegment[] = [];
    const strokeWidths: number[] = [];
    let nextId = 0;

    const toView = (x: number, y: number): TakeoffPointPx => {
      const [vx, vy] = viewport.convertToViewportPoint(x, y);
      return { x: vx, y: vy };
    };

    const flushPoints = (raw: TakeoffPointPx[], strokeWidth: number, hasCurves: boolean) => {
      if (raw.length < 2) return;
      const points: TakeoffPointPx[] = [raw[0]!];
      for (let i = 1; i < raw.length; i += 1) {
        const p = raw[i]!;
        const prev = points[points.length - 1]!;
        if (!nearlySame(prev, p, 0.05)) points.push(p);
      }
      if (points.length < 2) return;
      const lengthPx = polylineLength(points);
      if (lengthPx < 1.5) return;
      const id = nextId++;
      const poly: PdfVectorPolyline = {
        id,
        points,
        lengthPx,
        strokeWidth,
        role: 'other',
        hasCurves,
      };
      polylines.push(poly);
      if (strokeWidth > 0.05) strokeWidths.push(strokeWidth);
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1]!;
        const b = points[i]!;
        segments.push({
          a,
          b,
          polylineId: id,
          lengthPx: dist(a, b),
          strokeWidth,
          role: 'other',
        });
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
      if (fn === OPS.setLineWidth) {
        lineWidth = Number(args[0]) || 0;
        continue;
      }

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
        let hasCurves = false;
        const pts: TakeoffPointPx[] = [];
        const strokeWidth = Math.abs(lineWidth * ctmScale(ctm));

        const pushPt = (x: number, y: number) => {
          const [ax, ay] = applyMat(ctm, x, y);
          pts.push(toView(ax, ay));
        };

        for (const op of pathOps) {
          if (op === OPS.moveTo) {
            if (pts.length >= 2) flushPoints(pts, strokeWidth, hasCurves);
            pts.length = 0;
            hasCurves = false;
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
            hasCurves = true;
            ci += 4;
            px = coords[ci++]!;
            py = coords[ci++]!;
            if (started) pushPt(px, py);
          } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
            hasCurves = true;
            ci += 2;
            px = coords[ci++]!;
            py = coords[ci++]!;
            if (started) pushPt(px, py);
          } else if (op === OPS.rectangle) {
            if (pts.length >= 2) flushPoints(pts, strokeWidth, hasCurves);
            pts.length = 0;
            hasCurves = false;
            const x = coords[ci++]!;
            const y = coords[ci++]!;
            const w = coords[ci++]!;
            const h = coords[ci++]!;
            // Filled/stroked squares used as posts — skip tiny boxes
            if (Math.abs(w) > 2 || Math.abs(h) > 2) {
              pushPt(x, y);
              pushPt(x + w, y);
              pushPt(x + w, y + h);
              pushPt(x, y + h);
              pushPt(x, y);
              flushPoints(pts, strokeWidth, false);
            }
            pts.length = 0;
            started = false;
          } else {
            pts.length = 0;
            started = false;
            break;
          }
        }
        if (pts.length >= 2) flushPoints(pts, strokeWidth, hasCurves);
      }
    }

    strokeWidths.sort((a, b) => a - b);
    const wallWidthHint =
      strokeWidths.length > 0 ? strokeWidths[Math.floor(strokeWidths.length * 0.5)]! : 0.5;

    assignRoles(polylines, wallWidthHint);
    for (const seg of segments) {
      const poly = polylines[seg.polylineId];
      if (poly) seg.role = poly.role;
    }

    return {
      pageIndex,
      widthPt: viewport.width,
      heightPt: viewport.height,
      polylines,
      segments,
      wallWidthHint,
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
 * Prefer same-role / thicker neighbors so dimension strings don't glue onto walls.
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
  const preferRole = seed.role;

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

    const candidates = all
      .filter((poly) => !used.has(poly.id) && poly.points.length >= 2)
      .filter((poly) => {
        if (preferRole === 'wall') return poly.role === 'wall' || poly.strokeWidth >= seed.strokeWidth * 0.5;
        if (preferRole === 'dimension') return poly.role !== 'wall';
        return poly.role !== 'dimension';
      });

    for (const poly of candidates) {
      const a = poly.points[0]!;
      const b = poly.points[poly.points.length - 1]!;
      const dPoly = direction(a, b);
      if (!dPoly) continue;

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
  role: PdfStrokeRole;
  strokeWidth: number;
};

export type PickOptions = {
  maxDistPx?: number;
  minLengthPx?: number;
  /** Prefer structural walls; ignore dimension strings. Default true for linear wall takeoff. */
  preferWalls?: boolean;
  /** Exclude dimension strokes from consideration. Default true when preferWalls. */
  excludeDimensions?: boolean;
  /** Optional drag direction to bias which collinear wall is chosen. */
  dragDir?: TakeoffPointPx | null;
  /** Prefer openings (door swings / arcs) — for door count. */
  preferOpenings?: boolean;
};

function scoreSegment(
  seg: PdfVectorSegment,
  poly: PdfVectorPolyline,
  distPx: number,
  options: PickOptions,
): number {
  let score = -distPx * 12;
  score += poly.strokeWidth * 80;
  score += Math.min(poly.lengthPx, 400) * 0.04;

  if (poly.role === 'wall') score += 40;
  if (poly.role === 'dimension') score -= 120;
  if (poly.role === 'opening') score += options.preferOpenings ? 60 : -10;
  if (options.preferOpenings && poly.hasCurves) score += 30;

  if (options.dragDir) {
    const d = segmentDir(seg.a, seg.b);
    if (d) {
      const align = Math.abs(d.x * options.dragDir.x + d.y * options.dragDir.y);
      score += align * 35;
    }
  }
  return score;
}

/**
 * Find the best stroked polyline near a click and return the full (possibly extended) run.
 */
export function pickPolylineNearPoint(
  vectors: PdfPageVectors,
  point: TakeoffPointPx,
  options: PickOptions = {},
): VectorPickResult | null {
  const maxDistPx = options.maxDistPx ?? 14;
  const minLengthPx = options.minLengthPx ?? 6;
  const preferWalls = options.preferWalls !== false;
  const excludeDimensions = options.excludeDimensions ?? preferWalls;

  let best: { polylineId: number; dist: number; score: number } | null = null;

  for (const seg of vectors.segments) {
    const poly = vectors.polylines[seg.polylineId];
    if (!poly || poly.lengthPx < minLengthPx) continue;
    if (excludeDimensions && poly.role === 'dimension') continue;
    if (preferWalls && !options.preferOpenings && poly.role === 'opening') continue;

    const { dist: d } = distPointToSegment(point, seg.a, seg.b);
    if (d > maxDistPx) continue;

    // If walls exist nearby, ignore thin annotation strokes even if tagged "other".
    if (preferWalls && poly.role !== 'wall' && poly.strokeWidth < vectors.wallWidthHint * 0.35) {
      // Allow only if nothing better — scored much lower.
    }

    const score = scoreSegment(seg, poly, d, options);
    if (!best || score > best.score) {
      best = { polylineId: seg.polylineId, dist: d, score };
    }
  }

  // Second pass: if preferWalls and we only hit thin "other", try again allowing slightly farther walls.
  if (preferWalls && best) {
    const hit = vectors.polylines[best.polylineId];
    if (hit && hit.role !== 'wall') {
      let wallBest: typeof best | null = null;
      for (const seg of vectors.segments) {
        const poly = vectors.polylines[seg.polylineId];
        if (!poly || poly.role !== 'wall' || poly.lengthPx < minLengthPx) continue;
        const { dist: d } = distPointToSegment(point, seg.a, seg.b);
        if (d > maxDistPx * 1.6) continue;
        const score = scoreSegment(seg, poly, d, options) + 25;
        if (!wallBest || score > wallBest.score) {
          wallBest = { polylineId: seg.polylineId, dist: d, score };
        }
      }
      if (wallBest) best = wallBest;
    }
  }

  if (!best) return null;
  const seed = vectors.polylines[best.polylineId];
  if (!seed) return null;
  const pool =
    preferWalls && seed.role === 'wall'
      ? vectors.polylines.filter((p) => p.role === 'wall' || p.strokeWidth >= seed.strokeWidth * 0.5)
      : vectors.polylines.filter((p) => p.role !== 'dimension');
  const points = extendCollinearPolyline(seed, pool);
  return {
    points,
    distancePx: best.dist,
    polylineId: seed.id,
    lengthPx: polylineLength(points),
    role: seed.role,
    strokeWidth: seed.strokeWidth,
  };
}

/**
 * PlanSwift-style: drag from start→end, lock onto the best wall along the path.
 */
export function pickPolylineAlongDrag(
  vectors: PdfPageVectors,
  start: TakeoffPointPx,
  end: TakeoffPointPx,
  options: PickOptions = {},
): VectorPickResult | null {
  const dragLen = dist(start, end);
  const dragDir = direction(start, end);
  if (!dragDir || dragLen < 3) {
    return pickPolylineNearPoint(vectors, start, options);
  }

  // Sample along the drag and majority-vote the best polyline.
  const samples = Math.min(12, Math.max(3, Math.ceil(dragLen / 8)));
  const votes = new Map<number, { score: number; dist: number }>();
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const p = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    const hit = pickPolylineNearPoint(vectors, p, {
      ...options,
      dragDir,
      maxDistPx: (options.maxDistPx ?? 14) + 4,
    });
    if (!hit) continue;
    const prev = votes.get(hit.polylineId) ?? { score: 0, dist: hit.distancePx };
    votes.set(hit.polylineId, {
      score: prev.score + 1 + hit.strokeWidth,
      dist: Math.min(prev.dist, hit.distancePx),
    });
  }

  let bestId: number | null = null;
  let bestScore = -Infinity;
  for (const [id, v] of votes) {
    if (v.score > bestScore) {
      bestScore = v.score;
      bestId = id;
    }
  }
  if (bestId == null) return pickPolylineNearPoint(vectors, end, { ...options, dragDir });

  const seed = vectors.polylines[bestId];
  if (!seed) return null;
  const pool =
    seed.role === 'wall'
      ? vectors.polylines.filter((p) => p.role === 'wall' || p.strokeWidth >= seed.strokeWidth * 0.5)
      : vectors.polylines.filter((p) => p.role !== 'dimension');
  const points = extendCollinearPolyline(seed, pool);
  return {
    points,
    distancePx: votes.get(bestId)?.dist ?? 0,
    polylineId: seed.id,
    lengthPx: polylineLength(points),
    role: seed.role,
    strokeWidth: seed.strokeWidth,
  };
}

export async function pickPdfLineAtPoint(
  pdfUrl: string,
  pageIndex: number,
  point: TakeoffPointPx,
  options?: PickOptions,
): Promise<VectorPickResult | null> {
  const vectors = await extractPdfPageVectors(pdfUrl, pageIndex);
  return pickPolylineNearPoint(vectors, point, options);
}

export async function pickPdfLineAlongDrag(
  pdfUrl: string,
  pageIndex: number,
  start: TakeoffPointPx,
  end: TakeoffPointPx,
  options?: PickOptions,
): Promise<VectorPickResult | null> {
  const vectors = await extractPdfPageVectors(pdfUrl, pageIndex);
  return pickPolylineAlongDrag(vectors, start, end, options);
}

/** Pick a door/opening cue near a click (arcs / short opening strokes). */
export async function pickPdfOpeningAtPoint(
  pdfUrl: string,
  pageIndex: number,
  point: TakeoffPointPx,
): Promise<VectorPickResult | null> {
  const vectors = await extractPdfPageVectors(pdfUrl, pageIndex);
  return pickPolylineNearPoint(vectors, point, {
    preferWalls: false,
    excludeDimensions: true,
    preferOpenings: true,
    maxDistPx: 28,
    minLengthPx: 8,
  });
}
