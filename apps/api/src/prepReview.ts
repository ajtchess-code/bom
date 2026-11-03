import {randomUUID} from "node:crypto";
import {db,many,oneOrNone} from "@bom/db";

type RegisterOpts={guildId:string;requireMember:(req:any,reply:any)=>Promise<any>;userId:(req:any)=>string};

type Port={name:string;rate:string;size:number;mapFile:string|null};
export const PREP_REVIEW_PORTS:Port[]=[
  {name:"Aruba",rate:"2nd Rate",size:20,mapFile:"aruba-ii.png"},
  {name:"Bord Radel",rate:"1st Rate",size:20,mapFile:"bord-radel.png"},
  {name:"Bridgetown",rate:"1st Rate",size:20,mapFile:"bridgetown-i.png"},
  {name:"Charleston",rate:"1st Rate",size:15,mapFile:"charlston.png"},
  {name:"Cursed City",rate:"3rd Rate",size:15,mapFile:"cursed-city.png"},
  {name:"Devios",rate:"1st Rate",size:15,mapFile:"devios.png"},
  {name:"Everston",rate:"2nd Rate",size:40,mapFile:"everstone.png"},
  {name:"Fiji",rate:"6th Rate",size:15,mapFile:null},
  {name:"Gelbion",rate:"3rd Rate",size:20,mapFile:"gelbion-iii.png"},
  {name:"Gray Island",rate:"1st Rate",size:10,mapFile:"gray-island.png"},
  {name:"La Navidad",rate:"1st Rate",size:40,mapFile:"la-navidad.png"},
  {name:"Laguna Blanco",rate:"1st Rate",size:20,mapFile:"laguna-i.png"},
  {name:"Los Catuano",rate:"6th Rate",size:15,mapFile:null},
  {name:"Masadora",rate:"1st Rate",size:10,mapFile:"massadora.png"},
  {name:"Nevis",rate:"1st Rate",size:20,mapFile:"nevis-i.png"},
  {name:"Nisogora",rate:"3rd Rate",size:10,mapFile:"nisogora.png"},
  {name:"North Bastion",rate:"4th Rate",size:15,mapFile:null},
  {name:"Northside",rate:"5th Rate",size:20,mapFile:"north-side-v.png"},
  {name:"Oneg",rate:"2nd Rate",size:10,mapFile:null},
  {name:"San Cristobel",rate:"4th Rate",size:20,mapFile:"san-christobel-iv.png"},
  {name:"San Martinas",rate:"1st Rate",size:15,mapFile:"san-martinas.png"},
  {name:"Severoangelsk",rate:"4th Rate",size:20,mapFile:"severo-angelsk-iv.png"},
  {name:"South Bastion",rate:"5th Rate",size:20,mapFile:"south-bastion-v.png"},
  {name:"Thermopylae",rate:"1st Rate",size:20,mapFile:"thermopylae.png"},
  {name:"West Bastion",rate:"1st Rate",size:20,mapFile:"west-bastion.png"}
];

const json=(v:any,f:any)=>{if(v==null)return f;if(typeof v==="string")try{return JSON.parse(v);}catch{return f;}return v;};
const cleanKind=(v:any)=>String(v??"").toUpperCase()==="REVIEW"?"REVIEW":"PREP";
const portByName=(v:any)=>PREP_REVIEW_PORTS.find(p=>p.name.toLowerCase()===String(v??"").trim().toLowerCase())??PREP_REVIEW_PORTS[0];
const safeUrl=(v:any)=>{const s=String(v??"").trim().slice(0,2000);if(!s)return null;try{const u=new URL(s);return ["http:","https:"].includes(u.protocol)?u.toString():null;}catch{return null;}};
const title=(v:any,kind:string,port:string)=>String(v??`${kind==="PREP"?"Prep":"Review"} · ${port}`).trim().slice(0,160)||`${kind} · ${port}`;
const compactSession=(r:any)=>({...r,drawing:json(r.drawing,[]),map_drawing:json(r.map_drawing,[]),view_state:json(r.view_state,{})});

export function registerPrepReviewRoutes(app:any,opts:RegisterOpts){
  const {guildId,requireMember,userId}=opts;
  app.get("/v1/prep-review/bootstrap",async(req:any,reply:any)=>{
    if(!(await requireMember(req,reply))?.member)return;
    const sessions=(await many<any>(`SELECT id,kind,title,port_name,map_key,video_url,version,created_by,updated_by,created_at,updated_at FROM prep_review_sessions WHERE guild_id=$1 ORDER BY updated_at DESC LIMIT 100`,[guildId] )).map((r:any)=>({...r,mapUrl:r.map_key?`/prep-review/maps/${r.map_key}`:null}));
    return {ports:PREP_REVIEW_PORTS.map(p=>({...p,mapUrl:p.mapFile?`/prep-review/maps/${p.mapFile}`:null,archivedMap:Boolean(p.mapFile)})),sessions};
  });
  app.get("/v1/prep-review/sessions/:id",async(req:any,reply:any)=>{
    if(!(await requireMember(req,reply))?.member)return;
    const row=await oneOrNone<any>(`SELECT * FROM prep_review_sessions WHERE guild_id=$1 AND id=$2`,[guildId,String(req.params.id)]);if(!row)return reply.code(404).send({error:"not_found"});return compactSession(row);
  });
  app.post("/v1/prep-review/sessions",async(req:any,reply:any)=>{
    if(!(await requireMember(req,reply))?.member)return;const uid=userId(req),kind=cleanKind(req.body?.kind),port=portByName(req.body?.portName);const id=randomUUID(),t=title(req.body?.title,kind,port.name),video=kind==="REVIEW"?safeUrl(req.body?.videoUrl):null;
    await db.query(`INSERT INTO prep_review_sessions(id,guild_id,kind,title,port_name,map_key,video_url,drawing,map_drawing,view_state,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,'[]'::jsonb,'[]'::jsonb,'{}'::jsonb,$8,$8)`,[id,guildId,kind,t,port.name,port.mapFile,video,uid]);
    return compactSession(await oneOrNone<any>(`SELECT * FROM prep_review_sessions WHERE id=$1`,[id]));
  });
  app.put("/v1/prep-review/sessions/:id",async(req:any,reply:any)=>{
    if(!(await requireMember(req,reply))?.member)return;const uid=userId(req),id=String(req.params.id),current=await oneOrNone<any>(`SELECT * FROM prep_review_sessions WHERE guild_id=$1 AND id=$2`,[guildId,id]);if(!current)return reply.code(404).send({error:"not_found"});const expected=Number(req.body?.version);if(!Number.isFinite(expected)||expected!==Number(current.version))return reply.code(409).send({error:"version_conflict",current:compactSession(current)});
    const kind=cleanKind(req.body?.kind??current.kind),port=portByName(req.body?.portName??current.port_name),drawing=Array.isArray(req.body?.drawing)?req.body.drawing:json(current.drawing,[]),mapDrawing=Array.isArray(req.body?.mapDrawing)?req.body.mapDrawing:json(current.map_drawing,[]),viewState=req.body?.viewState&&typeof req.body.viewState==="object"?req.body.viewState:json(current.view_state,{}),video=kind==="REVIEW"?safeUrl(req.body?.videoUrl??current.video_url):null,t=title(req.body?.title??current.title,kind,port.name),next=expected+1;
    if(drawing.length>1000||mapDrawing.length>1000)return reply.code(400).send({error:"too_many_annotations"});
    await db.query(`INSERT INTO prep_review_revisions(id,session_id,guild_id,version,snapshot,actor_id) VALUES($1,$2,$3,$4,$5::jsonb,$6)`,[randomUUID(),id,guildId,expected,JSON.stringify({kind:current.kind,title:current.title,portName:current.port_name,mapKey:current.map_key,videoUrl:current.video_url,drawing:json(current.drawing,[]),mapDrawing:json(current.map_drawing,[]),viewState:json(current.view_state,{})}),uid]);
    await db.query(`UPDATE prep_review_sessions SET kind=$1,title=$2,port_name=$3,map_key=$4,video_url=$5,drawing=$6::jsonb,map_drawing=$7::jsonb,view_state=$8::jsonb,version=$9,updated_by=$10,updated_at=CURRENT_TIMESTAMP WHERE guild_id=$11 AND id=$12`,[kind,t,port.name,port.mapFile,video,JSON.stringify(drawing),JSON.stringify(mapDrawing),JSON.stringify(viewState),next,uid,guildId,id]);
    await db.query(`DELETE FROM prep_review_revisions WHERE id IN (SELECT id FROM prep_review_revisions WHERE session_id=$1 ORDER BY created_at DESC OFFSET 50)`,[id]);
    return compactSession(await oneOrNone<any>(`SELECT * FROM prep_review_sessions WHERE guild_id=$1 AND id=$2`,[guildId,id]));
  });
  app.get("/v1/prep-review/sessions/:id/revisions",async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;return {revisions:await many<any>(`SELECT id,version,actor_id,created_at FROM prep_review_revisions WHERE guild_id=$1 AND session_id=$2 ORDER BY created_at DESC LIMIT 50`,[guildId,String(req.params.id)])};});
  app.post("/v1/prep-review/sessions/:id/restore/:revisionId",async(req:any,reply:any)=>{
    if(!(await requireMember(req,reply))?.member)return;const uid=userId(req),id=String(req.params.id),rev=await oneOrNone<any>(`SELECT * FROM prep_review_revisions WHERE guild_id=$1 AND session_id=$2 AND id=$3`,[guildId,id,String(req.params.revisionId)]),current=await oneOrNone<any>(`SELECT * FROM prep_review_sessions WHERE guild_id=$1 AND id=$2`,[guildId,id]);if(!rev||!current)return reply.code(404).send({error:"not_found"});const s=json(rev.snapshot,{}),port=portByName(s.portName??current.port_name),next=Number(current.version)+1;await db.query(`UPDATE prep_review_sessions SET kind=$1,title=$2,port_name=$3,map_key=$4,video_url=$5,drawing=$6::jsonb,map_drawing=$7::jsonb,view_state=$8::jsonb,version=$9,updated_by=$10,updated_at=CURRENT_TIMESTAMP WHERE guild_id=$11 AND id=$12`,[cleanKind(s.kind),title(s.title,s.kind,port.name),port.name,port.mapFile,safeUrl(s.videoUrl),JSON.stringify(s.drawing??[]),JSON.stringify(s.mapDrawing??[]),JSON.stringify(s.viewState??{}),next,uid,guildId,id]);return compactSession(await oneOrNone<any>(`SELECT * FROM prep_review_sessions WHERE guild_id=$1 AND id=$2`,[guildId,id]));
  });
  app.delete("/v1/prep-review/sessions/:id",async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;await db.query(`DELETE FROM prep_review_sessions WHERE guild_id=$1 AND id=$2`,[guildId,String(req.params.id)]);return {ok:true};});
}
