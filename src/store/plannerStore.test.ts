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
  usePlannerStore.setState({ workflowStage: 'room', furniture: [], openings: [], openingNotice: '' });
  usePlannerStore.getState().cancelPendingPlacement();
  const before=usePlannerStore.getState().furniture.length;
  usePlannerStore.getState().beginPlacement('ghost-bed','Cloud Bed','Bedroom',[1.7,2.1,.55],'#ddd',undefined,undefined,{mountingType:'floor'});
  const pending=usePlannerStore.getState().pendingPlacement;
  expect(pending?.name).toBe('Cloud Bed');
  expect(pending).not.toBeNull();
  expect(usePlannerStore.getState().furniture).toHaveLength(before);
  usePlannerStore.getState().movePendingPlacement(0,0);
  usePlannerStore.getState().rotatePendingPlacement(Math.PI/2);
  const id=usePlannerStore.getState().commitPendingPlacement();
  const state=usePlannerStore.getState();
  expect(state.openingNotice).toBe('');
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
 it('keeps baseboard aligned after adding a neighboring room',()=>{
  usePlannerStore.setState({
    workflowStage:'house',
    furniture:[],
    openings:[],
    planRooms:[],
    walls:[],
    openingNotice:'',
    selectedRoomId:null,
  });
  const id=usePlannerStore.getState().placePlanRoom({x:400,y:300},'rectangle','Trim Room');
  expect(id).toBeTruthy();
  usePlannerStore.getState().enterRoom(id!);
  usePlannerStore.getState().applyPerimeterTrim('baseboard','Baseboard','Trim',[1,.015,.09],'#fff','floor');
  const before=usePlannerStore.getState().furniture.filter(f=>f.placementKind==='perimeter-trim');
  expect(before.length).toBeGreaterThanOrEqual(4);
  usePlannerStore.getState().exitRoom();
  const neighbor=usePlannerStore.getState().placePlanRoom({x:700,y:300},'rectangle','Neighbor');
  expect(neighbor).toBeTruthy();
  const after=usePlannerStore.getState().furniture.filter(f=>f.placementKind==='perimeter-trim');
  expect(after.length).toBeGreaterThanOrEqual(4);
  const wallIds=new Set(usePlannerStore.getState().walls.map(w=>w.id));
  expect(after.every(f=>f.wallId&&wallIds.has(f.wallId))).toBe(true);
 });

 it('moves a selected plan room without overlapping neighbors',()=>{
  usePlannerStore.setState({
    workflowStage:'house',
    furniture:[],
    openings:[],
    planRooms:[],
    walls:[],
    openingNotice:'',
    selectedRoomId:null,
  });
  const a=usePlannerStore.getState().placePlanRoom({x:400,y:300},'rectangle','A');
  const b=usePlannerStore.getState().placePlanRoom({x:780,y:300},'rectangle','B');
  expect(a&&b).toBeTruthy();
  const before=usePlannerStore.getState().planRooms.find(r=>r.id===a!)!;
  const cx0=before.points.reduce((s,p)=>s+p.x,0)/before.points.length;
  expect(usePlannerStore.getState().movePlanRoom(a!,0,1.5)).toBe(true);
  const after=usePlannerStore.getState().planRooms.find(r=>r.id===a!)!;
  const cx1=after.points.reduce((s,p)=>s+p.x,0)/after.points.length;
  // Recentering may shift both rooms; relative move along Z should still change the polygon.
  expect(after.points.some((p,i)=>Math.abs(p.y-before.points[i]!.y)>1||Math.abs(p.x-before.points[i]!.x)>1)).toBe(true);
  void cx0;void cx1;
  // Overlap into neighbor should fail.
  expect(usePlannerStore.getState().movePlanRoom(a!,3,0)).toBe(false);
 });
});

describe('floor fill and undo',()=>{
 it('applies a tile color to a room floor and undoes it',()=>{
  usePlannerStore.getState().placePlanRoom({x:400,y:300},'rectangle','Tile Room');
  const room=usePlannerStore.getState().planRooms[0]!;
  const before=room.floorColor;
  usePlannerStore.getState().beginFloorFill({catalogId:'its-afyon-gold-18',name:'Afyon Gold',color:'#cdb58d'});
  expect(usePlannerStore.getState().pendingFloorFill?.name).toBe('Afyon Gold');
  expect(usePlannerStore.getState().applyFloorFillToRoom(room.id)).toBe(true);
  expect(usePlannerStore.getState().planRooms.find(r=>r.id===room.id)?.floorColor).toBe('#cdb58d');
  usePlannerStore.getState().undo();
  expect(usePlannerStore.getState().planRooms.find(r=>r.id===room.id)?.floorColor).toBe(before);
 });

 it('ignores freehand wall draw tool requests',()=>{
  usePlannerStore.getState().setTool('wall');
  expect(usePlannerStore.getState().tool).toBe('select');
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

 it('updates room outline points when wall length changes',()=>{
  usePlannerStore.setState({
   walls:[
    {id:'w1',start:{x:180,y:150},end:{x:660,y:150},thickness:0.15,height:2.7},
    {id:'w2',start:{x:660,y:150},end:{x:660,y:510},thickness:0.15,height:2.7},
    {id:'w3',start:{x:660,y:510},end:{x:180,y:510},thickness:0.15,height:2.7},
    {id:'w4',start:{x:180,y:510},end:{x:180,y:150},thickness:0.15,height:2.7},
   ],
   planRooms:[{
    id:'r1',name:'Room',roomType:'Bedroom',
    points:[{x:180,y:150},{x:660,y:150},{x:660,y:510},{x:180,y:510}],
   }],
  });
  usePlannerStore.getState().setWallLength('w1',4);
  const next=usePlannerStore.getState();
  const updated=next.walls.find(w=>w.id==='w1')!;
  const len=Math.hypot(updated.end.x-updated.start.x,updated.end.y-updated.start.y)/80;
  expect(len).toBeCloseTo(4,1);
  expect(next.planRooms[0]!.points.some(p=>Math.hypot(p.x-updated.end.x,p.y-updated.end.y)<1)).toBe(true);
 });

 it('keeps the opposite end fixed when resizing with a grow side',()=>{
  usePlannerStore.setState({
   walls:[
    {id:'w1',start:{x:180,y:150},end:{x:660,y:150},thickness:0.15,height:2.7},
    {id:'w2',start:{x:660,y:150},end:{x:660,y:510},thickness:0.15,height:2.7},
    {id:'w3',start:{x:660,y:510},end:{x:180,y:510},thickness:0.15,height:2.7},
    {id:'w4',start:{x:180,y:510},end:{x:180,y:150},thickness:0.15,height:2.7},
   ],
   planRooms:[{
    id:'r1',name:'Room',roomType:'Bedroom',
    points:[{x:180,y:150},{x:660,y:150},{x:660,y:510},{x:180,y:510}],
   }],
  });
  const startBefore={...usePlannerStore.getState().walls.find(w=>w.id==='w1')!.start};
  usePlannerStore.getState().setWallLength('w1',4,'right');
  const afterRight=usePlannerStore.getState().walls.find(w=>w.id==='w1')!;
  expect(afterRight.start).toEqual(startBefore);
  const lenRight=Math.hypot(afterRight.end.x-afterRight.start.x,afterRight.end.y-afterRight.start.y)/80;
  expect(lenRight).toBeCloseTo(4,1);

  const endBefore={...usePlannerStore.getState().walls.find(w=>w.id==='w1')!.end};
  usePlannerStore.getState().setWallLength('w1',3,'left');
  const afterLeft=usePlannerStore.getState().walls.find(w=>w.id==='w1')!;
  expect(afterLeft.end).toEqual(endBefore);
  const lenLeft=Math.hypot(afterLeft.end.x-afterLeft.start.x,afterLeft.end.y-afterLeft.start.y)/80;
  expect(lenLeft).toBeCloseTo(3,1);
 });
});
