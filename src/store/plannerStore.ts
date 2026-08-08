import { create } from 'zustand';
import type { CameraMode, FurnitureItem, Opening, Point, SceneSnapshot, Tool, Wall } from '../types';

type View='2d'|'3d';
type FloorRecord={id:string;name:string;scene:SceneSnapshot};
type PlannerState = SceneSnapshot & {
 tool:Tool; view:View; cameraMode:CameraMode; selectedWallId:string|null; selectedFurnitureId:string|null; draftStart:Point|null; floors:FloorRecord[]; activeFloorId:string;
 history:SceneSnapshot[]; historyIndex:number;
 setTool:(tool:Tool)=>void; setView:(view:View)=>void; setCameraMode:(mode:CameraMode)=>void; setDraftStart:(p:Point|null)=>void;
 addWall:(a:Point,b:Point)=>void; updateWall:(id:string,patch:Partial<Wall>)=>void; selectWall:(id:string|null)=>void; addOpening:(wallId:string,type:'door'|'window')=>void; updateOpening:(id:string,patch:Partial<Opening>)=>void; deleteOpening:(id:string)=>void;
 addFurniture:(catalogId:string,name:string,category:string,dims:[number,number,number],color:string,x?:number,z?:number)=>void;
 selectFurniture:(id:string|null)=>void; updateFurniture:(id:string,patch:Partial<FurnitureItem>)=>void; updateFurnitureLive:(id:string,patch:Partial<FurnitureItem>)=>void; moveSelected:(dx:number,dz:number)=>void; duplicateSelected:()=>void; deleteSelected:()=>void;
 setFinish:(target:'floor'|'wall',color:string)=>void; addFloor:()=>void; switchFloor:(id:string)=>void; undo:()=>void; redo:()=>void; clear:()=>void; save:()=>void; load:()=>void; exportProject:()=>void;
};
const initialWalls:Wall[]=[{id:'w1',start:{x:180,y:150},end:{x:660,y:150},thickness:.15,height:2.7},{id:'w2',start:{x:660,y:150},end:{x:660,y:510},thickness:.15,height:2.7},{id:'w3',start:{x:660,y:510},end:{x:180,y:510},thickness:.15,height:2.7},{id:'w4',start:{x:180,y:510},end:{x:180,y:150},thickness:.15,height:2.7}];
const initial:SceneSnapshot={walls:initialWalls,openings:[{id:'o1',wallId:'w1',type:'window',offset:.55,width:1.4,height:1.2,sill:.9},{id:'o2',wallId:'w3',type:'door',offset:.25,width:.9,height:2.1,sill:0}],furniture:[],floorColor:'#c9b18f',wallColor:'#f3f0e9'};
export const usePlannerStore=create<PlannerState>((set,get)=>{
 const snap=():SceneSnapshot=>({walls:get().walls,openings:get().openings,furniture:get().furniture,floorColor:get().floorColor,wallColor:get().wallColor});
 const commit=(next:SceneSnapshot)=>set(s=>{const history=s.history.slice(0,s.historyIndex+1).concat(next).slice(-200);const floors=s.floors.map(f=>f.id===s.activeFloorId?{...f,scene:next}:f);return{...next,floors,history,historyIndex:history.length-1}});
 const mutate=(patch:Partial<SceneSnapshot>)=>commit({...snap(),...patch});
 return {...initial,tool:'select',view:'2d',cameraMode:'orbit',selectedWallId:null,selectedFurnitureId:null,draftStart:null,floors:[{id:'ground',name:'Ground floor',scene:initial}],activeFloorId:'ground',history:[initial],historyIndex:0,
  setTool:(tool)=>set({tool,draftStart:null}),setView:(view)=>set({view,draftStart:null}),setCameraMode:(cameraMode)=>set({cameraMode}),setDraftStart:(draftStart)=>set({draftStart}),
  addWall:(start,end)=>{if(Math.hypot(end.x-start.x,end.y-start.y)<20)return;mutate({walls:[...get().walls,{id:crypto.randomUUID(),start,end,thickness:.15,height:2.7}]})},
  updateWall:(id,patch)=>mutate({walls:get().walls.map(w=>w.id===id?{...w,...patch}:w)}),
  selectWall:(selectedWallId)=>set({selectedWallId,selectedFurnitureId:null}),
  addOpening:(wallId,type)=>mutate({openings:[...get().openings,{id:crypto.randomUUID(),wallId,type,offset:.5,width:type==='door'?.9:1.2,height:type==='door'?2.1:1.1,sill:type==='door'?0:.9}]}),
  updateOpening:(id,patch)=>mutate({openings:get().openings.map(o=>o.id===id?{...o,...patch,offset:patch.offset===undefined?o.offset:Math.max(.05,Math.min(.95,patch.offset))}:o)}),deleteOpening:(id)=>mutate({openings:get().openings.filter(o=>o.id!==id)}),
  addFurniture:(catalogId,name,category,[width,depth,height],color,x=0,z=0)=>{const id=crypto.randomUUID();mutate({furniture:[...get().furniture,{id,catalogId,name,category,x,y:0,z,rotation:0,color,width,depth,height}]});set({selectedFurnitureId:id,selectedWallId:null})},
  selectFurniture:(selectedFurnitureId)=>set({selectedFurnitureId,selectedWallId:null}),
  updateFurnitureLive:(id,patch)=>set(s=>({furniture:s.furniture.map(f=>f.id===id?{...f,...patch}:f)})),
  updateFurniture:(id,patch)=>mutate({furniture:get().furniture.map(f=>f.id===id?{...f,...patch,x:patch.x===undefined?f.x:Math.round(patch.x*4)/4,z:patch.z===undefined?f.z:Math.round(patch.z*4)/4}:f)}),
  moveSelected:(dx,dz)=>{const id=get().selectedFurnitureId,item=get().furniture.find(f=>f.id===id);if(item)get().updateFurniture(item.id,{x:item.x+dx,z:item.z+dz})},
  duplicateSelected:()=>{const item=get().furniture.find(f=>f.id===get().selectedFurnitureId);if(item)get().addFurniture(item.catalogId,item.name,item.category,[item.width,item.depth,item.height],item.color,item.x+.5,item.z+.5)},
  deleteSelected:()=>{const wid=get().selectedWallId,fid=get().selectedFurnitureId;if(wid)mutate({walls:get().walls.filter(w=>w.id!==wid),openings:get().openings.filter(o=>o.wallId!==wid)});if(fid)mutate({furniture:get().furniture.filter(f=>f.id!==fid)});set({selectedWallId:null,selectedFurnitureId:null})},
  setFinish:(target,color)=>mutate(target==='floor'?{floorColor:color}:{wallColor:color}),
  addFloor:()=>{const id=crypto.randomUUID(),scene:{walls:Wall[];openings:Opening[];furniture:FurnitureItem[];floorColor:string;wallColor:string}={walls:[],openings:[],furniture:[],floorColor:initial.floorColor,wallColor:initial.wallColor};set(s=>({...scene,floors:[...s.floors,{id,name:`Floor ${s.floors.length+1}`,scene}],activeFloorId:id,history:[scene],historyIndex:0,selectedWallId:null,selectedFurnitureId:null}))},
  switchFloor:(id)=>set(s=>{const current=s.floors.map(f=>f.id===s.activeFloorId?{...f,scene:snap()}:f),target=current.find(f=>f.id===id);return target?{...target.scene,floors:current,activeFloorId:id,history:[target.scene],historyIndex:0,selectedWallId:null,selectedFurnitureId:null}:s}),
  undo:()=>set(s=>{const i=Math.max(0,s.historyIndex-1);return{...s.history[i],historyIndex:i,selectedWallId:null,selectedFurnitureId:null}}),redo:()=>set(s=>{const i=Math.min(s.history.length-1,s.historyIndex+1);return{...s.history[i],historyIndex:i,selectedWallId:null,selectedFurnitureId:null}}),
  clear:()=>{mutate({...initial,walls:[],openings:[],furniture:[]});set({selectedWallId:null,selectedFurnitureId:null,draftStart:null})},
  save:()=>{const s=get();localStorage.setItem('roomcraft-project',JSON.stringify({version:2,activeFloorId:s.activeFloorId,floors:s.floors.map(f=>f.id===s.activeFloorId?{...f,scene:snap()}:f)}))},
  load:()=>{const raw=localStorage.getItem('roomcraft-project');if(raw){const data=JSON.parse(raw);if(data.floors){const target=data.floors.find((f:FloorRecord)=>f.id===data.activeFloorId)??data.floors[0];set({...target.scene,floors:data.floors,activeFloorId:target.id,history:[target.scene],historyIndex:0})}else mutate({walls:data.walls??[],openings:data.openings??[],furniture:data.furniture??[],floorColor:data.floorColor??initial.floorColor,wallColor:data.wallColor??initial.wallColor})}},
  exportProject:()=>{const s=get(),floors=s.floors.map(f=>f.id===s.activeFloorId?{...f,scene:snap()}:f);const blob=new Blob([JSON.stringify({version:2,activeFloorId:s.activeFloorId,floors},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='roomcraft-project.json';a.click();URL.revokeObjectURL(a.href)}
 }});
