'use client';
import {useEffect,useRef,useState} from 'react';
export function useWorkspaceFullscreen(){
 const ref=useRef<HTMLDivElement>(null),[native,setNative]=useState(false),[fallback,setFallback]=useState(false);
 async function toggle(){if(document.fullscreenElement===ref.current){await document.exitFullscreen();return;}if(fallback){setFallback(false);return;}try{if(!ref.current?.requestFullscreen)throw Error('Fullscreen unavailable');await ref.current.requestFullscreen();}catch{setFallback(true);}}
 useEffect(()=>{const changed=()=>setNative(document.fullscreenElement===ref.current),escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setFallback(false);},requested=()=>void toggle();document.addEventListener('fullscreenchange',changed);window.addEventListener('keydown',escape);const root=ref.current;root?.addEventListener('bom:workspace-fullscreen',requested);return()=>{document.removeEventListener('fullscreenchange',changed);window.removeEventListener('keydown',escape);root?.removeEventListener('bom:workspace-fullscreen',requested);};},[fallback]);
 useEffect(()=>{if(!fallback)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[fallback]);
 return {ref,fullscreen:native||fallback,toggle};
}
export function requestWorkspaceFullscreen(el:HTMLElement|null){el?.closest('.prWorkspaceRoot')?.dispatchEvent(new Event('bom:workspace-fullscreen'));}
