import { Circle, Group, Label, Line, Tag, Text } from 'react-konva';
import { memo, useRef, useState } from 'react';
import type { Opening, Tool, Wall } from '../../types';
import { wallLengthMeters } from '../../lib/geometry/snapping';
export const WallShape=memo(function WallShape({wall,selected,onSelect,onOpening,onEndpointMove,tool,openings}:{wall:Wall;selected:boolean;onSelect:()=>void;onOpening:(type:'door'|'window')=>void;onEndpointMove:(end:'start'|'end',x:number,y:number)=>void;tool:Tool;openings:Opening[]}){
 const [dragPoint,setDragPoint]=useState<{end:'start'|'end';x:number;y:number}|null>(null);
 const displayWall={...wall,[dragPoint?.end??'start']:dragPoint?{x:dragPoint.x,y:dragPoint.y}:wall.start};
 const mid={x:(displayWall.start.x+displayWall.end.x)/2,y:(displayWall.start.y+displayWall.end.y)/2};
 const lastAction=useRef(0);
 const click=(e:any)=>{e.cancelBubble=true;const now=performance.now();if(now-lastAction.current<350)return;lastAction.current=now;if(tool==='door'||tool==='window')onOpening(tool);else onSelect()};
 const drag=(end:'start'|'end',e:any)=>{e.cancelBubble=true;lastAction.current=performance.now();setDragPoint({end,x:e.target.x(),y:e.target.y()})};
 const drop=(end:'start'|'end',e:any)=>{e.cancelBubble=true;lastAction.current=performance.now();const {x,y}=e.target.position();setDragPoint(null);onEndpointMove(end,x,y)};
 return <Group onClick={click} onTap={click}>
  <Line points={[displayWall.start.x,displayWall.start.y,displayWall.end.x,displayWall.end.y]} stroke={selected?'#d56d3b':'#26342e'} strokeWidth={selected?11:9} lineCap="round" hitStrokeWidth={36}/>
  <Label x={mid.x} y={mid.y-25} offsetX={31} listening={false}><Tag fill="#fff" stroke="#dfe4df" cornerRadius={6} shadowBlur={4} shadowOpacity={.08}/><Text text={`${wallLengthMeters(displayWall.start,displayWall.end).toFixed(2)} m`} padding={6} fontSize={11} fontStyle="bold" fill="#35423c"/></Label>
  {selected&&<><Circle x={displayWall.start.x} y={displayWall.start.y} radius={11} fill="#fff" stroke="#d56d3b" strokeWidth={4} hitStrokeWidth={58} draggable onDragStart={e=>drag('start',e)} onDragMove={e=>drag('start',e)} onDragEnd={e=>drop('start',e)}/><Circle x={displayWall.end.x} y={displayWall.end.y} radius={11} fill="#fff" stroke="#d56d3b" strokeWidth={4} hitStrokeWidth={58} draggable onDragStart={e=>drag('end',e)} onDragMove={e=>drag('end',e)} onDragEnd={e=>drop('end',e)}/></>}
  {openings.map(o=>{const x=displayWall.start.x+(displayWall.end.x-displayWall.start.x)*o.offset,y=displayWall.start.y+(displayWall.end.y-displayWall.start.y)*o.offset;return <Circle key={o.id} x={x} y={y} radius={o.type==='door'?10:8} fill={o.type==='door'?'#d56d3b':'#64a9ad'} stroke="#fff" strokeWidth={3} listening={false}/>})}
 </Group>
},(a,b)=>a.wall===b.wall&&a.selected===b.selected&&a.tool===b.tool&&a.openings===b.openings);
