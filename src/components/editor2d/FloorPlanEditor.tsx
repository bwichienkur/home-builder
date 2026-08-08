import { useEffect, useRef, useState } from 'react';
import { Circle, Layer, Line, Stage } from 'react-konva';
import type Konva from 'konva';
import { snapPoint } from '../../lib/geometry/snapping';
import { usePlannerStore } from '../../store/plannerStore';
import { Grid } from './Grid'; import { WallShape } from './WallShape';

export function FloorPlanEditor(){
 const host=useRef<HTMLDivElement>(null); const [size,setSize]=useState({width:900,height:650}); const [cursor,setCursor]=useState({x:0,y:0});
 const {walls,openings,tool,draftStart,setDraftStart,addWall,updateWall,selectedWallId,selectWall,addOpening}=usePlannerStore();
 useEffect(()=>{const ro=new ResizeObserver(([e])=>setSize({width:e.contentRect.width,height:e.contentRect.height})); if(host.current)ro.observe(host.current); return()=>ro.disconnect()},[]);
 const point=(stage:Konva.Stage)=>snapPoint(stage.getRelativePointerPosition()??{x:0,y:0});
 const move=(e:Konva.KonvaEventObject<MouseEvent|TouchEvent>)=>setCursor(point(e.target.getStage()!));
 const down=(e:Konva.KonvaEventObject<MouseEvent|TouchEvent>)=>{if(e.target!==e.target.getStage())return; const p=point(e.target.getStage()!); if(tool==='wall'){if(!draftStart)setDraftStart(p); else {addWall(draftStart,p);setDraftStart(p)}} else selectWall(null)};
 return <div className="canvas-host" ref={host}><Stage width={size.width} height={size.height} onMouseMove={move} onTouchMove={move} onMouseDown={down} onTouchStart={down}>
   <Layer><Grid width={size.width} height={size.height}/>{walls.map(w=><WallShape key={w.id} wall={w} tool={tool} openings={openings.filter(o=>o.wallId===w.id)} selected={w.id===selectedWallId} onSelect={()=>selectWall(w.id)} onOpening={(type)=>addOpening(w.id,type)} onEndpointMove={(end,x,y)=>updateWall(w.id,{[end]:snapPoint({x,y})})}/>)}
   {draftStart&&tool==='wall'&&<><Line points={[draftStart.x,draftStart.y,cursor.x,cursor.y]} stroke="#d56d3b" strokeWidth={5} dash={[10,7]} lineCap="round"/><Circle x={cursor.x} y={cursor.y} radius={6} fill="#d56d3b"/></>}</Layer>
 </Stage><div className="scale">1 square = 25 cm</div></div>
}
