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

 it('ghost-places a product before committing it to the room',()=>{
  usePlannerStore.setState({ workflowStage: 'room' });
  usePlannerStore.getState().cancelPendingPlacement();
  const before=usePlannerStore.getState().furniture.length;
  usePlannerStore.getState().beginPlacement('ghost-bed','Cloud Bed','Bedroom',[1.7,2.1,.55],'#ddd',undefined,undefined,{mountingType:'floor'});
  const pending=usePlannerStore.getState().pendingPlacement;
  expect(pending?.name).toBe('Cloud Bed');
  expect(pending).not.toBeNull();
  expect(usePlannerStore.getState().furniture).toHaveLength(before);
  usePlannerStore.getState().movePendingPlacement(.5,.25);
  usePlannerStore.getState().rotatePendingPlacement(Math.PI/2);
  const id=usePlannerStore.getState().commitPendingPlacement();
  const state=usePlannerStore.getState();
  expect(state.pendingPlacement).toBeNull();
  expect(state.furniture).toHaveLength(before+1);
  expect(state.selectedFurnitureId).toBe(id);
 });

 it('cancels a ghost placement without adding furniture',()=>{
  usePlannerStore.setState({ workflowStage: 'room' });
  const before=usePlannerStore.getState().furniture.length;
  usePlannerStore.getState().beginPlacement('ghost-cancel','Temp','Decor',[.4,.1,.4],'#ccc');
  usePlannerStore.getState().cancelPendingPlacement();
  expect(usePlannerStore.getState().pendingPlacement).toBeNull();
  expect(usePlannerStore.getState().furniture).toHaveLength(before);
 });

 it('rotates the selected product in place',()=>{
  usePlannerStore.getState().addFurniture('rotate-me','Chair','Seating',[.5,.5,.8],'#bbb');
  const item=usePlannerStore.getState().furniture.at(-1)!;
  const start=item.rotation;
  usePlannerStore.getState().rotateSelected(Math.PI/2);
  expect(usePlannerStore.getState().furniture.find(f=>f.id===item.id)?.rotation).toBeCloseTo(start+Math.PI/2);
 });
});

describe('perimeter trim',()=>{
 it('applies crown molding along every boundary wall of the focused room',()=>{
  usePlannerStore.setState({ workflowStage:'room', furniture:[], selectedRoomId:null, planRooms:[], openingNotice:'' });
  usePlannerStore.getState().applyPerimeterTrim('crown-molding','Crown Molding','Trim',[1,.05,.09],'#f4f1ea','ceiling');
  const state=usePlannerStore.getState();
  expect(state.openingNotice).toBe('');
  expect(state.furniture.filter(f=>f.placementKind==='perimeter-trim')).toHaveLength(4);
  expect(new Set(state.furniture.map(f=>f.runId)).size).toBe(1);
  expect(state.furniture.every(f=>f.trimEdge==='ceiling'&&f.y>2)).toBe(true);
 });

 it('replaces an existing crown run when re-applied',()=>{
  usePlannerStore.setState({ workflowStage:'room', furniture:[], openingNotice:'' });
  usePlannerStore.getState().applyPerimeterTrim('crown-molding','Crown Molding','Trim',[1,.05,.09],'#f4f1ea','ceiling');
  usePlannerStore.getState().applyPerimeterTrim('crown-molding','Crown Molding','Trim',[1,.05,.09],'#eee','ceiling');
  expect(usePlannerStore.getState().furniture.filter(f=>f.catalogId==='crown-molding')).toHaveLength(4);
 });

 it('deletes the whole trim run when one segment is selected',()=>{
  usePlannerStore.setState({ workflowStage:'room', furniture:[], openingNotice:'' });
  usePlannerStore.getState().applyPerimeterTrim('baseboard','Baseboard','Trim',[1,.015,.09],'#fff','floor');
  const first=usePlannerStore.getState().furniture.find(f=>f.placementKind==='perimeter-trim')!;
  usePlannerStore.setState({ selectedFurnitureId:first.id });
  usePlannerStore.getState().deleteSelected();
  expect(usePlannerStore.getState().furniture.filter(f=>f.placementKind==='perimeter-trim')).toHaveLength(0);
 });

 it('does not move fixed trim strips',()=>{
  usePlannerStore.setState({ workflowStage:'room', furniture:[], openingNotice:'' });
  usePlannerStore.getState().applyPerimeterTrim('crown-molding','Crown Molding','Trim',[1,.05,.09],'#f4f1ea','ceiling');
  const item=usePlannerStore.getState().furniture[0]!;
  const {x,z,rotation}=item;
  usePlannerStore.setState({ selectedFurnitureId:item.id });
  usePlannerStore.getState().moveSelected(1,1);
  usePlannerStore.getState().rotateSelected(Math.PI/2);
  usePlannerStore.getState().updateFurniture(item.id,{ x:x+2, z:z+2, rotation:rotation+1 });
  const next=usePlannerStore.getState().furniture.find(f=>f.id===item.id)!;
  expect(next.x).toBeCloseTo(x);
  expect(next.z).toBeCloseTo(z);
  expect(next.rotation).toBeCloseTo(rotation);
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
