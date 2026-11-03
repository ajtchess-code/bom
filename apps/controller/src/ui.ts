import { MessageFlags, ButtonStyle } from "discord.js";
import { FILTER_PRESETS, LANGUAGES, tr, type RoomRuntimeState } from "@bom/shared";

const button=(custom_id:string,label:string,style=ButtonStyle.Secondary,emoji?:string)=>({type:2,custom_id,label,style,...(emoji?{emoji:{name:emoji}}:{})});
const row=(components:any[])=>({type:1,components});
const text=(content:string)=>({type:10,content});
const sep=()=>({type:14,divider:true,spacing:1});

export function publicRoomPanel(room:{id:string,name:string},state:RoomRuntimeState,queued=0,metadata:any=null,locale="en-US",opts:{visualizerUrl?:string;accentColor?:number;requesterId?:string;next?:any;currentLyric?:string|null;mediaEnabled?:boolean}={}){
  const now=state.track,accent=opts.accentColor??0xD6A83A,mediaEnabled=opts.mediaEnabled!==false;
  const requester=opts.requesterId??state.requesterId;const origin=state.origin??"USER";const surface=state.surface??"DISCORD";
  const progress=now?progressBar(Number(state.position??0),Number(now.length??0),24):"";
  const header=[
    text(now?`## ${state.status==="PAUSED"?"⏸":"▶"} ${escapeMd(now.title)}`:`## 🎵 ${escapeMd(room.name)}`),
    text(now?`**${escapeMd(now.author)}** · ${formatMs(now.length)} · ${escapeMd(now.sourceName??"source")}\n${requester?`Requested by ${/^\d+$/.test(requester)?`<@${requester}>`:escapeMd(requester)}`:""} · **${escapeMd(origin)}** via ${escapeMd(surface)}`:`${tr(locale,"readyRequests")} · ${tr(locale,"queue")} ${queued}`)
  ];
  // Discord Components V2 Section (type 9) requires a valid accessory.
  // When artwork/media is disabled, use plain text components instead of an
  // accessory-less Section so the text-safe fallback is truly valid.
  // Keep the canonical public player on component shapes Discord accepts
  // consistently through discord.js. Raw Section/Thumbnail accessories were
  // rejected by the API in production with BASE_TYPE_REQUIRED even though the
  // nested object contained a thumbnail type. The public player therefore
  // uses Text Displays + a lightweight looping BOM visualizer; album artwork stays
  // on the dashboard instead of expanding into an oversized Discord image.
  const body:any[]=[...header];
  if(now){
    if(mediaEnabled&&opts.visualizerUrl)body.push({type:12,items:[{media:{url:opts.visualizerUrl},description:`Animated BOM music visualizer for ${now.title}`} ]});
    body.push(text(`${progress}\n**${formatMs(state.position??0)} / ${formatMs(now.length)}** · ${queued} queued`));
    if(opts.currentLyric)body.push(text(`♪ *${escapeMd(opts.currentLyric)}*`));
    if(opts.next)body.push(text(`**Up next:** ${escapeMd(opts.next.display??opts.next.trackInfo?.title??opts.next.query??"Queued track")}${opts.next.requesterId&&/^\d+$/.test(String(opts.next.requesterId))?` · <@${opts.next.requesterId}>`:""}`));
    if(metadata?.fact)body.push(text(`💡 ${escapeMd(String(metadata.fact))}`));
  }
  body.push(sep(),row([
    button(`music:pause:${room.id}`,state.status==="PAUSED"?tr(locale,"resume"):tr(locale,"pause"),ButtonStyle.Secondary,state.status==="PAUSED"?"▶️":"⏸️"),
    button(`music:skip:${room.id}`,tr(locale,"voteSkip"),ButtonStyle.Primary,"⏭️"),
    button(`music:queue:${room.id}`,tr(locale,"queue"),ButtonStyle.Secondary,"📃"),
    button(`music:lyrics:${room.id}`,tr(locale,"lyrics"),ButtonStyle.Secondary,"📜")
  ]),row([
    button(`music:add:${room.id}`,tr(locale,"addMusic"),ButtonStyle.Success,"➕"),
    button(`music:filters:${room.id}`,tr(locale,"filters"),ButtonStyle.Secondary,"🎚️"),
    button(`music:recommend:${room.id}`,tr(locale,"recommendations"),ButtonStyle.Secondary,"✨")
  ]));
  if(!now)body.push(text(tr(locale,"requestHint")));
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

export function privatePanel(room:{id:string,name:string},state:RoomRuntimeState,note?:string,locale="en-US"){
  const t=state.track;
  const components:any[]=[{type:17,accent_color:0xD6A83A,components:[
    text(`## ${escapeMd(room.name)} — ${tr(locale,"privateControls")}`),
    text(t?`**${escapeMd(t.title)}** — ${escapeMd(t.author)}\n${state.status} • ${formatMs(state.position??0)} / ${formatMs(t.length)}`:tr(locale,"nothingPlaying")),
    ...(note?[text(`> ${note}`)]:[]),
    sep(),
    row([
      button(`music:pause:${room.id}`,state.status==="PAUSED"?tr(locale,"resume"):tr(locale,"pause"),ButtonStyle.Secondary),
      button(`music:skip:${room.id}`,tr(locale,"voteSkip"),ButtonStyle.Primary),
      button(`music:queue:${room.id}`,tr(locale,"queue")),
      button(`music:lyrics:${room.id}`,tr(locale,"lyrics"))
    ]),
    row([button(`music:add:${room.id}`,tr(locale,"addMusic"),ButtonStyle.Success),button(`music:filters:${room.id}`,tr(locale,"filters")),button(`music:close:${room.id}`,tr(locale,"close"),ButtonStyle.Danger)]),
    languageSelect(room.id,locale),
    text(tr(locale,"inactivity"))
  ]}];
  return {flags:MessageFlags.Ephemeral|MessageFlags.IsComponentsV2,components} as any;
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
