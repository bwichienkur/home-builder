import { Line } from 'react-konva';
export function Grid({width,height,step=20}:{width:number;height:number;step?:number}) {
  const lines=[]; for(let x=0;x<=width;x+=step) lines.push(<Line key={'x'+x} points={[x,0,x,height]} stroke={x%100===0?'#cdd3cf':'#e4e8e4'} strokeWidth={x%100===0?1.2:.7}/>);
  for(let y=0;y<=height;y+=step) lines.push(<Line key={'y'+y} points={[0,y,width,y]} stroke={y%100===0?'#cdd3cf':'#e4e8e4'} strokeWidth={y%100===0?1.2:.7}/>); return <>{lines}</>;
}
