/**
 * M1–M5 model kernel: typed elements, hosted openings by wall id,
 * story fabric, opening component params, and story floor plates.
 */
import { ensureDefaultStories } from './cadStories';
import { segLengthFt, syncWallSegments } from './editCadPlate';
import type {
  CadOpeningHintFt,
  CadOpeningSwing,
  CadOpeningTypeId,
  CadPlate,
  CadSlabFt,
  CadWallCenterlineFt,
  CadWallTypeId,
} from './types';

let wallSeq = 0;
let openingSeq = 0;

export function nextWallElementId(): string {
  wallSeq += 1;
  return `wall-${wallSeq.toString(36)}`;
}

export function nextOpeningElementId(): string {
  openingSeq += 1;
  return `opn-${openingSeq.toString(36)}`;
}

export type CadWallTypeDef = {
  id: CadWallTypeId;
  label: string;
  exterior: boolean;
  thicknessFt: number;
  materialId: NonNullable<CadWallCenterlineFt['materialId']>;
  heightFt?: number;
};

export type CadOpeningTypeDef = {
  id: CadOpeningTypeId;
  label: string;
  kind: CadOpeningHintFt['kind'];
  widthFt: number;
  heightFt: number;
  sillFt: number;
  swing: CadOpeningSwing;
};

export const CAD_WALL_TYPES: CadWallTypeDef[] = [
  {
    id: 'wall-ext-2x6',
    label: 'Exterior 2×6',
    exterior: true,
    thicknessFt: 0.59,
    materialId: 'stucco',
  },
  {
    id: 'wall-ext-2x4',
    label: 'Exterior 2×4',
    exterior: true,
    thicknessFt: 0.45,
    materialId: 'stucco',
  },
  {
    id: 'wall-int-2x4',
    label: 'Interior 2×4',
    exterior: false,
    thicknessFt: 0.39,
    materialId: 'interior',
  },
  {
    id: 'wall-int-partition',
    label: 'Partition',
    exterior: false,
    thicknessFt: 0.33,
    materialId: 'interior',
  },
];

export const CAD_OPENING_TYPES: CadOpeningTypeDef[] = [
  {
    id: 'door-3068',
    label: 'Door 3′-0″ × 6′-8″',
    kind: 'door',
    widthFt: 3,
    heightFt: 6.667,
    sillFt: 0,
    swing: 'left',
  },
  {
    id: 'door-2868',
    label: 'Door 2′-8″ × 6′-8″',
    kind: 'door',
    widthFt: 2.667,
    heightFt: 6.667,
    sillFt: 0,
    swing: 'left',
  },
  {
    id: 'door-garage-16',
    label: 'Garage 16′ × 7′',
    kind: 'garage',
    widthFt: 16,
    heightFt: 7,
    sillFt: 0,
    swing: 'none',
  },
  {
    id: 'window-3040',
    label: 'Window 3′-0″ × 4′-0″',
    kind: 'window',
    widthFt: 3,
    heightFt: 4,
    sillFt: 3,
    swing: 'none',
  },
  {
    id: 'window-6030',
    label: 'Window 6′-0″ × 3′-0″',
    kind: 'window',
    widthFt: 6,
    heightFt: 3,
    sillFt: 3,
    swing: 'slider',
  },
  {
    id: 'passage-30',
    label: 'Passage 2′-6″',
    kind: 'passage',
    widthFt: 2.5,
    heightFt: 6.667,
    sillFt: 0,
    swing: 'none',
  },
  {
    id: 'passage-36',
    label: 'Passage 3′-0″',
    kind: 'passage',
    widthFt: 3,
    heightFt: 6.667,
    sillFt: 0,
    swing: 'none',
  },
];

export function wallTypeById(id: CadWallTypeId | undefined): CadWallTypeDef | undefined {
  return CAD_WALL_TYPES.find((t) => t.id === id);
}

export function openingTypeById(id: CadOpeningTypeId | undefined): CadOpeningTypeDef | undefined {
  return CAD_OPENING_TYPES.find((t) => t.id === id);
}

function defaultWallTypeId(w: CadWallCenterlineFt): CadWallTypeId {
  return w.exterior ? 'wall-ext-2x6' : 'wall-int-2x4';
}

function defaultOpeningTypeId(o: CadOpeningHintFt): CadOpeningTypeId {
  if (o.kind === 'garage') return 'door-garage-16';
  if (o.kind === 'window') return 'window-3040';
  if (o.kind === 'passage') return 'passage-30';
  return 'door-3068';
}

function wallUnit(w: CadWallCenterlineFt): { ux: number; uy: number; len: number } {
  const len = segLengthFt(w) || 1;
  return { ux: (w.x2 - w.x1) / len, uy: (w.y2 - w.y1) / len, len };
}

function seatOpeningOnWall(
  o: CadOpeningHintFt,
  w: CadWallCenterlineFt,
  t: number,
  widthFt: number,
): CadOpeningHintFt {
  const { ux, uy, len } = wallUnit(w);
  const tt = Math.max(0.02, Math.min(0.98, t));
  const half = Math.min(Math.max(0.5, widthFt) / 2, len * 0.45);
  return {
    ...o,
    hostWallId: w.id,
    hostT: tt,
    widthFt: half * 2,
    x1: w.x1 + ux * len * tt - ux * half,
    y1: w.y1 + uy * len * tt - uy * half,
    x2: w.x1 + ux * len * tt + ux * half,
    y2: w.y1 + uy * len * tt + uy * half,
  };
}

/** Assign stable ids, type defaults, story ids; migrate hostWallIndex → hostWallId. */
export function ensureModelKernel(plate: CadPlate): CadPlate {
  let next = ensureDefaultStories(plate);
  const activeStoryId = next.activeStoryId ?? next.stories?.[0]?.id;

  const wallCenterlines = next.wallCenterlines.map((w) => {
    const typeId = w.typeId ?? defaultWallTypeId(w);
    const type = wallTypeById(typeId)!;
    return {
      ...w,
      id: w.id || nextWallElementId(),
      typeId,
      storyId: w.storyId ?? activeStoryId,
      thicknessFt: w.thicknessFt ?? type.thicknessFt,
      materialId: w.materialId ?? type.materialId,
      exterior: w.exterior ?? type.exterior,
    };
  });

  const idByIndex = new Map(wallCenterlines.map((w, i) => [i, w.id!] as const));

  const openingHints = next.openingHints.map((o) => {
    const typeId = o.typeId ?? defaultOpeningTypeId(o);
    const type = openingTypeById(typeId)!;
    let hostWallId = o.hostWallId;
    if (!hostWallId && o.hostWallIndex != null) {
      hostWallId = idByIndex.get(o.hostWallIndex);
    }
    const host = hostWallId ? wallCenterlines.find((w) => w.id === hostWallId) : undefined;
    const hostWallIndex = host ? wallCenterlines.indexOf(host) : o.hostWallIndex;
    const sillFt = o.kind === 'window' ? (o.sillFt ?? type.sillFt) : 0;
    const heightFt = o.heightFt ?? type.heightFt;
    return {
      ...o,
      id: o.id || nextOpeningElementId(),
      typeId,
      storyId: o.storyId ?? host?.storyId ?? activeStoryId,
      hostWallId: host?.id,
      hostWallIndex,
      widthFt: o.widthFt ?? type.widthFt,
      heightFt,
      sillFt,
      headFt: o.headFt ?? sillFt + heightFt,
      swing: o.swing ?? type.swing,
    };
  });

  const slabs = (next.slabs ?? []).map((s) => ({
    ...s,
    storyId: s.storyId ?? activeStoryId,
  }));

  next = { ...next, wallCenterlines, openingHints, slabs };
  return syncWallSegments(resyncAllHostedOpenings(next));
}

export function wallIndexById(plate: CadPlate, wallId: string | undefined): number {
  if (!wallId) return -1;
  return plate.wallCenterlines.findIndex((w) => w.id === wallId);
}

export function resolveOpeningHostIndex(plate: CadPlate, o: CadOpeningHintFt): number {
  if (o.hostWallId) {
    const byId = wallIndexById(plate, o.hostWallId);
    if (byId >= 0) return byId;
  }
  return o.hostWallIndex ?? -1;
}

/** Re-seat every hosted opening from hostWallId/hostT (falls back to hostWallIndex). */
export function resyncAllHostedOpenings(plate: CadPlate): CadPlate {
  const openingHints = plate.openingHints.map((o) => {
    const idx = resolveOpeningHostIndex(plate, o);
    const w = idx >= 0 ? plate.wallCenterlines[idx] : undefined;
    if (!w || o.hostT == null) return o;
    return seatOpeningOnWall(o, w, o.hostT, o.widthFt ?? segLengthFt(o));
  });
  return syncWallSegments({ ...plate, openingHints });
}

/** Resync openings for one wall (by index), keeping hostWallId in sync. */
export function resyncHostedOpeningsByWall(plate: CadPlate, wallIndex: number): CadPlate {
  const w = plate.wallCenterlines[wallIndex];
  if (!w) return plate;
  const openingHints = plate.openingHints.map((o) => {
    const idx = resolveOpeningHostIndex(plate, o);
    if (idx !== wallIndex || o.hostT == null) return o;
    return seatOpeningOnWall(
      { ...o, hostWallId: w.id, hostWallIndex: wallIndex },
      w,
      o.hostT,
      o.widthFt ?? segLengthFt(o),
    );
  });
  return syncWallSegments({ ...plate, openingHints });
}

export function applyWallType(
  plate: CadPlate,
  wallIndex: number,
  typeId: CadWallTypeId,
): CadPlate {
  const type = wallTypeById(typeId);
  const w = plate.wallCenterlines[wallIndex];
  if (!type || !w) return plate;
  const wallCenterlines = plate.wallCenterlines.map((wall, i) =>
    i === wallIndex
      ? {
          ...wall,
          typeId,
          exterior: type.exterior,
          thicknessFt: type.thicknessFt,
          materialId: type.materialId,
          heightFt: type.heightFt ?? wall.heightFt,
        }
      : wall,
  );
  return { ...plate, wallCenterlines };
}

export function applyOpeningType(
  plate: CadPlate,
  openingIndex: number,
  typeId: CadOpeningTypeId,
): CadPlate {
  const type = openingTypeById(typeId);
  const o = plate.openingHints[openingIndex];
  if (!type || !o) return plate;
  let next: CadOpeningHintFt = {
    ...o,
    typeId,
    kind: type.kind,
    widthFt: type.widthFt,
    heightFt: type.heightFt,
    sillFt: type.kind === 'window' ? type.sillFt : 0,
    headFt: (type.kind === 'window' ? type.sillFt : 0) + type.heightFt,
    swing: type.swing,
  };
  const hostIdx = resolveOpeningHostIndex(plate, next);
  const host = hostIdx >= 0 ? plate.wallCenterlines[hostIdx] : undefined;
  if (host && next.hostT != null) {
    next = seatOpeningOnWall(next, host, next.hostT, type.widthFt);
  }
  const openingHints = plate.openingHints.map((h, i) => (i === openingIndex ? next : h));
  return syncWallSegments({ ...plate, openingHints });
}

export function setOpeningHeight(plate: CadPlate, index: number, heightFt: number): CadPlate {
  const openingHints = plate.openingHints.map((h, i) => {
    if (i !== index) return h;
    const sill = h.kind === 'window' ? (h.sillFt ?? 0) : 0;
    const height = Math.max(0.5, heightFt);
    return { ...h, heightFt: height, headFt: sill + height, sillFt: sill };
  });
  return { ...plate, openingHints };
}

export function setOpeningSwing(plate: CadPlate, index: number, swing: CadOpeningSwing): CadPlate {
  const openingHints = plate.openingHints.map((h, i) => (i === index ? { ...h, swing } : h));
  return { ...plate, openingHints };
}

export function setWallStory(plate: CadPlate, wallIndex: number, storyId: string): CadPlate {
  const wallCenterlines = plate.wallCenterlines.map((w, i) =>
    i === wallIndex ? { ...w, storyId } : w,
  );
  const wall = wallCenterlines[wallIndex];
  const openingHints = plate.openingHints.map((o) => {
    const idx = resolveOpeningHostIndex({ ...plate, wallCenterlines }, o);
    if (idx === wallIndex) return { ...o, storyId: wall?.storyId ?? storyId };
    return o;
  });
  return { ...plate, wallCenterlines, openingHints };
}

export function setOpeningStory(plate: CadPlate, openingIndex: number, storyId: string): CadPlate {
  const openingHints = plate.openingHints.map((h, i) =>
    i === openingIndex ? { ...h, storyId } : h,
  );
  return { ...plate, openingHints };
}

/** Elements belonging to a story (unassigned ⇒ active story). */
export function filterPlateToStory(plate: CadPlate, storyId: string): CadPlate {
  const wallCenterlines = plate.wallCenterlines.filter(
    (w) => (w.storyId ?? plate.activeStoryId) === storyId,
  );
  const wallIds = new Set(wallCenterlines.map((w) => w.id).filter(Boolean) as string[]);
  const openingHints = plate.openingHints.filter((o) => {
    if ((o.storyId ?? plate.activeStoryId) === storyId) return true;
    if (o.hostWallId && wallIds.has(o.hostWallId)) return true;
    return false;
  });
  const slabs = (plate.slabs ?? []).filter((s) => (s.storyId ?? plate.activeStoryId) === storyId);
  return {
    ...plate,
    wallCenterlines,
    openingHints,
    slabs,
    activeStoryId: storyId,
  };
}

export function storyHeightFt(plate: CadPlate, storyId: string | undefined, fallbackFt = 9): number {
  if (!storyId || !plate.stories?.length) return fallbackFt;
  const stories = [...plate.stories].sort((a, b) => a.levelFt - b.levelFt);
  const idx = stories.findIndex((s) => s.id === storyId);
  if (idx < 0) return fallbackFt;
  const cur = stories[idx]!;
  const above = stories[idx + 1];
  if (above) return Math.max(7, above.levelFt - cur.levelFt);
  return fallbackFt;
}

/** Exterior contour rectangle as a floor slab for a story (M5). */
export function ensureStoryFloorSlab(plate: CadPlate, storyId: string): CadPlate {
  const storyPlate = filterPlateToStory(plate, storyId);
  const exterior = storyPlate.wallCenterlines.filter((w) => w.exterior);
  let use = exterior.length ? exterior : storyPlate.wallCenterlines;
  // Prefer main house when detached buildings exist so floor isn't a site-wide AABB.
  const buildingIds = [...new Set(use.map((w) => w.buildingId).filter(Boolean))] as string[];
  if (buildingIds.length > 1) {
    const preferred =
      plate.buildings?.find((b) => /main/i.test(b.id) || /main/i.test(b.name))?.id ?? buildingIds[0]!;
    const filtered = use.filter((w) => w.buildingId === preferred);
    if (filtered.length) use = filtered;
  }
  if (!use.length) return plate;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const w of use) {
    minX = Math.min(minX, w.x1, w.x2);
    minY = Math.min(minY, w.y1, w.y2);
    maxX = Math.max(maxX, w.x1, w.x2);
    maxY = Math.max(maxY, w.y1, w.y2);
  }
  if (!Number.isFinite(minX)) return plate;
  const story = plate.stories?.find((s) => s.id === storyId);
  const levelFt = story?.levelFt ?? 0;
  const floorId = `floor-${storyId}`;
  const slab: CadSlabFt = {
    id: floorId,
    kind: 'foundation',
    points: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ],
    thicknessFt: 0.5,
    elevationFt: levelFt - 0.5,
    layer: 'FLOOR',
    storyId,
  };
  const slabs = (plate.slabs ?? []).filter((s) => s.id !== floorId);
  return { ...plate, slabs: [...slabs, slab] };
}

export function ensureAllStoryFloorSlabs(plate: CadPlate): CadPlate {
  let next = ensureModelKernel(plate);
  for (const story of next.stories ?? []) {
    next = ensureStoryFloorSlab(next, story.id);
  }
  return next;
}
