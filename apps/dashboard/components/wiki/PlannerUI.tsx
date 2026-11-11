"use client";
import {useId} from 'react';
export const number=(v:any)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString(undefined,{maximumFractionDigits:2}):'Not established';
export function Picture({images=[],name=''}:{images?:any[];name?:string}){
 const id=useId().replaceAll(':','');const image=images.find(i=>!i.PNGPath.includes('_gray'));
 if(!image)return <span className="gwMissingImage">No preview</span>;
 const url=`/api/internal/game-wiki/asset?path=${encodeURIComponent(image.PNGPath)}`;
 if(!image.Rect)return <img className="gwItemImage" src={url} alt={name} loading="lazy"/>;
 const r=image.Rect;return <svg className="gwItemImage" role="img" aria-label={name} viewBox={`${r.x} ${r.y} ${r.width} ${r.height}`}><defs><clipPath id={id}><rect x={r.x} y={r.y} width={r.width} height={r.height}/></clipPath></defs><image href={url} width={image.Width} height={image.Height} clipPath={`url(#${id})`}/></svg>;
}
export function Check({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}){return <label className="wpCheck"><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/>{label}</label>;}
export function Numeric({label,value,onChange,min=0,max=1000000,step=1}:{label:string;value:number;onChange:(v:number)=>void;min?:number;max?:number;step?:number}){return <label>{label}<input type="number" min={min} max={max} step={step} value={value} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))onChange(Math.min(max,Math.max(min,n)));}}/></label>;}
export function Evidence({children}:{children:React.ReactNode}){return <details className="wpEvidence"><summary>Behind the numbers (technical details)</summary>{children}</details>;}
export const mapPoint=(x:number,y:number)=>({x:-.08651901053*x/10000+53.07514584455*y/10000+59.94519574561,y:100-(53.05204593999*x/10000-.11112675982*y/10000+50.29679572795)});
