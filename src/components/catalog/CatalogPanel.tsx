import {ExternalLink,Search,X} from 'lucide-react';
import {memo,useMemo,useState,type CSSProperties} from 'react';
import {usePlannerStore} from '../../store/plannerStore';
import {catalog} from './catalogData';

const categories=['All','Appliances','Cabinetry','Surfaces','Tile','Plumbing','Paneling','Seating','Tables','Storage','Bedroom','Lighting','Decor'];
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});

export const CatalogPanel=memo(function CatalogPanel({close}:{close:()=>void}){
 const add=usePlannerStore(s=>s.addFurniture),[q,setQ]=useState(''),[category,setCategory]=useState('All');
 const items=useMemo(()=>catalog.filter(i=>{const text=`${i.brand??''} ${i.model??''} ${i.name} ${i.category}`.toLowerCase();return(category==='All'||i.category===category)&&text.includes(q.toLowerCase())}),[q,category]);
 return <aside className="catalog-panel"><div className="catalog-title"><div><p className="eyebrow">OLSEN-SOURCED PRODUCTS</p><h2>Catalog</h2></div><button aria-label="Close catalog" onClick={close}><X size={18}/></button></div><p className="catalog-disclaimer">Manufacturer MSRP and dimensions are references only—not an Olsen installed-price quote.</p><div className="search"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search products or brands"/></div><div className="chips">{categories.map(c=><button className={c===category?'active':''} onClick={()=>setCategory(c)} key={c}>{c}</button>)}</div><div className="catalog-grid">{items.map(i=><article key={i.id} draggable onDragStart={e=>e.dataTransfer.setData('catalogId',i.id)}><div className="thumb" style={{'--product-color':i.color} as CSSProperties}>{i.emoji}</div>{i.brand&&<span className="catalog-brand">{i.brand}</span>}<strong>{i.name}</strong><span>{i.price?`${money.format(i.price)} MSRP`:'Price by dealer/design'}</span>{i.note&&<small>{i.note}</small>}{i.sourceUrl&&<a href={i.sourceUrl} target="_blank" rel="noreferrer" draggable={false}>{i.sourceLabel} <ExternalLink size={10}/></a>}<button onClick={()=>add(i.id,i.name,i.category,i.dims,i.color)}>Add to room</button></article>)}</div></aside>
});
