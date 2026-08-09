import {ExternalLink,Search,X} from 'lucide-react';
import {memo,useMemo,useState,type CSSProperties} from 'react';
import {usePlannerStore} from '../../store/plannerStore';
import {catalog} from './catalogData';
import type {RoomType} from '../../types';

const categories=['All','Appliances','Cabinetry','Surfaces','Tile','Plumbing','Paneling','Seating','Tables','Storage','Bedroom','Lighting','Decor'];
const roomCategories:Record<RoomType,string[]>={
 'Bedroom':['Bedroom','Storage','Lighting','Decor'],'Living room':['Seating','Tables','Storage','Lighting','Decor','Paneling'],'Bathroom':['Plumbing','Cabinetry','Tile','Surfaces','Lighting'],'Kitchen':['Appliances','Cabinetry','Surfaces','Plumbing','Tile','Lighting'],'Dining room':['Seating','Tables','Storage','Lighting','Decor'],'Office':['Tables','Seating','Storage','Lighting','Decor'],'Children’s room':['Bedroom','Storage','Lighting','Decor'],'Hallway':['Storage','Lighting','Decor'],'Outdoor':['Seating','Tables','Lighting','Decor','Surfaces']
};
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});

export const CatalogPanel=memo(function CatalogPanel({close,onAdd,roomType}:{close:()=>void;onAdd?:()=>void;roomType:RoomType}){
 const add=usePlannerStore(s=>s.addFurniture),[q,setQ]=useState(''),[category,setCategory]=useState('All'),[recommended,setRecommended]=useState(true),relevant=roomCategories[roomType];
 const visibleCategories=recommended?['All',...relevant]:categories;
 const items=useMemo(()=>catalog.filter(i=>{const text=`${i.brand??''} ${i.model??''} ${i.name} ${i.category}`.toLowerCase();return(!recommended||relevant.includes(i.category))&&(category==='All'||i.category===category)&&text.includes(q.toLowerCase())}),[q,category,recommended,relevant]);
 return <aside className="catalog-panel"><div className="catalog-title"><div><p className="eyebrow">OLSEN-SOURCED PRODUCTS</p><h2>{roomType} products</h2></div><button aria-label="Close catalog" onClick={close}><X size={18}/></button></div><label className="room-filter"><input type="checkbox" checked={recommended} onChange={e=>{setRecommended(e.target.checked);setCategory('All')}}/>Recommended for this room</label><p className="catalog-disclaimer">Manufacturer MSRP and dimensions are references only—not an Olsen installed-price quote.</p><div className="search"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search products or brands"/></div><div className="chips">{visibleCategories.map(c=><button className={c===category?'active':''} onClick={()=>setCategory(c)} key={c}>{c}</button>)}</div><div className="catalog-grid">{items.map(i=><article key={i.id} draggable onDragStart={e=>e.dataTransfer.setData('catalogId',i.id)}><div className="thumb" style={{'--product-color':i.color} as CSSProperties}>{i.emoji}</div>{i.brand&&<span className="catalog-brand">{i.brand}</span>}<strong>{i.name}</strong><span>{i.price?`${money.format(i.price)} MSRP`:'Price by dealer/design'}</span>{i.note&&<small>{i.note}</small>}{i.sourceUrl&&<a href={i.sourceUrl} target="_blank" rel="noreferrer" draggable={false}>{i.sourceLabel} <ExternalLink size={10}/></a>}<button onClick={()=>{add(i.id,i.name,i.category,i.dims,i.color);onAdd?.()}}><span className="desktop-add-label">Add to room</span><span className="mobile-add-label">Add &amp; view in 3D</span></button></article>)}</div></aside>
});
