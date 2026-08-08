import { Circle, Group, Label, Line, Tag, Text } from 'react-konva';
import { memo } from 'react';
import type { Opening, Tool, Wall } from '../../types';
import { wallLengthMeters } from '../../lib/geometry/snapping';
export const WallShape=memo(function WallShape({wall,selected,onSelect,onOpening,onEndpointMove,tool,openings}:{wall:Wall;selected:boolean;onSelect:()=>void;onOpening:(type:'door'|'window')=>void;onEndpointMove:(end:'start'|'end',x:number,y:number)=>void;tool:Tool;openings:Opening[]}){
 const mid={x:(wall.start.x+wall.end.x)/2,y:(wall.start.y+wall.end.y)/2};
 const click=(e:any)=>{e.cancelBubble=true;if(tool==='door'||tool==='window')onOpening(tool);else onSelect()};
 return <Group onClick={click} onTap={click}>
  <Line points={[wall.start.x,wall.start.y,wall.end.x,wall.end.y]} stroke={selected?'#d56d3b':'#26342e'} strokeWidth={selected?11:9} lineCap="round" hitStrokeWidth={22}/>
  <Label x={mid.x} y={mid.y-25} offsetX={31}><Tag fill="#fff" stroke="#dfe4df" cornerRadius={6} shadowBlur={4} shadowOpacity={.08}/><Text text={`${wallLengthMeters(wall.start,wall.end).toFixed(2)} m`} padding={6} fontSize={11} fontStyle="bold" fill="#35423c"/></Label>
  {selected&&<><Circle x={wall.start.x} y={wall.start.y} radius={7} fill="#fff" stroke="#d56d3b" strokeWidth={3} draggable onDragEnd={e=>onEndpointMove('start',e.target.x(),e.target.y())}/><Circle x={wall.end.x} y={wall.end.y} radius={7} fill="#fff" stroke="#d56d3b" strokeWidth={3} draggable onDragEnd={e=>onEndpointMove('end',e.target.x(),e.target.y())}/></>}
  {openings.map(o=>{const x=wall.start.x+(wall.end.x-wall.start.x)*o.offset,y=wall.start.y+(wall.end.y-wall.start.y)*o.offset;return <Circle key={o.id} x={x} y={y} radius={o.type==='door'?10:8} fill={o.type==='door'?'#d56d3b':'#64a9ad'} stroke="#fff" strokeWidth={3}/>})}
 </Group>
},(a,b)=>a.wall===b.wall&&a.selected===b.selected&&a.tool===b.tool&&a.openings===b.openings);
