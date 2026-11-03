import {mergeGuildCatalogue,resolveCatalogueGuild} from '@bom/shared';
import sharp,{type OverlayOptions} from 'sharp';
import {readFile,mkdir,access,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const safe=(s:any)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const tagKey=(s:any)=>String(s??'').trim().toUpperCase();
export const artworkFaction=(s:any)=>{const name=String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');return /antilia|brit/i.test(name)?'antilia':/espan|span/i.test(name)?'espaniol':/kai|severia/i.test(name)?'kai-severia':'pirates';};
const isBOM=(s:any)=>['BOM','ßǾM'].includes(tagKey(s));
const palettes:Record<string,string[]>={bom:['#fff5bd','#efbc4f','#9b5c16'],antilia:['#ffd3d8','#e63c57','#8c102a'],espaniol:['#ffe4a5','#f28637','#a92117'],'kai-severia':['#d4f5ff','#4cb6f0','#2051ab'],pirates:['#ffffff','#bcc7d4','#677383']};
const pending=new Map<string,Promise<string|null>>();
export async function ensureBattleArtwork(b:any,guilds:any[],base:string):Promise<string|null>{
 if(!/^https?:\/\//.test(base))return null;
 try{const defaults=JSON.parse(await readFile(join(process.cwd(),'data/pb/guild-defaults.json'),'utf8'));guilds=mergeGuildCatalogue(defaults,guilds);}catch{}
 const records=[b.attacker,b.defender].map(tag=>({...resolveCatalogueGuild(guilds,String(tag??'')),tag:tag||'?'}));
 const key=createHash('sha256').update(JSON.stringify(['cinematic-factions-v9-template-centering',b.port_name,records])).digest('hex');const url=`${base.replace(/\/$/,'')}/pb-art/${key}.png`;
 if(pending.has(key))return pending.get(key)!;
 const task=(async()=>{
 const out=join(process.cwd(),'data/pb-art',key+'.png');try{await access(out);return url;}catch{}
 const assets=join(process.cwd(),'apps/controller/assets/pb-matchups'),w=2048,h=800,half=w/2,parts:OverlayOptions[]=[];
 // Templates contain artwork only. Port names, roles and tags are always rendered here.
 const halves=await Promise.all(records.map(async r=>{const bom=isBOM(r.tag);const full=await sharp(join(assets,`cinematic-${bom?'antilia':artworkFaction(r.faction)}.png`)).resize(w,h,{fit:'fill'}).png().toBuffer();return sharp(full).extract({left:bom?0:1124,top:0,width:924,height:h}).resize(half,h,{fit:'fill'}).png().toBuffer();}));
 parts.push({input:halves[0],left:0,top:0},{input:halves[1],left:half,top:0});
 const fullHeader=await sharp(join(assets,'cinematic-antilia.png')).resize(w,h,{fit:'fill'}).png().toBuffer();
 const header=await sharp(fullHeader).extract({left:450,top:0,width:1150,height:150}).png().toBuffer();parts.push({input:header,left:450,top:0});
 parts.push({input:Buffer.from('<svg width="2048" height="800"><path d="M1024 150V800" stroke="#d3ac60" stroke-width="3"/><circle cx="1024" cy="420" r="74" fill="#0b1520" stroke="#e1be76" stroke-width="4"/><circle cx="1024" cy="420" r="66" fill="none" stroke="#826633" stroke-width="1"/></svg>')});
 async function label(value:any,cx:number,y:number,width:number,height:number,palette=palettes.bom){
 const text=String(value??'').trim().slice(0,160)||'?';
 const raw=await sharp({text:{text:`<span foreground="white">${safe(text)}</span>`,font:/[\u3000-\u9fff]/.test(text)?'Droid Sans Fallback':'DejaVu Serif Bold',fontfile:join(assets,/[\u3000-\u9fff]/.test(text)?'cjk.ttf':'title.ttf'),width,height,align:'centre',rgba:true}}).png().toBuffer({resolveWithObject:true});
 // Pango text canvases include asymmetric transparent padding. Trim to the
 // actual painted glyph bounds before centering each heading or guild tag.
 const ink=await sharp(raw.data).trim({background:'#00000000',threshold:1}).png().toBuffer({resolveWithObject:true});
 const tw=ink.info.width,th=ink.info.height;
 const gradient=Buffer.from(`<svg width="${tw}" height="${th}"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="${palette[0]}"/><stop offset=".48" stop-color="${palette[1]}"/><stop offset="1" stop-color="${palette[2]}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
 const colored=await sharp(gradient).composite([{input:ink.data,blend:'dest-in'}]).png().toBuffer();
 const shadow=await sharp({create:{width:tw,height:th,channels:4,background:'#000000'}}).composite([{input:ink.data,blend:'dest-in'}]).png().toBuffer();const left=Math.round(cx-(tw+2)/2),top=Math.round(y-(th+3)/2);
 parts.push({input:shadow,left:left+2,top:top+3},{input:colored,left,top});
 }
 await label('BATTLE OF '+String(b.port_name??'Unknown Port').toUpperCase(),1024,82,1080,64);
 const cream=['#fff9e7','#eee2c2','#cab484'];
 for(let i=0;i<2;i++){const r=records[i],cx=i*half+(isBOM(r.tag)?620:400);await label(i===0?'ATTACKERS':'DEFENDERS',cx,547,560,24,cream);await label(r.tag,cx,637,570,104,palettes[isBOM(r.tag)?'bom':artworkFaction(r.faction)]);if(isBOM(r.tag))await label('BAND OF MISFITS',cx,738,570,28,cream);}
 await label('VS',1024,420,110,64);
 const data=await sharp({create:{width:w,height:h,channels:4,background:'#080c13'}}).composite(parts).png().toBuffer();await mkdir(join(process.cwd(),'data/pb-art'),{recursive:true});const tmp=out+'.'+randomUUID()+'.tmp';await writeFile(tmp,data);await rename(tmp,out);return url;
 })().catch(error=>{console.warn('[pb-artwork] Unable to build battle image:',String(error?.message??error));return null;}).finally(()=>pending.delete(key));pending.set(key,task);return task;
}
