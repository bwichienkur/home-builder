export type Point = { x: number; y: number };
export type Wall = { id: string; start: Point; end: Point; thickness: number; height: number };
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
  placementKind?: 'perimeter-trim';
  /** Shared id for all segments of one Apply Trim action. */
  runId?: string;
  /** Ceiling junction vs floor junction. */
  trimEdge?: 'ceiling' | 'floor';
};
export type CameraMode = 'top' | 'orbit' | 'walk';
export type UnitSystem = 'metric' | 'imperial';
export type Tool = 'select' | 'wall' | 'door' | 'window' | 'passage' | 'room';
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
  | 'Storage /wardrobe'
  | 'Outdoor';
export type SurfaceTarget = 'floor' | 'wall' | 'ceiling';
export type WorkflowStage = 'start' | 'house' | 'room';
export type StudioMode = 'architect' | 'furnish';
export type PlanRoomLabel = { id: string; name: string; roomType: RoomType; points: Point[]; floorColor?: string };
export type SceneSnapshot = {
  walls: Wall[];
  openings: Opening[];
  furniture: FurnitureItem[];
  floorColor: string;
  wallColor: string;
  ceilingColor: string;
  /** Included so undo/redo restores per-room floor finishes. */
  planRooms?: PlanRoomLabel[];
};
export type PendingFloorFill = { catalogId: string; name: string; color: string };
