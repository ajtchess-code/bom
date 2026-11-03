import {join} from 'node:path';import sharp from 'sharp';import {db} from '@bom/db';
let nextAttempt=0;let cached:Record<string,string>={};
export async function ensurePBEmojis(client:any,guildId:string,settings:any){
 const configured=typeof settings.duty_emojis==='string'?JSON.parse(settings.duty_emojis):settings.duty_emojis??{};
 if(Date.now()<nextAttempt)return {...cached,...Object.fromEntries(Object.entries(configured).filter(([,v])=>v))};
 nextAttempt=Date.now()+3600000;
 try{const guild=await client.guilds.fetch(guildId);await guild.emojis.fetch();const output:Record<string,string>={};
 for(const key of ['horn','red-flare','gold-flare','blue-flare','bom']){if(configured[key]){output[key]=configured[key];continue;}const name=key==='bom'?'bom_pb_logo':'bom_pb_'+key.replaceAll('-','_');let emoji=guild.emojis.cache.find((e:any)=>e.name===name);if(!emoji){const path=key==='bom'?join(process.cwd(),'apps/dashboard/public/wosb/pb/bom-logo.png'):join(process.cwd(),'apps/dashboard/public/wosb/pb/duties',key+'.png');const attachment=await sharp(path).resize(128,128,{fit:'inside'}).png().toBuffer();emoji=await guild.emojis.create({attachment,name,reason:'Port Battle duty and schedule branding'});}output[key]=`<:${emoji.name}:${emoji.id}>`;}
 cached=output;await db.query('UPDATE pb_discord_settings SET duty_emojis=$2::jsonb WHERE guild_id=$1',[guildId,JSON.stringify({...configured,...output})]);return output;
 }catch(error:any){console.warn('[port-battle] Custom emoji setup unavailable; using text fallbacks.',String(error?.code??'emoji_setup'));return {...cached,...configured};}
}
