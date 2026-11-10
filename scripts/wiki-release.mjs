/** Dependency-free, resumable release installer for the Novonode Node runtime. */
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {mkdir,readFile,writeFile,rename,stat} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const data=()=>resolve(process.env.WOSB_WIKI_STORAGE||'data/wiki-releases');
const tagPattern=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const maxZip=45_000_000;
const hash=b=>createHash('sha256').update(b).digest('hex');
let active=false;
async function locked(work){if(active)throw Object.assign(new Error('Another wiki install operation is running'),{statusCode:409});active=true;try{return await work();}finally{active=false;}}
async function json(path){return JSON.parse(await readFile(path,'utf8'));}
async function atomicJson(path,value){await mkdir(dirname(path),{recursive:true});const tmp=path+'.tmp';await writeFile(tmp,JSON.stringify(value));await rename(tmp,path);}
export function validateManifest(m){
  if(m?.format!=='wosb-wiki-release-v1'||!tagPattern.test(m.release)||!Array.isArray(m.parts)||!m.parts.length||m.parts.length>500)throw new Error('Invalid wiki release manifest');
  const seen=new Set();
  for(const p of m.parts){if(!/^wiki-part-\d{3}\.zip$/.test(p.file)||seen.has(p.file)||!Number.isInteger(p.bytes)||p.bytes<=0||p.bytes>=maxZip||!/^[a-f0-9]{64}$/.test(p.sha256)||!Number.isInteger(p.files)||p.files<=0)throw new Error('Invalid wiki release part');seen.add(p.file);}
  return m;
}
async function download(url,maximum){
  const response=await fetch(url,{signal:AbortSignal.timeout(60_000)});
  if(!response.ok)throw new Error(`GitHub download failed (${response.status}). Confirm the release exists and its assets are public.`);
  if(Number(response.headers.get('content-length')||0)>maximum)throw new Error('Download exceeds the size limit');
  const chunks=[];let bytes=0;
  for await(const chunk of response.body){bytes+=chunk.length;if(bytes>maximum){await response.body.cancel().catch(()=>{});throw new Error('Download exceeds the size limit');}chunks.push(chunk);}
  return Buffer.concat(chunks);
}
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}

/** Central directory parsing rejects traversal, links, encrypted and oversized entries. */
export async function extractCheckedZip(buffer,directory){
  if(buffer.length>=maxZip)throw new Error('ZIP exceeds the upload limit');
  let end=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0)throw new Error('Invalid ZIP end record');
  if(buffer.readUInt16LE(end+4)||buffer.readUInt16LE(end+6))throw new Error('Multi-disk ZIPs are unsupported');
  const count=buffer.readUInt16LE(end+10),centralBytes=buffer.readUInt32LE(end+12);let cursor=buffer.readUInt32LE(end+16),unpacked=0;
  if(!count||count>10000||cursor+centralBytes>end)throw new Error('Invalid ZIP directory');
  const paths=new Set(),entries=[];
  for(let i=0;i<count;i++){
    if(cursor+46>end||buffer.readUInt32LE(cursor)!==0x02014b50)throw new Error('Invalid ZIP entry');
    const flags=buffer.readUInt16LE(cursor+8),method=buffer.readUInt16LE(cursor+10),crc=buffer.readUInt32LE(cursor+16),compressed=buffer.readUInt32LE(cursor+20),size=buffer.readUInt32LE(cursor+24),length=buffer.readUInt16LE(cursor+28),extra=buffer.readUInt16LE(cursor+30),comment=buffer.readUInt16LE(cursor+32),mode=buffer.readUInt32LE(cursor+38)>>>16,offset=buffer.readUInt32LE(cursor+42);
    const name=buffer.subarray(cursor+46,cursor+46+length).toString('utf8');cursor+=46+length+extra+comment;
    if(flags&1||![0,8].includes(method)||(mode&0xf000)===0xa000||name.includes('\\')||name.startsWith('/')||/^[A-Za-z]:/.test(name)||name.split('/').some(p=>p==='..'||p==='.'||p==='')||paths.has(name)||name.includes('\0'))throw new Error('Unsafe ZIP entry');
    paths.add(name);unpacked+=size;if(unpacked>60_000_000)throw new Error('ZIP expands beyond the allowed size');
    const target=resolve(directory,name);if(!target.startsWith(resolve(directory)+sep))throw new Error('Unsafe ZIP path');
    if(offset+30>buffer.length||buffer.readUInt32LE(offset)!==0x04034b50)throw new Error('Invalid ZIP local header');
    const start=offset+30+buffer.readUInt16LE(offset+26)+buffer.readUInt16LE(offset+28);if(start+compressed>buffer.length)throw new Error('Truncated ZIP data');
    const input=buffer.subarray(start,start+compressed),body=method===0?input:inflateRawSync(input,{maxOutputLength:Math.max(1,size)});
    if(body.length!==size||crc32(body)!==crc)throw new Error('ZIP data integrity failure');
    entries.push({target,body});
  }
  // Validate the entire archive before touching the staging release.
  for(const {target,body} of entries){await mkdir(dirname(target),{recursive:true});await writeFile(target,body);}
  return entries.length;
}
function progress(state){return {release:state.tag,completedParts:state.completed,totalParts:state.manifest.parts.length,complete:state.complete};}
export async function startInstall(tag){return locked(async()=>{
  if(!tagPattern.test(tag)||tag==='.'||tag==='..')throw Object.assign(new Error('Invalid release tag'),{statusCode:400});
  const statePath=resolve(data(),tag,'install.json');
  try{return progress(await json(statePath));}catch(e){if(e.code!=='ENOENT')throw e;}
  const base=`https://github.com/ajtchess-code/bom/releases/download/${encodeURIComponent(tag)}`;
  const manifest=validateManifest(JSON.parse((await download(base+'/release.json',1_000_000)).toString('utf8')));
  const state={tag,base,manifest,completed:0,complete:false};await atomicJson(statePath,state);return progress(state);
});}
async function activate(state,directory){
  const catalog=await json(resolve(directory,'catalog.json'));
  if(catalog.release!==state.manifest.release)throw new Error('Release catalog does not match the manifest');
  const audit=await json(resolve(directory,'audit.json'));
  if(audit.missingImages.length||audit.imageCount!==catalog.images||audit.tables.length!==catalog.tables.length)throw new Error('Incomplete wiki audit');
  for(const t of catalog.tables){
    const pages=await json(resolve(directory,'indexes',`${t.name}.json`));
    if(pages.length!==Math.ceil(t.rows/100))throw new Error(`Invalid page index: ${t.name}`);
    for(const file of new Set(pages.map(p=>p.file)))await stat(resolve(directory,'tables',t.name,file));
  }
  await atomicJson(resolve('data/wiki-active.json'),{directory,release:catalog.release,activatedAt:new Date().toISOString()});
}
export async function nextInstall(tag){return locked(async()=>{
  if(!tagPattern.test(tag))throw Object.assign(new Error('Invalid release tag'),{statusCode:400});
  const statePath=resolve(data(),tag,'install.json'),state=await json(statePath),directory=resolve(data(),tag,'content');
  if(state.complete)return progress(state);
  const part=state.manifest.parts[state.completed],bytes=await download(`${state.base}/${part.file}`,maxZip);
  if(bytes.length!==part.bytes||hash(bytes)!==part.sha256)throw new Error(`Checksum mismatch: ${part.file}`);
  const count=await extractCheckedZip(bytes,directory);if(count!==part.files)throw new Error(`Entry count mismatch: ${part.file}`);
  state.completed++;
  if(state.completed===state.manifest.parts.length){await activate(state,directory);state.complete=true;}
  await atomicJson(statePath,state);return progress(state);
});}
export async function installLocal(manifestPath){return locked(async()=>{
  const manifest=validateManifest(await json(manifestPath)),directory=resolve(data(),manifest.release,'content');
  for(const part of manifest.parts){const bytes=await readFile(resolve(dirname(manifestPath),part.file));if(bytes.length!==part.bytes||hash(bytes)!==part.sha256)throw new Error(`Checksum mismatch: ${part.file}`);if(await extractCheckedZip(bytes,directory)!==part.files)throw new Error('Entry count mismatch');console.log(`Verified ${part.file}`);}
  await activate({manifest},directory);return {complete:true,directory};
});}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [command,value]=process.argv.slice(2);
  if(command==='local'&&value)console.log(await installLocal(resolve(value)));
  else if(command==='github'&&value){let status=await startInstall(value);while(!status.complete){status=await nextInstall(value);console.log(status);}}
  else {console.error('Usage: node scripts/wiki-release.mjs local /path/to/release.json\n       node scripts/wiki-release.mjs github RELEASE_TAG');process.exitCode=1;}
}
