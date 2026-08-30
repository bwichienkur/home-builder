export type Point = { x: number; y: number };
export type WallAssembly = 'exterior' | 'interior' | 'party';
export type Wall = {
  id: string;
  start: Point;
  end: Point;
  thickness: number;
  height: number;
  /** Structural assembly role for takeoffs / exports. */
  assembly?: WallAssembly;
};
export type OpeningShape = 'rect' | 'arch' | 'wide';
export type Opening = {
  id: string;
  wallId: string;
  type: 'door' | 'window' | 'passage';
  offset: number;
  width: number;
  height: number;
  /** Doors/passages stay on the floor (sill = 0). Windows may float. */
  sill: number;
  swing?: 'left' | 'right' | 'none';
  /** Which side of the wall the door swings into (`in` = left-of-run, `out` = opposite). */
  face?: 'in' | 'out';
  shape?: OpeningShape;
};
export type MountingType = 'floor' | 'wall' | 'ceiling';
export type FurnitureClearance = { front?: number; back?: number; left?: number; right?: number };
export type StairSpec = {
  fromFloorId: string;
  toFloorId: string;
  /** Horizontal run (depth) in meters. */
  runM?: number;
  /** Total rise in meters (defaults to story height). */
  riseM?: number;
  steps?: number;
  /** Landing depth at top in meters. */
  landingM?: number;
};
export type FurnitureItem = {
  id: string;
  catalogId: string;
  name: string;
  category: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  color: string;
  width: number;
  depth: number;
  height: number;
  mountingType?: MountingType;
  wallId?: string | null;
  wallOffset?: number | null;
  clearance?: FurnitureClearance;
  showClearance?: boolean;
  /**
   * Fixed architectural trim (crown / baseboard). Not freely dragged —
   * one strip per boundary wall, linked by `runId`.
   */
  placementKind?: 'perimeter-trim' | 'stair';
  /** Shared id for all segments of one Apply Trim action. */
  runId?: string;
  /** Ceiling junction vs floor junction. */
  trimEdge?: 'ceiling' | 'floor';
  /** Roll in the wall plane (wall-mounted art / shelves). */
  roll?: number;
  /** Stair connects two floor ids when placementKind is stair. */
  stair?: StairSpec;
};
export type CameraMode = 'top' | 'orbit' | 'walk' | 'elevation';
export type ElevationFace = 'front' | 'back' | 'left' | 'right';
export type UnitSystem = 'metric' | 'imperial';
export type Tool = 'select' | 'wall' | 'door' | 'window' | 'passage' | 'room' | 'corner';
export type RoomType =
  | 'Bedroom'
  | 'Living room'
  | 'Bathroom'
  | 'Kitchen'
  | 'Dining room'
  | 'Office'
  | 'Children’s room'
  | 'Laundry'
  | 'Hallway'
  | 'Storage / wardrobe'
  | 'Outdoor';
export type SurfaceTarget = 'floor' | 'wall' | 'ceiling';
export type WorkflowStage = 'start' | 'house' | 'room';
export type StudioMode = 'architect' | 'furnish';
export type RoofStyle = 'none' | 'flat' | 'gable';
export type SiteSetback = { frontM: number; sideM: number; rearM: number };
/** Plan markup for trades / clients — soft notes, not CAD dimensions. */
export type PlanAnnotation = {
  id: string;
  floorId: string;
  x: number;
  z: number;
  kind: 'note' | 'cloud' | 'arrow';
  text: string;
  /** Arrow heading in degrees (Yaw). */
  rotation?: number;
};
/** Toggleable plan/3D layers for trade views. */
export type LayerVisibility = {
  furniture: boolean;
  openings: boolean;
  labels: boolean;
  dims: boolean;
  annotations: boolean;
  roof: boolean;
  framing: boolean;
  setbacks: boolean;
  /** Exact DXF linework under Plan view (CAD reference overlay). */
  cadOverlay: boolean;
};
export const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  furniture: true,
  openings: true,
  labels: true,
  dims: true,
  annotations: true,
  roof: true,
  framing: false,
  setbacks: true,
  cadOverlay: true,
};
export type PlanRoomLabel = {
  id: string;
  name: string;
  roomType: RoomType;
  points: Point[];
  floorColor?: string;
  /** Catalog SKU applied as a floor fill (tile / surface) for shopping-list qty. */
  floorCatalogId?: string;
  floorName?: string;
};
export type SceneSnapshot = {
  walls: Wall[];
  openings: Opening[];
  furniture: FurnitureItem[];
  floorColor: string;
  wallColor: string;
  ceilingColor: string;
  /** Included so undo/redo restores per-room floor finishes. */
  planRooms?: PlanRoomLabel[];
  roofStyle?: RoofStyle;
  siteSetback?: SiteSetback;
};
export type PendingFloorFill = { catalogId: string; name: string; color: string };
export type ManualBomLine = { id: string; name: string; qty: number; unit: string; price: number };
