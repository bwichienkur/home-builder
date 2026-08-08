import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Layer, Line, Stage } from 'react-konva';
import type Konva from 'konva';
import { snapPoint } from '../../lib/geometry/snapping';
import { usePlannerStore } from '../../store/plannerStore';
import { Grid } from './Grid';
import { WallShape } from './WallShape';

export function FloorPlanEditor(){
 const host=useRef<HTMLDivElement>(null),nextCursor=useRef({x:0,y:0}),frame=useRef<number|null>(null);
 const [size,setSize]=useState({width:900,height:650}),[cursor,setCursor]=useState({x:0,y:0});
 const walls=usePlannerStore(s=>s.walls),openings=usePlannerStore(s=>s.openings),tool=usePlannerStore(s=>s.tool),draftStart=usePlannerStore(s=>s.draftStart),selectedWallId=usePlannerStore(s=>s.selectedWallId);
 const setDraftStart=usePlannerStore(s=>s.setDraftStart),addWall=usePlannerStore(s=>s.addWall),updateWall=usePlannerStore(s=>s.updateWall),selectWall=usePlannerStore(s=>s.selectWall),addOpening=usePlannerStore(s=>s.addOpening);
 const openingsByWall=useMemo(()=>{const map=new Map<string,typeof openings>();for(const opening of openings){const list=map.get(opening.wallId);if(list)list.push(opening);else map.set(opening.wallId,[opening])}return map},[openings]);
 useEffect(()=>{const ro=new ResizeObserver(([e])=>setSize({width:e.contentRect.width,height:e.contentRect.height}));if(host.current)ro.observe(host.current);return()=>ro.disconnect()},[]);
 useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current)},[]);
 const point=(stage:Konva.Stage)=>snapPoint(stage.getRelativePointerPosition()??{x:0,y:0});
 const move=(e:Konva.KonvaEventObject<MouseEvent|TouchEvent>)=>{nextCursor.current=point(e.target.getStage()!);if(frame.current===null)frame.current=requestAnimationFrame(()=>{frame.current=null;setCursor(nextCursor.current)})};
 const down=(e:Konva.KonvaEventObject<MouseEvent|TouchEvent>)=>{if(e.target!==e.target.getStage())return;const p=point(e.target.getStage()!);if(tool==='wall'){if(!draftStart)setDraftStart(p);else{addWall(draftStart,p);setDraftStart(p)}}else selectWall(null)};
 return <div className="canvas-host" ref={host}><Stage width={size.width} height={size.height} onMouseMove={move} onTouchMove={move} onMouseDown={down} onTouchStart={down}>
  <Layer><Grid width={size.width} height={size.height}/>{walls.map(w=><WallShape key={w.id} wall={w} tool={tool} openings={openingsByWall.get(w.id)??[]} selected={w.id===selectedWallId} onSelect={()=>selectWall(w.id)} onOpening={type=>addOpening(w.id,type)} onEndpointMove={(end,x,y)=>updateWall(w.id,{[end]:snapPoint({x,y})})}/>)}
  {draftStart&&tool==='wall'&&<><Line points={[draftStart.x,draftStart.y,cursor.x,cursor.y]} stroke="#d56d3b" strokeWidth={5} dash={[10,7]} lineCap="round"/><Circle x={cursor.x} y={cursor.y} radius={6} fill="#d56d3b"/></>}</Layer>
 </Stage><div className="scale">1 square = 25 cm</div></div>
}
