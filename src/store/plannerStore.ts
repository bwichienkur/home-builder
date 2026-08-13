import { create } from 'zustand';
import type { CameraMode, FurnitureItem, MountingType, Opening, PlanRoomLabel, Point, RoomType, SceneSnapshot, SurfaceTarget, Tool, UnitSystem, Wall } from '../types';
import { constrainPlacement, openingConflicts, resolveMountingType, roomFloorCenter } from '../lib/geometry/placement';
import { writeRecoverySnapshot } from '../lib/designShare';
import { buildHouse, rebuildFromPlanRooms, resizePlanRoomPoints } from '../lib/housePlans/buildPlan';
import { getHousePlan } from '../lib/housePlans/olsenPlans';

type View = '2d' | '3d';
type FloorRecord = { id: string; name: string; scene: SceneSnapshot; planRooms?: PlanRoomLabel[] };
export type FurnitureAddMeta = {
  mountingType?: MountingType | string;
  clearance?: FurnitureItem['clearance'];
  rotation?: number;
  y?: number;
  wallId?: string | null;
  wallOffset?: number | null;
};

/** Catalog item awaiting IKEA-style ghost place → commit. */
export type PendingPlacement = {
  catalogId: string;
  name: string;
  category: string;
  color: string;
  width: number;
  depth: number;
  height: number;
  mountingType?: MountingType | string;
  clearance?: FurnitureItem['clearance'];
  x: number;
  z: number;
  y: number;
  rotation: number;
  wallId?: string | null;
  wallOffset?: number | null;
};

type PlannerState = SceneSnapshot & {
  tool: Tool;
  view: View;
  cameraMode: CameraMode;
  roomType: RoomType;
  unitSystem: UnitSystem;
  selectedWallId: string | null;
  selectedOpeningId: string | null;
  selectedFurnitureId: string | null;
  selectedSurface: SurfaceTarget | null;
  selectedRoomId: string | null;
  pendingPlacement: PendingPlacement | null;
  draftStart: Point | null;
  floors: FloorRecord[];
  activeFloorId: string;
  history: SceneSnapshot[];
  historyIndex: number;
  openingNotice: string;
  setTool: (tool: Tool) => void;
  setView: (view: View) => void;
  setCameraMode: (mode: CameraMode) => void;
  setRoomType: (type: RoomType) => void;
  setUnitSystem: (unit: UnitSystem) => void;
  setDraftStart: (p: Point | null) => void;
  beginPlacement: (
    catalogId: string,
    name: string,
    category: string,
    dims: [number, number, number],
    color: string,
    x?: number | undefined,
    z?: number | undefined,
    meta?: FurnitureAddMeta,
  ) => void;
  movePendingPlacement: (x: number, z: number, rotation?: number) => void;
  rotatePendingPlacement: (delta?: number) => void;
  commitPendingPlacement: () => string | null;
  cancelPendingPlacement: () => void;
  rotateSelected: (delta?: number) => void;
  addWall: (a: Point, b: Point) => void;
  updateWall: (id: string, patch: Partial<Wall>) => void;
  updateWallEndpoint: (id: string, end: 'start' | 'end', point: Point) => void;
  setWallLength: (id: string, meters: number) => void;
  splitWall: (id: string) => void;
  offsetWall: (id: string, meters: number) => void;
  setCeilingHeight: (meters: number) => void;
  applyRoomTemplate: (shape: 'rectangle' | 'wide' | 'l-shape') => void;
  applyHousePlan: (planId: string) => boolean;
  housePlanId: string | null;
  housePlanName: string | null;
  planRooms: PlanRoomLabel[];
  selectRoom: (id: string | null) => void;
  updatePlanRoom: (id: string, patch: Partial<Pick<PlanRoomLabel, 'name' | 'roomType' | 'floorColor'>>) => void;
  resizePlanRoom: (id: string, widthFt: number, depthFt: number) => void;
  deletePlanRoom: (id: string) => void;
  selectWall: (id: string | null) => void;
  selectOpening: (id: string | null) => void;
  selectSurface: (surface: SurfaceTarget | null) => void;
  addOpening: (wallId: string, type: 'door' | 'window' | 'passage') => boolean;
  updateOpening: (id: string, patch: Partial<Opening>) => boolean;
  deleteOpening: (id: string) => void;
  clearOpeningNotice: () => void;
  addFurniture: (
    catalogId: string,
    name: string,
    category: string,
    dims: [number, number, number],
    color: string,
    x?: number,
    z?: number,
    meta?: FurnitureAddMeta,
  ) => void;
  selectFurniture: (id: string | null) => void;
  updateFurniture: (id: string, patch: Partial<FurnitureItem>) => void;
  updateFurnitureLive: (id: string, patch: Partial<FurnitureItem>) => void;
  moveSelected: (dx: number, dz: number) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  setFinish: (target: SurfaceTarget, color: string) => void;
  addFloor: () => void;
  switchFloor: (id: string) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  save: () => void;
  load: () => void;
  importProject: (data: unknown) => boolean;
  exportProject: () => void;
  projectPayload: () => { version: number; roomType: RoomType; unitSystem: UnitSystem; activeFloorId: string; floors: FloorRecord[] };
};

const initialWalls: Wall[] = [
  { id: 'w1', start: { x: 180, y: 150 }, end: { x: 660, y: 150 }, thickness: 0.15, height: 2.7 },
  { id: 'w2', start: { x: 660, y: 150 }, end: { x: 660, y: 510 }, thickness: 0.15, height: 2.7 },
  { id: 'w3', start: { x: 660, y: 510 }, end: { x: 180, y: 510 }, thickness: 0.15, height: 2.7 },
  { id: 'w4', start: { x: 180, y: 510 }, end: { x: 180, y: 150 }, thickness: 0.15, height: 2.7 },
];
const initial: SceneSnapshot = {
  walls: initialWalls,
  openings: [
    { id: 'o1', wallId: 'w1', type: 'window', offset: 0.55, width: 1.4, height: 1.2, sill: 0.9 },
    { id: 'o2', wallId: 'w3', type: 'door', offset: 0.25, width: 0.9, height: 2.1, sill: 0, swing: 'left' },
  ],
  furniture: [],
  floorColor: '#c9b18f',
  wallColor: '#f3f0e9',
  ceilingColor: '#f4f6f8',
};

function placeFurniture(
  walls: Wall[],
  width: number,
  depth: number,
  height: number,
  x: number,
  z: number,
  meta?: FurnitureAddMeta & { category?: string; name?: string; live?: boolean },
) {
  const mounting = resolveMountingType(meta?.mountingType);
  const constrained = constrainPlacement(x, z, walls, depth, {
    mountingType: mounting,
    category: meta?.category,
    name: meta?.name,
    rotation: meta?.rotation,
    live: meta?.live,
    width,
  });
  let y = 0;
  if (mounting === 'wall') {
    y = Math.min(Math.max(meta?.y ?? 1.4, 0.3), Math.max(0.3, (walls[0]?.height ?? 2.7) - height - 0.05));
  } else if (mounting === 'ceiling') {
    y = Math.max(0.1, (walls[0]?.height ?? 2.7) - height);
  }
  return {
    x: constrained.x,
    z: constrained.z,
    rotation: constrained.rotation ?? meta?.rotation ?? 0,
    wallId: constrained.wallId,
    wallOffset: constrained.wallOffset,
    y: meta?.y !== undefined && mounting !== 'floor' ? meta.y : y,
    mountingType: mounting,
    width,
    depth,
    height,
  };
}

export const usePlannerStore = create<PlannerState>((set, get) => {
  const snap = (): SceneSnapshot => ({
    walls: get().walls,
    openings: get().openings,
    furniture: get().furniture,
    floorColor: get().floorColor,
    wallColor: get().wallColor,
    ceilingColor: get().ceilingColor,
  });
  const commit = (next: SceneSnapshot) =>
    set((s) => {
      const history = s.history.slice(0, s.historyIndex + 1).concat(next).slice(-200);
      const floors = s.floors.map((f) => (f.id === s.activeFloorId ? { ...f, scene: next } : f));
      return { ...next, floors, history, historyIndex: history.length - 1 };
    });
  const mutate = (patch: Partial<SceneSnapshot>) => commit({ ...snap(), ...patch });
  const projectPayload = () => {
    const s = get();
    return {
      version: 4,
      roomType: s.roomType,
      unitSystem: s.unitSystem,
      activeFloorId: s.activeFloorId,
      floors: s.floors.map((f) => (f.id === s.activeFloorId ? { ...f, scene: snap() } : f)),
    };
  };

  return {
    ...initial,
    tool: 'select',
    view: '3d',
    cameraMode: 'orbit',
    roomType: 'Bedroom',
    unitSystem: 'metric',
    selectedWallId: null,
    selectedOpeningId: null,
    selectedFurnitureId: null,
    selectedSurface: null,
    selectedRoomId: null,
    pendingPlacement: null,
    draftStart: null,
    floors: [{ id: 'ground', name: 'Ground floor', scene: initial }],
    activeFloorId: 'ground',
    history: [initial],
    historyIndex: 0,
    openingNotice: '',
    housePlanId: null,
    housePlanName: null,
    planRooms: [],
    setTool: (tool) => set({ tool, draftStart: null }),
    setView: (view) => set({ view, draftStart: null }),
    setCameraMode: (cameraMode) => set({ cameraMode }),
    setRoomType: (roomType) => set({ roomType }),
    setUnitSystem: (unitSystem) => set({ unitSystem }),
    setDraftStart: (draftStart) => set({ draftStart }),
    addWall: (start, end) => {
      if (Math.hypot(end.x - start.x, end.y - start.y) < 20) return;
      mutate({ walls: [...get().walls, { id: crypto.randomUUID(), start, end, thickness: 0.15, height: 2.7 }] });
    },
    updateWall: (id, patch) => mutate({ walls: get().walls.map((w) => (w.id === id ? { ...w, ...patch } : w)) }),
    updateWallEndpoint: (id, end, point) => {
      const wall = get().walls.find((w) => w.id === id);
      if (!wall) return;
      const old = wall[end];
      const same = (p: Point) => Math.hypot(p.x - old.x, p.y - old.y) < 1;
      mutate({
        walls: get().walls.map((w) => ({
          ...w,
          start: same(w.start) ? point : w.start,
          end: same(w.end) ? point : w.end,
        })),
      });
    },
    setWallLength: (id, meters) => {
      const wall = get().walls.find((w) => w.id === id);
      if (!wall || !Number.isFinite(meters)) return;
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const length = Math.hypot(dx, dy) || 1;
      const next = {
        x: wall.start.x + (dx / length) * Math.max(0.25, meters) * 80,
        y: wall.start.y + (dy / length) * Math.max(0.25, meters) * 80,
      };
      get().updateWallEndpoint(id, 'end', next);
    },
    splitWall: (id) => {
      const wall = get().walls.find((w) => w.id === id);
      if (!wall) return;
      const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
      const secondId = crypto.randomUUID();
      const first = { ...wall, end: mid };
      const second = { ...wall, id: secondId, start: mid };
      const walls = get().walls.flatMap((w) => (w.id === id ? [first, second] : [w]));
      const openings = get().openings.map((o) =>
        o.wallId !== id ? o : o.offset <= 0.5 ? { ...o, offset: o.offset * 2 } : { ...o, wallId: secondId, offset: (o.offset - 0.5) * 2 },
      );
      mutate({ walls, openings });
      set({ selectedWallId: id });
    },
    offsetWall: (id, meters) => {
      const wall = get().walls.find((w) => w.id === id);
      if (!wall) return;
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const length = Math.hypot(dx, dy) || 1;
      const shift = { x: (-dy / length) * meters * 80, y: (dx / length) * meters * 80 };
      const start = { x: wall.start.x + shift.x, y: wall.start.y + shift.y };
      const end = { x: wall.end.x + shift.x, y: wall.end.y + shift.y };
      const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 1;
      mutate({
        walls: get().walls.map((w) =>
          w.id === id
            ? { ...w, start, end }
            : {
                ...w,
                start: same(w.start, wall.start) ? start : same(w.start, wall.end) ? end : w.start,
                end: same(w.end, wall.start) ? start : same(w.end, wall.end) ? end : w.end,
              },
        ),
      });
    },
    setCeilingHeight: (meters) => {
      if (!Number.isFinite(meters)) return;
      mutate({ walls: get().walls.map((w) => ({ ...w, height: Math.max(2, Math.min(6, meters)) })) });
    },
    applyRoomTemplate: (shape) => {
      const id = () => crypto.randomUUID();
      const mk = (a: Point, b: Point): Wall => ({ id: id(), start: a, end: b, thickness: 0.15, height: 2.7 });
      let walls: Wall[];
      if (shape === 'wide') {
        const a = { x: 140, y: 170 },
          b = { x: 700, y: 170 },
          c = { x: 700, y: 490 },
          d = { x: 140, y: 490 };
        walls = [mk(a, b), mk(b, c), mk(c, d), mk(d, a)];
      } else if (shape === 'l-shape') {
        const a = { x: 160, y: 150 },
          b = { x: 680, y: 150 },
          c = { x: 680, y: 510 },
          d = { x: 420, y: 510 },
          e = { x: 420, y: 350 },
          f = { x: 160, y: 350 };
        walls = [mk(a, b), mk(b, c), mk(c, d), mk(d, e), mk(e, f), mk(f, a)];
      } else {
        const a = { x: 180, y: 150 },
          b = { x: 660, y: 150 },
          c = { x: 660, y: 510 },
          d = { x: 180, y: 510 };
        walls = [mk(a, b), mk(b, c), mk(c, d), mk(d, a)];
      }
      mutate({ walls, openings: [], furniture: [] });
      set({ selectedWallId: null, selectedOpeningId: null, selectedFurnitureId: null, draftStart: null, tool: 'select', housePlanId: null, housePlanName: null, planRooms: [] });
    },
    applyHousePlan: (planId) => {
      const plan = getHousePlan(planId);
      if (!plan) return false;
      const built = buildHouse(plan);
      const floors: FloorRecord[] = built.floors.map((f) => ({
        id: f.id,
        name: f.name,
        scene: f.scene,
        planRooms: f.roomPolygons,
      }));
      const first = floors[0];
      if (!first) return false;
      set({
        ...first.scene,
        floors,
        activeFloorId: first.id,
        history: [first.scene],
        historyIndex: 0,
        housePlanId: plan.id,
        housePlanName: plan.name,
        planRooms: first.planRooms ?? [],
        selectedWallId: null,
        selectedOpeningId: null,
        selectedFurnitureId: null,
        selectedSurface: null,
        selectedRoomId: null,
        pendingPlacement: null,
        draftStart: null,
        tool: 'select',
        cameraMode: 'top',
        view: '3d',
        unitSystem: 'imperial',
        roomType: 'Living room',
      });
      return true;
    },
    selectWall: (selectedWallId) => set({ selectedWallId, selectedOpeningId: null, selectedFurnitureId: null, selectedSurface: null, selectedRoomId: null }),
    selectOpening: (selectedOpeningId) =>
      set({
        selectedOpeningId,
        selectedWallId: selectedOpeningId ? get().openings.find((o) => o.id === selectedOpeningId)?.wallId ?? null : null,
        selectedFurnitureId: null,
        selectedSurface: null,
        selectedRoomId: null,
      }),
    selectSurface: (selectedSurface) => set({ selectedSurface, selectedWallId: null, selectedOpeningId: null, selectedFurnitureId: null, selectedRoomId: null }),
    selectRoom: (selectedRoomId) =>
      set({
        selectedRoomId,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedFurnitureId: null,
        selectedSurface: selectedRoomId ? 'floor' : null,
        roomType: selectedRoomId ? get().planRooms.find((r) => r.id === selectedRoomId)?.roomType ?? get().roomType : get().roomType,
      }),
    updatePlanRoom: (id, patch) => {
      const planRooms = get().planRooms.map((r) => (r.id === id ? { ...r, ...patch } : r));
      set({
        planRooms,
        floors: get().floors.map((f) => (f.id === get().activeFloorId ? { ...f, planRooms } : f)),
        roomType: patch.roomType && get().selectedRoomId === id ? patch.roomType : get().roomType,
      });
    },
    resizePlanRoom: (id, widthFt, depthFt) => {
      const current = get().planRooms;
      if (!current.some((r) => r.id === id)) return;
      const nextLabels = current.map((r) =>
        r.id === id ? { ...r, points: resizePlanRoomPoints(r.points, widthFt, depthFt) } : r,
      );
      const height = get().walls[0]?.height ?? 2.74;
      const rebuilt = rebuildFromPlanRooms(nextLabels, get().activeFloorId, height);
      const planRooms = rebuilt.roomPolygons.map((p) => ({
        ...p,
        floorColor: nextLabels.find((l) => l.id === p.id)?.floorColor,
      }));
      mutate({
        walls: rebuilt.scene.walls,
        openings: rebuilt.scene.openings,
        furniture: get().furniture,
      });
      set({
        planRooms,
        floors: get().floors.map((f) =>
          f.id === get().activeFloorId ? { ...f, scene: { ...f.scene, walls: rebuilt.scene.walls, openings: rebuilt.scene.openings }, planRooms } : f,
        ),
      });
    },
    deletePlanRoom: (id) => {
      const nextLabels = get().planRooms.filter((r) => r.id !== id);
      if (!nextLabels.length) {
        mutate({ walls: [], openings: [], furniture: get().furniture });
        set({ planRooms: [], selectedRoomId: null, floors: get().floors.map((f) => (f.id === get().activeFloorId ? { ...f, planRooms: [] } : f)) });
        return;
      }
      const height = get().walls[0]?.height ?? 2.74;
      const rebuilt = rebuildFromPlanRooms(nextLabels, get().activeFloorId, height);
      const planRooms = rebuilt.roomPolygons.map((p) => ({
        ...p,
        floorColor: nextLabels.find((l) => l.id === p.id)?.floorColor,
      }));
      mutate({ walls: rebuilt.scene.walls, openings: rebuilt.scene.openings, furniture: get().furniture });
      set({
        planRooms,
        selectedRoomId: get().selectedRoomId === id ? null : get().selectedRoomId,
        floors: get().floors.map((f) =>
          f.id === get().activeFloorId ? { ...f, scene: { ...f.scene, walls: rebuilt.scene.walls, openings: rebuilt.scene.openings }, planRooms } : f,
        ),
      });
    },
    addOpening: (wallId, type) => {
      const id = crypto.randomUUID();
      const candidate: Opening = {
        id,
        wallId,
        type,
        offset: 0.5,
        width: type === 'window' ? 1.2 : 0.9,
        height: type === 'window' ? 1.1 : 2.1,
        sill: type === 'window' ? 0.9 : 0,
        swing: type === 'door' ? 'left' : 'none',
      };
      if (openingConflicts(candidate, get().openings, get().walls).length) {
        set({ openingNotice: 'That opening overlaps another on this wall. Move or resize it first.' });
        return false;
      }
      mutate({ openings: [...get().openings, candidate] });
      set({ selectedOpeningId: id, selectedWallId: wallId, tool: 'select', openingNotice: '' });
      return true;
    },
    updateOpening: (id, patch) => {
      const current = get().openings.find((o) => o.id === id);
      if (!current) return false;
      const next: Opening = {
        ...current,
        ...patch,
        width: patch.width === undefined ? current.width : Math.max(0.3, Math.min(6, patch.width)),
        height: patch.height === undefined ? current.height : Math.max(0.3, Math.min(6, patch.height)),
        offset: patch.offset === undefined ? current.offset : Math.max(0.03, Math.min(0.97, patch.offset)),
      };
      if (openingConflicts(next, get().openings, get().walls).length) {
        set({ openingNotice: 'Openings cannot overlap on the same wall.' });
        return false;
      }
      mutate({ openings: get().openings.map((o) => (o.id === id ? next : o)) });
      set({ openingNotice: '' });
      return true;
    },
    deleteOpening: (id) => {
      mutate({ openings: get().openings.filter((o) => o.id !== id) });
      if (get().selectedOpeningId === id) set({ selectedOpeningId: null });
    },
    clearOpeningNotice: () => set({ openingNotice: '' }),
    beginPlacement: (catalogId, name, category, [width, depth, height], color, x, z, meta) => {
      const walls = get().walls;
      const center = roomFloorCenter(walls);
      const startX = x ?? center.x;
      const startZ = z ?? center.z;
      const placed = placeFurniture(walls, width, depth, height, startX, startZ, {
        ...meta,
        category,
        name,
        live: true,
      });
      set({
        pendingPlacement: {
          catalogId,
          name,
          category,
          color,
          width,
          depth,
          height,
          mountingType: meta?.mountingType ?? placed.mountingType,
          clearance: meta?.clearance,
          x: placed.x,
          z: placed.z,
          y: placed.y,
          rotation: placed.rotation,
          wallId: placed.wallId,
          wallOffset: placed.wallOffset,
        },
        selectedFurnitureId: null,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedSurface: null,
        view: '3d',
      });
    },
    movePendingPlacement: (x, z, rotation) => {
      const pending = get().pendingPlacement;
      if (!pending) return;
      const placed = placeFurniture(get().walls, pending.width, pending.depth, pending.height, x, z, {
        mountingType: pending.mountingType,
        category: pending.category,
        name: pending.name,
        clearance: pending.clearance,
        rotation: rotation ?? pending.rotation,
        y: pending.y,
        live: true,
      });
      set({
        pendingPlacement: {
          ...pending,
          x: placed.x,
          z: placed.z,
          y: placed.y,
          rotation: placed.rotation,
          wallId: placed.wallId,
          wallOffset: placed.wallOffset,
          mountingType: placed.mountingType,
        },
      });
    },
    rotatePendingPlacement: (delta = Math.PI / 2) => {
      const pending = get().pendingPlacement;
      if (!pending) return;
      get().movePendingPlacement(pending.x, pending.z, pending.rotation + delta);
    },
    commitPendingPlacement: () => {
      const pending = get().pendingPlacement;
      if (!pending) return null;
      set({ pendingPlacement: null });
      get().addFurniture(
        pending.catalogId,
        pending.name,
        pending.category,
        [pending.width, pending.depth, pending.height],
        pending.color,
        pending.x,
        pending.z,
        {
          mountingType: pending.mountingType,
          clearance: pending.clearance,
          rotation: pending.rotation,
          y: pending.y,
          wallId: pending.wallId,
          wallOffset: pending.wallOffset,
        },
      );
      return get().selectedFurnitureId;
    },
    cancelPendingPlacement: () => set({ pendingPlacement: null }),
    addFurniture: (catalogId, name, category, [width, depth, height], color, x = 0, z = 0, meta) => {
      const id = crypto.randomUUID();
      const placed = placeFurniture(get().walls, width, depth, height, x, z, { ...meta, category, name });
      mutate({
        furniture: [
          ...get().furniture,
          {
            id,
            catalogId,
            name,
            category,
            color,
            clearance: meta?.clearance,
            showClearance: false,
            ...placed,
          },
        ],
      });
      set({ selectedFurnitureId: id, selectedWallId: null, selectedOpeningId: null, selectedSurface: null, selectedRoomId: null, pendingPlacement: null });
    },
    selectFurniture: (selectedFurnitureId) =>
      set({ selectedFurnitureId, selectedWallId: null, selectedOpeningId: null, selectedSurface: null, selectedRoomId: null }),
    updateFurnitureLive: (id, patch) => set((s) => ({ furniture: s.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
    updateFurniture: (id, patch) => {
      const item = get().furniture.find((f) => f.id === id);
      if (!item) return;
      const mounting = resolveMountingType(patch.mountingType ?? item.mountingType);
      let next: FurnitureItem = { ...item, ...patch, mountingType: mounting };
      if (patch.x !== undefined || patch.z !== undefined || patch.mountingType !== undefined || patch.rotation !== undefined) {
        const placed = placeFurniture(get().walls, next.width, next.depth, next.height, next.x, next.z, {
          mountingType: mounting,
          rotation: next.rotation,
          y: next.y,
          category: next.category,
          name: next.name,
        });
        next = { ...next, ...placed };
      } else {
        if (patch.x !== undefined) next.x = Math.round(patch.x * 4) / 4;
        if (patch.z !== undefined) next.z = Math.round(patch.z * 4) / 4;
      }
      mutate({ furniture: get().furniture.map((f) => (f.id === id ? next : f)) });
    },
    moveSelected: (dx, dz) => {
      const id = get().selectedFurnitureId;
      const item = get().furniture.find((f) => f.id === id);
      if (item) get().updateFurniture(item.id, { x: item.x + dx, z: item.z + dz });
    },
    rotateSelected: (delta = Math.PI / 2) => {
      const item = get().furniture.find((f) => f.id === get().selectedFurnitureId);
      if (item) get().updateFurniture(item.id, { rotation: item.rotation + delta });
    },
    duplicateSelected: () => {
      const item = get().furniture.find((f) => f.id === get().selectedFurnitureId);
      if (!item) return;
      get().addFurniture(item.catalogId, item.name, item.category, [item.width, item.depth, item.height], item.color, item.x + 0.5, item.z + 0.5, {
        mountingType: item.mountingType,
        clearance: item.clearance,
        rotation: item.rotation,
        y: item.y,
      });
    },
    deleteSelected: () => {
      const oid = get().selectedOpeningId;
      const wid = get().selectedWallId;
      const fid = get().selectedFurnitureId;
      if (oid) mutate({ openings: get().openings.filter((o) => o.id !== oid) });
      else if (wid) mutate({ walls: get().walls.filter((w) => w.id !== wid), openings: get().openings.filter((o) => o.wallId !== wid) });
      if (fid) mutate({ furniture: get().furniture.filter((f) => f.id !== fid) });
      set({ selectedWallId: null, selectedOpeningId: null, selectedFurnitureId: null });
    },
    setFinish: (target, color) =>
      mutate(target === 'floor' ? { floorColor: color } : target === 'wall' ? { wallColor: color } : { ceilingColor: color }),
    addFloor: () => {
      const id = crypto.randomUUID();
      const scene: SceneSnapshot = {
        walls: [],
        openings: [],
        furniture: [],
        floorColor: initial.floorColor,
        wallColor: initial.wallColor,
        ceilingColor: initial.ceilingColor,
      };
      set((s) => ({
        ...scene,
        floors: [...s.floors, { id, name: `Floor ${s.floors.length + 1}`, scene }],
        activeFloorId: id,
        history: [scene],
        historyIndex: 0,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedFurnitureId: null,
      }));
    },
    switchFloor: (id) =>
      set((s) => {
        const current = s.floors.map((f) =>
          f.id === s.activeFloorId ? { ...f, scene: snap(), planRooms: s.planRooms } : f,
        );
        const target = current.find((f) => f.id === id);
        return target
          ? {
              ...target.scene,
              floors: current,
              activeFloorId: id,
              history: [target.scene],
              historyIndex: 0,
              selectedWallId: null,
              selectedFurnitureId: null,
              planRooms: target.planRooms ?? [],
            }
          : s;
      }),
    undo: () =>
      set((s) => {
        const i = Math.max(0, s.historyIndex - 1);
        return { ...s.history[i], historyIndex: i, selectedWallId: null, selectedFurnitureId: null };
      }),
    redo: () =>
      set((s) => {
        const i = Math.min(s.history.length - 1, s.historyIndex + 1);
        return { ...s.history[i], historyIndex: i, selectedWallId: null, selectedFurnitureId: null };
      }),
    clear: () => {
      mutate({ ...initial, walls: [], openings: [], furniture: [] });
      set({ selectedWallId: null, selectedFurnitureId: null, draftStart: null, housePlanId: null, housePlanName: null, planRooms: [] });
    },
    projectPayload,
    save: () => {
      const payload = { ...projectPayload(), savedAt: new Date().toISOString() };
      localStorage.setItem('roomcraft-project', JSON.stringify(payload));
      writeRecoverySnapshot(payload);
    },
    load: () => {
      const raw = localStorage.getItem('roomcraft-project');
      if (raw) get().importProject(JSON.parse(raw));
    },
    importProject: (value) => {
      try {
        const data = value as any;
        if (!data || !Array.isArray(data.floors) || !data.floors.length) return false;
        const target = data.floors.find((f: FloorRecord) => f.id === data.activeFloorId) ?? data.floors[0];
        if (!target?.scene || !Array.isArray(target.scene.walls) || !Array.isArray(target.scene.openings) || !Array.isArray(target.scene.furniture)) return false;
        const scene = {
          ...target.scene,
          ceilingColor: target.scene.ceilingColor ?? initial.ceilingColor,
        };
        set({
          ...scene,
          roomType: data.roomType ?? 'Bedroom',
          unitSystem: data.unitSystem ?? 'metric',
          floors: data.floors.map((f: FloorRecord) => ({
            ...f,
            scene: { ...f.scene, ceilingColor: f.scene.ceilingColor ?? initial.ceilingColor },
          })),
          activeFloorId: target.id,
          history: [scene],
          historyIndex: 0,
          selectedWallId: null,
          selectedOpeningId: null,
          selectedFurnitureId: null,
          selectedSurface: null,
        });
        return true;
      } catch {
        return false;
      }
    },
    exportProject: () => {
      const payload = { ...projectPayload(), exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'roomcraft-project.json';
      a.click();
      URL.revokeObjectURL(a.href);
    },
  };
});
