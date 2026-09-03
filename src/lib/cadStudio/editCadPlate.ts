import { classifyLayerKind, classifySegmentRole } from './classifyLayers';
import type {
  CadBoundsFt,
  CadFixtureHintFt,
  CadFixtureKind,
  CadLabelFt,
  CadLayerInfo,
  CadOpeningHintFt,
  CadPlate,
  CadSegmentFt,
  CadSegmentRole,
  CadWallCenterlineFt,
} from './types';

export type CadEditTool = 'select' | 'wall' | 'opening' | 'fixture' | 'delete';

export type CadPlateSelection =
  | { kind: 'wall'; index: number }
  | { kind: 'label'; index: number }
  | { kind: 'fixture'; index: number }
  | { kind: 'opening'; index: number }
  | { kind: 'segment'; index: number };

export function segLengthFt(s: { x1: number; y1: number; x2: number; y2: number }): number {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
}

/** Architectural length label e.g. 12'-6" or 8'-0". */
export function formatWallLengthFt(ft: number): string {
  const sign = ft < 0 ? '-' : '';
  const abs = Math.abs(ft);
  const whole = Math.floor(abs);
  const inches = Math.round((abs - whole) * 12);
  if (inches >= 12) return `${sign}${whole + 1}'-0"`;
  if (inches === 0) return `${sign}${whole}'-0"`;
  return `${sign}${whole}'-${inches}"`;
}

function boundsOfPoints(pts: { x: number; y: number }[]): CadBoundsFt {
  if (!pts.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

export function recomputePlateBounds(plate: CadPlate): CadBoundsFt {
  const pts: { x: number; y: number }[] = [
    ...plate.wallCenterlines.flatMap((w) => [
      { x: w.x1, y: w.y1 },
      { x: w.x2, y: w.y2 },
    ]),
    ...plate.segments.flatMap((s) => [
      { x: s.x1, y: s.y1 },
      { x: s.x2, y: s.y2 },
    ]),
    ...plate.labels.map((l) => ({ x: l.x, y: l.y })),
    ...plate.fixtureHints.map((f) => ({ x: f.xFt, y: f.yFt })),
  ];
  return boundsOfPoints(pts);
}

function rebuildLayerIndex(plate: CadPlate): CadLayerInfo[] {
  const map = new Map<string, CadLayerInfo>();
  for (const layer of plate.layers) {
    map.set(layer.name, { ...layer, segmentCount: 0 });
  }
  for (const s of plate.segments) {
    const existing = map.get(s.layer);
    if (existing) {
      existing.segmentCount += 1;
      continue;
    }
    map.set(s.layer, {
      name: s.layer,
      kind: classifyLayerKind(s.layer),
      role: classifySegmentRole(s.layer),
      visible: true,
      segmentCount: 1,
    });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Keep wall segments in sync with editable centerlines. */
export function syncWallSegments(plate: CadPlate): CadPlate {
  const nonWall = plate.segments.filter((s) => s.role !== 'wall');
  const wallSegs: CadSegmentFt[] = plate.wallCenterlines.map((w) => ({
    x1: w.x1,
    y1: w.y1,
    x2: w.x2,
    y2: w.y2,
    layer: w.layer ?? 'WALLS',
    role: 'wall',
  }));
  const segments = [...wallSegs, ...nonWall];
  return {
    ...plate,
    segments,
    bounds: recomputePlateBounds({ ...plate, segments }),
    layers: rebuildLayerIndex({ ...plate, segments }),
  };
}

export function moveLabel(plate: CadPlate, index: number, x: number, y: number): CadPlate {
  const labels = plate.labels.map((l, i) => (i === index ? { ...l, x, y } : l));
  return syncWallSegments({ ...plate, labels, bounds: recomputePlateBounds({ ...plate, labels }) });
}

export function moveFixtureHint(plate: CadPlate, index: number, xFt: number, yFt: number): CadPlate {
  const fixtureHints = plate.fixtureHints.map((f, i) =>
    i === index ? { ...f, xFt, yFt } : f,
  );
  return syncWallSegments({
    ...plate,
    fixtureHints,
    bounds: recomputePlateBounds({ ...plate, fixtureHints }),
  });
}

export function moveOpeningHint(
  plate: CadPlate,
  index: number,
  cx: number,
  cy: number,
  lenFt?: number,
): CadPlate {
  const hint = plate.openingHints[index];
  if (!hint) return plate;
  const length = lenFt ?? segLengthFt(hint);
  const half = length / 2;
  const dx = hint.x2 - hint.x1;
  const dy = hint.y2 - hint.y1;
  const curLen = Math.hypot(dx, dy) || 1;
  const ux = dx / curLen;
  const uy = dy / curLen;
  const updated: CadOpeningHintFt = {
    ...hint,
    x1: cx - ux * half,
    y1: cy - uy * half,
    x2: cx + ux * half,
    y2: cy + uy * half,
  };
  const openingHints = plate.openingHints.map((h, i) => (i === index ? updated : h));
  const segments = plate.segments.map((s) => {
    if (s.role !== 'opening') return s;
    const mid = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
    const hintMid = { x: (hint.x1 + hint.x2) / 2, y: (hint.y1 + hint.y2) / 2 };
    if (Math.hypot(mid.x - hintMid.x, mid.y - hintMid.y) > 0.5) return s;
    return {
      ...s,
      x1: updated.x1,
      y1: updated.y1,
      x2: updated.x2,
      y2: updated.y2,
    };
  });
  return syncWallSegments({ ...plate, openingHints, segments });
}

export function updateWallCenterline(
  plate: CadPlate,
  index: number,
  wall: CadWallCenterlineFt,
): CadPlate {
  const wallCenterlines = plate.wallCenterlines.map((w, i) => (i === index ? wall : w));
  return syncWallSegments({ ...plate, wallCenterlines });
}

export function moveWallEndpoint(
  plate: CadPlate,
  index: number,
  end: 'a' | 'b',
  x: number,
  y: number,
): CadPlate {
  const w = plate.wallCenterlines[index];
  if (!w) return plate;
  const next =
    end === 'a' ? { ...w, x1: x, y1: y } : { ...w, x2: x, y2: y };
  return updateWallCenterline(plate, index, next);
}

export function addWallCenterline(
  plate: CadPlate,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  layer = 'WALLS',
): CadPlate {
  const wallCenterlines = [
    ...plate.wallCenterlines,
    { x1, y1, x2, y2, layer, exterior: /EXT/i.test(layer) },
  ];
  return syncWallSegments({ ...plate, wallCenterlines });
}

export function addOpeningHint(
  plate: CadPlate,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  kind: 'door' | 'window' = 'door',
  sillFt?: number,
): CadPlate {
  const openingHints: CadOpeningHintFt[] = [
    ...plate.openingHints,
    {
      x1,
      y1,
      x2,
      y2,
      kind,
      layer: kind === 'window' ? 'WINDOWS' : 'DOORS',
      sillFt: kind === 'window' ? (sillFt ?? 3) : 0,
    },
  ];
  const segments: CadSegmentFt[] = [
    ...plate.segments,
    {
      x1,
      y1,
      x2,
      y2,
      layer: kind === 'window' ? 'WINDOWS' : 'DOORS',
      role: 'opening',
    },
  ];
  return syncWallSegments({ ...plate, openingHints, segments });
}

const FIXTURE_DEFAULTS: Record<
  CadFixtureKind,
  { widthFt: number; depthFt: number; layer: string; blockName: string }
> = {
  counter: { widthFt: 6, depthFt: 2, layer: 'FIXTURE', blockName: 'COUNTER' },
  island: { widthFt: 8, depthFt: 3.5, layer: 'FIXTURE', blockName: 'ISLAND' },
  sink: { widthFt: 2, depthFt: 2, layer: 'FIXTURE', blockName: 'SINK' },
  toilet: { widthFt: 2, depthFt: 2.5, layer: 'FIXTURE', blockName: 'TOILET' },
  tub: { widthFt: 5, depthFt: 2.5, layer: 'FIXTURE', blockName: 'TUB' },
  appliance: { widthFt: 3, depthFt: 2.5, layer: 'FIXTURE', blockName: 'STOVE' },
  other: { widthFt: 2, depthFt: 2, layer: 'FIXTURE', blockName: 'FIXTURE' },
};

export function addFixtureHint(plate: CadPlate, kind: CadFixtureKind, xFt: number, yFt: number): CadPlate {
  const d = FIXTURE_DEFAULTS[kind];
  const fixtureHints: CadFixtureHintFt[] = [
    ...plate.fixtureHints,
    {
      xFt,
      yFt,
      widthFt: d.widthFt,
      depthFt: d.depthFt,
      layer: d.layer,
      blockName: d.blockName,
      kind,
    },
  ];
  return syncWallSegments({ ...plate, fixtureHints });
}

export function addSegment(
  plate: CadPlate,
  seg: Omit<CadSegmentFt, 'role'> & { role?: CadSegmentRole },
): CadPlate {
  const role = seg.role ?? classifySegmentRole(seg.layer);
  const segments = [...plate.segments, { ...seg, role }];
  return syncWallSegments({ ...plate, segments });
}

export function setSegmentRole(plate: CadPlate, index: number, role: CadSegmentRole): CadPlate {
  const segments = plate.segments.map((s, i) => (i === index ? { ...s, role } : s));
  return syncWallSegments({ ...plate, segments });
}

export function deleteSelection(plate: CadPlate, sel: CadPlateSelection): CadPlate {
  switch (sel.kind) {
    case 'wall': {
      const wallCenterlines = plate.wallCenterlines.filter((_, i) => i !== sel.index);
      return syncWallSegments({ ...plate, wallCenterlines });
    }
    case 'label': {
      const labels = plate.labels.filter((_, i) => i !== sel.index);
      return syncWallSegments({ ...plate, labels });
    }
    case 'fixture': {
      const fixtureHints = plate.fixtureHints.filter((_, i) => i !== sel.index);
      return syncWallSegments({ ...plate, fixtureHints });
    }
    case 'opening': {
      const hint = plate.openingHints[sel.index];
      const openingHints = plate.openingHints.filter((_, i) => i !== sel.index);
      const segments = hint
        ? plate.segments.filter((s) => {
            if (s.role !== 'opening') return true;
            const mid = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
            const hm = { x: (hint.x1 + hint.x2) / 2, y: (hint.y1 + hint.y2) / 2 };
            return Math.hypot(mid.x - hm.x, mid.y - hm.y) > 0.5;
          })
        : plate.segments;
      return syncWallSegments({ ...plate, openingHints, segments });
    }
    case 'segment': {
      const segments = plate.segments.filter((_, i) => i !== sel.index);
      return syncWallSegments({ ...plate, segments });
    }
    default:
      return plate;
  }
}

export function selectionSummary(plate: CadPlate, sel: CadPlateSelection): string {
  switch (sel.kind) {
    case 'wall': {
      const w = plate.wallCenterlines[sel.index];
      if (!w) return 'Wall (missing)';
      return `Wall ${formatWallLengthFt(segLengthFt(w))}${w.exterior ? ' · exterior' : ''}`;
    }
    case 'label': {
      const l = plate.labels[sel.index];
      return l ? `Label: ${l.text}` : 'Label';
    }
    case 'fixture': {
      const f = plate.fixtureHints[sel.index];
      return f ? `Fixture: ${f.kind ?? f.blockName ?? 'item'}` : 'Fixture';
    }
    case 'opening': {
      const o = plate.openingHints[sel.index];
      if (!o) return 'Opening';
      const sill =
        o.kind === 'window' && o.sillFt != null ? ` · sill ${formatWallLengthFt(o.sillFt)}` : '';
      return `${o.kind} ${formatWallLengthFt(segLengthFt(o))}${sill}`;
    }
    case 'segment': {
      const s = plate.segments[sel.index];
      return s ? `${s.role} line ${formatWallLengthFt(segLengthFt(s))}` : 'Segment';
    }
    default:
      return '';
  }
}

/** Convert SVG viewBox coords to plan feet (matches renderCadPlateSvg transform). */
export function svgToPlanFt(
  svgX: number,
  svgY: number,
  bounds: CadBoundsFt,
  padFt: number,
): { x: number; y: number } {
  const h = Math.max(bounds.maxY - bounds.minY, 1) + padFt * 2;
  const ox = bounds.minX - padFt;
  const oy = bounds.minY - padFt;
  return { x: svgX + ox, y: h + oy - svgY };
}

export function planToSvgFt(
  x: number,
  y: number,
  bounds: CadBoundsFt,
  padFt: number,
): { x: number; y: number } {
  const h = Math.max(bounds.maxY - bounds.minY, 1) + padFt * 2;
  const ox = bounds.minX - padFt;
  const oy = bounds.minY - padFt;
  return { x: x - ox, y: h + oy - y };
}

export function hitTestWall(
  plate: CadPlate,
  px: number,
  py: number,
  tolFt = 0.45,
): number | null {
  let best = -1;
  let bestD = tolFt;
  plate.wallCenterlines.forEach((w, i) => {
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) return;
    let t = ((px - w.x1) * dx + (py - w.y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (w.x1 + t * dx), py - (w.y1 + t * dy));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best >= 0 ? best : null;
}

export function hitTestLabel(plate: CadPlate, px: number, py: number, tolFt = 2): number | null {
  let best = -1;
  let bestD = tolFt;
  plate.labels.forEach((l, i) => {
    const d = Math.hypot(px - l.x, py - l.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best >= 0 ? best : null;
}

export function hitTestFixture(plate: CadPlate, px: number, py: number, tolFt = 2.5): number | null {
  let best = -1;
  let bestD = tolFt;
  plate.fixtureHints.forEach((f, i) => {
    const d = Math.hypot(px - f.xFt, py - f.yFt);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best >= 0 ? best : null;
}

export function hitTestOpening(plate: CadPlate, px: number, py: number, tolFt = 1.2): number | null {
  let best = -1;
  let bestD = tolFt;
  plate.openingHints.forEach((o, i) => {
    const mx = (o.x1 + o.x2) / 2;
    const my = (o.y1 + o.y2) / 2;
    const d = Math.hypot(px - mx, py - my);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best >= 0 ? best : null;
}

export function pickAtPoint(plate: CadPlate, px: number, py: number): CadPlateSelection | null {
  const label = hitTestLabel(plate, px, py);
  if (label != null) return { kind: 'label', index: label };
  const fixture = hitTestFixture(plate, px, py);
  if (fixture != null) return { kind: 'fixture', index: fixture };
  const opening = hitTestOpening(plate, px, py);
  if (opening != null) return { kind: 'opening', index: opening };
  const wall = hitTestWall(plate, px, py);
  if (wall != null) return { kind: 'wall', index: wall };
  return null;
}
