'use client';
import {useId,useState} from 'react';
type Guild={tag:string;name?:string;reference?:string;faction?:string};
const ref=(g:Guild)=>g.reference||g.tag;
export default function TerritoryGuildSelect({label,value,onChange,guilds,disabled=false}:{label:string;value:string;onChange:(value:string)=>void;guilds:Guild[];disabled?:boolean}) {
 const id=useId(),[open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
 const selected=guilds.find(g=>ref(g)===value),display=selected?`${selected.tag} · ${selected.name??selected.tag}`:value||'None / Unowned';
 const choices=[{tag:'',name:'None / Unowned'},...guilds].filter(g=>`${g.tag} ${g.name??''}`.toLowerCase().includes(query.toLowerCase()));
 function choose(tag:string){onChange(tag);setQuery('');setOpen(false);setActive(0);}
 return <div className="territoryGuildSelect" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)){setOpen(false);setQuery('');}}}>
  <label htmlFor={id}>{label}</label>
  <div className="territoryGuildInput"><input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={id+'-list'} aria-activedescendant={open&&choices[active]?`${id}-${active}`:undefined} disabled={disabled} value={open?query:display} placeholder="Search guild name or tag…" onClick={()=>{if(!open){setOpen(true);setQuery('');setActive(0);}}} onFocus={()=>{setOpen(true);setQuery('');setActive(0);}} onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(0);}} onKeyDown={e=>{
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(i=>Math.max(0,Math.min(choices.length-1,i+(e.key==='ArrowDown'?1:-1))));}
   if(e.key==='Enter'&&open){e.preventDefault();if(choices[active])choose(ref(choices[active]));}
   if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false);setQuery('');}
  }}/><span aria-hidden="true">⌄</span></div>
  {open&&!disabled&&<ul id={id+'-list'} role="listbox" aria-label={label} className="territoryGuildOptions">{choices.map((g,i)=><li id={`${id}-${i}`} key={ref(g)} role="option" aria-selected={ref(g)===value} className={active===i?'active':''} onPointerDown={e=>e.preventDefault()} onPointerMove={()=>setActive(i)} onClick={()=>choose(ref(g))}>{g.tag?`${g.tag} · ${g.name??g.tag}${g.faction?` · ${g.faction}`:''}`:g.name}</li>)}{!choices.length&&<li role="presentation">No guilds found</li>}</ul>}
 </div>;
}
