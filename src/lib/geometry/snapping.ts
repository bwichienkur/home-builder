import type { Point, Wall } from '../../types';
export const GRID_SIZE = 20;
export const PIXELS_PER_METER = 80;
export const snapPoint = (point: Point, size = GRID_SIZE): Point => ({ x: Math.round(point.x / size) * size, y: Math.round(point.y / size) * size });
export const snapWallPoint = (point:Point,walls:Wall[],excludeWallId?:string,magnetDistance=48):Point => {
 const endpoints=walls.filter(w=>w.id!==excludeWallId).flatMap(w=>[w.start,w.end]);
 const nearest=endpoints.reduce<Point|null>((best,p)=>{
  if(Math.hypot(p.x-point.x,p.y-point.y)>magnetDistance)return best;
  return !best||Math.hypot(p.x-point.x,p.y-point.y)<Math.hypot(best.x-point.x,best.y-point.y)?p:best;
 },null);
 return nearest?{...nearest}:snapPoint(point);
};
export const wallLengthMeters = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y) / PIXELS_PER_METER;
