export type Point = { x: number; y: number };
export type Wall = { id: string; start: Point; end: Point; thickness: number; height: number };
export type Opening = { id: string; wallId: string; type: 'door'|'window'|'passage'; offset: number; width: number; height: number; sill: number; swing?:'left'|'right'|'none' };
export type FurnitureItem = { id:string; catalogId:string; name:string; category:string; x:number; y:number; z:number; rotation:number; color:string; width:number; depth:number; height:number };
export type CameraMode = 'top'|'orbit'|'walk';
export type Tool = 'select' | 'wall' | 'door' | 'window' | 'passage';
export type RoomType = 'Bedroom'|'Living room'|'Bathroom'|'Kitchen'|'Dining room'|'Office'|'Children’s room'|'Laundry'|'Hallway'|'Storage / wardrobe'|'Outdoor';
export type SceneSnapshot = { walls: Wall[]; openings:Opening[]; furniture:FurnitureItem[]; floorColor:string; wallColor:string };
