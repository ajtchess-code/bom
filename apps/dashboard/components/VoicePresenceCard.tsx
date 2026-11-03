"use client";
import {useEffect,useMemo,useState} from 'react';
import CommandIcon from './CommandIcon';

type Member={id:string;username:string;avatar?:string|null;status?:string;channelId:string};
type Channel={id:string;name:string;position:number};
type Snapshot={enabled:boolean;members:Member[];voiceChannels:Channel[];at?:number};
const stripTag=(name:string)=>String(name??'Member').replace(/^(?:\s*\[[^\]]{2,12}\]\s*)+/g,'').trim();
export default function VoicePresenceCard({initial}:{initial:Snapshot}){
 const [snap,setSnap]=useState<Snapshot>(initial??{enabled:false,members:[],voiceChannels:[]});
 useEffect(()=>{let mounted=true;const refresh=async()=>{if(document.visibilityState==='hidden')return;try{const res=await fetch('/api/internal/platform/discord-widget',{cache:'no-store'});if(res.ok&&mounted)setSnap(await res.json());}catch{}};void refresh();const timer=window.setInterval(()=>void refresh(),12000);return()=>{mounted=false;window.clearInterval(timer)};},[]);
 const groups=useMemo(()=>{const by=new Map<string,Member[]>();for(const member of snap.members??[]){const group=by.get(String(member.channelId))??[];group.push(member);by.set(String(member.channelId),group);}return (snap.voiceChannels??[]).filter(c=>by.has(String(c.id))).sort((a,b)=>Number(a.position??0)-Number(b.position??0)).map(c=>({...c,members:by.get(String(c.id))??[]}));},[snap]);
 return <article className="panel voiceNowCard"><header><div><span className="cardKicker">DISCORD VOICE · LIVE BOT FEED</span><h2>Who’s In Voice</h2></div><span className="voiceNowCount">{snap.members?.length??0} in voice</span></header>
 {snap.enabled?<div className="voiceChannelGroups">{groups.map(ch=><section key={ch.id}><div className="voiceChannelName"><span>◉</span><b>{ch.name}</b><small>{ch.members.length}</small></div><div className="voiceMemberList">{ch.members.map(m=><div key={m.id}><span>{m.avatar?<img src={m.avatar} alt=""/>:<i>{String(m.username).slice(0,1).toUpperCase()}</i>}</span><b>{stripTag(m.username)}</b><em className="presence online"/></div>)}</div></section>)}{!groups.length&&<div className="homeEmpty"><CommandIcon name="users" size={25}/><b>Nobody is in voice right now.</b></div>}</div>:<div className="homeEmpty"><CommandIcon name="users" size={25}/><b>Connecting to live voice status…</b><small>Voice presence is read from the connected BOM bot, not Discord’s optional Server Widget.</small></div>}</article>;
}
