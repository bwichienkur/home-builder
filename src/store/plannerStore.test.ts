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
