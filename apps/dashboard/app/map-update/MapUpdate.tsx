'use client';
import {useEffect,useState} from 'react';
import TerritoryMap from '@/components/TerritoryMap';
export default function MapUpdate(){
 const [token,setToken]=useState(''),[expires,setExpires]=useState(''),[error,setError]=useState(''),[closed,setClosed]=useState(false),[dirty,setDirty]=useState(false);
 useEffect(()=>{const changed=(e:Event)=>setDirty(Boolean((e as CustomEvent).detail?.dirty));window.addEventListener('bom:dirty',changed);return()=>window.removeEventListener('bom:dirty',changed);},[]);
 useEffect(()=>{const token=window.location.hash.slice(1);if(!/^[a-f0-9]{64}$/.test(token)){setError('Request a temporary editing link using Update Battle Map in Discord.');return;}
 let cancelled=false;
 fetch('/api/map-edit',{headers:{'x-map-edit-token':token},cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);if(!cancelled){setExpires(d.expiresAt);setToken(token);}}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;};},[]);
 useEffect(()=>{if(!expires)return;const timer=setTimeout(()=>{setToken('');setError('This editing link has expired. Request another link in Discord.');},Math.max(0,Date.parse(expires)-Date.now()));return()=>clearTimeout(timer);},[expires]);
 return <div className="uiPage"><header className="panel uiPadMd uiGapBelow"><h1>Update Battle Map</h1>{closed?<p>Editing link closed. You can return to Discord.</p>:error?<p role="alert">{error}</p>:token?<><p>Select a port to update ownership, taxation, attack windows, or protection. Your changes are recorded under your Discord account.</p><p>Editing access expires at {new Date(expires).toLocaleString()}.</p><button className="outlineButton" disabled={dirty} title={dirty?'Wait for all changes to save':undefined} onClick={async()=>{try{const r=await fetch('/api/map-edit/close',{method:'POST',headers:{'x-map-edit-token':token}});if(!r.ok)throw new Error('Could not close link.');setToken('');setClosed(true);window.history.replaceState(null,'',window.location.pathname);}catch(e:any){setError(e.message);}}}>Finish editing</button></>:<p>Opening temporary editor…</p>}</header>{token&&!closed&&!error&&<TerritoryMap battles={[]} config={{}} manager editToken={token}/>}</div>;
}
