import { Circle, Group, Label, Line, Rect, Tag, Text } from 'react-konva';
import { memo, useRef, useState } from 'react';
import type { Opening, Tool, UnitSystem, Wall } from '../../types';
import { wallLengthMeters } from '../../lib/geometry/snapping';
import {formatLength} from '../../lib/measurements';
export const WallShape=memo(function WallShape({wall,selected,selectedOpeningId,onSelect,onOpening,onOpeningSelect,onOpeningMove,onEndpointMove,tool,openings,unitSystem}:{wall:Wall;selected:boolean;selectedOpeningId:string|null;onSelect:()=>void;onOpening:(type:'door'|'window'|'passage')=>void;onOpeningSelect:(id:string)=>void;onOpeningMove:(id:string,offset:number)=>void;onEndpointMove:(end:'start'|'end',x:number,y:number)=>void;tool:Tool;openings:Opening[];unitSystem:UnitSystem}){
 const [dragPoint,setDragPoint]=useState<{end:'start'|'end';x:number;y:number}|null>(null);
 const displayWall={...wall,[dragPoint?.end??'start']:dragPoint?{x:dragPoint.x,y:dragPoint.y}:wall.start};
 const mid={x:(displayWall.start.x+displayWall.end.x)/2,y:(displayWall.start.y+displayWall.end.y)/2};
 const lastAction=useRef(0);
 const click=(e:any)=>{e.cancelBubble=true;const now=performance.now();if(now-lastAction.current<350)return;lastAction.current=now;if(tool==='door'||tool==='window'||tool==='passage')onOpening(tool);else onSelect()};
 const drag=(end:'start'|'end',e:any)=>{e.cancelBubble=true;lastAction.current=performance.now();setDragPoint({end,x:e.target.x(),y:e.target.y()})};
 const drop=(end:'start'|'end',e:any)=>{e.cancelBubble=true;lastAction.current=performance.now();const {x,y}=e.target.position();setDragPoint(null);onEndpointMove(end,x,y)};
 return <Group onClick={click} onTap={click}>
  <Line points={[displayWall.start.x,displayWall.start.y,displayWall.end.x,displayWall.end.y]} stroke={selected?'#0058a3':'#111820'} strokeWidth={selected?11:9} lineCap="round" hitStrokeWidth={36}/>
  <Label x={mid.x} y={mid.y-25} offsetX={35} onClick={e=>{e.cancelBubble=true;onSelect()}} onTap={e=>{e.cancelBubble=true;onSelect()}}><Tag fill="#fff" stroke="#d8dee4" cornerRadius={6} shadowBlur={4} shadowOpacity={.08}/><Text text={formatLength(wallLengthMeters(displayWall.start,displayWall.end),unitSystem)} padding={6} fontSize={11} fontStyle="bold" fill="#0058a3"/></Label>
  {selected&&<><Circle x={displayWall.start.x} y={displayWall.start.y} radius={11} fill="#fff" stroke="#0058a3" strokeWidth={4} hitStrokeWidth={58} draggable onDragStart={e=>drag('start',e)} onDragMove={e=>drag('start',e)} onDragEnd={e=>drop('start',e)}/><Circle x={displayWall.end.x} y={displayWall.end.y} radius={11} fill="#fff" stroke="#0058a3" strokeWidth={4} hitStrokeWidth={58} draggable onDragStart={e=>drag('end',e)} onDragMove={e=>drag('end',e)} onDragEnd={e=>drop('end',e)}/></>}
  {openings.map(o=>{const x=displayWall.start.x+(displayWall.end.x-displayWall.start.x)*o.offset,y=displayWall.start.y+(displayWall.end.y-displayWall.start.y)*o.offset,chosen=o.id===selectedOpeningId;const move=(e:any)=>{e.cancelBubble=true;const dx=displayWall.end.x-displayWall.start.x,dy=displayWall.end.y-displayWall.start.y,t=((e.target.x()-displayWall.start.x)*dx+(e.target.y()-displayWall.start.y)*dy)/(dx*dx+dy*dy);onOpeningMove(o.id,Math.max(.03,Math.min(.97,t)))};return <Group key={o.id} x={x} y={y} draggable={tool==='select'} onDragMove={move} onDragEnd={move} onClick={e=>{e.cancelBubble=true;onOpeningSelect(o.id)}} onTap={e=>{e.cancelBubble=true;onOpeningSelect(o.id)}}>
   {o.type==='window'?<Rect x={-11} y={-8} width={22} height={16} cornerRadius={3} fill="#64a9ad" stroke={chosen?'#0058a3':'#fff'} strokeWidth={chosen?4:3}/>:<Circle radius={o.type==='passage'?9:11} fill={o.type==='passage'?'#fff':'#0058a3'} stroke={chosen?'#003d70':'#fff'} strokeWidth={chosen?4:3}/>}<Circle radius={26} opacity={0}/>
  </Group>})}
 </Group>
});
