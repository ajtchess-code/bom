import { MessageFlags, ButtonStyle } from "discord.js";
import { FILTER_PRESETS, LANGUAGES, tr, type RoomRuntimeState } from "@bom/shared";

const button=(custom_id:string,label:string,style=ButtonStyle.Secondary,emoji?:string)=>({type:2,custom_id,label,style,...(emoji?{emoji:{name:emoji}}:{})});
const row=(components:any[])=>({type:1,components});
const text=(content:string)=>({type:10,content});
const sep=()=>({type:14,divider:true,spacing:1});

// ---- Music panels -----------------------------------------------------------
// One shared "now playing" block used by the public player, /music nowplaying
// and private controls: small label, title, artist, progress, requester, and
// what's next. Album art shows as a thumbnail when Discord accepts media; the
// caller falls back to mediaEnabled:false if it doesn't.
const qTitle=(q:any)=>String(q?.trackInfo?.title??q?.display??q?.originalQuery??q?.query??"Queued song");
const qAuthor=(q:any)=>q?.trackInfo?.author?String(q.trackInfo.author):"";
const mention=(id?:string|null)=>!id?"":/^\d+$/.test(id)?`<@${id}>`:escapeMd(id==="autoplay"?"Autoplay":id);
function nowPlayingBlock(room:{id:string,name:string},state:RoomRuntimeState,queued:number,opts:{requesterId?:string;upNext?:any[];next?:any;mediaEnabled?:boolean}={}){
  const now=state.track,paused=state.status==="PAUSED",out:any[]=[];
  if(!now){
    out.push(text(`-# ${escapeMd(room.name)}\n### Nothing playing\nUse **/play** or press **Add song**.${queued?` ${queued} waiting in the queue.`:""}`));
    return out;
  }
  const length=Number(now.length??0),pos=Number(state.position??0);
  const head=`-# ${paused?"⏸  PAUSED":"▶  NOW PLAYING"} · ${escapeMd(room.name)}\n### ${escapeMd(now.title).slice(0,180)}\n${escapeMd(now.author)}`;
  const art=opts.mediaEnabled!==false&&now.artworkUrl&&/^https:\/\//.test(String(now.artworkUrl))?String(now.artworkUrl):null;
  out.push(art?{type:9,components:[text(head)],accessory:{type:11,media:{url:art},description:`Artwork for ${now.title}`.slice(0,1024)}}:text(head));
  const requester=mention(opts.requesterId??state.requesterId);
  out.push(text([
    now.isStream?"`LIVE`":`\`${formatMs(pos)}\` ${progressBar(pos,length,18)} \`${formatMs(length)}\``,
    `-# ${[requester&&`Requested by ${requester}`,queued?`${queued} in queue`:"Queue empty"].filter(Boolean).join(" · ")}`,
  ].join("\n")));
  const upNext=(opts.upNext?.length?opts.upNext:opts.next?[opts.next]:[]).slice(0,3);
  if(upNext.length){
    out.push(sep());
    out.push(text(`**Up next**\n${upNext.map((q:any,i:number)=>`${i+1}. ${escapeMd(qTitle(q)).slice(0,90)}${qAuthor(q)?` · ${escapeMd(qAuthor(q)).slice(0,40)}`:""}`).join("\n")}${queued>upNext.length?`\n-# +${queued-upNext.length} more`:""}`));
  }
  return out;
}
function controlRows(room:{id:string},state:RoomRuntimeState,locale:string,extra:any[]=[]){
  const paused=state.status==="PAUSED",live=Boolean(state.track);
  const rows=[row([
    {...button(`music:pause:${room.id}`,paused?tr(locale,"resume"):tr(locale,"pause"),paused?ButtonStyle.Success:ButtonStyle.Secondary,paused?"▶️":"⏸️"),disabled:!live},
    {...button(`music:skip:${room.id}`,"Skip",ButtonStyle.Secondary,"⏭️"),disabled:!live},
    {...button(`music:stop:${room.id}`,"Stop",ButtonStyle.Danger,"⏹️"),disabled:!live},
    button(`music:queue:${room.id}`,tr(locale,"queue"),ButtonStyle.Secondary,"📃"),
    button(`music:add:${room.id}`,"Add song",ButtonStyle.Primary,"➕"),
  ])];
  if(extra.length)rows.push(row(extra));
  return rows;
}
export function publicRoomPanel(room:{id:string,name:string},state:RoomRuntimeState,queued=0,_metadata:any=null,locale="en-US",opts:{visualizerUrl?:string;accentColor?:number;requesterId?:string;next?:any;upNext?:any[];currentLyric?:string|null;mediaEnabled?:boolean}={}){
  return {flags:MessageFlags.IsComponentsV2,allowedMentions:{parse:[]},components:[{type:17,accent_color:opts.accentColor??0xd6a83a,components:[
    ...nowPlayingBlock(room,state,queued,opts),
    sep(),
    ...controlRows(room,state,locale),
  ]}]} as any;
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
// Private controls (from /music controls): same block, only visible to you.
export function privatePanel(room:{id:string,name:string},state:RoomRuntimeState,note?:string,locale="en-US",opts:{upNext?:any[];queued?:number}={}){
  return {flags:MessageFlags.Ephemeral|MessageFlags.IsComponentsV2,allowedMentions:{parse:[]},components:[{type:17,accent_color:0xd6a83a,components:[
    ...nowPlayingBlock(room,state,opts.queued??opts.upNext?.length??0,{upNext:opts.upNext,mediaEnabled:false}),
    ...(note?[text(`> ${note}`)]:[]),
    sep(),
    ...controlRows(room,state,locale,[button(`music:lyrics:${room.id}`,tr(locale,"lyrics"),ButtonStyle.Secondary,"📜"),button(`music:close:${room.id}`,tr(locale,"close"),ButtonStyle.Secondary)]),
  ]}]} as any;
}

// Queue view: numbered, with artist, length and who asked for it.
export function queuePanel(room:{id:string,name:string},queue:any[]){
  const shown=queue.slice(0,15);
  const lines=shown.map((q:any,i:number)=>{
    const len=Number(q?.trackInfo?.length??0);
    return `\`${String(i+1).padStart(2," ")}\` **${escapeMd(qTitle(q)).slice(0,80)}**${qAuthor(q)?` · ${escapeMd(qAuthor(q)).slice(0,40)}`:""}${len?` · ${formatMs(len)}`:""}${q?.requesterId?` · ${mention(q.requesterId)}`:""}`;
  });
  const total=queue.every((q:any)=>Number(q?.trackInfo?.length)>0)?queue.reduce((n:number,q:any)=>n+Number(q.trackInfo.length),0):0;
  return {flags:MessageFlags.Ephemeral|MessageFlags.IsComponentsV2,allowedMentions:{parse:[]},components:[{type:17,accent_color:0xd6a83a,components:[
    text(`-# ${escapeMd(room.name)}\n### Queue`),
    text(lines.length?lines.join("\n"):"The queue is empty. Use **/play** to add a song."),
    ...(queue.length?[text(`-# ${queue.length} song${queue.length===1?"":"s"}${total?` · about ${formatMs(total)}`:""}${queue.length>shown.length?` · showing first ${shown.length}`:""}`)]:[]),
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
