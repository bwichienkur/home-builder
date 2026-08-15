import { create } from 'zustand';
import type { CameraMode, FurnitureItem, MountingType, Opening, OpeningShape, PendingFloorFill, PlanRoomLabel, Point, RoomType, SceneSnapshot, StudioMode, SurfaceTarget, Tool, UnitSystem, Wall, WorkflowStage } from '../types';
import { doorSwingZones, furnitureHitsDoorSwing } from '../lib/geometry/doorClearance';
import { wouldOverlapFurniture } from '../lib/collisions';
import { clampWallMountY, constrainPlacement, openingConflicts, resolveMountingType, roomFloorCenter, WORLD_ORIGIN } from '../lib/geometry/placement';
import { detectRoomPolygons } from '../lib/geometry/rooms';
import { perimeterTrimSegments, type PerimeterTrimEdge } from '../lib/geometry/ceilingTrim';
import { writeRecoverySnapshot } from '../lib/designShare';
import { buildHouse, rebuildFromPlanRooms, resizePlanRoomPoints, shapedRoomPoints, snapRoomCenterToNeighbors, splitPlanRoomPoints, proposedRoomOverlaps, type PlanRoomShape } from '../lib/housePlans/buildPlan';
import { getHousePlan } from '../lib/housePlans/olsenPlans';
import { pointInPlanRoom, wallEndpointForGrowSide, type WallGrowSide } from '../lib/geometry/roomWalls';
import { PIXELS_PER_METER } from '../lib/geometry/snapping';

export type { PlanRoomShape };

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
  pendingFloorFill: PendingFloorFill | null;
  draftStart: Point | null;
  floors: FloorRecord[];
  activeFloorId: string;
  history: SceneSnapshot[];
  historyIndex: number;
  openingNotice: string;
  workflowStage: WorkflowStage;
  studioMode: StudioMode;
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
  movePendingPlacement: (x: number, z: number, rotation?: number, y?: number) => void;
  rotatePendingPlacement: (delta?: number) => void;
  commitPendingPlacement: () => string | null;
  cancelPendingPlacement: () => void;
  beginFloorFill: (fill: PendingFloorFill) => void;
  cancelFloorFill: () => void;
  applyFloorFillToRoom: (roomId: string | null) => boolean;
  rotateSelected: (delta?: number) => void;
  addWall: (a: Point, b: Point) => void;
  updateWall: (id: string, patch: Partial<Wall>) => void;
  updateWallEndpoint: (id: string, end: 'start' | 'end', point: Point) => void;
  updateWallEndpointLive: (id: string, end: 'start' | 'end', point: Point) => void;
  setWallLength: (id: string, meters: number, growSide?: WallGrowSide) => void;
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
  addSquareRoom: (center: Point, widthFt?: number, depthFt?: number, name?: string) => string | null;
  pendingRoomShape: PlanRoomShape | null;
  setPendingRoomShape: (shape: PlanRoomShape | null) => void;
  placePlanRoom: (center: Point, shape?: PlanRoomShape, name?: string) => string | null;
  splitPlanRoom: (id: string, axis?: 'x' | 'y') => void;
  setWorkflowStage: (stage: WorkflowStage) => void;
  setStudioMode: (mode: StudioMode) => void;
  enterHouse: () => void;
  enterRoom: (id: string) => void;
  exitRoom: () => void;
  showStart: () => void;
  selectWall: (id: string | null) => void;
  selectOpening: (id: string | null) => void;
  selectSurface: (surface: SurfaceTarget | null) => void;
  addOpening: (wallId: string, type: 'door' | 'window' | 'passage', shape?: OpeningShape) => boolean;
  updateOpening: (id: string, patch: Partial<Opening>) => boolean;
  updateOpeningLive: (id: string, patch: Partial<Opening>) => void;
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
  /** Apply crown/baseboard strips along the focused room’s wall junctions. */
  applyPerimeterTrim: (
    catalogId: string,
    name: string,
    category: string,
    dims: [number, number, number],
    color: string,
    edge: PerimeterTrimEdge,
  ) => void;
  selectFurniture: (id: string | null) => void;
  updateFurniture: (id: string, patch: Partial<FurnitureItem>) => void;
  updateFurnitureLive: (id: string, patch: Partial<FurnitureItem>) => void;
  moveSelected: (dx: number, dz: number) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  /** Remove every furniture line for a catalog id (shopping bag remove). */
  removeCatalogFromRoom: (catalogId: string) => void;
  /** Remove crown or baseboard runs in the focused room. */
  removePerimeterTrim: (edge: PerimeterTrimEdge) => void;
  /** Clear per-room (or global) floor finish color. */
  clearFloorFinish: () => void;
  setFinish: (target: SurfaceTarget, color: string) => void;
  addFloor: (opts?: { copyActive?: boolean }) => void;
  switchFloor: (id: string) => void;
  renameFloor: (id: string, name: string) => void;
  deleteFloor: (id: string) => boolean;
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
  const host = walls.find((w) => w.id === constrained.wallId) ?? walls[0];
  const wallHeight = host?.height ?? 2.7;
  let y = 0;
  if (mounting === 'wall') {
    y = clampWallMountY(meta?.y ?? 1.4, height, wallHeight);
  } else if (mounting === 'ceiling') {
    y = Math.max(0.1, wallHeight - height);
  }
  return {
    x: constrained.x,
    z: constrained.z,
    rotation: constrained.rotation ?? meta?.rotation ?? 0,
    wallId: constrained.wallId,
    wallOffset: constrained.wallOffset,
    y,
    mountingType: mounting,
    width,
    depth,
    height,
  };
}

/** Prefer the focused plan room; otherwise synthesize from detected wall polygons. */
function focusedTrimRoom(state: {
  selectedRoomId: string | null;
  planRooms: PlanRoomLabel[];
  walls: Wall[];
  roomType: RoomType;
}): PlanRoomLabel | null {
  if (state.selectedRoomId) {
    const room = state.planRooms.find((r) => r.id === state.selectedRoomId);
    if (room) return room;
  }
  if (state.planRooms.length === 1) return state.planRooms[0]!;
  const polys = detectRoomPolygons(state.walls);
  if (polys[0]?.length) {
    return { id: 'focus-room', name: 'Room', roomType: state.roomType, points: polys[0]! };
  }
  return null;
}

function furnitureInRoom(item: FurnitureItem, room: PlanRoomLabel) {
  const planX = item.x * PIXELS_PER_METER + WORLD_ORIGIN.x;
  const planY = item.z * PIXELS_PER_METER + WORLD_ORIGIN.y;
  return pointInPlanRoom(planX, planY, room);
}

export const usePlannerStore = create<PlannerState>((set, get) => {
  const snap = (): SceneSnapshot => ({
    walls: get().walls,
    openings: get().openings,
    furniture: get().furniture,
    floorColor: get().floorColor,
    wallColor: get().wallColor,
    ceilingColor: get().ceilingColor,
    planRooms: get().planRooms,
  });
  const commit = (next: SceneSnapshot) =>
    set((s) => {
      const history = s.history.slice(0, s.historyIndex + 1).concat(next).slice(-200);
      const floors = s.floors.map((f) =>
        f.id === s.activeFloorId ? { ...f, scene: next, planRooms: next.planRooms ?? s.planRooms } : f,
      );
      return { ...next, planRooms: next.planRooms ?? s.planRooms, floors, history, historyIndex: history.length - 1 };
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
    pendingFloorFill: null,
    draftStart: null,
    floors: [{ id: 'ground', name: 'Ground floor', scene: initial }],
    activeFloorId: 'ground',
    history: [initial],
    historyIndex: 0,
    openingNotice: '',
    housePlanId: null,
    housePlanName: null,
    planRooms: [],
    pendingRoomShape: null,
    workflowStage: 'start',
    studioMode: 'architect',
    setTool: (tool) => set({ tool: tool === 'wall' ? 'select' : tool, draftStart: null }),
    setView: (view) => set({ view, draftStart: null }),
    setCameraMode: (cameraMode) => set({ cameraMode }),
    setRoomType: (roomType) => set({ roomType }),
    setUnitSystem: (unitSystem) => set({ unitSystem }),
    setDraftStart: (draftStart) => set({ draftStart }),
    addWall: (start, end) => {
      if (Math.hypot(end.x - start.x, end.y - start.y) < 20) return;
      mutate({ walls: [...get().walls, { id: crypto.randomUUID(), start, end, thickness: 0.15, height: 2.7 }] });
    },
    updateWall: (id, patch) => {
      // Height drives the ceiling plate — keep every wall on the same story height.
      if (patch.height !== undefined) {
        mutate({ walls: get().walls.map((w) => ({ ...w, ...patch, height: patch.height! })) });
        return;
      }
      mutate({ walls: get().walls.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
    },
    updateWallEndpoint: (id, end, point) => {
      const wall = get().walls.find((w) => w.id === id);
      if (!wall) return;
      const old = wall[end];
      const same = (p: Point) => Math.hypot(p.x - old.x, p.y - old.y) < 1;
      const walls = get().walls.map((w) => ({
        ...w,
        start: same(w.start) ? point : w.start,
        end: same(w.end) ? point : w.end,
      }));
      // Floor / ceiling polygons follow wall corners.
      const planRooms = get().planRooms.map((room) => ({
        ...room,
        points: room.points.map((p) => (same(p) ? { ...point } : p)),
      }));
      mutate({ walls });
      set({
        planRooms,
        floors: get().floors.map((f) => (f.id === get().activeFloorId ? { ...f, planRooms, scene: { ...f.scene, walls } } : f)),
      });
    },
    updateWallEndpointLive: (id, end, point) => {
      const wall = get().walls.find((w) => w.id === id);
      if (!wall) return;
      const old = wall[end];
      const same = (p: Point) => Math.hypot(p.x - old.x, p.y - old.y) < 1;
      const walls = get().walls.map((w) => ({
        ...w,
        start: same(w.start) ? point : w.start,
        end: same(w.end) ? point : w.end,
      }));
      const planRooms = get().planRooms.map((room) => ({
        ...room,
        points: room.points.map((p) => (same(p) ? { ...point } : p)),
      }));
      set({ walls, planRooms });
    },
    setWallLength: (id, meters, growSide) => {
      const wall = get().walls.find((w) => w.id === id);
      if (!wall || !Number.isFinite(meters)) return;
      const targetPx = Math.max(0.25, meters) * PIXELS_PER_METER;
      const movingEnd = growSide ? wallEndpointForGrowSide(wall, growSide) : 'end';
      const fixedEnd = movingEnd === 'start' ? 'end' : 'start';
      const fixed = wall[fixedEnd];
      const moving = wall[movingEnd];
      const dx = moving.x - fixed.x;
      const dy = moving.y - fixed.y;
      const length = Math.hypot(dx, dy) || 1;
      const next = {
        x: fixed.x + (dx / length) * targetPx,
        y: fixed.y + (dy / length) * targetPx,
      };
      get().updateWallEndpoint(id, movingEnd, next);
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
      const polys = detectRoomPolygons(walls);
      const planRooms: PlanRoomLabel[] = polys.map((points, i) => ({
        id: crypto.randomUUID(),
        name: i === 0 ? 'Room' : `Room ${i + 1}`,
        roomType: get().roomType,
        points,
      }));
      set({
        selectedWallId: null,
        selectedOpeningId: null,
        selectedFurnitureId: null,
        draftStart: null,
        tool: 'select',
        housePlanId: null,
        housePlanName: null,
        planRooms,
        // Stay at plan level — do not auto-enter room edit / inspector.
        workflowStage: 'house',
        studioMode: 'architect',
        selectedRoomId: null,
        selectedSurface: null,
        pendingRoomShape: null,
        cameraMode: 'top',
        view: '3d',
        floors: get().floors.map((f) =>
          f.id === get().activeFloorId
            ? { ...f, scene: { walls, openings: [], furniture: [], wallColor: get().wallColor, floorColor: get().floorColor, ceilingColor: get().ceilingColor }, planRooms }
            : f,
        ),
      });
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
        workflowStage: 'house',
        studioMode: 'architect',
      });
      return true;
    },
    selectWall: (selectedWallId) =>
      set({
        selectedWallId,
        selectedOpeningId: null,
        selectedFurnitureId: null,
        selectedSurface: null,
        selectedRoomId:
          get().workflowStage === 'room' ? get().selectedRoomId : selectedWallId ? null : get().selectedRoomId,
      }),
    selectOpening: (selectedOpeningId) =>
      set({
        selectedOpeningId,
        // Keep the current room framing — do not select the host wall (that zooms the plan).
        selectedWallId: null,
        selectedFurnitureId: null,
        selectedSurface: null,
        selectedRoomId: get().workflowStage === 'room' ? get().selectedRoomId : null,
      }),
    selectSurface: (selectedSurface) =>
      set({
        selectedSurface,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedFurnitureId: null,
        selectedRoomId: get().workflowStage === 'room' ? get().selectedRoomId : null,
      }),
    selectRoom: (selectedRoomId) =>
      set({
        selectedRoomId,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedFurnitureId: null,
        selectedSurface: null,
        roomType: selectedRoomId ? get().planRooms.find((r) => r.id === selectedRoomId)?.roomType ?? get().roomType : get().roomType,
        // Selecting a room at plan level must not enter room focus — use enterRoom for that.
      }),
    setWorkflowStage: (workflowStage) => set({ workflowStage }),
    setStudioMode: (studioMode) => set({ studioMode }),
    enterHouse: () =>
      set({
        workflowStage: 'house',
        studioMode: 'architect',
        selectedRoomId: null,
        selectedFurnitureId: null,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedSurface: null,
        pendingPlacement: null,
        cameraMode: 'top',
        view: '3d',
      }),
    enterRoom: (id) => {
      const room = get().planRooms.find((r) => r.id === id);
      if (!room) return;
      set({
        workflowStage: 'room',
        selectedRoomId: id,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedFurnitureId: null,
        selectedSurface: null,
        roomType: room.roomType,
        cameraMode: 'top',
        view: '3d',
        tool: 'select',
        draftStart: null,
      });
    },
    exitRoom: () =>
      set({
        workflowStage: 'house',
        studioMode: 'architect',
        selectedRoomId: null,
        selectedSurface: null,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedFurnitureId: null,
        pendingPlacement: null,
        cameraMode: 'top',
        view: '3d',
        tool: 'select',
        draftStart: null,
      }),
    showStart: () =>
      set({
        workflowStage: 'start',
        studioMode: 'architect',
        selectedRoomId: null,
        selectedFurnitureId: null,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedSurface: null,
        pendingPlacement: null,
      }),
    updatePlanRoom: (id, patch) => {
      const planRooms = get().planRooms.map((r) => (r.id === id ? { ...r, ...patch } : r));
      // Floor finish changes must be undoable with the scene.
      if (patch.floorColor !== undefined) {
        mutate({
          planRooms,
          floorColor: get().selectedRoomId === id || get().planRooms.length <= 1 ? patch.floorColor : get().floorColor,
        });
        set({
          roomType: patch.roomType && get().selectedRoomId === id ? patch.roomType : get().roomType,
        });
        return;
      }
      set({
        planRooms,
        floors: get().floors.map((f) => (f.id === get().activeFloorId ? { ...f, planRooms } : f)),
        roomType: patch.roomType && get().selectedRoomId === id ? patch.roomType : get().roomType,
      });
    },
    beginFloorFill: (fill) =>
      set({
        pendingFloorFill: fill,
        pendingPlacement: null,
        studioMode: 'furnish',
        openingNotice: 'Tap a room floor to apply this tile everywhere in that room.',
      }),
    cancelFloorFill: () => set({ pendingFloorFill: null, openingNotice: '' }),
    applyFloorFillToRoom: (roomId) => {
      const fill = get().pendingFloorFill;
      if (!fill) return false;
      const id = roomId ?? get().selectedRoomId;
      if (id) {
        get().updatePlanRoom(id, { floorColor: fill.color });
      } else {
        mutate({ floorColor: fill.color });
      }
      set({ pendingFloorFill: null, openingNotice: `Applied ${fill.name} to the floor.` });
      return true;
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
    addSquareRoom: (center, widthFt = 12, depthFt = 12, name) => {
      // Prefer shaped placement; width/depth kept for API compat (rectangle uses 12×12 defaults).
      void widthFt;
      void depthFt;
      return get().placePlanRoom(center, 'rectangle', name);
    },
    setPendingRoomShape: (pendingRoomShape) =>
      set({
        pendingRoomShape,
        tool: pendingRoomShape ? 'room' : get().tool === 'room' ? 'select' : get().tool,
        draftStart: null,
        selectedWallId: null,
        studioMode: 'architect',
      }),
    placePlanRoom: (center, shape, name) => {
      const kind = shape ?? get().pendingRoomShape ?? 'rectangle';
      const snapped = snapRoomCenterToNeighbors(center, kind, get().planRooms);
      if (proposedRoomOverlaps(snapped, kind, get().planRooms)) {
        set({ openingNotice: 'Place rooms beside existing ones — they can’t overlap.' });
        return null;
      }
      const id = crypto.randomUUID();
      const roomType = get().roomType;
      const label: PlanRoomLabel = {
        id,
        name: name ?? `Room ${get().planRooms.length + 1}`,
        roomType,
        points: shapedRoomPoints(kind, snapped),
      };
      const nextLabels = [...get().planRooms, label];
      const height = get().walls[0]?.height ?? 2.74;
      const rebuilt = rebuildFromPlanRooms(nextLabels, get().activeFloorId, height);
      const planRooms = rebuilt.roomPolygons.map((p) => ({
        ...p,
        floorColor: nextLabels.find((l) => l.id === p.id)?.floorColor,
      }));
      mutate({ walls: rebuilt.scene.walls, openings: rebuilt.scene.openings, furniture: get().furniture });
      set({
        planRooms,
        selectedRoomId: id,
        workflowStage: 'house',
        studioMode: 'architect',
        selectedSurface: null,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedFurnitureId: null,
        pendingRoomShape: null,
        cameraMode: 'top',
        view: '3d',
        tool: 'select',
        draftStart: null,
        floors: get().floors.map((f) =>
          f.id === get().activeFloorId ? { ...f, scene: { ...f.scene, walls: rebuilt.scene.walls, openings: rebuilt.scene.openings }, planRooms } : f,
        ),
      });
      return id;
    },
    splitPlanRoom: (id, axis) => {
      const current = get().planRooms;
      const room = current.find((r) => r.id === id);
      if (!room) return;
      const [aPts, bPts] = splitPlanRoomPoints(room.points, axis);
      const bId = crypto.randomUUID();
      const nextLabels: PlanRoomLabel[] = current.flatMap((r) =>
        r.id !== id
          ? [r]
          : [
              { ...r, points: aPts },
              { ...r, id: bId, name: `${r.name} B`, points: bPts },
            ],
      );
      const height = get().walls[0]?.height ?? 2.74;
      const rebuilt = rebuildFromPlanRooms(nextLabels, get().activeFloorId, height);
      const planRooms = rebuilt.roomPolygons.map((p) => ({
        ...p,
        floorColor: nextLabels.find((l) => l.id === p.id)?.floorColor,
      }));
      mutate({ walls: rebuilt.scene.walls, openings: rebuilt.scene.openings, furniture: get().furniture });
      set({
        planRooms,
        selectedRoomId: id,
        workflowStage: 'room',
        floors: get().floors.map((f) =>
          f.id === get().activeFloorId ? { ...f, scene: { ...f.scene, walls: rebuilt.scene.walls, openings: rebuilt.scene.openings }, planRooms } : f,
        ),
      });
    },
    addOpening: (wallId, type, shape = 'rect') => {
      const id = crypto.randomUUID();
      const wide = shape === 'wide';
      const candidate: Opening = {
        id,
        wallId,
        type,
        offset: 0.5,
        width: type === 'window' ? (wide ? 1.8 : 1.2) : wide ? 1.2 : 0.9,
        height: type === 'window' ? (shape === 'arch' ? 1.4 : 1.1) : 2.1,
        // Doors and passages stay on the ground; windows may have a sill.
        sill: type === 'window' ? 0.9 : 0,
        swing: type === 'door' ? 'left' : 'none',
        face: 'in',
        shape,
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
      const nextType = patch.type ?? current.type;
      const next: Opening = {
        ...current,
        ...patch,
        width: patch.width === undefined ? current.width : Math.max(0.3, Math.min(6, patch.width)),
        height: patch.height === undefined ? current.height : Math.max(0.3, Math.min(6, patch.height)),
        offset: patch.offset === undefined ? current.offset : Math.max(0.03, Math.min(0.97, patch.offset)),
        sill: nextType === 'window' ? (patch.sill === undefined ? current.sill : Math.max(0, patch.sill)) : 0,
      };
      if (openingConflicts(next, get().openings, get().walls).length) {
        set({ openingNotice: 'Openings cannot overlap on the same wall.' });
        return false;
      }
      mutate({ openings: get().openings.map((o) => (o.id === id ? next : o)) });
      set({ openingNotice: '' });
      return true;
    },
    updateOpeningLive: (id, patch) => {
      const current = get().openings.find((o) => o.id === id);
      if (!current) return;
      const nextType = patch.type ?? current.type;
      const next: Opening = {
        ...current,
        ...patch,
        width: patch.width === undefined ? current.width : Math.max(0.3, Math.min(6, patch.width)),
        height: patch.height === undefined ? current.height : Math.max(0.3, Math.min(6, patch.height)),
        offset: patch.offset === undefined ? current.offset : Math.max(0.03, Math.min(0.97, patch.offset)),
        sill: nextType === 'window' ? (patch.sill === undefined ? current.sill : Math.max(0, patch.sill)) : 0,
      };
      set({ openings: get().openings.map((o) => (o.id === id ? next : o)) });
    },
    deleteOpening: (id) => {
      mutate({ openings: get().openings.filter((o) => o.id !== id) });
      if (get().selectedOpeningId === id) set({ selectedOpeningId: null });
    },
    clearOpeningNotice: () => set({ openingNotice: '' }),
    beginPlacement: (catalogId, name, category, [width, depth, height], color, x, z, meta) => {
      if (get().workflowStage !== 'room') return;
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
        pendingFloorFill: null,
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
    movePendingPlacement: (x, z, rotation, y) => {
      const pending = get().pendingPlacement;
      if (!pending) return;
      const placed = placeFurniture(get().walls, pending.width, pending.depth, pending.height, x, z, {
        mountingType: pending.mountingType,
        category: pending.category,
        name: pending.name,
        clearance: pending.clearance,
        rotation: rotation ?? pending.rotation,
        y: y ?? pending.y,
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
      const probe = {
        id: '__pending__',
        x: pending.x,
        y: pending.y ?? 0,
        z: pending.z,
        width: pending.width,
        depth: pending.depth,
        height: pending.height,
        rotation: pending.rotation,
        mountingType: pending.mountingType as import('../types').MountingType | undefined,
      };
      if (furnitureHitsDoorSwing(probe, doorSwingZones(get().openings, get().walls))) {
        set({ openingNotice: 'Cannot place in a door clearance zone. Move clear of the opening.' });
        return null;
      }
      if (wouldOverlapFurniture(probe, get().furniture)) {
        set({ openingNotice: 'Cannot stack items. Move clear of other products.' });
        return null;
      }
      set({ pendingPlacement: null, openingNotice: '' });
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
      set({
        selectedFurnitureId: id,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedSurface: null,
        selectedRoomId: get().workflowStage === 'room' ? get().selectedRoomId : null,
        pendingPlacement: null,
      });
    },
    applyPerimeterTrim: (catalogId, name, category, [, depth, height], color, edge) => {
      if (get().workflowStage !== 'room') {
        set({ openingNotice: 'Enter a room to apply trim.' });
        return;
      }
      const room = focusedTrimRoom(get());
      if (!room) {
        set({ openingNotice: 'Select a room first to apply trim.' });
        return;
      }
      const segments = perimeterTrimSegments(room, get().walls, {
        profileDepth: depth,
        profileHeight: height,
        edge,
        furniture: get().furniture,
      });
      if (!segments.length) {
        set({ openingNotice: 'No wall corners found for trim in this room.' });
        return;
      }
      const runId = crypto.randomUUID();
      const existingRuns = new Set(
        get()
          .furniture.filter(
            (f) =>
              f.catalogId === catalogId &&
              f.placementKind === 'perimeter-trim' &&
              furnitureInRoom(f, room),
          )
          .map((f) => f.runId)
          .filter(Boolean) as string[],
      );
      const kept = get().furniture.filter((f) => !(f.runId && existingRuns.has(f.runId)));
      const mounting: MountingType = edge === 'ceiling' ? 'ceiling' : 'floor';
      const strips: FurnitureItem[] = segments.map((seg) => ({
        id: crypto.randomUUID(),
        catalogId,
        name,
        category,
        color,
        x: seg.x,
        y: seg.y,
        z: seg.z,
        rotation: seg.rotation,
        width: seg.width,
        depth: seg.depth,
        height: seg.height,
        mountingType: mounting,
        wallId: seg.wallId,
        wallOffset: seg.wallOffset,
        placementKind: 'perimeter-trim',
        runId,
        trimEdge: edge,
        showClearance: false,
      }));
      mutate({ furniture: [...kept, ...strips] });
      set({
        selectedFurnitureId: strips[0]?.id ?? null,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedSurface: null,
        pendingPlacement: null,
        openingNotice: '',
      });
    },
    selectFurniture: (selectedFurnitureId) =>
      set({
        selectedFurnitureId,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedSurface: null,
        selectedRoomId: get().workflowStage === 'room' ? get().selectedRoomId : null,
      }),
    updateFurnitureLive: (id, patch) => {
      const item = get().furniture.find((f) => f.id === id);
      if (item?.placementKind === 'perimeter-trim') return;
      set((s) => ({ furniture: s.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
    },
    updateFurniture: (id, patch) => {
      const item = get().furniture.find((f) => f.id === id);
      if (!item) return;
      if (item.placementKind === 'perimeter-trim') {
        // Trim is on/off for shape — only finish + profile height (affects $/LF take-off).
        const runId = item.runId;
        if (!runId) return;
        const nextHeight = patch.height;
        const nextColor = patch.color;
        const nextName = patch.name;
        if (nextHeight === undefined && nextColor === undefined && nextName === undefined) return;
        mutate({
          furniture: get().furniture.map((f) => {
            if (f.runId !== runId) return f;
            const y =
              nextHeight !== undefined && f.trimEdge === 'ceiling'
                ? Math.max(0.05, (get().walls.find((w) => w.id === f.wallId)?.height ?? 2.7) - nextHeight)
                : f.y;
            return {
              ...f,
              ...(nextColor !== undefined ? { color: nextColor } : {}),
              ...(nextName !== undefined ? { name: nextName } : {}),
              ...(nextHeight !== undefined
                ? {
                    height: Math.max(0.03, nextHeight),
                    y: f.trimEdge === 'floor' ? 0 : y,
                  }
                : {}),
            };
          }),
        });
        return;
      }
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
        if (patch.y !== undefined && mounting === 'wall') {
          const host = get().walls.find((w) => w.id === next.wallId) ?? get().walls[0];
          next.y = clampWallMountY(patch.y, next.height, host?.height ?? 2.7);
        }
      }
      mutate({ furniture: get().furniture.map((f) => (f.id === id ? next : f)) });
    },
    moveSelected: (dx, dz) => {
      const id = get().selectedFurnitureId;
      const item = get().furniture.find((f) => f.id === id);
      if (!item || item.placementKind === 'perimeter-trim') return;
      get().updateFurniture(item.id, { x: item.x + dx, z: item.z + dz });
    },
    rotateSelected: (delta = Math.PI / 2) => {
      const item = get().furniture.find((f) => f.id === get().selectedFurnitureId);
      if (!item || item.placementKind === 'perimeter-trim') return;
      // Wall mounts: rotate in the wall plane (roll), not yaw off the wall.
      if (item.mountingType === 'wall') {
        get().updateFurniture(item.id, { roll: (item.roll ?? 0) + delta });
        return;
      }
      get().updateFurniture(item.id, { rotation: item.rotation + delta });
    },
    duplicateSelected: () => {
      const item = get().furniture.find((f) => f.id === get().selectedFurnitureId);
      if (!item || item.placementKind === 'perimeter-trim') return;
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
      if (fid) {
        const item = get().furniture.find((f) => f.id === fid);
        if (item?.runId) mutate({ furniture: get().furniture.filter((f) => f.runId !== item.runId) });
        else mutate({ furniture: get().furniture.filter((f) => f.id !== fid) });
      }
      set({ selectedWallId: null, selectedOpeningId: null, selectedFurnitureId: null });
    },
    removeCatalogFromRoom: (catalogId) => {
      mutate({
        furniture: get().furniture.filter((f) => f.catalogId !== catalogId),
      });
      const sel = get().selectedFurnitureId;
      if (sel && !get().furniture.some((f) => f.id === sel)) set({ selectedFurnitureId: null });
    },
    removePerimeterTrim: (edge) => {
      const room = focusedTrimRoom(get());
      mutate({
        furniture: get().furniture.filter((f) => {
          if (f.placementKind !== 'perimeter-trim' || f.trimEdge !== edge) return true;
          if (!room) return false;
          return !furnitureInRoom(f, room);
        }),
      });
      set({ selectedFurnitureId: null, openingNotice: edge === 'ceiling' ? 'Crown molding removed.' : 'Baseboard removed.' });
    },
    clearFloorFinish: () => {
      const roomId = get().selectedRoomId;
      if (roomId) {
        get().updatePlanRoom(roomId, { floorColor: undefined });
        set({ openingNotice: 'Floor finish cleared for this room.' });
        return;
      }
      mutate({ floorColor: '#c9b18f' });
      set({ openingNotice: 'Floor finish reset.' });
    },
    setFinish: (target, color) => {
      if (target === 'floor') {
        const roomId = get().selectedRoomId;
        if (roomId) {
          get().updatePlanRoom(roomId, { floorColor: color });
          return;
        }
        mutate({ floorColor: color });
        return;
      }
      mutate(target === 'wall' ? { wallColor: color } : { ceilingColor: color });
    },
    addFloor: (opts) => {
      const id = crypto.randomUUID();
      const n = get().floors.length + 1;
      const name = n === 1 ? 'First story' : n === 2 ? 'Second story' : `Story ${n}`;
      const copy = !!opts?.copyActive;
      const source = get();
      // Persist current floor before switching.
      const floors = source.floors.map((f) =>
        f.id === source.activeFloorId ? { ...f, scene: snap(), planRooms: source.planRooms } : f,
      );
      let scene: SceneSnapshot;
      let planRooms: PlanRoomLabel[];
      if (copy && source.planRooms.length) {
        const height = source.walls[0]?.height ?? 2.74;
        const nextLabels = source.planRooms.map((r) => ({
          ...r,
          id: crypto.randomUUID(),
          points: r.points.map((p) => ({ ...p })),
        }));
        const rebuilt = rebuildFromPlanRooms(nextLabels, id, height);
        planRooms = rebuilt.roomPolygons.map((p) => ({
          ...p,
          floorColor: nextLabels.find((l) => l.id === p.id)?.floorColor,
        }));
        scene = {
          ...rebuilt.scene,
          floorColor: source.floorColor,
          wallColor: source.wallColor,
          ceilingColor: source.ceilingColor,
        };
      } else if (copy) {
        scene = {
          walls: source.walls.map((w) => ({ ...w, id: crypto.randomUUID() })),
          openings: [],
          furniture: [],
          floorColor: source.floorColor,
          wallColor: source.wallColor,
          ceilingColor: source.ceilingColor,
        };
        planRooms = [];
      } else {
        scene = {
          walls: [],
          openings: [],
          furniture: [],
          floorColor: initial.floorColor,
          wallColor: initial.wallColor,
          ceilingColor: initial.ceilingColor,
        };
        planRooms = [];
      }
      set({
        ...scene,
        floors: [...floors, { id, name, scene, planRooms }],
        activeFloorId: id,
        planRooms,
        history: [scene],
        historyIndex: 0,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedFurnitureId: null,
        selectedRoomId: null,
        selectedSurface: null,
        pendingPlacement: null,
        workflowStage: 'house',
        cameraMode: 'top',
        view: '3d',
        tool: 'select',
        draftStart: null,
      });
    },
    switchFloor: (id) =>
      set((s) => {
        if (id === s.activeFloorId) return s;
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
              selectedOpeningId: null,
              selectedFurnitureId: null,
              selectedSurface: null,
              selectedRoomId: null,
              pendingPlacement: null,
              planRooms: target.planRooms ?? [],
              workflowStage: 'house',
              cameraMode: 'top',
              view: '3d',
              tool: 'select',
              draftStart: null,
            }
          : s;
      }),
    renameFloor: (id, name) =>
      set((s) => ({
        floors: s.floors.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)),
      })),
    deleteFloor: (id) => {
      const state = get();
      if (state.floors.length <= 1) return false;
      // Persist current floor scene before removing another (or self).
      const persisted = state.floors.map((f) =>
        f.id === state.activeFloorId ? { ...f, scene: snap(), planRooms: state.planRooms } : f,
      );
      const remaining = persisted.filter((f) => f.id !== id);
      if (!remaining.length) return false;
      const deletingActive = state.activeFloorId === id;
      const next = deletingActive ? remaining[0] : remaining.find((f) => f.id === state.activeFloorId) ?? remaining[0];
      if (!next) return false;
      set({
        ...next.scene,
        floors: remaining,
        activeFloorId: next.id,
        planRooms: next.planRooms ?? [],
        history: [next.scene],
        historyIndex: 0,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedFurnitureId: null,
        selectedRoomId: null,
        selectedSurface: null,
        pendingPlacement: null,
        workflowStage: 'house',
        studioMode: 'architect',
        cameraMode: 'top',
        view: '3d',
        tool: 'select',
        draftStart: null,
      });
      return true;
    },
    undo: () =>
      set((s) => {
        const i = Math.max(0, s.historyIndex - 1);
        const entry = s.history[i]!;
        return {
          ...entry,
          planRooms: entry.planRooms ?? s.planRooms,
          historyIndex: i,
          selectedWallId: null,
          selectedFurnitureId: null,
          selectedOpeningId: null,
        };
      }),
    redo: () =>
      set((s) => {
        const i = Math.min(s.history.length - 1, s.historyIndex + 1);
        const entry = s.history[i]!;
        return {
          ...entry,
          planRooms: entry.planRooms ?? s.planRooms,
          historyIndex: i,
          selectedWallId: null,
          selectedFurnitureId: null,
          selectedOpeningId: null,
        };
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
          selectedRoomId: null,
          planRooms: target.planRooms ?? [],
          housePlanId: data.housePlanId ?? null,
          housePlanName: data.housePlanName ?? null,
          workflowStage: target.scene.walls?.length ? 'house' : 'start',
          studioMode: 'architect',
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
