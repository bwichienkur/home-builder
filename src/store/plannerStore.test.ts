import {describe,expect,it} from 'vitest';
import {usePlannerStore} from './plannerStore';

describe('mobile planner defaults',()=>{
 it('opens in select mode so a tap cannot accidentally start a wall',()=>{
  expect(usePlannerStore.getState().tool).toBe('select');
 });

 it('selects a catalog item immediately after adding it',()=>{
  const before=usePlannerStore.getState().furniture.length;
  usePlannerStore.getState().addFurniture('test-fixture','Test fixture','Plumbing',[.2,.2,.3],'#aaa');
  const state=usePlannerStore.getState();
  expect(state.furniture).toHaveLength(before+1);
  expect(state.selectedFurnitureId).toBe(state.furniture.at(-1)?.id);
 });
});

describe('IKEA-style wall editing',()=>{
 it('splits a wall into two equal connected segments',()=>{
  const before=usePlannerStore.getState().walls.length,wall=usePlannerStore.getState().walls[0];
  usePlannerStore.getState().splitWall(wall.id);
  const state=usePlannerStore.getState(),first=state.walls.find(w=>w.id===wall.id)!;
  expect(state.walls).toHaveLength(before+1);
  expect(first.end).toEqual({x:(wall.start.x+wall.end.x)/2,y:(wall.start.y+wall.end.y)/2});
  expect(state.walls.some(w=>w.start.x===first.end.x&&w.start.y===first.end.y)).toBe(true);
 });

 it('moves connected corners together when a wall segment is offset',()=>{
  const state=usePlannerStore.getState(),wall=state.walls[0],connected=state.walls.find(w=>w.id!==wall.id&&(w.start.x===wall.end.x&&w.start.y===wall.end.y));
  expect(connected).toBeTruthy();
  usePlannerStore.getState().offsetWall(wall.id,.25);
  const next=usePlannerStore.getState(),moved=next.walls.find(w=>w.id===wall.id)!,neighbor=next.walls.find(w=>w.id===connected!.id)!;
  expect(neighbor.start).toEqual(moved.end);
 });
});
