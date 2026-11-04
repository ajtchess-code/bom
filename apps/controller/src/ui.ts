import { MessageFlags, ButtonStyle } from "discord.js";
import { FILTER_PRESETS, LANGUAGES, tr, type RoomRuntimeState } from "@bom/shared";

const button=(custom_id:string,label:string,style=ButtonStyle.Secondary,emoji?:string)=>({type:2,custom_id,label,style,...(emoji?{emoji:{name:emoji}}:{})});
const row=(components:any[])=>({type:1,components});
const text=(content:string)=>({type:10,content});
const sep=()=>({type:14,divider:true,spacing:1});

// Public "now playing" panel: what's playing, who asked for it, progress, what's
// next, and plain controls. No visualizer, trivia or origin badges.
export function publicRoomPanel(room:{id:string,name:string},state:RoomRuntimeState,queued=0,_metadata:any=null,locale="en-US",opts:{visualizerUrl?:string;accentColor?:number;requesterId?:string;next?:any;currentLyric?:string|null;mediaEnabled?:boolean}={}){
  const now=state.track,accent=opts.accentColor??0xd6a83a,paused=state.status==="PAUSED";
  const requester=opts.requesterId??state.requesterId;
  const who=requester?(/^\d+$/.test(requester)?`<@${requester}>`:escapeMd(requester)):"";
  const body:any[]=[];
  if(now){
    body.push(text(`## ${paused?"⏸":"▶"} ${escapeMd(now.title)}`));
    body.push(text(`**${escapeMd(now.author)}** · ${now.isStream?"Live":formatMs(now.length)}${who?` · requested by ${who}`:""}`));
    if(!now.isStream)body.push(text(`${progressBar(Number(state.position??0),Number(now.length??0),20)}  ${formatMs(state.position??0)} / ${formatMs(now.length)}`));
    const next=opts.next?escapeMd(String(opts.next.display??opts.next.trackInfo?.title??opts.next.query??"Queued track")).slice(0,120):null;
    body.push(text(next?`**Up next:** ${next}${queued>1?` · ${queued-1} more`:""}`:queued?`${queued} in queue`:"Nothing queued after this."));
  }else{
    body.push(text(`## 🎵 ${escapeMd(room.name)}`),text(`Nothing is playing. Use **/play** or press **Add song**.${queued?` ${queued} in queue.`:""}`));
  }
  body.push(sep(),row([
    button(`music:pause:${room.id}`,paused?tr(locale,"resume"):tr(locale,"pause"),ButtonStyle.Secondary,paused?"▶️":"⏸️"),
    button(`music:skip:${room.id}`,"Skip",ButtonStyle.Primary,"⏭️"),
    button(`music:stop:${room.id}`,"Stop",ButtonStyle.Danger,"⏹️"),
    button(`music:queue:${room.id}`,tr(locale,"queue"),ButtonStyle.Secondary,"📃"),
    button(`music:add:${room.id}`,"Add song",ButtonStyle.Success,"➕"),
  ]));
  return {flags:MessageFlags.IsComponentsV2,components:[{type:17,accent_color:accent,components:body}]} as any;
}
function progressBar(position:number,duration:number,width=24){const p=duration>0?Math.max(0,Math.min(1,position/duration)):0,done=Math.max(0,Math.min(width,Math.round(p*width)));return `${"━".repeat(Math.max(0,done-1))}${done?"●":"○"}${"─".repeat(Math.max(0,width-done))}`;}

function languageSelect(roomId:string,locale:string){
  return row([{type:3,custom_id:`music:language:${roomId}`,placeholder:tr(locale,"language"),min_values:1,max_values:1,options:LANGUAGES.map(l=>({label:l.label,value:l.value,emoji:{name:l.emoji},default:l.value===locale}))}]);
}


export function nowPlayingAnnouncement(room:{id:string;name:string},track:any,requesterId:string,metadata:any=null,locale="en-US",visualizerUrl?:string,positionMs=0){
  return {flags:MessageFlags.IsComponentsV2,components:[{type:17,accent_color:0xD6A83A,components:[
    text(`## ▶ ${tr(locale,"nowPlaying")} — ${escapeMd(track?.title??"Unknown track")}`),
    text(`**${escapeMd(track?.author??"Unknown artist")}** • ${formatMs(track?.length??0)} • ${escapeMd(track?.sourceName??"source")}
Requested by ${/^\d+$/.test(requesterId)?`<@${requesterId}>`:escapeMd(requesterId==="autoplay"?"Autoplay":requesterId)}`),
    ...(visualizerUrl?[{type:12,items:[{media:{url:visualizerUrl},description:`Animated BOM music visualizer for ${track?.title??"current track"}`}]}]:[]),
    text(`**${formatMs(positionMs)} / ${formatMs(track?.length??0)}** · visualizer is decorative`),
    ...(metadata?.fact?[text(`💡 **${tr(locale,"didYouKnow")}** ${escapeMd(String(metadata.fact))}`)]:[])
  ]}]} as any;
}

// Private controls (from /music controls): same essentials, only visible to you.
export function privatePanel(room:{id:string,name:string},state:RoomRuntimeState,note?:string,locale="en-US"){
  const t=state.track,paused=state.status==="PAUSED";
  return {flags:MessageFlags.Ephemeral|MessageFlags.IsComponentsV2,components:[{type:17,accent_color:0xd6a83a,components:[
    text(`## 🎵 ${escapeMd(room.name)}`),
    text(t?`${paused?"⏸":"▶"} **${escapeMd(t.title)}** — ${escapeMd(t.author)}\n${t.isStream?"Live":`${formatMs(state.position??0)} / ${formatMs(t.length)}`}`:tr(locale,"nothingPlaying")),
    ...(note?[text(`> ${note}`)]:[]),
    sep(),
    row([
      button(`music:pause:${room.id}`,paused?tr(locale,"resume"):tr(locale,"pause"),ButtonStyle.Secondary),
      button(`music:skip:${room.id}`,"Skip",ButtonStyle.Primary),
      button(`music:stop:${room.id}`,"Stop",ButtonStyle.Danger),
      button(`music:queue:${room.id}`,tr(locale,"queue")),
    ]),
    row([
      button(`music:add:${room.id}`,"Add song",ButtonStyle.Success),
      button(`music:lyrics:${room.id}`,tr(locale,"lyrics")),
      button(`music:close:${room.id}`,tr(locale,"close")),
    ]),
  ]}]} as any;
}
export function simpleEphemeral(title:string,body:string){
  return {flags:MessageFlags.Ephemeral|MessageFlags.IsComponentsV2,components:[{type:17,accent_color:0xD6A83A,components:[text(`## ${title}`),text(body)]}]} as any;
}

export function liveLyricsPanel(room:{id:string;name:string},state:RoomRuntimeState,lyrics:any,locale="en-US"){
  const lines=Array.isArray(lyrics?.lines)?lyrics.lines:[];let idx=0;
  for(let i=0;i<lines.length;i++)if(Number(lines[i]?.timestamp??0)<=Number(state.position??0))idx=i;
  const visible=lines.slice(Math.max(0,idx-2),idx+4).map((l:any,i:number)=>{
    const real=Math.max(0,idx-2)+i;const value=String(l?.line??"♪");return real===idx?`### ▶ ${escapeMd(value||"♪")}`:`${escapeMd(value||"♪")}`;
  });
  const body=visible.length?visible.join("\n"):tr(locale,"lyricsWaiting");
  return {flags:MessageFlags.Ephemeral|MessageFlags.IsComponentsV2,components:[{type:17,accent_color:0xD6A83A,components:[
    text(`## 📜 ${escapeMd(room.name)} — ${tr(locale,"liveLyrics")}`),text(body),
    row([button(`music:lyricsrefresh:${room.id}`,"Refresh",ButtonStyle.Secondary,"🔄"),button(`music:lyricsclose:${room.id}`,tr(locale,"close"),ButtonStyle.Danger)]),
    text(tr(locale,"inactivity"))
  ]}]} as any;
}

function prettyFilter(id:string){return id.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());}
export function filterPanel(room:{id:string;name:string},locale="en-US",note?:string){
  const entries=Object.keys(FILTER_PRESETS);
  const selects=[entries.slice(0,20),entries.slice(20,40)].filter(x=>x.length).map((group,index)=>row([{
    type:3,custom_id:`music:filter${index+1}:${room.id}`,placeholder:`${tr(locale,"filters")} ${index+1}`,min_values:1,max_values:1,
    options:group.map(id=>({label:prettyFilter(id).slice(0,100),value:id,description:id==="flat"?"Disable DSP effects":undefined}))
  }]));
  return {flags:MessageFlags.Ephemeral|MessageFlags.IsComponentsV2,components:[{type:17,accent_color:0xD6A83A,components:[
    text(`## 🎚️ ${escapeMd(room.name)} — ${tr(locale,"filters")}`),
    text(note??"Choose a DSP preset. Selecting **Flat** removes active effects."),
    ...selects,
    text(tr(locale,"inactivity"))
  ]}]} as any;
}

export function modalAdd(roomId:string,locale="en-US"){
  return {custom_id:`music:addmodal:${roomId}`,title:tr(locale,"addMusicTitle"),components:[{type:1,components:[{type:4,custom_id:"query",label:tr(locale,"addMusicLabel"),style:2,required:true,max_length:1000,placeholder:tr(locale,"addMusicPlaceholder")}]}]} as any;
}

export const formatMs=(ms:number)=>{if(!Number.isFinite(ms)||ms<0)return"0:00";const s=Math.floor(ms/1000),m=Math.floor(s/60);return`${m}:${String(s%60).padStart(2,"0")}`;};
const escapeMd=(x:string)=>x.replace(/[\\`*_{}\[\]()#+\-.!|>]/g,"\\$&");
