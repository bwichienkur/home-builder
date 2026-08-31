import { create } from 'zustand';
import type { CameraMode, FurnitureItem, LayerVisibility, ManualBomLine, MountingType, Opening, OpeningShape, PendingFloorFill, PlanAnnotation, PlanRoomLabel, Point, RoomType, SceneSnapshot, StudioMode, SurfaceTarget, Tool, UnitSystem, Wall, WorkflowStage } from '../types';
import { DEFAULT_LAYER_VISIBILITY } from '../types';
import { clampOpeningOffset, wallOffsetFromWorldPoint } from '../lib/geometry/wallOpenings';
import { doorSwingZones, furnitureHitsDoorSwing } from '../lib/geometry/doorClearance';
import { wouldOverlapFurniture } from '../lib/collisions';
import { clampWallMountY, constrainPlacement, openingConflicts, pointInWorldRooms, resolveMountingType, roomFloorCenter, WORLD_ORIGIN } from '../lib/geometry/placement';
import { detectRoomPolygons } from '../lib/geometry/rooms';
import { perimeterTrimSegments, type PerimeterTrimEdge } from '../lib/geometry/ceilingTrim';
import { writeRecoverySnapshot } from '../lib/designShare';
import { buildHouse, rebuildFromPlanRooms, resizePlanRoomPoints, shapedRoomPoints, snapRoomCenterToNeighbors, splitPlanRoomPoints, proposedRoomOverlaps, planRoomLabelOverlaps, attachSquareRoomPoints, attachSideBlocked, nudgePlanRoomsByWall, planRoomsCenterFt, movePlanRoomVertexPoints, insertPlanRoomVertexPoints, removePlanRoomVertexPoints, type PlanRoomShape, type AttachSide } from '../lib/housePlans/buildPlan';
import type { HousePlan } from '../lib/housePlans/buildPlan';
import { cadBuildCenterFt } from '../lib/housePlans/dxfCadBuild';
import { getHousePlan } from '../lib/housePlans/planRegistry';
import { remapFurnitureAfterPlanRebuild } from '../lib/geometry/planFurnitureRemap';
import { remapOpeningsAfterPlanRebuild } from '../lib/geometry/planOpeningRemap';
import { pointInPlanRoom, planRoomEdgeIndexForWall, wallEndpointForGrowSide, type WallGrowSide } from '../lib/geometry/roomWalls';
import { clampInsertT, projectPointOntoPolygonOutline } from '../lib/geometry/planCornerGhost';
import { PIXELS_PER_METER } from '../lib/geometry/snapping';

export type { PlanRoomShape, AttachSide };

type View = '2d' | '3d';
type FloorRecord = {
  id: string;
  name: string;
  scene: SceneSnapshot;
  planRooms?: PlanRoomLabel[];
  /** Floor-to-floor height used for stacking and IFC elevations (m). */
  storyHeightM?: number;
  /** CAD wall centerlines (feet). When set, room edits keep CAD walls. */
  wallSegmentsFt?: HousePlan['floors'][number]['wallSegmentsFt'];
  /** Door/window hints from DXF (feet, same origin as wallSegmentsFt). */
  openingHintsFt?: HousePlan['floors'][number]['openingHintsFt'];
  /** Exact DXF linework for Plan CAD overlay (feet). */
  cadPlanVectorsFt?: HousePlan['floors'][number]['cadPlanVectorsFt'];
  /** Plate center used when CAD walls were first projected to pixels. */
  cadBuildCenterFt?: { cx: number; cy: number };
};
export type { FloorRecord };
export type FurnitureAddMeta = {
  mountingType?: MountingType | string;
  clearance?: FurnitureItem['clearance'];
  rotation?: number;
  y?: number;
  wallId?: string | null;
  wallOffset?: number | null;
};

/** Ghost corner on a room outline, awaiting Confirm. */
export type PendingCorner = {
  roomId: string;
  edgeIndex: number;
  t: number;
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
  /** Plan / 3D view yaw in degrees — 0, 90, 180, or 270. */
  viewYawDeg: number;
  /** Which facade the elevation (side) ortho view faces. */
  elevationFace: import('../types').ElevationFace;
  roomType: RoomType;
  unitSystem: UnitSystem;
  selectedWallId: string | null;
  selectedOpeningId: string | null;
  selectedFurnitureId: string | null;
  selectedSurface: SurfaceTarget | null;
  selectedRoomId: string | null;
  pendingPlacement: PendingPlacement | null;
  pendingCorner: PendingCorner | null;
  /** Highlight a polygon vertex after inserting a corner. */
  selectedVertexIndex: number | null;
  pendingFloorFill: PendingFloorFill | null;
  draftStart: Point | null;
  floors: FloorRecord[];
  activeFloorId: string;
  /** Orbit dollhouse: draw every floor stacked by story height. */
  stackView: boolean;
  setStackView: (on: boolean) => void;
  roofStyle: import('../types').RoofStyle;
  setRoofStyle: (style: import('../types').RoofStyle) => void;
  siteSetback: import('../types').SiteSetback;
  setSiteSetback: (setback: import('../types').SiteSetback) => void;
  layerVisibility: LayerVisibility;
  setLayerVisibility: (patch: Partial<LayerVisibility>) => void;
  annotations: PlanAnnotation[];
  selectedAnnotationId: string | null;
  addAnnotation: (kind: PlanAnnotation['kind'], x: number, z: number, text?: string) => string;
  updateAnnotation: (id: string, patch: Partial<PlanAnnotation>) => void;
  deleteAnnotation: (id: string) => void;
  selectAnnotation: (id: string | null) => void;
  /** Linked CRM client for this design (optional). */
  clientId: string | null;
  setClientId: (id: string | null) => void;
  /** Latest estimate frozen on save (also embedded in projectPayload). */
  estimateSnapshot: import('../lib/estimateSnapshot').EstimateSnapshot | null;
  /** Locked baseline for change-order diffs. */
  baselineEstimate: import('../lib/estimateSnapshot').EstimateSnapshot | null;
  setEstimateSnapshot: (snap: import('../lib/estimateSnapshot').EstimateSnapshot | null) => void;
  lockEstimateBaseline: () => void;
  clearEstimateBaseline: () => void;
  /** Numbered change-order records minted from baseline diffs. */
  changeOrders: import('../lib/estimateSnapshot').ChangeOrderRecord[];
  addChangeOrder: (record: import('../lib/estimateSnapshot').ChangeOrderRecord) => void;
  clearChangeOrders: () => void;
  setChangeOrderStatus: (
    id: string,
    status: import('../lib/estimateSnapshot').ChangeOrderStatus,
  ) => void;
  vendorQuotes: import('../lib/estimateSnapshot').VendorQuote[];
  addVendorQuote: (quote: Omit<import('../lib/estimateSnapshot').VendorQuote, 'id'> & { id?: string }) => void;
  removeVendorQuote: (id: string) => void;
  bidSettings: import('../lib/estimateSnapshot').BidSettings;
  setBidSettings: (patch: Partial<import('../lib/estimateSnapshot').BidSettings>) => void;
  history: SceneSnapshot[];
  historyIndex: number;
  openingNotice: string;
  workflowStage: WorkflowStage;
  studioMode: StudioMode;
  /** Extra shopping-list lines the user added by hand. */
  manualBomLines: ManualBomLine[];
  addManualBomLine: (line: Omit<ManualBomLine, 'id'>) => void;
  removeManualBomLine: (id: string) => void;
  setTool: (tool: Tool) => void;
  setView: (view: View) => void;
  setCameraMode: (mode: CameraMode) => void;
  setElevationFace: (face: import('../types').ElevationFace) => void;
  /** Rotate plan and 3D framing by 90° (default) or `deltaDeg`. */
  rotateViewYaw: (deltaDeg?: number) => void;
  setViewYawDeg: (deg: number) => void;
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
  applyHousePlanObject: (plan: HousePlan) => boolean;
  housePlanId: string | null;
  housePlanName: string | null;
  planRooms: PlanRoomLabel[];
  selectRoom: (id: string | null) => void;
  updatePlanRoom: (id: string, patch: Partial<Pick<PlanRoomLabel, 'name' | 'roomType' | 'floorColor' | 'floorCatalogId' | 'floorName' | 'wallColor' | 'ceilingColor' | 'wallCatalogId' | 'ceilingCatalogId'>>) => void;
  resizePlanRoom: (id: string, widthFt: number, depthFt: number) => void;
  deletePlanRoom: (id: string) => void;
  addSquareRoom: (center: Point, widthFt?: number, depthFt?: number, name?: string) => string | null;
  pendingRoomShape: PlanRoomShape | null;
  setPendingRoomShape: (shape: PlanRoomShape | null) => void;
  /** Plan-level “Add room” mode — pick a side of the selected room. */
  pendingAttachMode: boolean;
  setPendingAttachMode: (on: boolean) => void;
  /** When true, plan-level Walls tool shows the room dimension card (no per-wall picks). */
  planWallTool: boolean;
  setPlanWallTool: (on: boolean) => void;
  placePlanRoom: (center: Point, shape?: PlanRoomShape, name?: string) => string | null;
  /** Attach a square room flush to a host on left/right/top/bottom. */
  attachPlanRoom: (hostId: string, side: AttachSide, name?: string) => string | null;
  /** Translate a plan room in world meters; rebuilds walls and remaps furniture/trim. */
  movePlanRoom: (id: string, dxM: number, dzM: number, opts?: { live?: boolean }) => boolean;
  /** Push current plan geometry onto undo history after a live room drag. */
  commitPlanRoomMove: () => void;
  /** Drag a polygon vertex (plan pixels) for angled / non-rect rooms. */
  movePlanRoomVertex: (id: string, vertexIndex: number, point: Point, opts?: { live?: boolean }) => boolean;
  commitPlanRoomVertex: () => void;
  insertPlanRoomVertex: (id: string, edgeIndex: number, t?: number) => boolean;
  beginPendingCorner: (roomId: string, planPoint: Point) => boolean;
  movePendingCorner: (planPoint: Point) => boolean;
  commitPendingCorner: () => boolean;
  cancelPendingCorner: () => void;
  removePlanRoomVertex: (id: string, vertexIndex: number) => boolean;
  /** Place a stair annotation linking two floors. */
  addStair: (fromFloorId: string, toFloorId: string, x?: number, z?: number) => void;
  /** Drag a wall perpendicular to itself to change room width/depth. */
  nudgeWall: (id: string, dxM: number, dzM: number, opts?: { live?: boolean }) => boolean;
  commitWallNudge: () => void;
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
  /** Place opening on a wall at a world XZ point (plan click). */
  placeOpeningAtWorld: (wallId: string, type: 'door' | 'window' | 'passage', worldX: number, worldZ: number) => boolean;
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
  applyLookbookToRoom: (opts: {
    roomId?: string | null;
    floorColor?: string;
    floorCatalogId?: string;
    floorName?: string;
    wallColor?: string;
    ceilingColor?: string;
    wallCatalogId?: string;
    ceilingCatalogId?: string;
  }) => boolean;
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
  projectPayload: () => {
    version: number;
    roomType: RoomType;
    unitSystem: UnitSystem;
    activeFloorId: string;
    floors: FloorRecord[];
    clientId?: string | null;
    annotations?: PlanAnnotation[];
    layerVisibility?: LayerVisibility;
    estimateSnapshot?: import('../lib/estimateSnapshot').EstimateSnapshot | null;
    baselineEstimate?: import('../lib/estimateSnapshot').EstimateSnapshot | null;
    changeOrders?: import('../lib/estimateSnapshot').ChangeOrderRecord[];
    vendorQuotes?: import('../lib/estimateSnapshot').VendorQuote[];
    bidSettings?: import('../lib/estimateSnapshot').BidSettings;
  };
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
  /** Rebuild walls from plan labels and remap furniture/trim so recenter doesn’t orphan strips. */
  const applyPlanRoomRebuild = (
    nextLabels: PlanRoomLabel[],
    opts?: { live?: boolean; selectedRoomId?: string | null; centerFt?: { cx: number; cy: number } },
  ) => {
    const prevRooms = get().planRooms;
    const prevFurniture = get().furniture;
    const prevWalls = get().walls;
    const prevOpenings = get().openings;
    const height = get().walls[0]?.height ?? 2.74;
    const activeFloor = get().floors.find((f) => f.id === get().activeFloorId);
    const rebuilt = rebuildFromPlanRooms(nextLabels, get().activeFloorId, height, {
      centerFt: opts?.centerFt,
      wallSegmentsFt: activeFloor?.wallSegmentsFt,
      openingHintsFt: activeFloor?.openingHintsFt,
      cadBuildCenterFt: activeFloor?.cadBuildCenterFt,
    });
    const planRooms = rebuilt.roomPolygons.map((p) => ({
      ...p,
      floorColor: nextLabels.find((l) => l.id === p.id)?.floorColor,
    }));
    const openings = remapOpeningsAfterPlanRebuild(
      prevWalls,
      rebuilt.scene.walls,
      prevOpenings,
      rebuilt.scene.openings,
    );
    const furniture = remapFurnitureAfterPlanRebuild(
      prevRooms,
      planRooms,
      rebuilt.scene.walls,
      prevFurniture,
      openings,
    );
    const patch: Partial<SceneSnapshot> = {
      walls: rebuilt.scene.walls,
      openings,
      furniture,
      planRooms,
    };
    const floorPatch = (f: FloorRecord, activeId: string): FloorRecord =>
      f.id === activeId
        ? {
            ...f,
            scene: {
              ...f.scene,
              walls: rebuilt.scene.walls,
              openings,
              furniture,
              planRooms,
            },
            planRooms,
            // Preserve CAD metadata across edits.
            wallSegmentsFt: f.wallSegmentsFt,
            openingHintsFt: f.openingHintsFt,
            cadPlanVectorsFt: f.cadPlanVectorsFt,
            cadBuildCenterFt: f.cadBuildCenterFt,
          }
        : f;
    if (opts?.live) {
      set((s) => ({
        ...patch,
        floors: s.floors.map((f) => floorPatch(f, s.activeFloorId)),
        ...(opts?.selectedRoomId !== undefined ? { selectedRoomId: opts.selectedRoomId } : {}),
      }));
    } else {
      mutate(patch);
      set((s) => ({
        floors: s.floors.map((f) => floorPatch(f, s.activeFloorId)),
        ...(opts?.selectedRoomId !== undefined ? { selectedRoomId: opts.selectedRoomId } : {}),
      }));
    }
    return planRooms;
  };
  /** Frozen plate center (feet) for the active live wall-drag gesture. */
  let liveWallNudgeCenter: { cx: number; cy: number } | null = null;
  const projectPayload = () => {
    const s = get();
    return {
      version: 6,
      roomType: s.roomType,
      unitSystem: s.unitSystem,
      activeFloorId: s.activeFloorId,
      floors: s.floors.map((f) => (f.id === s.activeFloorId ? { ...f, scene: snap() } : f)),
      clientId: s.clientId,
      annotations: s.annotations,
      layerVisibility: s.layerVisibility,
      estimateSnapshot: s.estimateSnapshot,
      baselineEstimate: s.baselineEstimate,
      changeOrders: s.changeOrders,
      vendorQuotes: s.vendorQuotes,
      bidSettings: s.bidSettings,
    };
  };

  return {
    ...initial,
    tool: 'select',
    view: '3d',
    cameraMode: 'orbit',
    viewYawDeg: 0,
    elevationFace: 'front',
    roomType: 'Bedroom',
    unitSystem: 'metric',
    selectedWallId: null,
    selectedOpeningId: null,
    selectedFurnitureId: null,
    selectedSurface: null,
    selectedRoomId: null,
    pendingPlacement: null,
    pendingCorner: null,
    selectedVertexIndex: null,
    pendingFloorFill: null,
    draftStart: null,
    floors: [{ id: 'ground', name: 'Ground floor', scene: initial, storyHeightM: 2.7 }],
    activeFloorId: 'ground',
    stackView: false,
    roofStyle: 'none',
    siteSetback: { frontM: 6, sideM: 1.5, rearM: 6 },
    layerVisibility: { ...DEFAULT_LAYER_VISIBILITY },
    annotations: [],
    selectedAnnotationId: null,
    clientId: null,
    estimateSnapshot: null,
    baselineEstimate: null,
    changeOrders: [],
    vendorQuotes: [],
    bidSettings: {
      jurisdiction: '',
      validityDays: 30,
      paymentTerms: 'Progress payments monthly; retainage 5%; final on punch completion.',
      inclusions:
        'Architectural framing, envelope allowances, interior finishes from takeoff, MEP rough allowances, sitework proxies, OH&P, tax, and bond as shown.',
      exclusions:
        'Specialty engineered systems, utility company fees, permits/impact fees unless listed, furnishings beyond FF&E schedule, hazardous materials, winter conditions, and owner-furnished equipment.',
      alternateNotes:
        'Unit prices and allowances are schematic; owner selections may adjust the contract sum via change order.',
    },
    history: [initial],
    historyIndex: 0,
    openingNotice: '',
    housePlanId: null,
    housePlanName: null,
    planRooms: [],
    pendingRoomShape: null,
    pendingAttachMode: false,
    planWallTool: false,
    workflowStage: 'start',
    studioMode: 'architect',
    manualBomLines: [],
    addManualBomLine: (line) =>
      set((s) => ({
        manualBomLines: [...s.manualBomLines, { ...line, id: crypto.randomUUID() }],
      })),
    removeManualBomLine: (id) =>
      set((s) => ({
        manualBomLines: s.manualBomLines.filter((row) => row.id !== id),
      })),
    setLayerVisibility: (patch) =>
      set((s) => ({ layerVisibility: { ...s.layerVisibility, ...patch } })),
    setClientId: (clientId) => set({ clientId }),
    setEstimateSnapshot: (estimateSnapshot) => set({ estimateSnapshot }),
    lockEstimateBaseline: () => {
      const snap = get().estimateSnapshot;
      if (snap) set({ baselineEstimate: snap });
    },
    clearEstimateBaseline: () => set({ baselineEstimate: null, changeOrders: [] }),
    addChangeOrder: (record) =>
      set((s) => ({ changeOrders: [...s.changeOrders, record] })),
    clearChangeOrders: () => set({ changeOrders: [] }),
    setChangeOrderStatus: (id, status) =>
      set((s) => ({
        changeOrders: s.changeOrders.map((co) =>
          co.id === id
            ? {
                ...co,
                status,
                decidedAt: status === 'draft' ? undefined : new Date().toISOString(),
              }
            : co,
        ),
      })),
    addVendorQuote: (quote) =>
      set((s) => ({
        vendorQuotes: [
          ...s.vendorQuotes,
          {
            ...quote,
            id: quote.id ?? crypto.randomUUID(),
            quoteDate: quote.quoteDate || new Date().toISOString().slice(0, 10),
          },
        ],
      })),
    removeVendorQuote: (id) =>
      set((s) => ({ vendorQuotes: s.vendorQuotes.filter((q) => q.id !== id) })),
    setBidSettings: (patch) =>
      set((s) => ({ bidSettings: { ...s.bidSettings, ...patch } })),
    selectAnnotation: (selectedAnnotationId) => set({ selectedAnnotationId }),
    addAnnotation: (kind, x, z, text = '') => {
      const id = crypto.randomUUID();
      const row: PlanAnnotation = {
        id,
        floorId: get().activeFloorId,
        x,
        z,
        kind,
        text: text || (kind === 'note' ? 'Note' : kind === 'cloud' ? 'Review' : 'Look'),
        rotation: kind === 'arrow' ? 0 : undefined,
      };
      set((s) => ({ annotations: [...s.annotations, row], selectedAnnotationId: id, tool: 'select' }));
      return id;
    },
    updateAnnotation: (id, patch) =>
      set((s) => ({
        annotations: s.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      })),
    deleteAnnotation: (id) =>
      set((s) => ({
        annotations: s.annotations.filter((a) => a.id !== id),
        selectedAnnotationId: s.selectedAnnotationId === id ? null : s.selectedAnnotationId,
      })),
    setTool: (tool) => {
      const next = tool === 'wall' ? 'select' : tool;
      set({
        tool: next,
        draftStart: null,
        pendingCorner: next === 'corner' ? get().pendingCorner : null,
        selectedVertexIndex: next === 'select' ? get().selectedVertexIndex : null,
      });
    },
    setView: (view) => set({ view, draftStart: null }),
    setCameraMode: (cameraMode) => set({ cameraMode }),
    setElevationFace: (elevationFace) => set({ elevationFace }),
    setViewYawDeg: (deg) => {
      const normalized = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
      set({ viewYawDeg: normalized });
    },
    rotateViewYaw: (deltaDeg = 90) => {
      const next = (((get().viewYawDeg + deltaDeg) % 360) + 360) % 360;
      const snapped = ((Math.round(next / 90) * 90) % 360 + 360) % 360;
      set({ viewYawDeg: snapped });
    },
    setRoomType: (roomType) => set({ roomType }),
    setUnitSystem: (unitSystem) => set({ unitSystem }),
    setStackView: (stackView) => set({ stackView }),
    setRoofStyle: (roofStyle) => set({ roofStyle }),
    setSiteSetback: (siteSetback) => set({ siteSetback }),
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
      const height = Math.max(2, Math.min(6, meters));
      mutate({ walls: get().walls.map((w) => ({ ...w, height })) });
      set((s) => ({
        floors: s.floors.map((f) =>
          f.id === s.activeFloorId ? { ...f, storyHeightM: height } : f,
        ),
      }));
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
      return get().applyHousePlanObject(plan);
    },
    applyHousePlanObject: (plan) => {
      const built = buildHouse(plan);
      const floors: FloorRecord[] = built.floors.map((f, i) => {
        const source = plan.floors[i];
        const wallSegmentsFt = source?.wallSegmentsFt;
        const openingHintsFt = source?.openingHintsFt;
        const cadPlanVectorsFt = source?.cadPlanVectorsFt;
        return {
          id: f.id,
          name: f.name,
          scene: f.scene,
          planRooms: f.roomPolygons,
          wallSegmentsFt,
          openingHintsFt,
          cadPlanVectorsFt,
          cadBuildCenterFt:
            source && (wallSegmentsFt?.length || cadPlanVectorsFt?.length)
              ? cadBuildCenterFt({
                  rooms: source.rooms,
                  wallSegmentsFt: wallSegmentsFt?.length ? wallSegmentsFt : cadPlanVectorsFt,
                })
              : undefined,
        };
      });
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
    selectWall: (selectedWallId) => {
      const st = get();
      const wall = selectedWallId ? st.walls.find((w) => w.id === selectedWallId) : undefined;
      let selectedRoomId = st.selectedRoomId;
      if (st.workflowStage === 'room') {
        selectedRoomId = st.selectedRoomId;
      } else if (st.planWallTool) {
        if (wall) {
          const owner = st.planRooms.find((r) => planRoomEdgeIndexForWall(r, wall) != null);
          if (owner) selectedRoomId = owner.id;
        }
      } else if (selectedWallId) {
        selectedRoomId = null;
      }
      set({
        selectedWallId,
        selectedOpeningId: null,
        selectedFurnitureId: null,
        selectedSurface: null,
        selectedVertexIndex: null,
        selectedRoomId,
      });
    },
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
        selectedVertexIndex: null,
        pendingCorner: get().pendingCorner?.roomId === selectedRoomId ? get().pendingCorner : null,
        planWallTool: get().planWallTool,
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
        pendingCorner: null,
        selectedVertexIndex: null,
        planWallTool: false,
        pendingAttachMode: false,
        cameraMode: 'top',
        view: '3d',
      }),
    enterRoom: (id) => {
      const room = get().planRooms.find((r) => r.id === id);
      if (!room) return;
      set({
        workflowStage: 'room',
        studioMode: 'furnish',
        selectedRoomId: id,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedFurnitureId: null,
        selectedSurface: null,
        roomType: room.roomType,
        cameraMode: 'orbit',
        view: '3d',
        tool: 'select',
        draftStart: null,
        planWallTool: false,
        pendingAttachMode: false,
        pendingCorner: null,
        selectedVertexIndex: null,
      });
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          window.dispatchEvent(new Event('roomcraft-fit-plan'));
          window.dispatchEvent(new Event('roomcraft-refocus'));
        }, 0);
      }
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
        pendingCorner: null,
        selectedVertexIndex: null,
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
        pendingCorner: null,
        selectedVertexIndex: null,
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
        openingNotice: '',
      }),
    cancelFloorFill: () => set({ pendingFloorFill: null, openingNotice: '' }),
    applyFloorFillToRoom: (roomId) => {
      const fill = get().pendingFloorFill;
      if (!fill) return false;
      const id = roomId ?? get().selectedRoomId;
      if (id) {
        get().updatePlanRoom(id, {
          floorColor: fill.color,
          floorCatalogId: fill.catalogId,
          floorName: fill.name,
        });
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
      applyPlanRoomRebuild(nextLabels);
    },
    deletePlanRoom: (id) => {
      const nextLabels = get().planRooms.filter((r) => r.id !== id);
      if (!nextLabels.length) {
        mutate({ walls: [], openings: [], furniture: [], planRooms: [] });
        set({ planRooms: [], selectedRoomId: null, floors: get().floors.map((f) => (f.id === get().activeFloorId ? { ...f, planRooms: [], scene: { ...f.scene, walls: [], openings: [], furniture: [], planRooms: [] } } : f)) });
        return;
      }
      applyPlanRoomRebuild(nextLabels, {
        selectedRoomId: get().selectedRoomId === id ? null : get().selectedRoomId,
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
        pendingAttachMode: false,
        tool: pendingRoomShape ? 'room' : get().tool === 'room' ? 'select' : get().tool,
        draftStart: null,
        selectedWallId: null,
        studioMode: 'architect',
      }),
    setPendingAttachMode: (pendingAttachMode) =>
      set({
        pendingAttachMode,
        pendingRoomShape: null,
        pendingCorner: null,
        planWallTool: false,
        tool: 'select',
        draftStart: null,
        selectedWallId: null,
        selectedVertexIndex: null,
        studioMode: 'architect',
        cameraMode: 'top',
        view: '3d',
        openingNotice: '',
      }),
    setPlanWallTool: (planWallTool) => {
      const rooms = get().planRooms;
      const keepRoom = get().selectedRoomId;
      set({
        planWallTool,
        pendingAttachMode: false,
        pendingRoomShape: null,
        pendingCorner: null,
        tool: 'select',
        draftStart: null,
        selectedWallId: null,
        selectedVertexIndex: null,
        // Keep (or auto-pick) a room so the exterior dim card has a target.
        selectedRoomId: planWallTool
          ? keepRoom ?? (rooms.length === 1 ? rooms[0]!.id : keepRoom)
          : keepRoom,
        studioMode: 'architect',
        cameraMode: 'top',
        view: '3d',
        openingNotice: '',
      });
    },
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
      applyPlanRoomRebuild(nextLabels, { selectedRoomId: id });
      set({
        workflowStage: 'house',
        studioMode: 'architect',
        selectedSurface: null,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedFurnitureId: null,
        pendingRoomShape: null,
        pendingAttachMode: false,
        cameraMode: 'top',
        view: '3d',
        tool: 'select',
        draftStart: null,
        openingNotice: '',
      });
      return id;
    },
    attachPlanRoom: (hostId, side, name) => {
      const host = get().planRooms.find((r) => r.id === hostId);
      if (!host) {
        set({ openingNotice: 'Select a room first, then choose a side.' });
        return null;
      }
      if (attachSideBlocked(hostId, side, get().planRooms)) {
        set({ openingNotice: 'That side is blocked — pick another edge.' });
        return null;
      }
      const id = crypto.randomUUID();
      const label: PlanRoomLabel = {
        id,
        name: name ?? `Room ${get().planRooms.length + 1}`,
        roomType: get().roomType,
        points: attachSquareRoomPoints(host.points, side),
      };
      const nextLabels = [...get().planRooms, label];
      if (planRoomLabelOverlaps(id, nextLabels)) {
        set({ openingNotice: 'That side is blocked — pick another edge.' });
        return null;
      }
      applyPlanRoomRebuild(nextLabels, { selectedRoomId: id });
      set({
        workflowStage: 'house',
        studioMode: 'architect',
        selectedSurface: null,
        selectedWallId: null,
        selectedOpeningId: null,
        selectedFurnitureId: null,
        pendingRoomShape: null,
        pendingAttachMode: false,
        cameraMode: 'top',
        view: '3d',
        tool: 'select',
        draftStart: null,
        openingNotice: '',
      });
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          window.dispatchEvent(new Event('roomcraft-fit-plan'));
          window.dispatchEvent(new Event('roomcraft-refocus'));
        }, 40);
      }
      return id;
    },
    movePlanRoom: (id, dxM, dzM, opts) => {
      if (!Number.isFinite(dxM) || !Number.isFinite(dzM)) return false;
      if (Math.abs(dxM) < 1e-6 && Math.abs(dzM) < 1e-6) return true;
      const current = get().planRooms;
      if (!current.some((r) => r.id === id)) return false;
      const dxPx = dxM * PIXELS_PER_METER;
      const dyPx = dzM * PIXELS_PER_METER;
      const nextLabels = current.map((r) =>
        r.id === id
          ? { ...r, points: r.points.map((p) => ({ x: p.x + dxPx, y: p.y + dyPx })) }
          : r,
      );
      if (planRoomLabelOverlaps(id, nextLabels)) {
        set({ openingNotice: 'Rooms can’t overlap — keep them edge-to-edge or apart.' });
        return false;
      }
      applyPlanRoomRebuild(nextLabels, { live: opts?.live, selectedRoomId: id });
      set({ openingNotice: '' });
      return true;
    },
    commitPlanRoomMove: () => {
      mutate({
        walls: get().walls,
        openings: get().openings,
        furniture: get().furniture,
        planRooms: get().planRooms,
      });
    },
    movePlanRoomVertex: (id, vertexIndex, point, opts) => {
      const current = get().planRooms;
      const room = current.find((r) => r.id === id);
      if (!room) return false;
      const nextPoints = movePlanRoomVertexPoints(room.points, vertexIndex, point);
      if (!nextPoints) {
        set({ openingNotice: 'Room can’t get smaller than 3 ft on a side.' });
        return false;
      }
      const nextLabels = current.map((r) => (r.id === id ? { ...r, points: nextPoints } : r));
      if (planRoomLabelOverlaps(id, nextLabels)) {
        set({ openingNotice: 'Rooms can’t overlap — keep corners clear of neighbors.' });
        return false;
      }
      applyPlanRoomRebuild(nextLabels, { live: opts?.live, selectedRoomId: id });
      set({ openingNotice: '' });
      return true;
    },
    commitPlanRoomVertex: () => {
      mutate({
        walls: get().walls,
        openings: get().openings,
        furniture: get().furniture,
        planRooms: get().planRooms,
      });
    },
    insertPlanRoomVertex: (id, edgeIndex, t) => {
      const current = get().planRooms;
      const room = current.find((r) => r.id === id);
      if (!room) return false;
      const i = ((edgeIndex % room.points.length) + room.points.length) % room.points.length;
      const a = room.points[i]!;
      const b = room.points[(i + 1) % room.points.length]!;
      const edgeLen = Math.hypot(b.x - a.x, b.y - a.y);
      const nextPoints = insertPlanRoomVertexPoints(room.points, edgeIndex, clampInsertT(t ?? 0.5, edgeLen));
      if (!nextPoints) return false;
      const nextLabels = current.map((r) => (r.id === id ? { ...r, points: nextPoints } : r));
      applyPlanRoomRebuild(nextLabels, { selectedRoomId: id });
      set({ selectedVertexIndex: i + 1, selectedWallId: null, pendingCorner: null, openingNotice: '' });
      return true;
    },
    beginPendingCorner: (roomId, planPoint) => {
      const room = get().planRooms.find((r) => r.id === roomId);
      if (!room || room.points.length < 3) return false;
      const hit = projectPointOntoPolygonOutline(room.points, planPoint);
      if (!hit) return false;
      set({
        pendingCorner: { roomId, edgeIndex: hit.edgeIndex, t: hit.t },
        selectedRoomId: roomId,
        selectedWallId: null,
        selectedVertexIndex: null,
        selectedOpeningId: null,
        selectedFurnitureId: null,
        tool: 'corner',
        planWallTool: false,
        pendingAttachMode: false,
      });
      return true;
    },
    movePendingCorner: (planPoint) => {
      const pending = get().pendingCorner;
      if (!pending) return false;
      const room = get().planRooms.find((r) => r.id === pending.roomId);
      if (!room) return false;
      const hit = projectPointOntoPolygonOutline(room.points, planPoint);
      if (!hit) return false;
      set({ pendingCorner: { roomId: pending.roomId, edgeIndex: hit.edgeIndex, t: hit.t } });
      return true;
    },
    commitPendingCorner: () => {
      const pending = get().pendingCorner;
      if (!pending) return false;
      const ok = get().insertPlanRoomVertex(pending.roomId, pending.edgeIndex, pending.t);
      set({ pendingCorner: null, tool: 'select' });
      return ok;
    },
    cancelPendingCorner: () => set({ pendingCorner: null, openingNotice: '' }),
    removePlanRoomVertex: (id, vertexIndex) => {
      const current = get().planRooms;
      const room = current.find((r) => r.id === id);
      if (!room) return false;
      const nextPoints = removePlanRoomVertexPoints(room.points, vertexIndex);
      if (!nextPoints) {
        set({ openingNotice: 'Need at least 3 corners to keep the room.' });
        return false;
      }
      const nextLabels = current.map((r) => (r.id === id ? { ...r, points: nextPoints } : r));
      if (planRoomLabelOverlaps(id, nextLabels)) {
        set({ openingNotice: 'Rooms can’t overlap after removing that corner.' });
        return false;
      }
      applyPlanRoomRebuild(nextLabels, { selectedRoomId: id });
      set({ openingNotice: '' });
      return true;
    },
    addStair: (fromFloorId, toFloorId, x?: number, z?: number) => {
      const floors = get().floors;
      if (!floors.some((f) => f.id === fromFloorId) || !floors.some((f) => f.id === toFloorId)) return;
      if (fromFloorId === toFloorId) return;
      // Ensure we're editing the from-floor scene.
      if (get().activeFloorId !== fromFloorId) get().switchFloor(fromFloorId);
      const riseM = Math.max(get().walls[0]?.height ?? 2.7, 2.4);
      const runM = 2.8;
      const steps = 14;
      const landingM = 0.9;
      const center = roomFloorCenter(get().walls);
      const sx = Number.isFinite(x) ? (x as number) : center.x;
      const sz = Number.isFinite(z) ? (z as number) : center.z;
      mutate({
        furniture: [
          ...get().furniture,
          {
            id: crypto.randomUUID(),
            catalogId: 'stair',
            name: 'Stair',
            category: 'Circulation',
            x: sx,
            y: 0,
            z: sz,
            rotation: 0,
            color: '#8b7355',
            width: 1.1,
            depth: runM + landingM,
            height: riseM,
            mountingType: 'floor',
            placementKind: 'stair',
            stair: { fromFloorId, toFloorId, runM, riseM, steps, landingM },
          },
        ],
      });
      get().selectFurniture(get().furniture[get().furniture.length - 1]?.id ?? null);
    },
    nudgeWall: (id, dxM, dzM, opts) => {
      if (!Number.isFinite(dxM) || !Number.isFinite(dzM)) return false;
      if (Math.abs(dxM) < 1e-6 && Math.abs(dzM) < 1e-6) return true;
      const wall = get().walls.find((w) => w.id === id);
      if (!wall) return false;
      const labels = get().planRooms;
      if (!labels.length) return false;
      const dxPx = dxM * PIXELS_PER_METER;
      const dyPx = dzM * PIXELS_PER_METER;
      const nextLabels = nudgePlanRoomsByWall(wall, labels, dxPx, dyPx);
      if (!nextLabels) {
        set({ openingNotice: 'Rooms can’t get smaller than 3 ft on a side.' });
        return false;
      }
      for (const room of nextLabels) {
        if (planRoomLabelOverlaps(room.id, nextLabels)) {
          set({ openingNotice: 'Rooms can’t overlap — resize stops at the neighbor.' });
          return false;
        }
      }
      // Freeze plate center for the whole live gesture so geometry moves 1:1 with the pointer.
      if (opts?.live && !liveWallNudgeCenter) {
        liveWallNudgeCenter = planRoomsCenterFt(labels);
      }
      const centerFt = opts?.live ? liveWallNudgeCenter ?? undefined : undefined;
      applyPlanRoomRebuild(nextLabels, {
        live: opts?.live,
        selectedRoomId: get().selectedRoomId,
        centerFt,
      });
      // Prefer the same wall id when edge topology is stable (typical AABB rebuild).
      const stillThere = get().walls.some((w) => w.id === id);
      set({ selectedWallId: stillThere ? id : get().selectedWallId, openingNotice: '' });
      return true;
    },
    commitWallNudge: () => {
      liveWallNudgeCenter = null;
      const labels = get().planRooms;
      if (!labels.length) return;
      // One final rebuild recenters the plate now that the gesture is done.
      applyPlanRoomRebuild(labels, { selectedRoomId: get().selectedRoomId });
      set({ selectedWallId: get().selectedWallId });
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
      applyPlanRoomRebuild(nextLabels, { selectedRoomId: id });
      set({ workflowStage: 'room' });
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
    placeOpeningAtWorld: (wallId, type, worldX, worldZ) => {
      const wall = get().walls.find((w) => w.id === wallId);
      if (!wall) return false;
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
        face: 'in',
        shape: 'rect',
      };
      const len =
        Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) / PIXELS_PER_METER || 0.01;
      const raw = wallOffsetFromWorldPoint(wall, worldX, worldZ, WORLD_ORIGIN, PIXELS_PER_METER);
      candidate.offset = clampOpeningOffset(candidate, get().openings, len);
      // Prefer the click position when it doesn't collide after clamp.
      const clicked = Math.max(0.05, Math.min(0.95, raw));
      const tryOffset = { ...candidate, offset: clicked };
      candidate.offset = openingConflicts(tryOffset, get().openings, get().walls).length
        ? candidate.offset
        : clampOpeningOffset(tryOffset, get().openings, len);
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
      const openings = get().openings;
      const furniture = get().furniture;
      const center = roomFloorCenter(walls);
      const preferredX = x ?? center.x;
      const preferredZ = z ?? center.z;
      // Never seed from a point outside the room (AABB/clone offsets can sit past walls).
      const start = pointInWorldRooms(preferredX, preferredZ, walls)
        ? { x: preferredX, z: preferredZ }
        : center;
      const zones = doorSwingZones(openings, walls);
      const placeAt = (cx: number, cz: number) =>
        placeFurniture(walls, width, depth, height, cx, cz, {
          ...meta,
          category,
          name,
          live: true,
        });
      const isClearInside = (trial: ReturnType<typeof placeFurniture>) => {
        if (!pointInWorldRooms(trial.x, trial.z, walls)) return false;
        const probe = {
          id: '__pending__',
          x: trial.x,
          y: trial.y ?? 0,
          z: trial.z,
          width,
          depth,
          height,
          rotation: trial.rotation,
          mountingType: trial.mountingType,
        };
        if (furnitureHitsDoorSwing(probe, zones)) return false;
        if (wouldOverlapFurniture(probe, furniture)) return false;
        return true;
      };
      // Search returns the constrained in-room pose — never the raw spiral probe.
      let placed: ReturnType<typeof placeFurniture> | null = null;
      const seed = placeAt(start.x, start.z);
      if (isClearInside(seed)) {
        placed = seed;
      } else {
        const step = 0.4;
        outer: for (let ring = 1; ring <= 14; ring++) {
          for (let i = -ring; i <= ring; i++) {
            const probes = [
              { x: start.x + i * step, z: start.z - ring * step },
              { x: start.x + i * step, z: start.z + ring * step },
              { x: start.x - ring * step, z: start.z + i * step },
              { x: start.x + ring * step, z: start.z + i * step },
            ];
            for (const p of probes) {
              // Skip probes that aren't even in the room — avoids docking to the exterior face.
              if (!pointInWorldRooms(p.x, p.z, walls)) continue;
              const trial = placeAt(p.x, p.z);
              if (isClearInside(trial)) {
                placed = trial;
                break outer;
              }
            }
          }
        }
      }
      if (!placed || !pointInWorldRooms(placed.x, placed.z, walls)) {
        placed = placeAt(center.x, center.z);
      }
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
    cancelPendingPlacement: () => set({ pendingPlacement: null, openingNotice: '' }),
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
        openings: get().openings,
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
      // Apply immediately — no ghost placement / confirm step, no selected trim FABs.
      set({
        selectedFurnitureId: null,
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
      // Ghost-place the clone so the user can pick a clear spot (same as catalog add).
      get().beginPlacement(
        item.catalogId,
        item.name,
        item.category,
        [item.width, item.depth, item.height],
        item.color,
        item.x + 0.55,
        item.z + 0.55,
        {
          mountingType: item.mountingType,
          clearance: item.clearance,
          rotation: item.rotation,
          y: item.y,
        },
      );
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
        get().updatePlanRoom(roomId, { floorColor: undefined, floorCatalogId: undefined, floorName: undefined });
        set({ openingNotice: 'Floor finish cleared for this room.' });
        return;
      }
      mutate({ floorColor: '#c9b18f' });
      set({ openingNotice: 'Floor finish reset.' });
    },
    setFinish: (target, color) => {
      const roomId = get().selectedRoomId;
      if (target === 'floor') {
        if (roomId) {
          get().updatePlanRoom(roomId, { floorColor: color });
          return;
        }
        mutate({ floorColor: color });
        return;
      }
      if (target === 'wall') {
        if (roomId) {
          get().updatePlanRoom(roomId, { wallColor: color });
          return;
        }
        mutate({ wallColor: color });
        return;
      }
      if (roomId) {
        get().updatePlanRoom(roomId, { ceilingColor: color });
        return;
      }
      mutate({ ceilingColor: color });
    },
    /** Apply a lookbook/catalog finish to the focused room (or global if none). */
    applyLookbookToRoom: (opts) => {
      const roomId = opts.roomId ?? get().selectedRoomId;
      if (!roomId) {
        if (opts.floorColor) mutate({ floorColor: opts.floorColor });
        if (opts.wallColor) mutate({ wallColor: opts.wallColor });
        if (opts.ceilingColor) mutate({ ceilingColor: opts.ceilingColor });
        return false;
      }
      get().updatePlanRoom(roomId, {
        floorColor: opts.floorColor,
        floorCatalogId: opts.floorCatalogId,
        floorName: opts.floorName,
        wallColor: opts.wallColor,
        ceilingColor: opts.ceilingColor,
        wallCatalogId: opts.wallCatalogId,
        ceilingCatalogId: opts.ceilingCatalogId,
      });
      set({ openingNotice: 'Look Book finish applied to this room.' });
      return true;
    },
    addFloor: (opts) => {
      const id = crypto.randomUUID();
      const n = get().floors.length + 1;
      const name = `L${n}`;
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
      const storyHeightM =
        (copy ? source.walls[0]?.height : undefined) ??
        source.walls[0]?.height ??
        2.74;
      set({
        ...scene,
        floors: [...floors, { id, name, scene, planRooms, storyHeightM }],
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
      if (!copy && get().planRooms.length === 0) {
        get().placePlanRoom(WORLD_ORIGIN, 'rectangle', 'Room');
      }
    },
    switchFloor: (id) =>
      set((s) => {
        if (id === s.activeFloorId) return s;
        const avgH =
          s.walls.length > 0
            ? s.walls.reduce((sum, w) => sum + w.height, 0) / s.walls.length
            : s.floors.find((f) => f.id === s.activeFloorId)?.storyHeightM ?? 2.7;
        const current = s.floors.map((f) =>
          f.id === s.activeFloorId
            ? { ...f, scene: snap(), planRooms: s.planRooms, storyHeightM: avgH }
            : f,
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
          clientId: data.clientId ?? null,
          estimateSnapshot: data.estimateSnapshot ?? null,
          baselineEstimate: data.baselineEstimate ?? null,
          changeOrders: Array.isArray(data.changeOrders) ? data.changeOrders : [],
          vendorQuotes: Array.isArray(data.vendorQuotes) ? data.vendorQuotes : [],
          bidSettings: data.bidSettings
            ? { ...get().bidSettings, ...data.bidSettings }
            : get().bidSettings,
          annotations: Array.isArray(data.annotations) ? data.annotations : [],
          layerVisibility: data.layerVisibility
            ? { ...DEFAULT_LAYER_VISIBILITY, ...data.layerVisibility }
            : { ...DEFAULT_LAYER_VISIBILITY },
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
