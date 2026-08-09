import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Circle, Layer, Line, Stage } from 'react-konva';
import type Konva from 'konva';
import type {Wall} from '../../types';
import { snapWallPoint,wallLengthMeters } from '../../lib/geometry/snapping';
import { usePlannerStore } from '../../store/plannerStore';
import { Grid } from './Grid';
import { WallShape } from './WallShape';

export function FloorPlanEditor(){
 const host=useRef<HTMLDivElement>(null),nextCursor=useRef({x:0,y:0}),frame=useRef<number|null>(null),gesture=useRef<{x:number;y:number;time:number;point:{x:number;y:number};onStage:boolean}|null>(null);
 const [size,setSize]=useState({width:1,height:1}),[cursor,setCursor]=useState({x:0,y:0});
 const walls=usePlannerStore(s=>s.walls),openings=usePlannerStore(s=>s.openings),tool=usePlannerStore(s=>s.tool),draftStart=usePlannerStore(s=>s.draftStart),selectedWallId=usePlannerStore(s=>s.selectedWallId);
 const setDraftStart=usePlannerStore(s=>s.setDraftStart),addWall=usePlannerStore(s=>s.addWall),updateWallEndpoint=usePlannerStore(s=>s.updateWallEndpoint),selectWall=usePlannerStore(s=>s.selectWall),addOpening=usePlannerStore(s=>s.addOpening);
 const openingsByWall=useMemo(()=>{const map=new Map<string,typeof openings>();for(const opening of openings){const list=map.get(opening.wallId);if(list)list.push(opening);else map.set(opening.wallId,[opening])}return map},[openings]);
 const scale=size.width<650?Math.max(.42,size.width/760):1,logicalWidth=size.width/scale,logicalHeight=size.height/scale;
 useLayoutEffect(()=>{const el=host.current;if(!el)return;const measure=()=>{const r=el.getBoundingClientRect();setSize({width:Math.max(1,r.width),height:Math.max(1,r.height)})};measure();const ro=new ResizeObserver(measure);ro.observe(el);return()=>ro.disconnect()},[]);
 useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current)},[]);
 const point=(stage:Konva.Stage,excludeWallId?:string)=>snapWallPoint(stage.getRelativePointerPosition()??{x:0,y:0},walls,excludeWallId);
 const move=(e:Konva.KonvaEventObject<PointerEvent>)=>{if(!e.evt.isPrimary||e.evt.pointerType==='touch')return;nextCursor.current=point(e.target.getStage()!);if(frame.current===null)frame.current=requestAnimationFrame(()=>{frame.current=null;setCursor(nextCursor.current)})};
 const activate=(p:{x:number;y:number})=>{if(tool==='wall'){if(!draftStart){setDraftStart(p);setCursor(p)}else{addWall(draftStart,p);setDraftStart(null)}}else selectWall(null)};
 const pointerDown=(e:Konva.KonvaEventObject<PointerEvent>)=>{if(!e.evt.isPrimary)return;const p=point(e.target.getStage()!);gesture.current={x:e.evt.clientX,y:e.evt.clientY,time:performance.now(),point:p,onStage:e.target===e.target.getStage()};if(e.evt.pointerType==='touch')setCursor(p)};
 const pointerUp=(e:Konva.KonvaEventObject<PointerEvent>)=>{const start=gesture.current;gesture.current=null;if(!start||!start.onStage||!e.evt.isPrimary)return;const distance=Math.hypot(e.evt.clientX-start.x,e.evt.clientY-start.y),maxDistance=e.evt.pointerType==='touch'?12:8;if(distance<=maxDistance&&performance.now()-start.time<700)activate(start.point)};
 return <div className="canvas-host" ref={host}><Stage width={size.width} height={size.height} scaleX={scale} scaleY={scale} onPointerMove={move} onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={()=>{gesture.current=null}}>
  <Layer><Grid width={logicalWidth} height={logicalHeight}/>{walls.map(w=><WallShape key={w.id} wall={w} tool={tool} openings={openingsByWall.get(w.id)??[]} selected={w.id===selectedWallId} onSelect={()=>selectWall(w.id)} onOpening={type=>addOpening(w.id,type)} onEndpointMove={(end,x,y)=>updateWallEndpoint(w.id,end,snapWallPoint({x,y},walls,w.id))}/>)}
  {draftStart&&tool==='wall'&&<><Line points={[draftStart.x,draftStart.y,cursor.x,cursor.y]} stroke="#d56d3b" strokeWidth={5} dash={[10,7]} lineCap="round"/><Circle x={cursor.x} y={cursor.y} radius={6} fill="#d56d3b"/></>}</Layer>
 </Stage>{tool==='select'&&selectedWallId&&<WallQuickEditor wall={walls.find(w=>w.id===selectedWallId)!}/>}<div className="mobile-builder-hint">{tool==='select'?'Tap a wall, then drag either orange handle':tool==='wall'?(draftStart?'Tap once where the wall should end':'Tap once where the wall should start'):tool==='door'?'Door: tap a wall':'Window: tap a wall'}{draftStart&&<button onClick={()=>setDraftStart(null)}>Cancel</button>}</div><div className="scale">1 square = 25 cm</div></div>
}

function WallQuickEditor({wall}:{wall:Wall}){const setLength=usePlannerStore(s=>s.setWallLength),split=usePlannerStore(s=>s.splitWall),offset=usePlannerStore(s=>s.offsetWall);const submit=(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const value=Number(new FormData(e.currentTarget).get('length'));if(value>0)setLength(wall.id,value)};return <div className="wall-quick-editor"><form onSubmit={submit}><label>Wall length<input name="length" type="number" min=".25" step=".01" defaultValue={wallLengthMeters(wall.start,wall.end).toFixed(2)} inputMode="decimal"/><span>m</span></label><button type="submit">Set</button></form><div><button onClick={()=>offset(wall.id,-.25)} aria-label="Move wall outward">− 25 cm</button><button onClick={()=>split(wall.id)}>Split wall</button><button onClick={()=>offset(wall.id,.25)} aria-label="Move wall inward">+ 25 cm</button></div></div>}
