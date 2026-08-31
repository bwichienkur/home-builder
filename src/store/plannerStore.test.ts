import {describe,expect,it} from 'vitest';
import {wouldOverlapFurniture} from '../lib/collisions';
import {pointInWorldRooms} from '../lib/geometry/placement';
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

 it('clone starts a ghost placement instead of stacking immediately',()=>{
  usePlannerStore.setState({ workflowStage:'room', furniture:[], openings:[], openingNotice:'' });
  usePlannerStore.getState().addFurniture('clone-me','Chair','Seating',[.5,.5,.8],'#bbb',0,0);
  const original=usePlannerStore.getState().furniture.at(-1)!;
  usePlannerStore.setState({ selectedFurnitureId:original.id });
  const before=usePlannerStore.getState().furniture.length;
  usePlannerStore.getState().duplicateSelected();
  const pending=usePlannerStore.getState().pendingPlacement;
  expect(pending?.catalogId).toBe('clone-me');
  expect(pending?.name).toBe('Chair');
  expect(usePlannerStore.getState().furniture).toHaveLength(before);
  expect(usePlannerStore.getState().selectedFurnitureId).toBeNull();
 });

 it('ghost placement starts clear of an occupied room center',()=>{
  usePlannerStore.setState({ workflowStage:'room', furniture:[], openings:[], openingNotice:'' });
  usePlannerStore.getState().addFurniture('blocker','Table','Tables',[1.4,1.4,.75],'#ccc',0,0);
  usePlannerStore.getState().beginPlacement('ghost-clear','Stool','Seating',[.4,.4,.45],'#ddd',0,0,{mountingType:'floor'});
  const pending=usePlannerStore.getState().pendingPlacement!;
  expect(wouldOverlapFurniture(
    { id:'p', x:pending.x, y:pending.y??0, z:pending.z, width:pending.width, depth:pending.depth, height:pending.height, rotation:pending.rotation },
    usePlannerStore.getState().furniture,
  )).toBe(false);
  expect(pointInWorldRooms(pending.x, pending.z, usePlannerStore.getState().walls)).toBe(true);
 });

 it('ghost placement stays inside the room even when seeded outside',()=>{
  usePlannerStore.setState({ workflowStage:'room', furniture:[], openings:[], openingNotice:'' });
  usePlannerStore.getState().beginPlacement('ghost-out','Lamp','Lighting',[.3,.3,.8],'#eee',20,20,{mountingType:'floor'});
  const pending=usePlannerStore.getState().pendingPlacement!;
  expect(pointInWorldRooms(pending.x, pending.z, usePlannerStore.getState().walls)).toBe(true);
  expect(Math.hypot(pending.x, pending.z)).toBeLessThan(8);
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
  expect(usePlannerStore.getState().cameraMode).toBe('orbit');
  expect(usePlannerStore.getState().studioMode).toBe('furnish');
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

 it('attaches a square room with a shared mid-wall passage and no starter windows',()=>{
  usePlannerStore.setState({
    workflowStage:'house',
    furniture:[],
    openings:[],
    planRooms:[],
    walls:[],
    openingNotice:'',
    selectedRoomId:null,
    pendingAttachMode:false,
  });
  const a=usePlannerStore.getState().placePlanRoom({x:400,y:300},'rectangle','A');
  expect(a).toBeTruthy();
  expect(usePlannerStore.getState().openings).toHaveLength(0);
  const b=usePlannerStore.getState().attachPlanRoom(a!,'right');
  expect(b).toBeTruthy();
  const openings=usePlannerStore.getState().openings;
  expect(openings.length).toBeGreaterThanOrEqual(1);
  expect(openings.every(o=>o.type==='passage')).toBe(true);
  expect(openings.some(o=>o.type==='window')).toBe(false);
  expect(usePlannerStore.getState().attachPlanRoom(a!,'right')).toBeNull();
 });

 it('live wall nudge keeps neighboring rooms still and preserves wall id',()=>{
  usePlannerStore.setState({
    workflowStage:'house',
    furniture:[],
    openings:[],
    planRooms:[],
    walls:[],
    openingNotice:'',
    selectedRoomId:null,
    pendingAttachMode:false,
  });
  const a=usePlannerStore.getState().placePlanRoom({x:400,y:300},'rectangle','A');
  const b=usePlannerStore.getState().attachPlanRoom(a!,'right','B');
  expect(a&&b).toBeTruthy();
  const before=usePlannerStore.getState();
  const roomA=before.planRooms.find(r=>r.id===a!)!;
  const leftX=Math.min(...roomA.points.map(p=>p.x));
  const rightWall=before.walls
    .filter(w=>Math.abs(w.start.x-w.end.x)<2)
    .sort((w1,w2)=>((w2.start.x+w2.end.x)/2)-((w1.start.x+w1.end.x)/2))[0]!;
  expect(rightWall).toBeTruthy();
  const midBefore=(rightWall.start.x+rightWall.end.x)/2;
  expect(usePlannerStore.getState().nudgeWall(rightWall.id,0.5,0,{live:true})).toBe(true);
  const mid=usePlannerStore.getState();
  expect(mid.selectedWallId).toBe(rightWall.id);
  expect(mid.walls.some(w=>w.id===rightWall.id)).toBe(true);
  const roomAMid=mid.planRooms.find(r=>r.id===a!)!;
  expect(Math.min(...roomAMid.points.map(p=>p.x))).toBeCloseTo(leftX,0);
  const midAfter=((mid.walls.find(w=>w.id===rightWall.id)!.start.x+mid.walls.find(w=>w.id===rightWall.id)!.end.x)/2);
  expect(midAfter).toBeGreaterThan(midBefore+20);
  usePlannerStore.getState().commitWallNudge();
  expect(usePlannerStore.getState().walls.length).toBeGreaterThan(4);
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

 it('adds a new floor without wiping the previous story', () => {
  const groundId = 'floor-ground';
  usePlannerStore.setState({
    workflowStage: 'house',
    activeFloorId: groundId,
    floors: [{
      id: groundId,
      name: 'Ground',
      scene: { walls: [], openings: [], furniture: [], floorColor: '#c9b18f', wallColor: '#f4f1ea', ceilingColor: '#ffffff' },
      planRooms: [],
      storyHeightM: 2.74,
    }],
    walls: [],
    openings: [],
    furniture: [],
    planRooms: [],
  });
  const firstId = usePlannerStore.getState().placePlanRoom({ x: 400, y: 300 }, 'rectangle', 'Room 1');
  expect(firstId).toBeTruthy();
  const beforeWalls = usePlannerStore.getState().walls.length;
  expect(beforeWalls).toBeGreaterThan(0);
  usePlannerStore.getState().addFloor();
  const next = usePlannerStore.getState();
  expect(next.floors).toHaveLength(2);
  expect(next.floors[1]?.name).toBe('L2');
  expect(next.planRooms.length).toBeGreaterThan(0);
  expect(next.walls.length).toBeGreaterThan(0);
  expect(next.activeFloorId).toBe(next.floors[1]?.id);
  next.switchFloor(groundId);
  expect(usePlannerStore.getState().walls.length).toBe(beforeWalls);
  expect(usePlannerStore.getState().deleteFloor(groundId)).toBe(true);
  expect(usePlannerStore.getState().floors).toHaveLength(1);
  expect(usePlannerStore.getState().deleteFloor(usePlannerStore.getState().activeFloorId)).toBe(false);
 });

 it('ghosts a corner until confirm and leaves rooms unchanged on cancel', () => {
  const points = [
    { x: 180, y: 150 },
    { x: 660, y: 150 },
    { x: 660, y: 510 },
    { x: 180, y: 510 },
  ];
  usePlannerStore.setState({
    planRooms: [{ id: 'r1', name: 'Room', roomType: 'Bedroom', points }],
    selectedRoomId: 'r1',
    pendingCorner: null,
    tool: 'corner',
    walls: [],
    openings: [],
    furniture: [],
    floors: [{
      id: 'ground',
      name: 'Ground',
      scene: { walls: [], openings: [], furniture: [], floorColor: '#c9b18f', wallColor: '#f4f1ea', ceilingColor: '#ffffff' },
      planRooms: [{ id: 'r1', name: 'Room', roomType: 'Bedroom', points }],
    }],
    activeFloorId: 'ground',
  });
  const before = JSON.stringify(usePlannerStore.getState().planRooms[0]!.points);
  const started = usePlannerStore.getState().beginPendingCorner('r1', { x: 300, y: 150 });
  expect(started).toBe(true);
  expect(JSON.stringify(usePlannerStore.getState().planRooms[0]!.points)).toBe(before);
  expect(usePlannerStore.getState().pendingCorner).toMatchObject({ roomId: 'r1', edgeIndex: 0 });
  usePlannerStore.getState().movePendingCorner({ x: 500, y: 140 });
  expect(usePlannerStore.getState().pendingCorner?.t).toBeGreaterThan(0.4);
  expect(JSON.stringify(usePlannerStore.getState().planRooms[0]!.points)).toBe(before);
  usePlannerStore.getState().cancelPendingCorner();
  expect(usePlannerStore.getState().pendingCorner).toBeNull();
  expect(JSON.stringify(usePlannerStore.getState().planRooms[0]!.points)).toBe(before);
 });

 it('confirms a ghost corner at t and selects the new vertex', () => {
  const points = [
    { x: 180, y: 150 },
    { x: 660, y: 150 },
    { x: 660, y: 510 },
    { x: 180, y: 510 },
  ];
  usePlannerStore.setState({
    planRooms: [{ id: 'r1', name: 'Room', roomType: 'Bedroom', points }],
    selectedRoomId: 'r1',
    pendingCorner: null,
    tool: 'corner',
    walls: [
      { id: 'w1', start: points[0]!, end: points[1]!, thickness: 0.15, height: 2.7 },
      { id: 'w2', start: points[1]!, end: points[2]!, thickness: 0.15, height: 2.7 },
      { id: 'w3', start: points[2]!, end: points[3]!, thickness: 0.15, height: 2.7 },
      { id: 'w4', start: points[3]!, end: points[0]!, thickness: 0.15, height: 2.7 },
    ],
    openings: [],
    furniture: [],
    floors: [{
      id: 'ground',
      name: 'Ground',
      scene: { walls: [], openings: [], furniture: [], floorColor: '#c9b18f', wallColor: '#f4f1ea', ceilingColor: '#ffffff' },
      planRooms: [{ id: 'r1', name: 'Room', roomType: 'Bedroom', points }],
    }],
    activeFloorId: 'ground',
  });
  usePlannerStore.getState().beginPendingCorner('r1', { x: 300, y: 150 });
  expect(usePlannerStore.getState().commitPendingCorner()).toBe(true);
  const next = usePlannerStore.getState();
  expect(next.pendingCorner).toBeNull();
  expect(next.tool).toBe('select');
  expect(next.planRooms[0]!.points.length).toBe(5);
  expect(next.selectedVertexIndex).toBe(1);
 });

 it('cancels a ghost corner when switching to Door', () => {
  usePlannerStore.setState({
    pendingCorner: { roomId: 'r1', edgeIndex: 0, t: 0.5 },
    tool: 'corner',
  });
  usePlannerStore.getState().setTool('door');
  expect(usePlannerStore.getState().pendingCorner).toBeNull();
  expect(usePlannerStore.getState().tool).toBe('door');
 });

 it('keeps the selected room when tapping a wall in Walls mode', () => {
  const points = [
    { x: 180, y: 150 },
    { x: 660, y: 150 },
    { x: 660, y: 510 },
    { x: 180, y: 510 },
  ];
  usePlannerStore.setState({
    workflowStage: 'house',
    planWallTool: true,
    selectedRoomId: 'r1',
    planRooms: [{ id: 'r1', name: 'Room', roomType: 'Bedroom', points }],
    walls: [
      { id: 'w1', start: points[0]!, end: points[1]!, thickness: 0.15, height: 2.7 },
      { id: 'w2', start: points[1]!, end: points[2]!, thickness: 0.15, height: 2.7 },
      { id: 'w3', start: points[2]!, end: points[3]!, thickness: 0.15, height: 2.7 },
      { id: 'w4', start: points[3]!, end: points[0]!, thickness: 0.15, height: 2.7 },
    ],
  });
  usePlannerStore.getState().selectWall('w1');
  expect(usePlannerStore.getState().selectedWallId).toBe('w1');
  expect(usePlannerStore.getState().selectedRoomId).toBe('r1');
  expect(usePlannerStore.getState().planWallTool).toBe(true);
 });
});
