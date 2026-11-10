import {createReadStream} from 'node:fs';
import {readFile, realpath} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {resolve, sep} from 'node:path';
import {readFileSync} from 'node:fs';
import {startInstall,nextInstall} from '../../../scripts/wiki-release.mjs';

type Row = Record<string, any>;
type Table = {name:string; label:string; rows:number; fields:string[]; group:string; evidence:boolean; bytes:number; categories:Record<string,number>};
type Catalog = {version:number; release:string; asOf:string; groups:string[]; tables:Table[]; images:number; coverage:string; limitations:string[]; decodeFailures:number; issues:number};
type Gate = (req:any, reply:any)=>Promise<any>;
const root = ()=>{if(process.env.WOSB_WIKI_DIR)return resolve(process.env.WOSB_WIKI_DIR);try{return resolve(JSON.parse(readFileSync('data/wiki-active.json','utf8')).directory);}catch{return resolve('data/wiki-v2');}};
const jsonFile = async (path:string)=>JSON.parse(await readFile(path,'utf8'));
const bounded = (v:unknown, min:number, max:number, fallback:number)=>{const n=Number(v); return Number.isFinite(n)?Math.max(min,Math.min(max,Math.floor(n))):fallback;};
export const recordName = (r:Row, n:number)=>String(r.EnglishName || r.NameEnglish || r.IDEnglish || r.English || r.Name || r.RecipeID || r.EntityID || r.ID || r.Key || r.Type || `Record ${n+1}`);
const normalized = (s:unknown)=>String(s??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
function imagesFor(links:Row,name:string,row:Row){
  if(row.PNGPath&&String(row.PNGPath).startsWith('Images/'))return [{ImageID:row.ImageID??row.PNGPath,PNGPath:row.PNGPath,Relationship:row.Relationship??'Exported source image'}];
  const rectangle=String(row.IconName??'').match(/^Icons\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/);
  if(rectangle){const [x,y,width,height]=rectangle.slice(1).map(Number);if(width>0&&height>0&&x+width<=1920&&y+height<=390)return [{ImageID:`IMG000842:${x}:${y}:${width}:${height}`,PNGPath:'Images/LooseFiles/Data/Textures/Icons.png',Rect:{x,y,width,height},Relationship:'Exact client icon rectangle from IconName'}];}
  const aliases:Record<string,string>={Crew_Sailors:'UnitsInfo',Crew_Boarding:'UnitsInfo',Crew_Special:'UnitsInfo'};
  const ids=[row.ID,row.Name,row.EntityID,row.Key].filter(x=>x!=null).map(String);
  const seen=new Set<string>();
  return ids.flatMap(id=>links[`${aliases[name]??name}:${id}`]??[]).filter((r:Row)=>!seen.has(r.ImageID)&&(seen.add(r.ImageID),true));
}

/** Indexed pages keep multi-million-row evidence tables off the API heap. */
export class GameWiki {
  constructor(public directory:string) {}
  async catalog():Promise<Catalog>{return jsonFile(resolve(this.directory,'catalog.json'));}
  async table(name:string):Promise<Table>{
    const table=(await this.catalog()).tables.find(t=>t.name===name);
    if(!table)throw Object.assign(new Error('Unknown wiki collection'),{statusCode:404});
    return table;
  }
  async page(name:string,page=0):Promise<Row[]>{
    await this.table(name);
    const offsets:{file:string;offset:number}[]=await jsonFile(resolve(this.directory,'indexes',`${name}.json`));
    const point=offsets[page]; if(!point)return [];
    const input=createReadStream(resolve(this.directory,'tables',name,point.file),{start:point.offset});
    const lines=createInterface({input,crlfDelay:Infinity}); const result:Row[]=[];
    try {for await(const line of lines){if(line.trim())result.push(JSON.parse(line)); if(result.length===100)break;}}
    finally {lines.close();input.destroy();}
    return result;
  }
  async all(name:string):Promise<Row[]>{
    const table=await this.table(name);
    if(table.rows>20000)throw Object.assign(new Error('Use indexed pages for this evidence collection'),{statusCode:400});
    const rows:Row[]=[];for(let p=0;p<Math.ceil(table.rows/100);p++)rows.push(...await this.page(name,p));return rows;
  }
  async record(name:string,index:number){
    const row=(await this.page(name,Math.floor(index/100)))[index%100];
    if(!row)throw Object.assign(new Error('Entry not found'),{statusCode:404});
    const links=await jsonFile(resolve(this.directory,'image-links.json'));
    const displayNames=await jsonFile(resolve(this.directory,'display-names.json')).catch((e:any)=>{if(e.code==='ENOENT')return {};throw e;});
    const images=imagesFor(links,name,row);
    const related:{table:string;row:number;name:string;data:Row}[]=[];
    const joins:Record<string,[string,string,string][]>={
      ShipsToPlay:[['ShipsBasics','StaticInfoID','ID'],['Ship_Construction','ID','ShipID'],['Ship_Materials','ID','ShipID']],
      Crafting_Recipes:[['Recipe_Ingredients','RecipeID','RecipeID']],
      Resources:[['Recipe_Ingredients','NumericID','ResourceID'],['Market_Price_Limits','ID','TextID']],
      Cannons:[['Cannon_Crafting','ID','TextID'],['Cannon_Materials','ID','TextID']],
      WorldPorts:[['Port_Definitions','PortName','PortName']],
    };
    for(const [target,from,to] of joins[name]??[]){
      const value=name==='Resources'&&from==='NumericID'?String(row.ID??'').replace(/^res_/,''):row[from];
      if(value==null)continue;
      (await this.all(target)).forEach((r,i)=>{if(r[to]!=null&&String(r[to])===String(value))related.push({table:target,row:i,name:recordName(r,i),data:r});});
    }
    return {table:name,row:index,name:displayNames[`${name}:${index}`]?.name??recordName(row,index),nameSource:displayNames[`${name}:${index}`]?.source??null,data:row,images,related,source:`${name} / record ${index+1}`};
  }
  async search(query:string,table?:string){
    const terms=normalized(query).trim().split(/\s+/).filter(Boolean).slice(0,12);
    if(!terms.length)return [];
    const index:{table:string;row:number;name:string;text:string}[]=await jsonFile(resolve(this.directory,'search.json'));
    return index.filter(r=>(!table||r.table===table)&&terms.every(t=>normalized(r.text).includes(t)))
      .map(r=>({table:r.table,row:r.row,name:r.name,score:terms.reduce((n,t)=>n+(normalized(r.name).includes(t)?10:1),0)}))
      .sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,100);
  }
}

/** Explicit choices, aggregated intermediate demand, whole batches and cycle checks. */
export function craftingPlan(recipes:Row[],ingredients:Row[],recipeId:string,quantity:number,choices:Record<string,string>={}){
  if(!Number.isFinite(quantity)||quantity<=0||quantity>1e9)throw Object.assign(new Error('Quantity must be between 0 and 1,000,000,000'),{statusCode:400});
  const byId=new Map(recipes.map(r=>[String(r.RecipeID),r]));
  const start=byId.get(recipeId);if(!start)throw Object.assign(new Error('Unknown recipe'),{statusCode:400});
  const candidates=new Map<string,Row[]>();
  for(const r of recipes){if(String(r.OutputType)!=='resource')continue;const id=String(r.OutputID);candidates.set(id,[...(candidates.get(id)??[]),r]);}
  const selected=new Map<string,Row>();const unresolved=new Map<string,any>();
  function route(id:string){
    const options=candidates.get(id)??[];
    if(choices[id]){const r=options.find(r=>r.RecipeID===choices[id]);if(!r)throw Object.assign(new Error(`Invalid recipe choice for resource ${id}`),{statusCode:400});return r;}
    if(options.length===1)return options[0];
    if(options.length>1)unresolved.set(id,{resourceId:id,reason:'Choose a recipe',recipes:options.map(r=>({id:r.RecipeID,name:r.EnglishName,context:r.Context}))});
    return undefined;
  }
  const visiting=new Set<string>(),visited=new Set<string>(),postorder:string[]=[];
  function visit(r:Row){
    const id=String(r.RecipeID);if(visiting.has(id))throw Object.assign(new Error(`Recipe cycle involving ${id}`),{statusCode:400});
    if(visited.has(id))return;visiting.add(id);selected.set(id,r);
    for(const input of ingredients.filter(i=>String(i.RecipeID)===id)){const child=route(String(input.ResourceID));if(child)visit(child);}
    visiting.delete(id);visited.add(id);postorder.push(id);
  }
  visit(start);
  const demands=new Map<string,number>([[recipeId,quantity]]),raw=new Map<string,any>(),steps:any[]=[];
  let craftHours=0,gold=0;
  for(const id of postorder.reverse()){
    const r=selected.get(id)!,need=demands.get(id)??0,output=Number(r.OutputQuantity);
    if(!Number.isFinite(output)||output<=0)throw Object.assign(new Error(`Unknown output quantity for ${id}`),{statusCode:400});
    const batches=Math.ceil(need/output);steps.push({recipeId:id,name:r.EnglishName,context:r.Context,needed:need,batches,produced:batches*output,leftover:batches*output-need,craftHours:r.CraftHours==null?null:batches*Number(r.CraftHours)});
    if(r.CraftHours!=null)craftHours+=batches*Number(r.CraftHours);if(r.InputGold!=null)gold+=batches*Number(r.InputGold);
    for(const i of ingredients.filter(i=>String(i.RecipeID)===id)){
      const amount=Number(i.Quantity)*batches;if(!Number.isFinite(amount)||amount<0)throw new Error(`Invalid ingredient quantity in ${id}`);
      const resourceId=String(i.ResourceID),child=route(resourceId);
      if(child)demands.set(String(child.RecipeID),(demands.get(String(child.RecipeID))??0)+amount);
      else {const prev=raw.get(resourceId);raw.set(resourceId,{resourceId,name:i.EnglishName,quantity:(prev?.quantity??0)+amount,reason:unresolved.has(resourceId)?'Recipe choice required':'Acquisition not specified by these recipes'});}
    }
  }
  return {recipeId,quantity,steps,rawMaterials:[...raw.values()],choicesRequired:[...unresolved.values()],craftHours,gold,complete:unresolved.size===0,notes:['Whole batches; shared intermediate demand is combined before rounding.','Craft hours are summed production work, not elapsed time.','No player, port, event, building or harvesting modifiers are assumed.','Resources without a selected production recipe are shown as external acquisition.']};
}

export function registerGameWiki(app:any,{requireMember,requireAdmin}: {requireMember:Gate;requireAdmin:Gate}){
  const wiki=()=>new GameWiki(root());
  const guard=async(req:any,reply:any)=>Boolean(await requireMember(req,reply));
  app.post('/v1/game-wiki/install/start',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;if(process.env.WOSB_WIKI_DIR)return reply.code(409).send({message:'Remove WOSB_WIKI_DIR to enable managed wiki releases.'});return startInstall(String(req.body?.tag??''));});
  app.post('/v1/game-wiki/install/next',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;return nextInstall(String(req.body?.release??''));});
  app.get('/v1/game-wiki/catalog',async(req:any,reply:any)=>{if(!await guard(req,reply))return;try{return await wiki().catalog();}catch(e:any){if(e.code==='ENOENT')return reply.code(503).send({error:'wiki_not_installed',message:'Install the wiki data release before opening the encyclopedia.'});throw e;}});
  app.get('/v1/game-wiki/table/:name',async(req:any,reply:any)=>{
    if(!await guard(req,reply))return;
    const name=String(req.params.name),table=await wiki().table(name),page=bounded(req.query.page,0,Math.max(0,Math.ceil(table.rows/100)-1),0);
    const q=normalized(req.query.q).slice(0,200),category=String(req.query.category??'');
    const links=await jsonFile(resolve(root(),'image-links.json'));
    const displayNames=await jsonFile(resolve(root(),'display-names.json')).catch((e:any)=>{if(e.code==='ENOENT')return {};throw e;});
    let rows:{data:Row;row:number}[],total=table.rows;
    if((q||category)&&table.rows<=20000){
      const all=(await wiki().all(name)).map((data,row)=>({data,row})).filter(r=>(!q||normalized(`${displayNames[`${name}:${r.row}`]?.name??''} ${JSON.stringify(r.data)}`).includes(q))&&(!category||String(r.data.Category??r.data.System??'')===category));
      total=all.length;rows=all.slice(page*100,(page+1)*100);
    }else rows=(await wiki().page(name,page)).map((data,i)=>({data,row:page*100+i})).filter(r=>!q||normalized(JSON.stringify(r.data)).includes(q));
    return {table,page,total,rows:rows.map(({data,row})=>({row,name:displayNames[`${name}:${row}`]?.name??recordName(data,row),data,images:imagesFor(links,name,data)}))};
  });
  app.get('/v1/game-wiki/record/:table/:row',async(req:any,reply:any)=>{if(!await guard(req,reply))return;return wiki().record(String(req.params.table),bounded(req.params.row,0,1e8,0));});
  app.get('/v1/game-wiki/search',async(req:any,reply:any)=>{if(!await guard(req,reply))return;return {results:await wiki().search(String(req.query.q??'').slice(0,200),req.query.table?String(req.query.table):undefined)};});
  app.get('/v1/game-wiki/asset',async(req:any,reply:any)=>{
    if(!await guard(req,reply))return;
    const path=String(req.query.path??'');if(!path.startsWith('Images/')||!path.endsWith('.png')||path.includes('\\')||path.split('/').some(p=>p==='..'||p==='.'||!p))return reply.code(400).send({error:'invalid_image'});
    const directory=await realpath(resolve(root(),'Images'));
    let target:string;try{target=await realpath(resolve(root(),path));}catch(e:any){if(e.code==='ENOENT')return reply.code(404).send({error:'image_not_found'});throw e;}
    if(!target.startsWith(directory+sep))return reply.code(400).send({error:'invalid_image'});
    reply.type('image/png').header('cache-control','private, max-age=3600');return reply.send(createReadStream(target));
  });
  app.get('/v1/game-wiki/download/:table',async(req:any,reply:any)=>{
    if(!await guard(req,reply))return;const name=String(req.params.table),t=await wiki().table(name);
    const offsets:{file:string}[]=await jsonFile(resolve(root(),'indexes',`${name}.json`));const files=[...new Set(offsets.map(o=>o.file))];
    // One source part per download bounds response sizes on the host.
    const part=bounded(req.query.part,0,Math.max(0,files.length-1),0);
    if(!files.length)return reply.type('application/x-ndjson').send('');
    reply.header('content-disposition',`attachment; filename="${t.name}-${part+1}.jsonl"`).header('x-wiki-parts',String(files.length)).type('application/x-ndjson');
    return reply.send(createReadStream(resolve(root(),'tables',name,files[part])));
  });
  app.get('/v1/game-wiki/evidence',async(req:any,reply:any)=>{
    if(!await guard(req,reply))return;
    const path=String(req.query.path??'').replaceAll('\\','/');
    if(!/^(CodeArchive|CodeEvidence|RawData)\//.test(path)||!path.endsWith('.txt')&&!path.endsWith('.json')||path.split('/').some(p=>p==='..'||p==='.'||!p))return reply.code(400).send({error:'invalid_evidence_path'});
    const folder=await realpath(resolve(root(),path.split('/')[0]));let target:string;
    try{target=await realpath(resolve(root(),path));}catch(e:any){if(e.code==='ENOENT')return reply.code(404).send({error:'evidence_not_found'});throw e;}
    if(!target.startsWith(folder+sep))return reply.code(400).send({error:'invalid_evidence_path'});
    reply.type('text/plain; charset=utf-8').header('x-content-type-options','nosniff');return reply.send(createReadStream(target));
  });
  app.post('/v1/game-wiki/craft',async(req:any,reply:any)=>{if(!await guard(req,reply))return;return craftingPlan(await wiki().all('Crafting_Recipes'),await wiki().all('Recipe_Ingredients'),String(req.body?.recipeId??''),Number(req.body?.quantity),req.body?.choices??{});});
}
