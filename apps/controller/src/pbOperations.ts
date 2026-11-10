import {createHash} from 'node:crypto';
import {db,many,oneOrNone} from '@bom/db';
import {withDmMute} from '@bom/shared';
import {redis} from '@bom/redis';
import {sendBotDm} from './dmDelivery.js';
import {canDiscordDm} from './notifications.js';
const row=(components:any[])=>({type:1,components});
const base=()=>String(process.env.PUBLIC_DASHBOARD_URL??'').replace(/\/$/,'');
const stamp=(v:any)=>{const n=Math.floor(new Date(v).getTime()/1000);return Number.isFinite(n)?`<t:${n}:f> · <t:${n}:R>`:'Time not set';};
const day=(d:Date,tz:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export function nightlyCutoff(now:Date,tz:string,hour:number){let date=day(now,tz);const currentHour=Number(new Intl.DateTimeFormat('en-US',{timeZone:tz,hour:'2-digit',hourCycle:'h23'}).format(now));if(currentHour<hour)date=new Date(Date.parse(date+'T12:00:00Z')-86400000).toISOString().slice(0,10);const [y,m,d]=date.split('-').map(Number),target=Date.UTC(y,m-1,d,hour);let value=target;for(let n=0;n<3;n++){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));const represented=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);value+=target-represented;}return {date,at:new Date(value)};}
export function createPBOperations(client:any,guildId:string,api:any,manager:any){
 let running=false;
 async function settings(){return oneOrNone<any>('SELECT * FROM pb_experience_settings WHERE guild_id=$1',[guildId]);}
 async function digest(uid:string,force=false){
  if(!await canDiscordDm(uid,'battles'))return;
  if(!force&&await redis.get(`pb:digest:backoff:${guildId}:${uid}`))return;
  const [cfg,rows]=await Promise.all([settings(),many<any>(`SELECT b.id,b.port_name,b.starts_at,b.status,s.signup_status,s.confirmed_ship,s.fleet_pending,s.horn_duty,s.flare_duty FROM pb_signups s JOIN pb_battles b ON b.id=s.battle_id WHERE s.guild_id=$1 AND s.user_id=$2 AND b.status IN('OPEN','CLOSED') ORDER BY b.starts_at,b.id`,[guildId,uid])]);
  const saved=await oneOrNone<any>('SELECT * FROM pb_signup_digest WHERE guild_id=$1 AND user_id=$2',[guildId,uid]);if(!rows.length&&!saved)return;
  const fingerprint=createHash('sha256').update(JSON.stringify({rows,horn:cfg?.horn_guide_url,flare:cfg?.flare_guide_url})).digest('hex');if(!force&&saved?.fingerprint===fingerprint)return;
  const fields=rows.slice(0,20).map(s=>({name:`${s.port_name} · ${s.signup_status}`,value:`${stamp(s.starts_at)}\nShip: **${s.confirmed_ship||'Awaiting assignment'}**\nHorn: ${s.horn_duty||'None'} · Flare: ${s.flare_duty||'None'}`}));
  const payload={embeds:[{title:'Your Port Battle Signups',color:0xD6A83A,description:rows.length?`Your live signup overview.${rows.length>20?' More signups are listed on the dashboard.':''}`:'You have no remaining active Port Battle signups.',fields}],components:[row([{type:2,style:2,label:'Refresh my signups',custom_id:'pbops:digest'},...(base()?[{type:2,style:5,label:'Open Port Battles',url:base()+'/dashboard/port-battles'}]:[])]),...(cfg?.horn_guide_url||cfg?.flare_guide_url?[row([...(cfg.horn_guide_url?[{type:2,style:5,label:'Horn Build Guide',url:cfg.horn_guide_url}]:[]),...(cfg.flare_guide_url?[{type:2,style:5,label:'Flare Build Guide',url:cfg.flare_guide_url}]:[])])]:[])],allowedMentions:{parse:[]}};
  const user=await client.users.fetch(uid);let message:any=null;
  if(saved?.message_id&&saved.channel_id){const channel=await client.channels.fetch(saved.channel_id);message=await channel?.messages?.fetch(saved.message_id).catch((e:any)=>{if(Number(e.code)===10008)return null;throw e;});}
  if(message)await message.edit(withDmMute(payload,uid));else message=await sendBotDm(user,payload);
  if(!message?.id)return;
  await db.query(`INSERT INTO pb_signup_digest(guild_id,user_id,message_id,channel_id,fingerprint) VALUES($1,$2,$3,$4,$5) ON CONFLICT(guild_id,user_id) DO UPDATE SET message_id=EXCLUDED.message_id,channel_id=EXCLUDED.channel_id,fingerprint=EXCLUDED.fingerprint,updated_at=now()`,[guildId,uid,message.id,message.channelId??message.channel?.id,fingerprint]);
 }
 async function nightly(){const cfg=await settings();if(!cfg)return;const cut=nightlyCutoff(new Date(),cfg.timezone,cfg.night_hour);if(cut.at<new Date(cfg.activated_at))return;
  const battles=await many<any>(`SELECT b.*,r.report_submitted_at FROM pb_battles b LEFT JOIN pb_battle_reviews r ON r.battle_id=b.id WHERE b.guild_id=$1 AND b.created_at>=$2 AND b.starts_at>=$2 AND b.starts_at<=$3 AND b.status IN('OPEN','CLOSED','FINISHED') ORDER BY b.starts_at`,[guildId,cfg.activated_at,cut.at]);
  for(const kind of ['officer','alliance']){const channelId=kind==='officer'?cfg.officer_channel_id:cfg.alliance_channel_id;if(!channelId)continue;const list=battles.filter(b=>kind==='officer'?['OPEN','CLOSED'].includes(b.status):b.status==='FINISHED'&&!b.report_submitted_at),saved=await many<any>('SELECT * FROM pb_nightly_messages WHERE guild_id=$1 AND night=$2 AND kind=$3 ORDER BY page',[guildId,cut.date,kind]);if(!list.length&&!saved.length)continue;
   const guild=await client.guilds.fetch(guildId),channel=await guild.channels.fetch(channelId);if(!channel?.isTextBased())continue;
   const count=Math.max(Math.ceil(list.length/5),saved.length);for(let page=0;page<count;page++){const group=list.slice(page*5,page*5+5),marker=`BOM nightly ${kind} ${cut.date} ${page}`,payload={embeds:[{title:kind==='officer'?'Tonight’s Unfinished Port Battles':'After Action Reports Still Needed',color:0xD6A83A,description:group.length?(kind==='officer'?'Mark each battle below to close it out. Screenshots are optional.':'Please complete these AARs in the dashboard.'):kind==='officer'?'All listed Port Battles have been closed out.':'All listed AARs are complete.',fields:group.map(b=>({name:b.port_name,value:`${b.attacker} vs ${b.defender}\n${stamp(b.starts_at)}`})),footer:{text:marker}}],components:group.map(b=>row(kind==='officer'?['WIN','DRAW','LOSS'].map(result=>({type:2,style:result==='WIN'?3:result==='LOSS'?4:2,label:`${result[0]+result.slice(1).toLowerCase()} · ${b.port_name}`.slice(0,80),custom_id:`pbops:${result}:${b.id}`})):base()?[{type:2,style:5,label:`AAR · ${b.port_name}`.slice(0,80),url:base()+`/dashboard/after-action-reports?battle=${b.id}`}]:[])).filter(r=>r.components.length),allowedMentions:{parse:[]}};
    let msg=saved[page]?await channel.messages.fetch(saved[page].message_id).catch((e:any)=>{if(Number(e.code)===10008)return null;throw e;}):null;
    if(!msg){const recent=await channel.messages.fetch({limit:100});msg=recent.find((m:any)=>m.author?.id===client.user.id&&m.embeds?.some((e:any)=>e.footer?.text===marker));}
    if(msg)await msg.edit(payload);else msg=await channel.send(payload);
    await db.query(`INSERT INTO pb_nightly_messages(guild_id,night,kind,page,channel_id,message_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(guild_id,night,kind,page) DO UPDATE SET message_id=EXCLUDED.message_id,channel_id=EXCLUDED.channel_id`,[guildId,cut.date,kind,page,channel.id,msg.id]);
   }
  }
 }
 async function sweep(){if(running||!client.isReady())return;running=true;const lock=`pb:operations:${guildId}`;if(!await redis.set(lock,'1','EX',120,'NX')){running=false;return;}try{const rows=await many<any>(`SELECT DISTINCT user_id FROM pb_signups s JOIN pb_battles b ON b.id=s.battle_id WHERE s.guild_id=$1 AND user_id IS NOT NULL AND b.status IN('OPEN','CLOSED') UNION SELECT user_id FROM pb_signup_digest WHERE guild_id=$1`,[guildId]);for(const r of rows)await digest(r.user_id).catch(async(e:any)=>{await redis.set(`pb:digest:backoff:${guildId}:${r.user_id}`,'1','EX',600);console.warn('[pb-digest]',r.user_id,e.message);});await nightly();}finally{await redis.del(lock);running=false;}}
 async function interaction(i:any){const id=String(i.customId??'');if(!id.startsWith('pbops:'))return false;const [,action,battleId]=id.split(':');
  if(action==='digest'){await i.deferReply(i.guildId?{flags:64}:{});await digest(i.user.id,true);await i.editReply('Your signup overview was refreshed.');return true;}
  if(action==='withdraw'){await i.deferReply({flags:64});const rows=await many<any>(`SELECT b.id,b.port_name FROM pb_battles b JOIN pb_signups s ON s.battle_id=b.id WHERE b.guild_id=$1 AND s.user_id=$2 AND b.status='OPEN' ORDER BY b.starts_at LIMIT 25`,[guildId,i.user.id]);await i.editReply({content:rows.length?'Choose the Port Battle you can no longer attend.':'You have no open signups.',components:rows.length?[row([{type:3,custom_id:'pbops:withdraw-choice',placeholder:'Choose signup to remove',options:rows.map(b=>({label:b.port_name,value:b.id}))}])]:[]});return true;}
  if(action==='withdraw-choice'){await i.deferReply({flags:64});await api(`/port-battles/${i.values[0]}/signup`,i.user.id,{method:'DELETE'});await i.editReply('Your signup was removed.');await digest(i.user.id,true);return true;}
  if(['WIN','DRAW','LOSS'].includes(action)){if(i.guildId!==guildId||!await manager(i)){await i.reply({content:'Port Battle manager access required.',flags:64});return true;}await i.deferReply({flags:64});await api(`/port-battles/${battleId}/result`,i.user.id,{method:'POST',body:JSON.stringify({result:action,requireOpen:true})});await nightly();await i.editReply(`Battle marked ${action.toLowerCase()} and closed.`);return true;}
  return false;
 }
 return {sweep,interaction};
}
