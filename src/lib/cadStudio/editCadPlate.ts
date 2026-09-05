import { classifyLayerKind, classifySegmentRole } from './classifyLayers';
import type {
  CadBoundsFt,
  CadBuilding,
  CadDormerFt,
  CadFixtureHintFt,
  CadFixtureKind,
  CadGuidelineFt,
  CadLayerInfo,
  CadOpeningHintFt,
  CadPlate,
  CadSectionCutFt,
  CadSegmentFt,
  CadSegmentRole,
  CadSlabFt,
  CadSlabKind,
  CadStairFt,
  CadWallCenterlineFt,
  CadWallMaterialId,
} from './types';
import { defaultWallThicknessFt } from './cadDrawSnap';

export type CadEditTool =
  | 'select'
  | 'wall'
  | 'opening'
  | 'fixture'
  | 'slab'
  | 'stair'
  | 'guide'
  | 'section'
  | 'dormer'
  | 'trim'
  | 'extend'
  | 'break'
  | 'offset'
  | 'delete';

export type CadPlateSelection =
  | { kind: 'wall'; index: number }
  | { kind: 'label'; index: number }
  | { kind: 'fixture'; index: number }
  | { kind: 'opening'; index: number }
  | { kind: 'slab'; index: number }
  | { kind: 'stair'; index: number }
  | { kind: 'guide'; index: number }
  | { kind: 'dormer'; index: number }
  | { kind: 'section'; index: number }
  | { kind: 'segment'; index: number };

export type CadGripKind = 'start' | 'end' | 'mid';

export type CadDragTarget =
  | { kind: 'selection'; selection: CadPlateSelection }
  | { kind: 'grip'; wallIndex: number; grip: CadGripKind };

const SLAB_DEFAULTS: Record<
  CadSlabKind,
  { thicknessFt: number; elevationFt: number; layer: string; railing?: boolean }
> = {
  terrace: { thicknessFt: 0.5, elevationFt: 0, layer: 'SLAB TERRACE' },
  driveway: { thicknessFt: 0.5, elevationFt: -0.15, layer: 'SLAB DRIVE' },
  garden: { thicknessFt: 0.25, elevationFt: -0.05, layer: 'SLAB GARDEN' },
  balcony: { thicknessFt: 0.5, elevationFt: 0, layer: 'SLAB BALCONY', railing: true },
  footing: { thicknessFt: 1, elevationFt: -1.67, layer: 'A-FND-FTG' },
  foundation: { thicknessFt: 0.67, elevationFt: -0.67, layer: 'A-FND-SLAB' },
  plot: { thicknessFt: 0.05, elevationFt: -0.02, layer: 'A-SITE-PLOT' },
};

let slabSeq = 0;
let guideSeq = 0;
let stairSeq = 0;
let dormerSeq = 0;
let sectionSeq = 0;
function nextSlabId(kind: CadSlabKind): string {
  slabSeq += 1;
  return `slab-${kind}-${slabSeq.toString(36)}`;
}
function nextGuideId(): string {
  guideSeq += 1;
  return `guide-${guideSeq.toString(36)}`;
}
function nextStairId(): string {
  stairSeq += 1;
  return `stair-${stairSeq.toString(36)}`;
}
function nextDormerId(): string {
  dormerSeq += 1;
  return `dormer-${dormerSeq.toString(36)}`;
}
function nextSectionId(): string {
  sectionSeq += 1;
  return `section-${sectionSeq.toString(36)}`;
}

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
    ...(plate.slabs ?? []).flatMap((s) => s.points),
    ...(plate.stairs ?? []).flatMap((s) => [
      { x: s.xFt, y: s.yFt },
      { x: s.xFt + s.runFt, y: s.yFt + s.widthFt },
    ]),
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
  // Prefer wall-locked slide when hosted (O1). Free XY only for unhosted.
  const hint = plate.openingHints[index];
  if (!hint) return plate;
  if (hint.hostWallIndex != null) {
    // Dynamic import avoided — inline reseat using wall param
    const w = plate.wallCenterlines[hint.hostWallIndex];
    if (w) {
      const width = lenFt ?? hint.widthFt ?? segLengthFt(hint);
      const wlen = segLengthFt(w) || 1;
      const ux = (w.x2 - w.x1) / wlen;
      const uy = (w.y2 - w.y1) / wlen;
      const t = ((cx - w.x1) * ux + (cy - w.y1) * uy) / wlen;
      const half = Math.min(Math.max(0.5, width) / 2, wlen * 0.45);
      const tMin = half / wlen + 0.02;
      const tMax = 1 - half / wlen - 0.02;
      const tt = Math.max(tMin, Math.min(tMax, t));
      const mx = w.x1 + ux * wlen * tt;
      const my = w.y1 + uy * wlen * tt;
      const updated = {
        ...hint,
        hostT: tt,
        widthFt: half * 2,
        x1: mx - ux * half,
        y1: my - uy * half,
        x2: mx + ux * half,
        y2: my + uy * half,
      };
      const openingHints = plate.openingHints.map((h, i) => (i === index ? updated : h));
      return syncWallSegments({ ...plate, openingHints });
    }
  }
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
  thicknessFt?: number,
): CadPlate {
  const exterior = /EXT/i.test(layer);
  const wallCenterlines = [
    ...plate.wallCenterlines,
    {
      x1,
      y1,
      x2,
      y2,
      layer,
      exterior,
      thicknessFt: thicknessFt ?? defaultWallThicknessFt({ exterior, layer }),
    },
  ];
  return syncWallSegments({ ...plate, wallCenterlines });
}

export function setWallThickness(plate: CadPlate, index: number, thicknessFt: number): CadPlate {
  const w = plate.wallCenterlines[index];
  if (!w) return plate;
  return updateWallCenterline(plate, index, { ...w, thicknessFt: Math.max(0.15, thicknessFt) });
}

export function setWallMaterial(plate: CadPlate, index: number, materialId: CadWallMaterialId): CadPlate {
  const w = plate.wallCenterlines[index];
  if (!w) return plate;
  return updateWallCenterline(plate, index, { ...w, materialId });
}

export function addOpeningHint(
  plate: CadPlate,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  kind: 'door' | 'window' | 'passage' | 'garage' = 'door',
  sillFt?: number,
): CadPlate {
  const layer =
    kind === 'window'
      ? 'WINDOWS'
      : kind === 'passage'
        ? 'OPENINGS'
        : kind === 'garage'
          ? 'GARAGE DOORS'
          : 'DOORS';
  const openingHints: CadOpeningHintFt[] = [
    ...plate.openingHints,
    {
      x1,
      y1,
      x2,
      y2,
      kind,
      layer,
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
      layer,
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
  sink: { widthFt: 2.5, depthFt: 2, layer: 'FIXTURE', blockName: 'SINK' },
  toilet: { widthFt: 1.75, depthFt: 2.4, layer: 'FIXTURE', blockName: 'TOILET' },
  tub: { widthFt: 5, depthFt: 2.5, layer: 'FIXTURE', blockName: 'TUB' },
  appliance: { widthFt: 2.5, depthFt: 2.5, layer: 'FIXTURE', blockName: 'STOVE' },
  mirror: { widthFt: 3, depthFt: 0.35, layer: 'FIXTURE', blockName: 'MIRROR' },
  other: { widthFt: 2, depthFt: 2, layer: 'FIXTURE', blockName: 'FIXTURE' },
};

export function addFixtureHint(
  plate: CadPlate,
  kind: CadFixtureKind,
  xFt: number,
  yFt: number,
  opts?: { rotationDeg?: number; alignToWall?: boolean; wallTolFt?: number },
): CadPlate {
  const d = FIXTURE_DEFAULTS[kind];
  let x = xFt;
  let y = yFt;
  let rotationDeg = opts?.rotationDeg ?? 0;
  if (opts?.alignToWall !== false) {
    const aligned = alignFixturePoseToNearestWall(plate, x, y, d.depthFt, opts?.wallTolFt ?? 3);
    if (aligned) {
      x = aligned.xFt;
      y = aligned.yFt;
      rotationDeg = aligned.rotationDeg;
    }
  }
  const fixtureHints: CadFixtureHintFt[] = [
    ...plate.fixtureHints,
    {
      xFt: x,
      yFt: y,
      widthFt: d.widthFt,
      depthFt: d.depthFt,
      layer: d.layer,
      blockName: d.blockName,
      kind,
      rotationDeg,
    },
  ];
  return syncWallSegments({ ...plate, fixtureHints });
}

/** Face the fixture into the room with its back toward the nearest wall. */
export function alignFixturePoseToNearestWall(
  plate: CadPlate,
  xFt: number,
  yFt: number,
  depthFt: number,
  tolFt = 3,
): { xFt: number; yFt: number; rotationDeg: number } | null {
  const host = nearestWallHost(plate, xFt, yFt, tolFt);
  if (!host) return null;
  const w = plate.wallCenterlines[host.wallIndex];
  if (!w) return null;
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Outward normal (left of wall direction); flip so it points toward the click.
  let nx = -uy;
  let ny = ux;
  const mx = w.x1 + ux * len * host.t;
  const my = w.y1 + uy * len * host.t;
  if ((xFt - mx) * nx + (yFt - my) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const standoff = Math.max(0.15, depthFt / 2 + 0.05);
  // Symbol +Y is the "back" (wall/tank side); rotate so +Y faces the wall (-normal).
  const rotationDeg = (Math.atan2(-nx, -ny) * 180) / Math.PI;
  return {
    xFt: mx + nx * standoff,
    yFt: my + ny * standoff,
    rotationDeg,
  };
}

export function rotateFixtureHint(plate: CadPlate, index: number, deltaDeg: number): CadPlate {
  const fixtureHints = plate.fixtureHints.map((f, i) => {
    if (i !== index) return f;
    const next = ((f.rotationDeg ?? 0) + deltaDeg) % 360;
    return { ...f, rotationDeg: next < 0 ? next + 360 : next };
  });
  return syncWallSegments({ ...plate, fixtureHints });
}

export function setFixtureHintRotation(plate: CadPlate, index: number, rotationDeg: number): CadPlate {
  const fixtureHints = plate.fixtureHints.map((f, i) =>
    i === index ? { ...f, rotationDeg } : f,
  );
  return syncWallSegments({ ...plate, fixtureHints });
}

export function alignFixtureHintToWall(plate: CadPlate, index: number, tolFt = 4): CadPlate {
  const f = plate.fixtureHints[index];
  if (!f) return plate;
  const depth = f.depthFt ?? FIXTURE_DEFAULTS[f.kind ?? 'other'].depthFt;
  const aligned = alignFixturePoseToNearestWall(plate, f.xFt, f.yFt, depth, tolFt);
  if (!aligned) return plate;
  const fixtureHints = plate.fixtureHints.map((item, i) =>
    i === index
      ? { ...item, xFt: aligned.xFt, yFt: aligned.yFt, rotationDeg: aligned.rotationDeg }
      : item,
  );
  return syncWallSegments({
    ...plate,
    fixtureHints,
    bounds: recomputePlateBounds({ ...plate, fixtureHints }),
  });
}

export function addSlab(
  plate: CadPlate,
  kind: CadSlabKind,
  points: Array<{ x: number; y: number }>,
  opts?: { thicknessFt?: number; elevationFt?: number; railing?: boolean },
): CadPlate {
  if (points.length < 3) return plate;
  const d = SLAB_DEFAULTS[kind];
  const slab: CadSlabFt = {
    id: nextSlabId(kind),
    kind,
    points: points.map((p) => ({ x: p.x, y: p.y })),
    thicknessFt: opts?.thicknessFt ?? d.thicknessFt,
    elevationFt: opts?.elevationFt ?? d.elevationFt,
    layer: d.layer,
    railing: opts?.railing ?? d.railing ?? false,
  };
  const slabs = [...(plate.slabs ?? []), slab];
  return syncWallSegments({
    ...plate,
    slabs,
    bounds: recomputePlateBounds({ ...plate, slabs }),
  });
}

export function addGuideline(
  plate: CadPlate,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): CadPlate {
  if (Math.hypot(x2 - x1, y2 - y1) < 0.5) return plate;
  const guide: CadGuidelineFt = { id: nextGuideId(), x1, y1, x2, y2 };
  const guidelines = [...(plate.guidelines ?? []), guide];
  return { ...plate, guidelines };
}

export function addStair(
  plate: CadPlate,
  xFt: number,
  yFt: number,
  opts?: Partial<Pick<CadStairFt, 'runFt' | 'widthFt' | 'riseFt' | 'steps' | 'rotationDeg' | 'railing'>>,
): CadPlate {
  const stair: CadStairFt = {
    id: nextStairId(),
    xFt,
    yFt,
    runFt: opts?.runFt ?? 10,
    widthFt: opts?.widthFt ?? 3.5,
    riseFt: opts?.riseFt ?? 9,
    steps: opts?.steps ?? 14,
    rotationDeg: opts?.rotationDeg ?? 0,
    railing: opts?.railing ?? true,
    layer: 'STAIRS',
  };
  const stairs = [...(plate.stairs ?? []), stair];
  return {
    ...plate,
    stairs,
    bounds: recomputePlateBounds({ ...plate, stairs }),
  };
}

export function updateStair(
  plate: CadPlate,
  index: number,
  patch: Partial<Omit<CadStairFt, 'id' | 'layer'>>,
): CadPlate {
  const stairs = (plate.stairs ?? []).map((s, i) => (i === index ? { ...s, ...patch } : s));
  return {
    ...plate,
    stairs,
    bounds: recomputePlateBounds({ ...plate, stairs }),
  };
}

export function addDormer(
  plate: CadPlate,
  xFt: number,
  yFt: number,
  opts?: Partial<Omit<CadDormerFt, 'id' | 'xFt' | 'yFt' | 'layer'>>,
): CadPlate {
  const dormer: CadDormerFt = {
    id: nextDormerId(),
    xFt,
    yFt,
    widthFt: opts?.widthFt ?? 6,
    depthFt: opts?.depthFt ?? 8,
    heightFt: opts?.heightFt ?? 5,
    rotationDeg: opts?.rotationDeg ?? 0,
    pitchRise12: opts?.pitchRise12 ?? 8,
    layer: 'A-ROOF-DORM',
    buildingId: opts?.buildingId,
  };
  const dormers = [...(plate.dormers ?? []), dormer];
  return { ...plate, dormers };
}

export function addSectionCut(
  plate: CadPlate,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts?: Partial<Pick<CadSectionCutFt, 'label' | 'depthFt'>>,
): CadPlate {
  const n = (plate.sectionCuts?.length ?? 0) + 1;
  const letter = String.fromCharCode(64 + Math.min(26, n));
  const cut: CadSectionCutFt = {
    id: nextSectionId(),
    x1,
    y1,
    x2,
    y2,
    depthFt: opts?.depthFt ?? 1.5,
    label: opts?.label ?? `SECTION ${letter}-${letter}`,
    layer: 'A-SECT',
  };
  return { ...plate, sectionCuts: [...(plate.sectionCuts ?? []), cut] };
}

export function setBuildings(plate: CadPlate, buildings: CadBuilding[]): CadPlate {
  return { ...plate, buildings };
}

export function toggleBuildingVisible(plate: CadPlate, buildingId: string): CadPlate {
  const buildings = (plate.buildings ?? []).map((b) =>
    b.id === buildingId ? { ...b, visible: !b.visible } : b,
  );
  return { ...plate, buildings };
}

export function updateSlab(
  plate: CadPlate,
  index: number,
  patch: Partial<Pick<CadSlabFt, 'kind' | 'thicknessFt' | 'elevationFt' | 'points' | 'railing'>>,
): CadPlate {
  const slabs = (plate.slabs ?? []).map((s, i) => {
    if (i !== index) return s;
    const next = { ...s, ...patch };
    if (patch.kind && patch.kind !== s.kind && !patch.thicknessFt && !patch.elevationFt) {
      const d = SLAB_DEFAULTS[patch.kind];
      next.thicknessFt = d.thicknessFt;
      next.elevationFt = d.elevationFt;
      next.layer = d.layer;
    }
    return next;
  });
  return syncWallSegments({
    ...plate,
    slabs,
    bounds: recomputePlateBounds({ ...plate, slabs }),
  });
}

export function moveSlab(plate: CadPlate, index: number, dx: number, dy: number): CadPlate {
  const slabs = (plate.slabs ?? []).map((s, i) =>
    i === index
      ? { ...s, points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
      : s,
  );
  return syncWallSegments({
    ...plate,
    slabs,
    bounds: recomputePlateBounds({ ...plate, slabs }),
  });
}

/** Point-in-polygon (ray cast). */
function pointInPolygon(px: number, py: number, pts: Array<{ x: number; y: number }>): boolean {
  if (pts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]!.x;
    const yi = pts[i]!.y;
    const xj = pts[j]!.x;
    const yj = pts[j]!.y;
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
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
    case 'slab': {
      const slabs = (plate.slabs ?? []).filter((_, i) => i !== sel.index);
      return syncWallSegments({
        ...plate,
        slabs,
        bounds: recomputePlateBounds({ ...plate, slabs }),
      });
    }
    case 'guide': {
      const guidelines = (plate.guidelines ?? []).filter((_, i) => i !== sel.index);
      return { ...plate, guidelines };
    }
    case 'stair': {
      const stairs = (plate.stairs ?? []).filter((_, i) => i !== sel.index);
      return {
        ...plate,
        stairs,
        bounds: recomputePlateBounds({ ...plate, stairs }),
      };
    }
    case 'dormer': {
      const dormers = (plate.dormers ?? []).filter((_, i) => i !== sel.index);
      return { ...plate, dormers };
    }
    case 'section': {
      const sectionCuts = (plate.sectionCuts ?? []).filter((_, i) => i !== sel.index);
      return { ...plate, sectionCuts };
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
      const thick = defaultWallThicknessFt(w);
      return `Wall ${formatWallLengthFt(segLengthFt(w))} · ${formatWallLengthFt(thick)} thick${w.exterior ? ' · exterior' : ''}`;
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
    case 'slab': {
      const s = plate.slabs?.[sel.index];
      if (!s) return 'Slab';
      const rail = s.railing ? ' · railing' : '';
      return `${s.kind} · ${formatWallLengthFt(s.thicknessFt)} thick · Z ${formatWallLengthFt(s.elevationFt)}${rail}`;
    }
    case 'guide': {
      const g = plate.guidelines?.[sel.index];
      return g ? `Guide ${formatWallLengthFt(segLengthFt(g))}` : 'Guide';
    }
    case 'stair': {
      const s = plate.stairs?.[sel.index];
      if (!s) return 'Stair';
      return `Stair ${s.steps} risers · ${formatWallLengthFt(s.runFt)} run${s.railing ? ' · rail' : ''}`;
    }
    case 'dormer': {
      const d = plate.dormers?.[sel.index];
      if (!d) return 'Dormer';
      return `Dormer ${formatWallLengthFt(d.widthFt)} × ${formatWallLengthFt(d.depthFt)}`;
    }
    case 'section': {
      const c = plate.sectionCuts?.[sel.index];
      if (!c) return 'Section';
      return `${c.label} · ${formatWallLengthFt(segLengthFt(c))}`;
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

export function hitTestSlab(plate: CadPlate, px: number, py: number): number | null {
  const slabs = plate.slabs ?? [];
  for (let i = slabs.length - 1; i >= 0; i--) {
    if (pointInPolygon(px, py, slabs[i]!.points)) return i;
  }
  return null;
}

export function hitTestStair(plate: CadPlate, px: number, py: number): number | null {
  const stairs = plate.stairs ?? [];
  for (let i = stairs.length - 1; i >= 0; i--) {
    const s = stairs[i]!;
    const rad = (s.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const lx = px - s.xFt;
    const ly = py - s.yFt;
    const localX = lx * cos + ly * sin;
    const localY = -lx * sin + ly * cos;
    if (localX >= 0 && localX <= s.runFt && localY >= 0 && localY <= s.widthFt) return i;
  }
  return null;
}

export function hitTestDormer(plate: CadPlate, px: number, py: number, tolFt = 3): number | null {
  let best = -1;
  let bestD = tolFt;
  (plate.dormers ?? []).forEach((d, i) => {
    const dist = Math.hypot(px - d.xFt, py - d.yFt);
    if (dist < bestD) {
      bestD = dist;
      best = i;
    }
  });
  return best >= 0 ? best : null;
}

export function hitTestSection(plate: CadPlate, px: number, py: number, tolFt = 0.6): number | null {
  let best = -1;
  let bestD = tolFt;
  (plate.sectionCuts ?? []).forEach((c, i) => {
    const dx = c.x2 - c.x1;
    const dy = c.y2 - c.y1;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) return;
    let t = ((px - c.x1) * dx + (py - c.y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (c.x1 + t * dx), py - (c.y1 + t * dy));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best >= 0 ? best : null;
}

export function hitTestGuide(plate: CadPlate, px: number, py: number, tolFt = 0.55): number | null {
  let best = -1;
  let bestD = tolFt;
  (plate.guidelines ?? []).forEach((g, i) => {
    const dx = g.x2 - g.x1;
    const dy = g.y2 - g.y1;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) return;
    let t = ((px - g.x1) * dx + (py - g.y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (g.x1 + t * dx), py - (g.y1 + t * dy));
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
  const dormer = hitTestDormer(plate, px, py);
  if (dormer != null) return { kind: 'dormer', index: dormer };
  const stair = hitTestStair(plate, px, py);
  if (stair != null) return { kind: 'stair', index: stair };
  const section = hitTestSection(plate, px, py);
  if (section != null) return { kind: 'section', index: section };
  const guide = hitTestGuide(plate, px, py);
  if (guide != null) return { kind: 'guide', index: guide };
  const wall = hitTestWall(plate, px, py);
  if (wall != null) return { kind: 'wall', index: wall };
  const slab = hitTestSlab(plate, px, py);
  if (slab != null) return { kind: 'slab', index: slab };
  return null;
}

/** Nearest wall index and parametric t for hosting an opening. */
export function nearestWallHost(
  plate: CadPlate,
  px: number,
  py: number,
  tolFt = 2.5,
): { wallIndex: number; t: number } | null {
  let best: { wallIndex: number; t: number; d: number } | null = null;
  for (let i = 0; i < plate.wallCenterlines.length; i++) {
    const w = plate.wallCenterlines[i]!;
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) continue;
    let t = ((px - w.x1) * dx + (py - w.y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (w.x1 + t * dx), py - (w.y1 + t * dy));
    if (d <= tolFt && (!best || d < best.d)) best = { wallIndex: i, t, d };
  }
  if (!best) return null;
  return { wallIndex: best.wallIndex, t: best.t };
}
